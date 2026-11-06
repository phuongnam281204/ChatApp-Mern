import { resolveSession } from "../lib/auth.js";

export async function requireAuth(req, res, next) {
  try {
    req.user = await resolveSession(req.cookies?.access_token);
  } catch {
    return res.status(401).json({ message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." });
  }
  return next();
}
