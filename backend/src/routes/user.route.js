import express from "express";
import { getMe, searchUsers } from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.get("/me", requireAuth, getMe);
router.get("/search", requireAuth, searchUsers);

export default router;
