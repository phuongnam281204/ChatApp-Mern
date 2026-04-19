import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";

export const listMessages = async (req, res) => {
  const userId = req.user.id;
  const { id: conversationId } = req.params;

  const convo = await Conversation.findById(conversationId);
  if (!convo)
    return res.status(404).json({ message: "Conversation not found" });
  if (!convo.members.map(String).includes(String(userId))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const limit = Math.min(parseInt(req.query.limit || "30", 10), 100);
  const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;

  const query = { conversationId };
  if (cursor && !Number.isNaN(cursor.getTime())) {
    query.createdAt = { $lt: cursor };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("senderId", "username email avatarUrl");

  const ordered = messages.reverse();

  const nextCursor = ordered.length ? ordered[0].createdAt : null;

  return res.json({
    messages: ordered.map((m) => ({
      id: m._id,
      conversationId: m.conversationId,
      sender: {
        id: m.senderId?._id,
        username: m.senderId?.username,
        email: m.senderId?.email,
        avatarUrl: m.senderId?.avatarUrl,
      },
      type: m.type,
      text: m.text,
      fileUrl: m.fileUrl,
      fileName: m.fileName,
      clientMessageId: m.clientMessageId,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
    })),
    nextCursor,
  });
};
