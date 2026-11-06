import mongoose from "mongoose";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import {
  conversationRoom,
  createAndBroadcastMessage,
  emitToUsers,
  getIO,
  userRoom,
} from "../lib/realtime.js";
import { toConversationResponse } from "../lib/serializers.js";
import {
  STORAGE_MISSING_MESSAGE,
  destroyStoredFiles,
  isStorageConfigured,
  uploadBuffer,
  validateUpload,
} from "../lib/uploads.js";

const MEMBER_FIELDS = "username email avatarUrl";
const MAX_GROUP_NAME = 80;

function normalizeIds(ids) {
  return Array.from(new Set((ids || []).map(String))).filter((id) =>
    mongoose.isValidObjectId(id),
  );
}

async function unreadCountFor(convo, userId) {
  const readAt = convo.lastReadAtByUser?.get?.(String(userId));
  const query = {
    conversationId: convo._id,
    senderId: { $ne: userId },
    type: { $ne: "system" },
    deletedFor: { $ne: userId },
  };
  if (readAt) query.createdAt = { $gt: readAt };
  return Message.countDocuments(query);
}

async function respond(convo, viewerId) {
  const populated = await Conversation.findById(convo._id).populate("members", MEMBER_FIELDS);
  return toConversationResponse(populated, viewerId, {
    unreadCount: await unreadCountFor(populated, viewerId),
  });
}

/** Tell every member (each with their own unread count / mute flag) that the conversation changed. */
async function broadcastUpdated(io, convo) {
  if (!io) return;
  const populated = await Conversation.findById(convo._id).populate("members", MEMBER_FIELDS);
  for (const member of populated.members) {
    const id = String(member._id);
    emitToUsers(io, [id], "conversation:updated", {
      conversation: toConversationResponse(populated, id, {
        unreadCount: await unreadCountFor(populated, id),
      }),
    });
  }
}

function displayName(user) {
  return user?.username || user?.email || "Một thành viên";
}

async function loadGroupForMember(req, res) {
  const convo = await Conversation.findById(req.params.id).catch(() => null);
  if (!convo) {
    res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện." });
    return null;
  }
  if (!convo.members.map(String).includes(String(req.user.id))) {
    res.status(403).json({ message: "Bạn không ở trong cuộc trò chuyện này." });
    return null;
  }
  if (convo.type !== "group") {
    res.status(400).json({ message: "Chỉ áp dụng cho nhóm." });
    return null;
  }
  return convo;
}

function isCreator(convo, userId) {
  return String(convo.createdBy) === String(userId);
}

// GET /api/conversations
export const listConversations = async (req, res) => {
  const userId = req.user.id;
  const conversations = await Conversation.find({ members: userId })
    .sort({ updatedAt: -1 })
    .limit(50)
    .populate("members", MEMBER_FIELDS);

  const counts = await Promise.all(conversations.map((c) => unreadCountFor(c, userId)));
  return res.json({
    conversations: conversations.map((c, i) =>
      toConversationResponse(c, userId, { unreadCount: counts[i] }),
    ),
  });
};

// POST /api/conversations/direct  { userId }
export const createDirectConversation = async (req, res) => {
  const userId = req.user.id;
  const otherUserId = String(req.body?.userId || "");

  if (!mongoose.isValidObjectId(otherUserId)) {
    return res.status(400).json({ message: "Thiếu người nhận." });
  }
  if (otherUserId === String(userId)) {
    return res.status(400).json({ message: "Không thể tự nhắn cho chính mình." });
  }
  if (!(await User.exists({ _id: otherUserId }))) {
    return res.status(404).json({ message: "Không tìm thấy người dùng." });
  }

  const { conversation, created } = await findOrCreateDirect(String(userId), otherUserId);
  return res.status(created ? 201 : 200).json({ conversation: await respond(conversation, userId) });
};

// One in-flight create per pair, so a double click can't make two chats.
// In-process only, which matches the single backend container.
const pendingDirect = new Map();

function findOrCreateDirect(userId, otherUserId) {
  const pairKey = [userId, otherUserId].sort().join(":");
  if (pendingDirect.has(pairKey)) {
    return pendingDirect.get(pairKey).then((result) => ({ ...result, created: false }));
  }

  const work = (async () => {
    const existing = await Conversation.findOne({
      type: "direct",
      members: { $all: [userId, otherUserId] },
      $expr: { $eq: [{ $size: "$members" }, 2] },
    });
    if (existing) return { conversation: existing, created: false };

    const conversation = await Conversation.create({
      type: "direct",
      members: [userId, otherUserId].map((id) => new mongoose.Types.ObjectId(id)),
      createdBy: userId,
    });
    return { conversation, created: true };
  })().finally(() => pendingDirect.delete(pairKey));

  pendingDirect.set(pairKey, work);
  return work;
}

// POST /api/conversations/group  { name, memberIds }
export const createGroupConversation = async (req, res) => {
  const userId = String(req.user.id);
  const name = String(req.body?.name || "").trim().slice(0, MAX_GROUP_NAME);
  if (!name) return res.status(400).json({ message: "Nhóm cần có tên." });

  const allMembers = Array.from(new Set([userId, ...normalizeIds(req.body?.memberIds)]));
  if (allMembers.length < 3) {
    return res.status(400).json({ message: "Nhóm cần ít nhất 2 người khác ngoài bạn." });
  }
  if ((await User.countDocuments({ _id: { $in: allMembers } })) !== allMembers.length) {
    return res.status(400).json({ message: "Có người dùng không tồn tại." });
  }

  const conversation = await Conversation.create({
    type: "group",
    name,
    members: allMembers.map((id) => new mongoose.Types.ObjectId(id)),
    createdBy: userId,
  });

  const io = getIO(req);
  const creator = await User.findById(userId).select("username email");
  await createAndBroadcastMessage(io, conversation, userId, {
    type: "system",
    text: `${displayName(creator)} đã tạo nhóm "${name}"`,
  });

  for (const memberId of allMembers.filter((id) => id !== userId)) {
    emitToUsers(io, [memberId], "conversation:added", {
      conversation: await respond(conversation, memberId),
    });
  }

  return res.status(201).json({ conversation: await respond(conversation, userId) });
};

// PATCH /api/conversations/:id  { name }   (group creator only)
export const updateGroup = async (req, res) => {
  const convo = await loadGroupForMember(req, res);
  if (!convo) return;
  if (!isCreator(convo, req.user.id)) {
    return res.status(403).json({ message: "Chỉ trưởng nhóm được đổi tên nhóm." });
  }

  const name = String(req.body?.name || "").trim().slice(0, MAX_GROUP_NAME);
  if (!name) return res.status(400).json({ message: "Nhóm cần có tên." });

  if (name !== convo.name) {
    convo.name = name;
    await convo.save();
    const actor = await User.findById(req.user.id).select("username email");
    await createAndBroadcastMessage(getIO(req), convo, req.user.id, {
      type: "system",
      text: `${displayName(actor)} đã đổi tên nhóm thành "${name}"`,
    });
    await broadcastUpdated(getIO(req), convo);
  }
  return res.json({ conversation: await respond(convo, req.user.id) });
};

// POST /api/conversations/:id/avatar  (multipart "file", group creator only)
export const updateGroupAvatar = async (req, res) => {
  const convo = await loadGroupForMember(req, res);
  if (!convo) return;
  if (!isCreator(convo, req.user.id)) {
    return res.status(403).json({ message: "Chỉ trưởng nhóm được đổi ảnh nhóm." });
  }

  const check = validateUpload(req.file, { imagesOnly: true });
  if (check.error) return res.status(400).json({ message: check.error });
  if (!isStorageConfigured()) return res.status(503).json({ message: STORAGE_MISSING_MESSAGE });

  try {
    const uploaded = await uploadBuffer(req.file, { folder: "memo-chat/groups", kind: "image" });
    convo.avatarUrl = uploaded.secure_url;
    await convo.save();
  } catch {
    return res.status(502).json({ message: "Tải ảnh lên thất bại. Thử lại sau." });
  }

  await broadcastUpdated(getIO(req), convo);
  return res.json({ conversation: await respond(convo, req.user.id) });
};

// POST /api/conversations/:id/members  { memberIds }   (any member)
export const addMembersToGroup = async (req, res) => {
  const convo = await loadGroupForMember(req, res);
  if (!convo) return;

  const prev = convo.members.map(String);
  const toAdd = normalizeIds(req.body?.memberIds).filter((id) => !prev.includes(id));
  if (toAdd.length === 0) return res.json({ conversation: await respond(convo, req.user.id) });

  const users = await User.find({ _id: { $in: toAdd } }).select("username email");
  if (users.length !== toAdd.length) {
    return res.status(400).json({ message: "Có người dùng không tồn tại." });
  }

  convo.members = [...prev, ...toAdd];
  await convo.save();

  const io = getIO(req);
  const actor = await User.findById(req.user.id).select("username email");
  await createAndBroadcastMessage(io, convo, req.user.id, {
    type: "system",
    text: `${displayName(actor)} đã thêm ${users.map(displayName).join(", ")} vào nhóm`,
  });

  for (const memberId of toAdd) {
    emitToUsers(io, [memberId], "conversation:added", {
      conversation: await respond(convo, memberId),
    });
  }
  await broadcastUpdated(io, convo);

  return res.json({ conversation: await respond(convo, req.user.id) });
};

// DELETE /api/conversations/:id/members/:memberId
// Creator removes others; anyone may remove themselves (leave).
export const removeMemberFromGroup = async (req, res) => {
  const convo = await loadGroupForMember(req, res);
  if (!convo) return;

  const userId = String(req.user.id);
  const memberId = String(req.params.memberId);
  const leaving = memberId === userId;
  const members = convo.members.map(String);

  if (!members.includes(memberId)) {
    return res.status(404).json({ message: "Người này không ở trong nhóm." });
  }
  if (!leaving && !isCreator(convo, userId)) {
    return res.status(403).json({ message: "Chỉ trưởng nhóm được xoá thành viên." });
  }

  const remaining = members.filter((m) => m !== memberId);
  const io = getIO(req);
  const [actor, target] = await Promise.all([
    User.findById(userId).select("username email"),
    User.findById(memberId).select("username email"),
  ]);

  emitToUsers(io, [memberId], "conversation:removed", { conversationId: String(convo._id) });
  // Take their sockets out of the group's room so typing events stop reaching them.
  io?.in(userRoom(memberId)).socketsLeave(conversationRoom(convo._id));

  if (remaining.length === 0) {
    const files = await Message.find({ conversationId: convo._id, fileUrl: { $exists: true } }).distinct("fileUrl");
    await Message.deleteMany({ conversationId: convo._id });
    await convo.deleteOne();
    destroyStoredFiles([...files, convo.avatarUrl].filter(Boolean));
    return res.json({ ok: true, deleted: true });
  }

  convo.members = remaining;
  convo.mutedBy = (convo.mutedBy || []).filter((m) => String(m) !== memberId);
  // Oldest remaining member takes over when the creator leaves.
  if (String(convo.createdBy) === memberId) convo.createdBy = remaining[0];
  await convo.save();

  await createAndBroadcastMessage(io, convo, userId, {
    type: "system",
    text: leaving
      ? `${displayName(actor)} đã rời nhóm`
      : `${displayName(actor)} đã xoá ${displayName(target)} khỏi nhóm`,
  });
  await broadcastUpdated(io, convo);

  return res.json({ ok: true });
};

// POST /api/conversations/:id/mute  { muted: boolean }
export const setMuted = async (req, res) => {
  const convo = await Conversation.findById(req.params.id).catch(() => null);
  if (!convo) return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện." });
  const userId = String(req.user.id);
  if (!convo.members.map(String).includes(userId)) {
    return res.status(403).json({ message: "Bạn không ở trong cuộc trò chuyện này." });
  }

  const others = (convo.mutedBy || []).filter((m) => String(m) !== userId);
  // timestamps:false so muting does not bump the conversation to the top of the list.
  await Conversation.updateOne(
    { _id: convo._id },
    { $set: { mutedBy: req.body?.muted ? [...others, userId] : others } },
    { timestamps: false },
  );

  return res.json({ conversation: await respond(convo, userId) });
};
