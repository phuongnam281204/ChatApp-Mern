import express from "express";
import dotenv from "dotenv";
import http from "http";
import cookieParser from "cookie-parser";
import cors from "cors";

import { connectDB } from "./lib/db.js";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import conversationRoutes from "./routes/conversation.route.js";
import messageRoutes from "./routes/message.route.js";
import { createSocketServer } from "./socket/socket.js";

dotenv.config();
const app = express();

// Required when running behind a reverse proxy (e.g. Nginx) in production.
app.set("trust proxy", 1);

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api", messageRoutes);

const httpServer = http.createServer(app);
const io = createSocketServer(httpServer);
app.set("io", io);
app.locals.io = io;

httpServer.listen(PORT, async () => {
  console.log("server is running on PORT:" + PORT);
  await connectDB();
});
