// Display helpers shared by the list, the chat pane and the info panel.

export const REVOKE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function initials(name) {
  const text = String(name || "").trim();
  if (!text) return "?";
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function displayName(user) {
  return user?.username || user?.email || "Người dùng";
}

export function otherMember(conversation, me) {
  if (conversation?.type !== "direct") return null;
  return (conversation.members || []).find((m) => String(m.id) !== String(me?.id)) || null;
}

export function conversationTitle(conversation, me) {
  if (!conversation) return "Memo Chat";
  if (conversation.type === "group") return conversation.name || "Nhóm chat";
  return otherMember(conversation, me)?.username || "Tin nhắn trực tiếp";
}

export function conversationAvatar(conversation, me) {
  if (!conversation) return "";
  if (conversation.type === "group") return conversation.avatarUrl || "";
  return otherMember(conversation, me)?.avatarUrl || "";
}

export function isGroupOwner(conversation, me) {
  return conversation?.type === "group" && String(conversation.createdBy) === String(me?.id);
}

export function normalizeMessage(message) {
  if (!message) return null;
  return {
    ...message,
    id: String(message.id || message._id || ""),
    conversationId: String(message.conversationId || ""),
  };
}

export function normalizeConversation(conversation) {
  if (!conversation) return null;
  return { ...conversation, id: String(conversation.id || conversation._id || "") };
}

// Mirrors previewFor() on the server, for updates applied locally.
export function previewFor(message) {
  if (!message) return "";
  if (message.revoked) return "Tin nhắn đã bị thu hồi";
  if (message.type === "image") return "[Ảnh]";
  if (message.type === "audio") return "[Tin nhắn thoại]";
  if (message.type === "file") return `[File] ${message.fileName || ""}`.trim();
  return String(message.text || "").slice(0, 200);
}

function sameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

export function formatListTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (sameDay(now, date)) {
    return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(yesterday, date)) return "Hôm qua";
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function formatMessageTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (sameDay(now, date)) return "Hôm nay";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(yesterday, date)) return "Hôm qua";
  return date.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: now.getFullYear() === date.getFullYear() ? undefined : "numeric",
  });
}

/** 75.4 -> "1:15" */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function canRevoke(message, me) {
  return (
    String(message?.sender?.id) === String(me?.id) &&
    !message.revoked &&
    message.type !== "system" &&
    !message.optimistic &&
    Date.now() - new Date(message.createdAt).getTime() < REVOKE_WINDOW_MS
  );
}

export function canEdit(message, me) {
  return (
    String(message?.sender?.id) === String(me?.id) &&
    !message.revoked &&
    message.type === "text" &&
    !message.optimistic
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

/** Split text into plain strings and { url } parts so links can be rendered safely. */
export function splitLinks(text) {
  const parts = [];
  let last = 0;
  for (const match of String(text || "").matchAll(URL_PATTERN)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ url: match[0] });
    last = match.index + match[0].length;
  }
  if (last < String(text || "").length) parts.push(text.slice(last));
  return parts;
}
