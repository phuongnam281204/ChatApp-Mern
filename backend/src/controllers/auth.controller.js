import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/user.model.js";
import { isMailConfigured, sendPasswordResetEmail } from "../lib/mailer.js";
import { clearAuthCookie, issueSession } from "../lib/auth.js";
import { toPublicUser } from "../lib/serializers.js";
import { getIO, userRoom } from "../lib/realtime.js";

const googleClient = new OAuth2Client();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;
const BAD_LOGIN = "Email hoặc mật khẩu không đúng.";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function passwordProblem(password) {
  const length = String(password || "").length;
  if (length < MIN_PASSWORD) return `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`;
  if (length > MAX_PASSWORD) return `Mật khẩu tối đa ${MAX_PASSWORD} ký tự.`;
  return null;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

// POST /api/auth/signup  { username, email, password, remember }
export const signup = async (req, res) => {
  const { password, remember } = req.body || {};
  const username = String(req.body?.username || "").trim();
  const email = normalizeEmail(req.body?.email);

  if (username.length < 2 || username.length > 50) {
    return res.status(400).json({ message: "Tên hiển thị cần từ 2 đến 50 ký tự." });
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return res.status(400).json({ message: "Email không hợp lệ." });
  }
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ message: problem });

  let user;
  try {
    user = await User.create({ username, email, passwordHash: await bcrypt.hash(String(password), 10) });
  } catch (err) {
    // Unique index on email: also catches two sign-ups racing each other.
    if (err?.code === 11000) return res.status(409).json({ message: "Email này đã được đăng ký." });
    throw err;
  }

  issueSession(res, user, Boolean(remember));
  return res.status(201).json({ user: toPublicUser(user) });
};

// POST /api/auth/login  { email, password, remember }
export const login = async (req, res) => {
  const { password, remember } = req.body || {};
  const email = normalizeEmail(req.body?.email);
  if (!email || !password) {
    return res.status(400).json({ message: "Nhập email và mật khẩu." });
  }

  const user = await User.findOne({ email }).select("+passwordHash +tokenVersion");
  if (!user) return res.status(401).json({ message: BAD_LOGIN });
  if (!user.passwordHash) {
    return res.status(400).json({
      message: "Tài khoản này đăng nhập bằng Google. Hãy dùng nút Google hoặc đặt mật khẩu qua Quên mật khẩu.",
    });
  }
  if (!(await bcrypt.compare(String(password), user.passwordHash))) {
    return res.status(401).json({ message: BAD_LOGIN });
  }

  issueSession(res, user, Boolean(remember));
  return res.json({ user: toPublicUser(user) });
};

// POST /api/auth/logout
export const logout = async (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
};

// POST /api/auth/google  { credential, remember }
export const loginWithGoogle = async (req, res) => {
  const { credential, remember } = req.body || {};
  if (!credential) return res.status(400).json({ message: "Thiếu thông tin đăng nhập Google." });
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ message: "Máy chủ chưa cấu hình đăng nhập Google." });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ message: "Đăng nhập Google không hợp lệ. Thử lại." });
  }
  if (!payload?.sub || !payload?.email) {
    return res.status(401).json({ message: "Đăng nhập Google không hợp lệ. Thử lại." });
  }
  // Without this, a Google account claiming someone else's (unverified) email
  // would be linked to that person's Memo account below.
  if (payload.email_verified !== true) {
    return res.status(401).json({ message: "Email của tài khoản Google này chưa được xác minh." });
  }

  const email = normalizeEmail(payload.email);
  const googleId = String(payload.sub);
  const suggestedName = String(payload.name || email.split("@")[0] || "Người dùng").trim().slice(0, 50);

  let user = await User.findOne({ $or: [{ googleId }, { email }] }).select("+tokenVersion");
  if (!user) {
    try {
      user = await User.create({
        username: suggestedName.length >= 2 ? suggestedName : "Người dùng",
        email,
        googleId,
        avatarUrl: payload.picture,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      user = await User.findOne({ $or: [{ googleId }, { email }] }).select("+tokenVersion");
    }
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

  issueSession(res, user, Boolean(remember));
  return res.json({ user: toPublicUser(user) });
};

// POST /api/auth/forgot-password  { email }
export const forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ message: "Email không hợp lệ." });

  const user = await User.findOne({ email }).select("+passwordResetTokenHash +passwordResetExpiresAt");
  // Same answer whether or not the email exists, so the form cannot be
  // used to find out who has an account.
  if (!user) return res.json({ ok: true, emailSent: isMailConfigured() });

  const resetToken = crypto.randomBytes(24).toString("hex");
  user.passwordResetTokenHash = hashToken(resetToken);
  user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();

  if (isMailConfigured()) {
    try {
      await sendPasswordResetEmail({ to: user.email, name: user.username, token: resetToken });
    } catch (err) {
      console.error("Failed to send reset email:", err?.message);
      return res.status(502).json({ message: "Không gửi được email đặt lại mật khẩu. Thử lại sau." });
    }
    return res.json({ ok: true, emailSent: true });
  }

  // No SMTP configured: outside production, hand the token back so the
  // flow can still be tested. In production this is a configuration error.
  if (process.env.NODE_ENV !== "production") {
    return res.json({ ok: true, emailSent: false, resetToken });
  }
  return res.status(503).json({ message: "Máy chủ chưa cấu hình gửi email. Liên hệ quản trị viên." });
};

// POST /api/auth/change-password  { currentPassword?, newPassword }
// Signs out every other device; this one gets a fresh cookie.
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const problem = passwordProblem(newPassword);
  if (problem) return res.status(400).json({ message: problem });

  const user = await User.findById(req.user.id).select("+passwordHash +tokenVersion");
  if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản." });

  // Google-only accounts may set a first password without a current one.
  if (user.passwordHash && !(await bcrypt.compare(String(currentPassword || ""), user.passwordHash))) {
    return res.status(400).json({ message: "Mật khẩu hiện tại không đúng." });
  }

  user.passwordHash = await bcrypt.hash(String(newPassword), 10);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  // Live sockets were authorised with the old token: close them. This tab
  // reconnects right away with the new cookie set below.
  getIO(req)?.in(userRoom(user._id)).disconnectSockets(true);
  issueSession(res, user, req.user.remember);
  return res.json({ ok: true });
};

// POST /api/auth/reset-password  { token, password }
// Signs out every device; the user logs in again with the new password.
export const resetPassword = async (req, res) => {
  const { token, password } = req.body || {};
  if (!token) return res.status(400).json({ message: "Thiếu mã đặt lại." });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ message: problem });

  const user = await User.findOne({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetExpiresAt +passwordHash +tokenVersion");
  if (!user) return res.status(400).json({ message: "Mã đặt lại không hợp lệ hoặc đã hết hạn." });

  user.passwordHash = await bcrypt.hash(String(password), 10);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  getIO(req)?.in(userRoom(user._id)).disconnectSockets(true);
  return res.json({ ok: true, message: "Đặt lại mật khẩu thành công." });
};
