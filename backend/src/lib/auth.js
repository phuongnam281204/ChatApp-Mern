import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is not set");
  return value;
}

/** Token and cookie live exactly as long: 30 days with "remember me", else 1 day. */
function sessionDays(remember) {
  return remember ? 30 : 1;
}

/**
 * Cookie flags.
 * - Secure only when the site is served over HTTPS (from CLIENT_ORIGIN), so a
 *   plain-HTTP deployment can still log in. COOKIE_SECURE=true forces it.
 * - SameSite=Lax: the frontend and API share one site (same origin behind
 *   nginx, or localhost:5173 -> localhost:5001 in dev), and Lax keeps the
 *   cookie off cross-site POSTs (CSRF).
 */
function cookieOptions() {
  const origin = String(process.env.CLIENT_ORIGIN || "");
  const secure = origin.startsWith("https://") || process.env.COOKIE_SECURE === "true";
  return { httpOnly: true, secure, sameSite: "lax", path: "/" };
}

export function signAccessToken({ sub, ver = 0, remember = false }) {
  return jwt.sign({ sub, ver, rem: remember ? 1 : 0 }, secret(), {
    expiresIn: `${sessionDays(remember)}d`,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, secret());
}

/** Sign a token for `user` and set it as the auth cookie. */
export function issueSession(res, user, remember = false) {
  const token = signAccessToken({
    sub: String(user._id ?? user.id),
    ver: user.tokenVersion || 0,
    remember,
  });
  res.cookie("access_token", token, {
    ...cookieOptions(),
    maxAge: sessionDays(remember) * DAY_MS,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie("access_token", cookieOptions());
}

/**
 * Validate a token against the database. Fails when the user is gone or the
 * password changed since the token was issued (tokenVersion moved on).
 * Returns { id, remember }.
 */
export async function resolveSession(token) {
  if (!token) throw new Error("Unauthorized");
  const decoded = verifyAccessToken(token);
  const user = await User.findById(decoded.sub).select("+tokenVersion").lean();
  if (!user || (user.tokenVersion || 0) !== (decoded.ver || 0)) {
    throw new Error("Unauthorized");
  }
  return { id: String(user._id), remember: Boolean(decoded.rem) };
}
