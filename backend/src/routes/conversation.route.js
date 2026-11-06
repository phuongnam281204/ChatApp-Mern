import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  addMembersToGroup,
  createDirectConversation,
  createGroupConversation,
  listConversations,
  removeMemberFromGroup,
  setMuted,
  updateGroup,
  updateGroupAvatar,
} from "../controllers/conversation.controller.js";
import { receiveFile } from "../lib/uploads.js";

const router = express.Router();

router.get("/", requireAuth, listConversations);
router.post("/direct", requireAuth, createDirectConversation);
router.post("/group", requireAuth, createGroupConversation);
router.patch("/:id", requireAuth, updateGroup);
router.post("/:id/avatar", requireAuth, receiveFile, updateGroupAvatar);
router.post("/:id/members", requireAuth, addMembersToGroup);
router.delete("/:id/members/:memberId", requireAuth, removeMemberFromGroup);
router.post("/:id/mute", requireAuth, setMuted);

export default router;
