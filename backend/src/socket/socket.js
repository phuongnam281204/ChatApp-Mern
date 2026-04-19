import { Server } from "socket.io";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { verifyAccessToken } from "../lib/auth.js";

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

function conversationRoom(conversationId) {
  return `conversation:${conversationId}`;
}

function userRoom(userId) {
  return `user:${userId}`;
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

  io.use((socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers?.cookie;
      const cookies = parseCookies(cookieHeader);
      const token = cookies.access_token;
      if (!token) return next(new Error("Unauthorized"));

      const decoded = verifyAccessToken(token);
      socket.user = { id: decoded.sub };

      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.user.id;

    socket.join(userRoom(userId));

    const set = socketsByUserId.get(userId) || new Set();
    set.add(socket.id);
    socketsByUserId.set(userId, set);

    socket.emit("presence:state", {
      userIds: Array.from(socketsByUserId.keys()),
    });

    if (set.size === 1) {
      io.emit("presence:update", { userId, isOnline: true });
    }

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

        const convo = await Conversation.findById(conversationId);
        if (!convo) return;
        if (!convo.members.map(String).includes(String(userId))) return;

        const message = await Message.create({
          conversationId,
          senderId: userId,
          type: "text",
          text: normalizedText,
          clientMessageId: clientMessageId
            ? String(clientMessageId)
            : undefined,
        });

        convo.lastMessageAt = message.createdAt;
        convo.lastMessagePreview = normalizedText.slice(0, 200);
        await convo.save();

        const sender = await User.findById(userId).select(
          "username email avatarUrl",
        );

        io.to(conversationRoom(conversationId)).emit("message:new", {
          message: {
            id: message._id,
            conversationId,
            sender: {
              id: sender?._id || userId,
              username: sender?.username,
              email: sender?.email,
              avatarUrl: sender?.avatarUrl,
            },
            type: message.type,
            text: message.text,
            clientMessageId: message.clientMessageId,
            createdAt: message.createdAt,
          },
        });
      },
    );

    socket.on("message:seen", async ({ conversationId }) => {
      if (!conversationId) return;
      const convo = await Conversation.findById(conversationId).select(
        "members lastReadAtByUser",
      );
      if (!convo) return;
      if (!convo.members.map(String).includes(String(userId))) return;

      convo.lastReadAtByUser.set(String(userId), new Date());
      await convo.save();

      const lastReadAt = convo.lastReadAtByUser.get(String(userId));
      for (const memberId of convo.members.map(String)) {
        if (String(memberId) === String(userId)) continue;
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
          io.emit("presence:update", { userId, isOnline: false });
        } else {
          socketsByUserId.set(userId, current);
        }
      }
    });
  });

  return io;
}
