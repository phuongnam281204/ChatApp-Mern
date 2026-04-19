import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  addMembersToGroup,
  createDirectConversation,
  createGroupConversation,
  listConversations,
  removeMemberFromGroup,
} from "../controllers/conversation.controller.js";

const router = express.Router();

router.get("/", requireAuth, listConversations);
router.post("/direct", requireAuth, createDirectConversation);
router.post("/group", requireAuth, createGroupConversation);
router.post("/:id/members", requireAuth, addMembersToGroup);
router.delete("/:id/members/:memberId", requireAuth, removeMemberFromGroup);

export default router;
