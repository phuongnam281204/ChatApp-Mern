import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import {
  createAndBroadcastMessage,
  emitToUsers,
  getIO,
  refreshPreviewIfLatest,
  userRoom,
} from "../lib/realtime.js";
import { toMessageResponse } from "../lib/serializers.js";
import {
  STORAGE_MISSING_MESSAGE,
  asMp3Url,
  destroyStoredFiles,
  isStorageConfigured,
  uploadBuffer,
  validateUpload,
  validateVoice,
} from "../lib/uploads.js";

export const MAX_TEXT_LENGTH = 4000;
export const REVOKE_WINDOW_MS = 24 * 60 * 60 * 1000;

const SENDER_FIELDS = "username email avatarUrl";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadMemberConversation(req, res, conversationId) {
  const convo = await Conversation.findById(conversationId).catch(() => null);
  if (!convo) {
    res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện." });
    return null;
  }
  if (!convo.members.map(String).includes(String(req.user.id))) {
    res.status(403).json({ message: "Bạn không ở trong cuộc trò chuyện này." });
    return null;
  }
  return convo;
}

async function loadMessageForMember(req, res) {
  const message = await Message.findById(req.params.messageId).catch(() => null);
  if (!message) {
    res.status(404).json({ message: "Không tìm thấy tin nhắn." });
    return {};
  }
  const convo = await loadMemberConversation(req, res, message.conversationId);
  if (!convo) return {};
  return { message, convo };
}

// GET /api/conversations/:id/messages?limit=&cursor=
export const listMessages = async (req, res) => {
  const userId = req.user.id;
  const convo = await loadMemberConversation(req, res, req.params.id);
  if (!convo) return;

  const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10) || 30, 1), 100);
  const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;

  const query = { conversationId: convo._id, deletedFor: { $ne: userId } };
  if (cursor && !Number.isNaN(cursor.getTime())) {
    query.createdAt = { $lt: cursor };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("senderId", SENDER_FIELDS);

  const ordered = messages.reverse();
  return res.json({
    messages: ordered.map((m) => toMessageResponse(m)),
    nextCursor: ordered.length ? ordered[0].createdAt : null,
    hasMore: messages.length === limit,
  });
};

// GET /api/conversations/:id/messages/search?q=
export const searchMessages = async (req, res) => {
  const userId = req.user.id;
  const convo = await loadMemberConversation(req, res, req.params.id);
  if (!convo) return;

  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ messages: [] });

  const messages = await Message.find({
    conversationId: convo._id,
    type: "text",
    deletedForAll: { $ne: true },
    deletedFor: { $ne: userId },
    text: { $regex: escapeRegex(q.slice(0, 100)), $options: "i" },
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .populate("senderId", SENDER_FIELDS);

  return res.json({ messages: messages.map((m) => toMessageResponse(m)) });
};

// GET /api/conversations/:id/media?kind=image|file|link
export const listMedia = async (req, res) => {
  const userId = req.user.id;
  const convo = await loadMemberConversation(req, res, req.params.id);
  if (!convo) return;

  const kind = String(req.query.kind || "image");
  const base = {
    conversationId: convo._id,
    deletedForAll: { $ne: true },
    deletedFor: { $ne: userId },
  };
  const query =
    kind === "link"
      ? { ...base, type: "text", text: { $regex: "https?://", $options: "i" } }
      : { ...base, type: kind === "file" ? "file" : "image" };

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(30)
    .populate("senderId", SENDER_FIELDS);

  return res.json({ messages: messages.map((m) => toMessageResponse(m)) });
};

// PATCH /api/messages/:messageId  { text }
export const editMessage = async (req, res) => {
  const { message, convo } = await loadMessageForMember(req, res);
  if (!message) return;

  if (String(message.senderId) !== String(req.user.id)) {
    return res.status(403).json({ message: "Chỉ sửa được tin nhắn của bạn." });
  }
  if (message.deletedForAll) {
    return res.status(400).json({ message: "Tin nhắn đã bị thu hồi." });
  }
  if (message.type !== "text") {
    return res.status(400).json({ message: "Chỉ sửa được tin nhắn chữ." });
  }

  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ message: "Tin nhắn không được để trống." });
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ message: `Tin nhắn tối đa ${MAX_TEXT_LENGTH} ký tự.` });
  }

  if (text !== message.text) {
    message.text = text;
    message.editedAt = new Date();
    await message.save();
    await refreshPreviewIfLatest(convo, message);
  }

  await message.populate("senderId", SENDER_FIELDS);
  const response = toMessageResponse(message);
  emitToUsers(getIO(req), convo.members, "message:updated", { message: response });
  return res.json({ message: response });
};

// DELETE /api/messages/:messageId?scope=all|me
export const deleteMessage = async (req, res) => {
  const { message, convo } = await loadMessageForMember(req, res);
  if (!message) return;
  const userId = String(req.user.id);
  const scope = req.query.scope === "all" ? "all" : "me";

  if (scope === "me") {
    if (!message.deletedFor.map(String).includes(userId)) {
      message.deletedFor.push(userId);
      await message.save();
    }
    // Other tabs of the same user hide it too.
    getIO(req)?.to(userRoom(userId)).emit("message:hidden", {
      conversationId: String(convo._id),
      messageId: String(message._id),
    });
    return res.json({ ok: true });
  }

  if (String(message.senderId) !== userId) {
    return res.status(403).json({ message: "Chỉ thu hồi được tin nhắn của bạn." });
  }
  if (message.type === "system") {
    return res.status(400).json({ message: "Không thu hồi được tin hệ thống." });
  }
  if (Date.now() - new Date(message.createdAt).getTime() > REVOKE_WINDOW_MS) {
    return res.status(400).json({ message: "Chỉ thu hồi được tin gửi trong vòng 24 giờ." });
  }

  if (!message.deletedForAll) {
    const storedUrl = message.fileUrl;
    message.deletedForAll = true;
    // Drop the link too: revoked files must not stay reachable by URL.
    message.fileUrl = undefined;
    await message.save();
    await refreshPreviewIfLatest(convo, message);
    if (storedUrl) destroyStoredFiles([storedUrl]);
  }

  await message.populate("senderId", SENDER_FIELDS);
  const response = toMessageResponse(message);
  emitToUsers(getIO(req), convo.members, "message:updated", { message: response });
  return res.json({ message: response });
};

// Voice clip: multipart "file" + kind=audio + duration (seconds).
async function uploadVoice(req, res, convo) {
  const check = validateVoice(req.file, req.body?.duration);
  if (check.error) return res.status(400).json({ message: check.error });
  if (!isStorageConfigured()) return res.status(503).json({ message: STORAGE_MISSING_MESSAGE });

  let uploaded;
  try {
    uploaded = await uploadBuffer(req.file, { folder: "memo-chat/voice", kind: "audio" });
  } catch {
    return res.status(502).json({ message: "Tải tin nhắn thoại lên thất bại. Thử lại sau." });
  }

  // Prefer the length Cloudinary measured; fall back to the recorder's.
  const measured = Number(uploaded.duration);
  const duration = Number.isFinite(measured) && measured > 0
    ? Math.round(measured * 10) / 10
    : check.duration;

  const response = await createAndBroadcastMessage(getIO(req), convo, req.user.id, {
    type: "audio",
    fileUrl: asMp3Url(uploaded.secure_url),
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: "audio/mpeg",
    duration,
    clientMessageId: req.body?.clientMessageId ? String(req.body.clientMessageId) : undefined,
  });
  return res.status(201).json({ message: response });
}

// POST /api/conversations/:id/attachments  (multipart field "file")
export const uploadAttachment = async (req, res) => {
  const convo = await loadMemberConversation(req, res, req.params.id);
  if (!convo) return;

  if (req.body?.kind === "audio") return uploadVoice(req, res, convo);

  const check = validateUpload(req.file);
  if (check.error) return res.status(400).json({ message: check.error });
  if (!isStorageConfigured()) return res.status(503).json({ message: STORAGE_MISSING_MESSAGE });

  let uploaded;
  try {
    uploaded = await uploadBuffer(req.file, { folder: "memo-chat/attachments", kind: check.kind });
  } catch {
    return res.status(502).json({ message: "Tải file lên kho lưu trữ thất bại. Thử lại sau." });
  }

  const response = await createAndBroadcastMessage(getIO(req), convo, req.user.id, {
    type: check.kind,
    text: String(req.body?.caption || "").trim().slice(0, MAX_TEXT_LENGTH) || undefined,
    fileUrl: uploaded.secure_url,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    clientMessageId: req.body?.clientMessageId ? String(req.body.clientMessageId) : undefined,
  });

  return res.status(201).json({ message: response });
};
