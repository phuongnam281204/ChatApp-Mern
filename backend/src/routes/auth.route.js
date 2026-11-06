import express from "express";
import {
  changePassword,
  forgotPassword,
  login,
  loginWithGoogle,
  logout,
  resetPassword,
  signup,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { limits } from "../lib/rateLimit.js";

const router = express.Router();

router.post("/signup", limits.signup, signup);
router.post("/login", limits.login, login);
router.post("/google", limits.google, loginWithGoogle);
router.post("/forgot-password", limits.forgotByIp, limits.forgotByEmail, forgotPassword);
router.post("/reset-password", limits.reset, resetPassword);
router.post("/change-password", requireAuth, limits.changePassword, changePassword);
// POST, not GET: a link or <img> on another site must not be able to log you out.
router.post("/logout", logout);

export default router;
