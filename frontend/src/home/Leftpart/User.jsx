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

const User = ({
  me,
  conversations = [],
  selectedConversation,
  onSelectConversation,
  onlineUserIds,
}) => {
  return (
    <div>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {conversations.map((c) => {
          const active =
            selectedConversation &&
            String(selectedConversation.id) === String(c.id);
          const title = getConversationTitle(c, me);
          const preview = c.lastMessagePreview || "";
          const avatarText = initialsFromName(title);

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
                active ? "list-item-active" : "bg-white"
              } hover:bg-[var(--app-bg)]`}
              onClick={() => onSelectConversation?.(c)}
              type="button"
            >
              <div className="list-item">
                <div className="relative">
                  <div className="avatar-circle" aria-hidden>
                    {avatarText}
                  </div>
                  {isDirect && isOnline ? (
                    <span className="status-dot" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <div
                      className="font-semibold truncate"
                      style={{ color: "var(--text-other)" }}
                    >
                      {title}
                    </div>
                    <div className="text-xs muted ml-2 whitespace-nowrap">
                      {c.lastMessageAt
                        ? new Date(c.lastMessageAt).toLocaleTimeString()
                        : ""}
                    </div>
                  </div>
                  <div className="text-sm truncate muted">{preview}</div>
                </div>
              </div>
            </button>
          );
        })}
        {conversations.length === 0 ? (
          <div className="px-4 py-6 muted">No conversations yet</div>
        ) : null}
      </div>
    </div>
  );
};

export default User;
