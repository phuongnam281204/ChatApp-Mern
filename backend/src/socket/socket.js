import { Server } from "socket.io";
import Conversation from "../models/conversation.model.js";
import { resolveSession } from "../lib/auth.js";
import {
  conversationRoom,
  createAndBroadcastMessage,
  userRoom,
} from "../lib/realtime.js";
import { MAX_TEXT_LENGTH } from "../controllers/message.controller.js";

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;

  const parts = String(cookieHeader).split(";");
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    const key = rawKey;
    const value = rest.join("=");
    out[key] = decodeURIComponent(value || "");
  }
  return out;
}

export function createSocketServer(httpServer) {
  const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

  const io = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      credentials: true,
    },
  });

  const socketsByUserId = new Map(); // userId -> Set(socketId)

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers?.cookie);
      socket.user = await resolveSession(cookies.access_token);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  // Online status is only shared between people who have a conversation together.
  const contactsOf = async (userId) => {
    const ids = await Conversation.distinct("members", { members: userId });
    return ids.map(String).filter((id) => id !== String(userId));
  };

  const announce = async (userId, isOnline) => {
    const contacts = await contactsOf(userId).catch(() => []);
    for (const id of contacts) io.to(userRoom(id)).emit("presence:update", { userId, isOnline });
  };

  io.on("connection", async (socket) => {
    const userId = socket.user.id;

    socket.join(userRoom(userId));

    const set = socketsByUserId.get(userId) || new Set();
    set.add(socket.id);
    socketsByUserId.set(userId, set);

    const contacts = await contactsOf(userId).catch(() => []);
    socket.emit("presence:state", {
      userIds: contacts.filter((id) => socketsByUserId.has(id)),
    });

    if (set.size === 1) announce(userId, true);

    socket.on("conversation:join", async ({ conversationId }) => {
      if (!conversationId) return;
      const convo = await Conversation.findById(conversationId);
      if (!convo) return;
      if (!convo.members.map(String).includes(String(userId))) return;

      socket.join(conversationRoom(conversationId));
    });

    socket.on("typing:start", async ({ conversationId }) => {
      if (!conversationId) return;
      const convo =
        await Conversation.findById(conversationId).select("members");
      if (!convo) return;
      if (!convo.members.map(String).includes(String(userId))) return;

      socket.to(conversationRoom(conversationId)).emit("typing:update", {
        conversationId,
        userId,
        isTyping: true,
      });
    });

    socket.on("typing:stop", async ({ conversationId }) => {
      if (!conversationId) return;
      const convo =
        await Conversation.findById(conversationId).select("members");
      if (!convo) return;
      if (!convo.members.map(String).includes(String(userId))) return;

      socket.to(conversationRoom(conversationId)).emit("typing:update", {
        conversationId,
        userId,
        isTyping: false,
      });
    });

    socket.on(
      "message:send",
      async ({ conversationId, text, clientMessageId }) => {
        if (!conversationId) return;
        const normalizedText = String(text || "").trim();
        if (!normalizedText) return;
        const normalizedClientMessageId = clientMessageId
          ? String(clientMessageId)
          : undefined;

        if (normalizedText.length > MAX_TEXT_LENGTH) {
          socket.emit("message:error", {
            clientMessageId: normalizedClientMessageId,
            message: `Tin nhắn tối đa ${MAX_TEXT_LENGTH} ký tự.`,
          });
          return;
        }

        try {
          const convo = await Conversation.findById(conversationId);
          if (!convo) return;
          if (!convo.members.map(String).includes(String(userId))) return;

          await createAndBroadcastMessage(io, convo, userId, {
            type: "text",
            text: normalizedText,
            clientMessageId: normalizedClientMessageId,
          });
        } catch (err) {
          console.error("message:send failed", err?.message);
          socket.emit("message:error", {
            clientMessageId: normalizedClientMessageId,
            message: "Gửi tin nhắn thất bại. Thử lại.",
          });
        }
      },
    );

    socket.on("message:seen", async ({ conversationId }) => {
      if (!conversationId) return;
      const convo = await Conversation.findById(conversationId).select(
        "members lastReadAtByUser",
      );
      if (!convo) return;
      if (!convo.members.map(String).includes(String(userId))) return;

      const lastReadAt = new Date();
      // timestamps:false so reading does not move the conversation to the top.
      await Conversation.updateOne(
        { _id: convo._id },
        { $set: { [`lastReadAtByUser.${String(userId)}`]: lastReadAt } },
        { timestamps: false },
      );

      // Includes the reader: their other tabs and their own unread badge
      // need the new read time too.
      for (const memberId of convo.members.map(String)) {
        io.to(userRoom(memberId)).emit("conversation:seen", {
          conversationId,
          userId,
          lastReadAt,
        });
      }
    });

    socket.on("disconnect", () => {
      const current = socketsByUserId.get(userId);
      if (current) {
        current.delete(socket.id);
        if (current.size === 0) {
          socketsByUserId.delete(userId);
          announce(userId, false);
        } else {
          socketsByUserId.set(userId, current);
        }
      }
    });
  });

  return io;
}
