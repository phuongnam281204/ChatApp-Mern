import React from "react";
import { socket } from "../../lib/socket";
import {
  FiPhone,
  FiVideo,
  FiSearch,
  FiSmile,
  FiPaperclip,
  FiArrowLeft,
  FiChevronDown,
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
  onSendMessage,
  setError,
  onlineUserIds,
  onBack,
}) => {
  const [text, setText] = React.useState("");
  const [typingUserIds, setTypingUserIds] = React.useState(() => new Set());
  const [seenByOtherAt, setSeenByOtherAt] = React.useState(null);
  const typingTimeoutRef = React.useRef(null);
  const bottomRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const messageListRef = React.useRef(null);
  const wasNearBottomRef = React.useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = React.useState(false);

  const isNearBottom = React.useCallback(() => {
    const el = messageListRef.current;
    if (!el) return true;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    return distance <= 80;
  }, []);

  const jumpToLatest = React.useCallback((behavior = "auto") => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    wasNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const handleMessageScroll = React.useCallback(() => {
    const nearBottom = isNearBottom();
    wasNearBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }, [isNearBottom]);

  React.useEffect(() => {
    setText("");
    setTypingUserIds(new Set());
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    requestAnimationFrame(() => jumpToLatest("auto"));
  }, [conversation?.id, jumpToLatest]);

  React.useEffect(() => {
    if (!conversation) {
      setSeenByOtherAt(null);
      return;
    }

    if (conversation.type !== "direct") {
      setSeenByOtherAt(null);
      return;
    }

    const other = (conversation.members || []).find(
      (m) => String(m.id) !== String(me?.id),
    );
    const raw = other?.id
      ? conversation.lastReadAtByUser?.[String(other.id)]
      : null;
    setSeenByOtherAt(raw ? new Date(raw) : null);
  }, [
    conversation?.id,
    conversation?.type,
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
    if (wasNearBottomRef.current) {
      jumpToLatest("auto");
    } else {
      setShowJumpToLatest(true);
    }
  }, [conversation?.id, messages.length, jumpToLatest]);

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

  const handleInputHeight = (e) => {
    const el = e?.target || inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  };

  React.useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!conversation) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      const sent = onSendMessage
        ? onSendMessage({ conversationId: conversation.id, text: trimmed })
        : (() => {
            socket.emit("message:send", {
              conversationId: conversation.id,
              text: trimmed,
              clientMessageId: `${Date.now()}-${Math.random()
                .toString(16)
                .slice(2)}`,
            });
            return true;
          })();

      if (!sent) return;
      setText("");
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
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
    <div className="relative flex-1 min-h-0 h-full flex flex-col overflow-hidden">
      <div className="panel-header">
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <button
              type="button"
              className="rail-btn hover:bg-[var(--input-bg)]"
              onClick={onBack}
              title="Back"
            >
              <FiArrowLeft className="text-lg" />
            </button>
          ) : null}
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
            className="rail-btn hover:bg-[var(--input-bg)]"
            title="Call"
          >
            <FiPhone className="text-lg" />
          </button>
          <button
            type="button"
            className="rail-btn hover:bg-[var(--input-bg)]"
            title="Video"
          >
            <FiVideo className="text-lg" />
          </button>
          <button
            type="button"
            className="rail-btn hover:bg-[var(--input-bg)]"
            title="Search"
          >
            <FiSearch className="text-lg" />
          </button>
        </div>
      </div>

      <div
        ref={messageListRef}
        onScroll={handleMessageScroll}
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 py-5 space-y-3 chat-shell"
      >
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
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm ${
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
                  <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {m.text}
                  </div>
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

      {conversation && showJumpToLatest ? (
        <button
          type="button"
          onClick={() => jumpToLatest("auto")}
          className="absolute right-4 bottom-[88px] h-10 w-10 rounded-full grid place-items-center border"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--app-border)",
            color: "var(--accent)",
            boxShadow: "0 8px 20px rgba(0,0,0,0.22)",
          }}
          title="Tin nhắn mới nhất"
          aria-label="Tin nhắn mới nhất"
        >
          <FiChevronDown className="text-lg" />
        </button>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="p-3 flex items-center gap-2 panel"
        style={{ borderTop: "1px solid var(--app-border)" }}
      >
        <button
          type="button"
          className="rail-btn hover:bg-[var(--input-bg)]"
          title="Emoji"
        >
          <FiSmile className="text-lg" />
        </button>
        <button
          type="button"
          className="rail-btn hover:bg-[var(--input-bg)]"
          title="Attach"
        >
          <FiPaperclip className="text-lg" />
        </button>
        <textarea
          ref={inputRef}
          className="flex-1 input-soft rounded-2xl px-3 py-2 outline-none resize-none leading-5 max-h-[132px] overflow-y-auto"
          placeholder={
            conversation ? "Type a message" : "Select a conversation"
          }
          value={text}
          onChange={(e) => {
            handleChange(e);
            handleInputHeight(e);
          }}
          rows={1}
          disabled={!conversation}
        />
        <button
          className="btn-primary px-4 py-2 rounded-2xl disabled:opacity-50"
          disabled={!conversation || !text.trim()}
          type="submit"
        >
          Gui
        </button>
      </form>
    </div>
  );
};

export default Right;
