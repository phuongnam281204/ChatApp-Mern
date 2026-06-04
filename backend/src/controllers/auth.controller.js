import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/user.model.js";
import {
  clearAuthCookie,
  setAuthCookie,
  signAccessToken,
} from "../lib/auth.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const signup = async (req, res) => {
  const { username, email, password, remember } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }
  if (String(password).length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }

  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) {
    return res.status(409).json({ message: "Email already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    username,
    email: String(email).toLowerCase(),
    passwordHash,
  });

  const token = signAccessToken({ sub: user._id.toString() });
  setAuthCookie(res, token, !!remember);

  return res.status(201).json({
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  });
};

export const login = async (req, res) => {
  const { email, password, remember } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const user = await User.findOne({
    email: String(email).toLowerCase(),
  }).select("+passwordHash");
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (!user.passwordHash) {
    return res
      .status(400)
      .json({ message: "Tài khoản này hãy dùng đăng nhập Google" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signAccessToken({ sub: user._id.toString() });
  setAuthCookie(res, token, !!remember);

  return res.json({
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  });
};

export const logout = async (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
};

export const loginWithGoogle = async (req, res) => {
  const { credential, remember } = req.body || {};
  if (!credential) {
    return res.status(400).json({ message: "Missing Google credential" });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res
      .status(500)
      .json({ message: "GOOGLE_CLIENT_ID is not configured" });
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.email) {
    return res.status(401).json({ message: "Google token invalid" });
  }

  const email = String(payload.email).toLowerCase();
  const googleId = String(payload.sub);
  const suggestedName = String(payload.name || email.split("@")[0] || "User")
    .trim()
    .slice(0, 50);

  let user = await User.findOne({ $or: [{ googleId }, { email }] });
  if (!user) {
    user = await User.create({
      username: suggestedName || "User",
      email,
      googleId,
      avatarUrl: payload.picture,
    });
  } else {
    let changed = false;
    if (!user.googleId) {
      user.googleId = googleId;
      changed = true;
    }
    if (!user.avatarUrl && payload.picture) {
      user.avatarUrl = payload.picture;
      changed = true;
    }
    if (changed) await user.save();
  }

  const token = signAccessToken({ sub: user._id.toString() });
  setAuthCookie(res, token, !!remember);

  return res.json({
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  });
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ message: "Missing email" });
  }

  const user = await User.findOne({
    email: String(email).toLowerCase(),
  }).select("+passwordResetTokenHash +passwordResetExpiresAt");
  if (!user) {
    return res.json({
      ok: true,
      message: "Nếu email tồn tại, mã đặt lại đã được tạo",
    });
  }

  const resetToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();

  const output = {
    ok: true,
    message: "Mã đặt lại đã được tạo. Hãy tiếp tục bước đặt lại mật khẩu.",
  };
  if (process.env.NODE_ENV !== "production") {
    output.resetToken = resetToken;
  }
  return res.json(output);
};

export const resetPassword = async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ message: "Missing token or password" });
  }
  if (String(password).length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(String(token))
    .digest("hex");
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetExpiresAt +passwordHash");

  if (!user) {
    return res
      .status(400)
      .json({ message: "Mã đặt lại không hợp lệ hoặc đã hết hạn" });
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();

  return res.json({ ok: true, message: "Đặt lại mật khẩu thành công" });
};
