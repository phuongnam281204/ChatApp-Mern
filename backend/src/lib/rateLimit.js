// Small fixed-window limiter kept in memory. Fine for the single backend
// container in docker-compose; with several instances use a shared store.

const buckets = new Map(); // key -> { count, resetAt }

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000).unref();

/**
 * rateLimit({ name, windowMs, max, key, message })
 * key(req) returns the identity to count (IP, IP+email, user id...).
 * Set DISABLE_RATE_LIMIT=1 to turn it off (the test suite does).
 */
export function rateLimit({ name, windowMs, max, key = (req) => req.ip, message }) {
  return (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === "1") return next();

    const id = `${name}:${key(req)}`;
    const now = Date.now();
    let bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(id, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      const minutes = Math.max(1, Math.ceil(retryAfter / 60));
      return res.status(429).json({ message: message || `Bạn thao tác quá nhanh. Thử lại sau ${minutes} phút.` });
    }
    return next();
  };
}

export function resetRateLimits() {
  buckets.clear();
}

const MIN = 60 * 1000;
const emailOf = (req) => String(req.body?.email || "").trim().toLowerCase();

// Per-endpoint limits for the auth routes.
export const limits = {
  login: rateLimit({
    name: "login",
    windowMs: 15 * MIN,
    max: 10,
    key: (req) => `${req.ip}|${emailOf(req)}`,
    message: "Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút.",
  }),
  signup: rateLimit({ name: "signup", windowMs: 60 * MIN, max: 10 }),
  forgotByIp: rateLimit({ name: "forgot-ip", windowMs: 60 * MIN, max: 10 }),
  // Stops one inbox being flooded with reset emails.
  forgotByEmail: rateLimit({
    name: "forgot-email",
    windowMs: 60 * MIN,
    max: 3,
    key: emailOf,
    message: "Đã gửi nhiều email đặt lại cho địa chỉ này. Kiểm tra hộp thư hoặc thử lại sau 1 giờ.",
  }),
  reset: rateLimit({ name: "reset", windowMs: 15 * MIN, max: 10 }),
  google: rateLimit({ name: "google", windowMs: 15 * MIN, max: 20 }),
  changePassword: rateLimit({
    name: "change-password",
    windowMs: 15 * MIN,
    max: 10,
    key: (req) => req.user?.id || req.ip,
  }),
};
