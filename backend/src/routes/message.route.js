import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { listMessages } from "../controllers/message.controller.js";

const router = express.Router();

router.get("/conversations/:id/messages", requireAuth, listMessages);

export default router;
