import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import {
  clearAuthCookie,
  setAuthCookie,
  signAccessToken,
} from "../lib/auth.js";

export const signup = async (req, res) => {
  const { username, email, password } = req.body || {};

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
  setAuthCookie(res, token);

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
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const user = await User.findOne({
    email: String(email).toLowerCase(),
  }).select("+passwordHash");
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signAccessToken({ sub: user._id.toString() });
  setAuthCookie(res, token);

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
