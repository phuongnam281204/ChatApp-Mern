import express from "express";

import {
  forgotPassword,
  login,
  loginWithGoogle,
  logout,
  resetPassword,
  signup,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/signup", signup);

router.post("/login", login);

router.post("/google", loginWithGoogle);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

router.get("/logout", logout);

export default router;
