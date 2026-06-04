import React from "react";

function getConversationTitle(conversation, me) {
  if (!conversation) return "";
  if (conversation.type === "group") return conversation.name || "Group";

  const other = (conversation.members || []).find(
    (m) => String(m.id) !== String(me?.id),
  );
  return other?.username || "Direct";
}

function initialsFromName(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function formatHomeTime(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - dt.getTime();
  if (diffMs < 60 * 1000) return "Vừa xong";

  const sameDay =
    now.getFullYear() === dt.getFullYear() &&
    now.getMonth() === dt.getMonth() &&
    now.getDate() === dt.getDate();
  if (sameDay) {
    return dt.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    yesterday.getFullYear() === dt.getFullYear() &&
    yesterday.getMonth() === dt.getMonth() &&
    yesterday.getDate() === dt.getDate();
  if (isYesterday) return "Hôm qua";

  const weekday = dt.getDay();
  if (diffMs < 7 * 24 * 60 * 60 * 1000) {
    if (weekday === 0) return "Chủ nhật";
    return `Thứ ${weekday + 1}`;
  }

  return dt.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

function getConversationAvatar(conversation, me) {
  if (!conversation) return null;
  if (conversation.type === "group") return conversation.avatarUrl || null;

  const other = (conversation.members || []).find(
    (m) => String(m.id) !== String(me?.id),
  );
  return other?.avatarUrl || null;
}

const User = ({
  me,
  conversations = [],
  selectedConversation,
  onSelectConversation,
  onlineUserIds,
}) => {
  const safeConversations = React.useMemo(() => {
    if (!Array.isArray(conversations)) return [];
    return conversations.filter(Boolean);
  }, [conversations]);

  return (
    <div>
      <div className="divide-y" style={{ borderColor: "var(--app-border)" }}>
        {safeConversations.map((c, index) => {
          const active =
            selectedConversation &&
            String(selectedConversation.id) === String(c.id);
          const title = getConversationTitle(c, me);
          const preview = c.lastMessagePreview || "";
          const avatarText = initialsFromName(title);

          const avatarUrl = getConversationAvatar(c, me);

          const myReadAt = me?.id ? c.lastReadAtByUser?.[String(me.id)] : null;
          const lastMsgAt = c.lastMessageAt || c.updatedAt;
          const isUnread =
            !!lastMsgAt &&
            (!myReadAt ||
              new Date(lastMsgAt).getTime() > new Date(myReadAt).getTime());

          const isDirect = c.type === "direct";
          const otherMember = isDirect
            ? (c.members || []).find((m) => String(m.id) !== String(me?.id))
            : null;
          const isOnline = otherMember
            ? onlineUserIds?.has?.(String(otherMember.id))
            : false;

          return (
            <button
              key={c.id}
              className={`w-full text-left ${
                active ? "list-item-active" : ""
              } hover:bg-[var(--input-bg)] reveal`}
              style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
              onClick={() => onSelectConversation?.(c)}
              type="button"
            >
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="relative shrink-0">
                  {isDirect ? (
                    <div className="story-ring">
                      <div className="story-inner">
                        <div
                          className="avatar-circle"
                          style={{ width: 46, height: 46 }}
                          aria-hidden
                        >
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            avatarText
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="avatar-circle"
                      style={{ width: 46, height: 46 }}
                      aria-hidden
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        avatarText
                      )}
                    </div>
                  )}
                  {isDirect && isOnline ? (
                    <span className="status-dot" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className="font-semibold truncate"
                        style={{ color: "var(--text-other)" }}
                      >
                        {title}
                      </div>
                      <div className="text-sm truncate muted">{preview}</div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="text-xs muted whitespace-nowrap">
                        {formatHomeTime(lastMsgAt)}
                      </div>
                      {isUnread ? (
                        <div
                          className="h-5 min-w-5 px-1 rounded-full text-[11px] font-bold grid place-items-center"
                          style={{
                            backgroundColor: "var(--accent)",
                            color: "#fff",
                          }}
                          aria-label="Chưa đọc"
                        >
                          1
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {safeConversations.length === 0 ? (
          <div className="px-4 py-6 muted">No conversations yet</div>
        ) : null}
      </div>
    </div>
  );
};

export default User;
