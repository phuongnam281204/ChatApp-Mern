// Load .env before any other module reads process.env at import time.
import "dotenv/config";
import http from "http";

import { createApp } from "./app.js";
import { connectDB } from "./lib/db.js";
import { createSocketServer } from "./socket/socket.js";

const PORT = process.env.PORT || 5000;
const app = createApp();

const httpServer = http.createServer(app);
const io = createSocketServer(httpServer);
app.set("io", io);
app.locals.io = io;

httpServer.listen(PORT, async () => {
  console.log("server is running on PORT:" + PORT);
  try {
    await connectDB();
  } catch {
    console.error(
      "Failed to connect MongoDB. Check MONGODB_URI and MongoDB is running.",
    );
    process.exitCode = 1;
    httpServer.close(() => process.exit(1));
  }
});
