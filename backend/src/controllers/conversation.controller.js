import mongoose from "mongoose";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";

function userRoom(userId) {
  return `user:${userId}`;
}

function toConversationResponse(c) {
  const lastReadAtByUser = {};
  if (c?.lastReadAtByUser && typeof c.lastReadAtByUser.entries === "function") {
    for (const [userId, dt] of c.lastReadAtByUser.entries()) {
      lastReadAtByUser[String(userId)] = dt ? new Date(dt).toISOString() : null;
    }
  }

  return {
    id: c._id,
    type: c.type,
    name: c.type === "group" ? c.name : undefined,
    avatarUrl: c.avatarUrl,
    members: (c.members || []).map((m) => ({
      id: m._id,
      username: m.username,
      email: m.email,
      avatarUrl: m.avatarUrl,
    })),
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    lastReadAtByUser,
    updatedAt: c.updatedAt,
  };
}

function normalizeMemberIds(memberIds) {
  const ids = (memberIds || []).map((id) => String(id));
  const uniq = Array.from(new Set(ids));
  return uniq;
}

export const listConversations = async (req, res) => {
  const userId = req.user.id;

  const conversations = await Conversation.find({ members: userId })
    .sort({ updatedAt: -1 })
    .limit(50)
    .populate("members", "username email avatarUrl");

  return res.json({
    conversations: conversations.map((c) => toConversationResponse(c)),
  });
};

export const createDirectConversation = async (req, res) => {
  const userId = req.user.id;
  const { userId: otherUserId } = req.body || {};

  if (!otherUserId) return res.status(400).json({ message: "Missing userId" });
  if (String(otherUserId) === String(userId)) {
    return res
      .status(400)
      .json({ message: "Cannot create direct chat with yourself" });
  }

  const otherUser = await User.findById(otherUserId);
  if (!otherUser) return res.status(404).json({ message: "User not found" });

  const existing = await Conversation.findOne({
    type: "direct",
    members: { $all: [userId, otherUserId] },
    $expr: { $eq: [{ $size: "$members" }, 2] },
  }).populate("members", "username email avatarUrl");

  if (existing) {
    return res.status(200).json({
      conversation: {
        id: existing._id,
        type: existing.type,
        members: existing.members.map((m) => ({
          id: m._id,
          username: m.username,
          email: m.email,
          avatarUrl: m.avatarUrl,
        })),
        lastMessageAt: existing.lastMessageAt,
        lastMessagePreview: existing.lastMessagePreview,
        updatedAt: existing.updatedAt,
      },
    });
  }

  const conversation = await Conversation.create({
    type: "direct",
    members: [
      new mongoose.Types.ObjectId(userId),
      new mongoose.Types.ObjectId(otherUserId),
    ],
    createdBy: userId,
  });

  const populated = await Conversation.findById(conversation._id).populate(
    "members",
    "username email avatarUrl",
  );

  return res.status(201).json({
    conversation: {
      id: populated._id,
      type: populated.type,
      members: populated.members.map((m) => ({
        id: m._id,
        username: m.username,
        email: m.email,
        avatarUrl: m.avatarUrl,
      })),
      lastMessageAt: populated.lastMessageAt,
      lastMessagePreview: populated.lastMessagePreview,
      updatedAt: populated.updatedAt,
    },
  });
};

export const createGroupConversation = async (req, res) => {
  const userId = req.user.id;
  const { name, memberIds } = req.body || {};

  if (!name) return res.status(400).json({ message: "Missing name" });

  const normalized = normalizeMemberIds(memberIds);
  const allMembers = Array.from(new Set([String(userId), ...normalized]));
  if (allMembers.length < 3) {
    return res
      .status(400)
      .json({ message: "Group must have at least 3 members" });
  }

  const usersCount = await User.countDocuments({ _id: { $in: allMembers } });
  if (usersCount !== allMembers.length) {
    return res.status(400).json({ message: "Some members not found" });
  }

  const conversation = await Conversation.create({
    type: "group",
    name: String(name).trim(),
    members: allMembers.map((id) => new mongoose.Types.ObjectId(id)),
    createdBy: userId,
  });

  const populated = await Conversation.findById(conversation._id).populate(
    "members",
    "username email avatarUrl",
  );

  const responseConversation = toConversationResponse(populated);

  const io = req.app.get("io") || req.app.locals.io;
  if (io) {
    const addedMemberIds = allMembers.filter(
      (id) => String(id) !== String(userId),
    );

    for (const memberId of addedMemberIds) {
      io.to(userRoom(memberId)).emit("conversation:added", {
        conversation: responseConversation,
      });
      io.to(userRoom(memberId)).emit("notification:welcome", {
        conversationId: String(populated._id),
        text: `Bạn đã được thêm vào nhóm: ${responseConversation.name || "Group"}`,
        conversation: responseConversation,
      });
    }
  }

  return res.status(201).json({
    conversation: responseConversation,
  });
};

export const addMembersToGroup = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { memberIds } = req.body || {};

  const convo = await Conversation.findById(id);
  if (!convo)
    return res.status(404).json({ message: "Conversation not found" });
  if (convo.type !== "group")
    return res.status(400).json({ message: "Not a group" });

  if (!convo.members.map(String).includes(String(userId))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const normalized = normalizeMemberIds(memberIds);
  if (normalized.length === 0) return res.json({ ok: true });

  const usersCount = await User.countDocuments({ _id: { $in: normalized } });
  if (usersCount !== normalized.length) {
    return res.status(400).json({ message: "Some members not found" });
  }

  const prevMembers = convo.members.map(String);
  const nextMembers = Array.from(new Set([...prevMembers, ...normalized]));
  const addedNow = normalized.filter((id) => !prevMembers.includes(String(id)));
  convo.members = nextMembers;
  await convo.save();

  const io = req.app.get("io") || req.app.locals.io;
  if (io && addedNow.length) {
    const populated = await Conversation.findById(convo._id).populate(
      "members",
      "username email avatarUrl",
    );
    const responseConversation = toConversationResponse(populated);

    for (const memberId of addedNow) {
      io.to(userRoom(memberId)).emit("conversation:added", {
        conversation: responseConversation,
      });
      io.to(userRoom(memberId)).emit("notification:welcome", {
        conversationId: String(convo._id),
        text: `Bạn đã được thêm vào nhóm: ${responseConversation.name || "Group"}`,
        conversation: responseConversation,
      });
    }
  }

  return res.json({ ok: true });
};

export const removeMemberFromGroup = async (req, res) => {
  const userId = req.user.id;
  const { id, memberId } = req.params;

  const convo = await Conversation.findById(id);
  if (!convo)
    return res.status(404).json({ message: "Conversation not found" });
  if (convo.type !== "group")
    return res.status(400).json({ message: "Not a group" });

  if (!convo.members.map(String).includes(String(userId))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const remaining = convo.members
    .map(String)
    .filter((m) => m !== String(memberId));
  if (remaining.length < 3) {
    return res
      .status(400)
      .json({ message: "Group must have at least 3 members" });
  }

  convo.members = remaining;
  await convo.save();

  return res.json({ ok: true });
};
