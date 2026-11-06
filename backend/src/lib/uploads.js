import path from "node:path";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Files that run code when opened. Blocked by extension because MIME types
// from the browser are not trustworthy.
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".ps1", ".vbs",
  ".jar", ".apk", ".sh", ".dll", ".app", ".pif", ".reg",
]);

export function isStorageConfigured() {
  return Boolean(
    process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET),
  );
}

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  configured = true;
}

export const singleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
}).single("file");

/** Express middleware wrapper that turns multer errors into 400s. */
export function receiveFile(req, res, next) {
  singleFile(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File vượt quá 20MB." });
    }
    return res.status(400).json({ message: "Không đọc được file tải lên." });
  });
}

/**
 * Check an uploaded file. Returns { kind: "image" | "file" } or { error }.
 * `imagesOnly` is used for avatars.
 */
export function validateUpload(file, { imagesOnly = false } = {}) {
  if (!file) return { error: "Chưa chọn file." };
  const ext = path.extname(file.originalname || "").toLowerCase();
  const isImage = String(file.mimetype || "").startsWith("image/") && ext !== ".svg";

  if (imagesOnly && !isImage) return { error: "Vui lòng chọn một file ảnh (JPG, PNG, GIF, WebP)." };
  if (BLOCKED_EXTENSIONS.has(ext)) return { error: `Không cho phép gửi file ${ext}.` };
  if (isImage && file.size > MAX_IMAGE_BYTES) return { error: "Ảnh vượt quá 10MB." };
  if (file.size > MAX_FILE_BYTES) return { error: "File vượt quá 20MB." };
  return { kind: isImage ? "image" : "file" };
}

export const MAX_VOICE_SECONDS = 120;
export const MAX_VOICE_BYTES = 10 * 1024 * 1024;

/**
 * Check a recorded voice clip. Browsers record audio/webm (Chrome, Firefox)
 * or audio/mp4 (Safari); some label it video/* even with no picture.
 * Returns { duration } or { error }.
 */
export function validateVoice(file, rawDuration) {
  if (!file) return { error: "Chưa có đoạn ghi âm." };
  const type = String(file.mimetype || "");
  if (!/^(audio\/|video\/(webm|mp4|ogg))/.test(type)) {
    return { error: "Định dạng ghi âm không được hỗ trợ." };
  }
  if (file.size > MAX_VOICE_BYTES) return { error: "Đoạn ghi âm quá lớn." };

  const duration = Number(rawDuration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { error: "Thiếu thời lượng ghi âm." };
  }
  // A little slack for the recorder stopping a beat late.
  if (duration > MAX_VOICE_SECONDS + 2) {
    return { error: `Tin nhắn thoại tối đa ${MAX_VOICE_SECONDS / 60} phút.` };
  }
  return { duration: Math.round(Math.min(duration, MAX_VOICE_SECONDS) * 10) / 10 };
}

/**
 * Cloudinary converts on delivery when the extension changes, so every
 * browser gets an mp3 it can play regardless of what was recorded.
 */
export function asMp3Url(secureUrl) {
  return String(secureUrl).replace(/\.[a-z0-9]+(\?.*)?$/i, ".mp3");
}

export async function uploadBuffer(file, { folder, kind }) {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        // Cloudinary files audio under its "video" resource type.
        resource_type: kind === "image" ? "image" : kind === "audio" ? "video" : "raw",
        use_filename: true,
        unique_filename: true,
        filename_override: file.originalname,
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(file.buffer);
  });
}

/**
 * Find the Cloudinary asset behind a delivery URL we stored.
 * https://res.cloudinary.com/<cloud>/<type>/upload/v123/<public_id>.<ext>
 * Raw files keep the extension in their public_id; images and audio don't.
 */
export function parseCloudinaryUrl(url) {
  const match = String(url || "").match(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(?:.*?\/)?v\d+\/(.+)$/,
  );
  if (!match) return null;
  const [, resourceType, path] = match;
  const decoded = decodeURIComponent(path);
  return {
    resourceType,
    publicId: resourceType === "raw" ? decoded : decoded.replace(/\.[a-z0-9]+$/i, ""),
  };
}

/**
 * Delete stored files so revoked content stops being reachable by link.
 * Best effort: failures are logged, never thrown to the user.
 */
export async function destroyStoredFiles(urls) {
  if (!isStorageConfigured()) return;
  ensureConfigured();
  const assets = urls.map(parseCloudinaryUrl).filter(Boolean);
  await Promise.all(
    assets.map(({ publicId, resourceType }) =>
      cloudinary.uploader
        .destroy(publicId, { resource_type: resourceType, invalidate: true })
        .catch((err) => console.error("Cloudinary destroy failed:", publicId, err?.message)),
    ),
  );
}

export const STORAGE_MISSING_MESSAGE =
  "Chưa cấu hình lưu trữ file (CLOUDINARY_*) trên máy chủ.";
