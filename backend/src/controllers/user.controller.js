import User from "../models/user.model.js";
import { toPublicUser } from "../lib/serializers.js";
import {
  STORAGE_MISSING_MESSAGE,
  isStorageConfigured,
  uploadBuffer,
  validateUpload,
} from "../lib/uploads.js";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function meResponse(userId) {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) return null;
  return {
    ...toPublicUser(user),
    createdAt: user.createdAt,
    // Google-only accounts have no password yet; the UI then asks for a new one only.
    hasPassword: Boolean(user.passwordHash),
  };
}

// GET /api/users/me
export const getMe = async (req, res) => {
  const user = await meResponse(req.user.id);
  if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản." });
  return res.json({ user });
};

// PUT /api/users/me  { username?, avatarUrl? }
// Only the fields present in the body change, so renaming keeps the avatar.
export const updateMe = async (req, res) => {
  const body = req.body || {};
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản." });

  if ("username" in body) {
    const username = String(body.username || "").trim();
    if (username.length < 2 || username.length > 50) {
      return res.status(400).json({ message: "Tên hiển thị cần từ 2 đến 50 ký tự." });
    }
    user.username = username;
  }

  if ("avatarUrl" in body) {
    const avatarUrl = String(body.avatarUrl || "").trim();
    // Data URLs are the fallback when file storage is not configured.
    if (avatarUrl && !/^(https:\/\/|data:image\/)/.test(avatarUrl)) {
      return res.status(400).json({ message: "Ảnh đại diện không hợp lệ." });
    }
    user.avatarUrl = avatarUrl || undefined;
  }

  await user.save();
  return res.json({ user: await meResponse(user._id) });
};

// POST /api/users/me/avatar  (multipart "file")
export const uploadMyAvatar = async (req, res) => {
  const check = validateUpload(req.file, { imagesOnly: true });
  if (check.error) return res.status(400).json({ message: check.error });
  if (!isStorageConfigured()) return res.status(503).json({ message: STORAGE_MISSING_MESSAGE });

  let uploaded;
  try {
    uploaded = await uploadBuffer(req.file, { folder: "memo-chat/avatars", kind: "image" });
  } catch {
    return res.status(502).json({ message: "Tải ảnh lên thất bại. Thử lại sau." });
  }

  await User.updateOne({ _id: req.user.id }, { $set: { avatarUrl: uploaded.secure_url } });
  return res.json({ user: await meResponse(req.user.id) });
};

/** "nguyen.an@gmail.com" -> "ng***@gmail.com" */
function maskEmail(email) {
  const [local = "", domain = ""] = String(email || "").split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

// GET /api/users/search?q=
// Names match on any part (2+ characters). Emails only match when typed in
// full, and are masked unless that exact address was searched, so the
// search can't be used to collect other people's emails.
export const searchUsers = async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  if (q.length < 2) return res.json({ users: [] });

  const exactEmail = q.includes("@") ? q.toLowerCase() : null;
  const users = await User.find({
    $or: [
      { username: { $regex: escapeRegex(q), $options: "i" } },
      ...(exactEmail ? [{ email: exactEmail }] : []),
    ],
    _id: { $ne: req.user.id },
  })
    .limit(20)
    .select("username email avatarUrl");

  return res.json({
    users: users.map((u) => ({
      ...toPublicUser(u),
      email: u.email === exactEmail ? u.email : maskEmail(u.email),
    })),
  });
};
