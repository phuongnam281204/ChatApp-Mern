// Shapes sent to the client. Keep every response going through these so
// REST and socket payloads never drift apart.

export function toPublicUser(u) {
  if (!u) return null;
  return {
    id: u._id ?? u.id,
    username: u.username,
    email: u.email,
    avatarUrl: u.avatarUrl,
  };
}

export function toConversationResponse(c, viewerId, extras = {}) {
  const lastReadAtByUser = {};
  if (c?.lastReadAtByUser && typeof c.lastReadAtByUser.entries === "function") {
    for (const [userId, dt] of c.lastReadAtByUser.entries()) {
      lastReadAtByUser[String(userId)] = dt ? new Date(dt).toISOString() : null;
    }
  }

  const mutedBy = (c.mutedBy || []).map(String);

  return {
    id: c._id,
    type: c.type,
    name: c.type === "group" ? c.name : undefined,
    avatarUrl: c.avatarUrl,
    createdBy: c.createdBy ? String(c.createdBy) : undefined,
    members: (c.members || []).map(toPublicUser),
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    lastReadAtByUser,
    mutedByMe: viewerId ? mutedBy.includes(String(viewerId)) : false,
    unreadCount: extras.unreadCount ?? 0,
    updatedAt: c.updatedAt,
  };
}

export const REVOKED_TEXT = "Tin nhắn đã bị thu hồi";

export function toMessageResponse(m, sender) {
  const revoked = Boolean(m.deletedForAll);
  const populated = m.senderId && typeof m.senderId === "object" && m.senderId.username !== undefined;
  const senderSource = sender || (populated ? m.senderId : { _id: m.senderId });

  return {
    id: m._id,
    conversationId: m.conversationId,
    sender: toPublicUser(senderSource),
    type: m.type,
    text: revoked ? "" : m.text,
    fileUrl: revoked ? undefined : m.fileUrl,
    fileName: revoked ? undefined : m.fileName,
    fileSize: revoked ? undefined : m.fileSize,
    mimeType: revoked ? undefined : m.mimeType,
    duration: revoked ? undefined : m.duration,
    clientMessageId: m.clientMessageId,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    revoked,
  };
}

// One-line summary shown under the conversation name in the list.
export function previewFor(m) {
  if (m.deletedForAll) return REVOKED_TEXT;
  if (m.type === "image") return "[Ảnh]";
  if (m.type === "audio") return "[Tin nhắn thoại]";
  if (m.type === "file") return `[File] ${m.fileName || ""}`.trim();
  return String(m.text || "").slice(0, 200);
}
