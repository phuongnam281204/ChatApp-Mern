import express from "express";
import {
  getMe,
  searchUsers,
  updateMe,
  uploadMyAvatar,
} from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { receiveFile } from "../lib/uploads.js";

const router = express.Router();

router.get("/me", requireAuth, getMe);
router.put("/me", requireAuth, updateMe);
router.post("/me/avatar", requireAuth, receiveFile, uploadMyAvatar);
router.get("/search", requireAuth, searchUsers);

export default router;
