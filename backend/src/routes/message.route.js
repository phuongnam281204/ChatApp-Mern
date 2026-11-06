import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  deleteMessage,
  editMessage,
  listMedia,
  listMessages,
  searchMessages,
  uploadAttachment,
} from "../controllers/message.controller.js";
import { receiveFile } from "../lib/uploads.js";

const router = express.Router();

router.get("/conversations/:id/messages", requireAuth, listMessages);
router.get("/conversations/:id/messages/search", requireAuth, searchMessages);
router.get("/conversations/:id/media", requireAuth, listMedia);
router.post("/conversations/:id/attachments", requireAuth, receiveFile, uploadAttachment);
router.patch("/messages/:messageId", requireAuth, editMessage);
router.delete("/messages/:messageId", requireAuth, deleteMessage);

export default router;
