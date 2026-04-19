import { verifyAccessToken } from "../lib/auth.js";

export function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.access_token;
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.sub };

    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}
