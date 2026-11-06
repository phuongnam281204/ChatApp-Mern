import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { previewFor, toMessageResponse } from "./serializers.js";

export function userRoom(userId) {
  return `user:${userId}`;
}

export function conversationRoom(conversationId) {
  return `conversation:${conversationId}`;
}

export function getIO(req) {
  return req.app.get("io") || req.app.locals.io || null;
}

export function emitToUsers(io, userIds, event, payload) {
  if (!io) return;
  for (const id of new Set((userIds || []).map(String))) {
    io.to(userRoom(id)).emit(event, payload);
  }
}

/**
 * Create a message in `convo`, update the conversation preview, and push
 * `message:new` to every member. Used by the socket handler, uploads and
 * system events so they all behave the same.
 * Returns the response-shaped message, or null for a duplicate clientMessageId.
 */
export async function createAndBroadcastMessage(io, convo, senderId, fields) {
  let message;
  try {
    message = await Message.create({
      conversationId: convo._id,
      senderId,
      ...fields,
    });
  } catch (err) {
    if (err?.code === 11000) return null;
    throw err;
  }

  const sender = await User.findById(senderId).select("username email avatarUrl").lean();
  const response = toMessageResponse(message, sender || { _id: senderId });

  convo.lastMessageAt = message.createdAt;
  convo.lastMessagePreview = previewFor(message);
  await convo.save();

  emitToUsers(io, convo.members, "message:new", { message: response });
  return response;
}

/** Keep the list preview right after the latest message is edited or revoked. */
export async function refreshPreviewIfLatest(convo, message) {
  const latest = await Message.findOne({ conversationId: convo._id })
    .sort({ createdAt: -1 })
    .select("_id");
  if (latest && String(latest._id) === String(message._id)) {
    convo.lastMessagePreview = previewFor(message);
    await convo.save();
  }
}
