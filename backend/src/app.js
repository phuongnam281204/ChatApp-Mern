import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import conversationRoutes from "./routes/conversation.route.js";
import messageRoutes from "./routes/message.route.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Refuse state-changing requests sent from another site. Browsers attach an
 * Origin header to these; requests without one (curl, server-to-server)
 * carry no browser cookie risk and pass through.
 */
function sameOriginOnly(allowedOrigin) {
  return (req, res, next) => {
    const origin = req.get("origin");
    if (UNSAFE_METHODS.has(req.method) && origin && origin !== allowedOrigin) {
      return res.status(403).json({ message: "Yêu cầu bị chặn vì không đến từ Memo Chat." });
    }
    return next();
  };
}

// Builds the Express app without listening, so tests can drive it directly.
export function createApp() {
  const app = express();
  const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

  // Required when running behind a reverse proxy (e.g. Nginx) in production.
  app.set("trust proxy", 1);

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  app.use(cors({ origin: clientOrigin, credentials: true }));
  app.use(sameOriginOnly(clientOrigin));
  app.use(express.json({ limit: "3mb" }));
  app.use(cookieParser());

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/conversations", conversationRoutes);
  app.use("/api", messageRoutes);

  // Malformed input and unexpected failures end here instead of crashing the request.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ message: "Dữ liệu gửi lên không đúng định dạng." });
    }
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ message: "Dữ liệu gửi lên quá lớn." });
    }
    if (err?.name === "CastError") {
      return res.status(400).json({ message: "Mã không hợp lệ." });
    }
    if (err?.name === "ValidationError") {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    }
    console.error(err);
    return res.status(500).json({ message: "Lỗi máy chủ. Thử lại sau." });
  });

  return app;
}
