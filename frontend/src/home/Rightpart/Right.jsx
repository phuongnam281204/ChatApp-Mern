import React from "react";
import { socket } from "../../lib/socket";
import {
  FiPhone,
  FiVideo,
  FiSearch,
  FiSmile,
  FiPaperclip,
} from "react-icons/fi";

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

const Right = ({
  me,
  conversation,
  messages = [],
  setError,
  onlineUserIds,
}) => {
  const [text, setText] = React.useState("");
  const [typingUserIds, setTypingUserIds] = React.useState(() => new Set());
  const [seenByOtherAt, setSeenByOtherAt] = React.useState(null);
  const typingTimeoutRef = React.useRef(null);
  const bottomRef = React.useRef(null);

  React.useEffect(() => {
    setText("");
    setTypingUserIds(new Set());
    if (conversation?.type === "direct") {
      const other = (conversation.members || []).find(
        (m) => String(m.id) !== String(me?.id),
      );
      const raw = other?.id
        ? conversation.lastReadAtByUser?.[String(other.id)]
        : null;
      setSeenByOtherAt(raw ? new Date(raw) : null);
    } else {
      setSeenByOtherAt(null);
    }
  }, [
    conversation?.id,
    conversation?.type,
    conversation?.members,
    conversation?.lastReadAtByUser,
    me?.id,
  ]);

  React.useEffect(() => {
    const onTypingUpdate = ({ conversationId, userId, isTyping }) => {
      if (!conversationId || !userId) return;
      if (String(conversationId) !== String(conversation?.id)) return;
      if (String(userId) === String(me?.id)) return;

      setTypingUserIds((prev) => {
        const next = new Set(prev);
        const id = String(userId);
        if (isTyping) next.add(id);
        else next.delete(id);
        return next;
      });
    };

    const onConversationSeen = ({ conversationId, userId, lastReadAt }) => {
      if (!conversationId || !userId) return;
      if (String(conversationId) !== String(conversation?.id)) return;
      if (String(userId) === String(me?.id)) return;
      if (!lastReadAt) return;
      setSeenByOtherAt(new Date(lastReadAt));
    };

    socket.on("typing:update", onTypingUpdate);
    socket.on("conversation:seen", onConversationSeen);

    return () => {
      socket.off("typing:update", onTypingUpdate);
      socket.off("conversation:seen", onConversationSeen);
    };
  }, [conversation?.id, me?.id]);

  React.useEffect(() => {
    if (!conversation) return;
    socket.emit("message:seen", { conversationId: conversation.id });

    if (!messages.length) return;
    const last = messages[messages.length - 1];
    const fromOther = String(last.sender?.id) !== String(me?.id);
    if (fromOther)
      socket.emit("message:seen", { conversationId: conversation.id });
  }, [conversation, messages, me?.id]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.id, messages.length]);

  const sendTyping = React.useCallback(
    (isTyping) => {
      if (!conversation) return;
      socket.emit(isTyping ? "typing:start" : "typing:stop", {
        conversationId: conversation.id,
      });
    },
    [conversation],
  );

  const handleChange = (e) => {
    setText(e.target.value);
    if (!conversation) return;

    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 800);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!conversation) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      socket.emit("message:send", {
        conversationId: conversation.id,
        text: trimmed,
        clientMessageId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });
      setText("");
      sendTyping(false);
    } catch (err) {
      setError?.(err.message);
    }
  };

  const title = getConversationTitle(conversation, me);
  const avatarText = initialsFromName(title);

  const typingNames = React.useMemo(() => {
    if (!conversation || typingUserIds.size === 0) return "";
    const members = conversation.members || [];
    const names = Array.from(typingUserIds)
      .map((id) => members.find((m) => String(m.id) === String(id))?.username)
      .filter(Boolean);
    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]} đang nhập...`;
    return `${names.length} người đang nhập...`;
  }, [conversation, typingUserIds]);

  const statusText = React.useMemo(() => {
    if (!conversation) return "Chọn một đoạn chat để bắt đầu";
    if (typingNames) return typingNames;

    if (conversation.type === "direct") {
      const other = (conversation.members || []).find(
        (m) => String(m.id) !== String(me?.id),
      );
      if (!other) return "";
      const online = onlineUserIds?.has?.(String(other.id));
      return online ? "Đang hoạt động" : "Không hoạt động";
    }

    const memberCount = (conversation.members || []).length;
    return memberCount ? `${memberCount} thành viên` : "Nhóm";
  }, [conversation, me?.id, onlineUserIds, typingNames]);

  return (
    <div className="flex-1 h-full flex flex-col">
      <div className="panel-header" style={{ backgroundColor: "#ffffff" }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="avatar-circle" aria-hidden>
            {conversation ? avatarText : "?"}
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">
              {conversation ? title : "Select a conversation"}
            </div>
            <div className="text-xs muted truncate">
              {conversation ? statusText : "Chọn một đoạn chat để bắt đầu"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rail-btn hover:bg-[var(--app-bg)]"
            title="Call"
          >
            <FiPhone className="text-lg" />
          </button>
          <button
            type="button"
            className="rail-btn hover:bg-[var(--app-bg)]"
            title="Video"
          >
            <FiVideo className="text-lg" />
          </button>
          <button
            type="button"
            className="rail-btn hover:bg-[var(--app-bg)]"
            title="Search"
          >
            <FiSearch className="text-lg" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 chat-shell">
        {conversation ? (
          messages.map((m) => {
            const mine = String(m.sender?.id) === String(me?.id);
            const isLastMessage = m.id === messages[messages.length - 1]?.id;
            const showSeen =
              mine &&
              isLastMessage &&
              seenByOtherAt &&
              (!m.createdAt || seenByOtherAt >= new Date(m.createdAt));

            const showSenderName = conversation?.type === "group" && !mine;
            const senderLabel =
              m.sender?.username || m.sender?.email || "Thành viên";
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[62%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bubble-me" : "bubble-other"
                  }`}
                >
                  {showSenderName ? (
                    <div
                      className="text-xs mb-1 font-semibold"
                      style={{ color: "var(--text-other)" }}
                    >
                      {senderLabel}
                    </div>
                  ) : null}
                  <div>{m.text}</div>
                  <div className="text-[10px] mt-1 muted">
                    {m.createdAt
                      ? new Date(m.createdAt).toLocaleTimeString()
                      : ""}
                  </div>
                  {showSeen ? (
                    <div className="text-[10px] mt-1 muted text-right">
                      Đã xem
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <div className="muted">No conversation selected</div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-3 flex items-center gap-2"
        style={{
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--app-bg)",
        }}
      >
        <button type="button" className="rail-btn hover:bg-white" title="Emoji">
          <FiSmile className="text-lg" />
        </button>
        <button
          type="button"
          className="rail-btn hover:bg-white"
          title="Attach"
        >
          <FiPaperclip className="text-lg" />
        </button>
        <input
          className="flex-1 input-soft rounded-lg px-3 py-2 outline-none"
          placeholder={
            conversation ? "Type a message" : "Select a conversation"
          }
          value={text}
          onChange={handleChange}
          disabled={!conversation}
        />
        <button
          className="btn-primary px-4 py-2 rounded-lg disabled:opacity-50"
          disabled={!conversation || !text.trim()}
          type="submit"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Right;
