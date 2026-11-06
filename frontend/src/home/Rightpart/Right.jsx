import React from "react";
import { socket } from "../../lib/socket";
import {
  FiArrowLeft,
  FiChevronDown,
  FiMessageSquare,
  FiPaperclip,
  FiPhone,
  FiSearch,
  FiSend,
  FiSmile,
  FiVideo,
} from "react-icons/fi";

function initials(name) {
  const text = String(name || "").trim();
  if (!text) return "?";
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getOtherMember(conversation, me) {
  if (conversation?.type !== "direct") return null;
  return (conversation.members || []).find(
    (member) => String(member.id) !== String(me?.id),
  );
}

function getConversationTitle(conversation, me) {
  if (!conversation) return "";
  if (conversation.type === "group") return conversation.name || "Nhóm chat";
  return getOtherMember(conversation, me)?.username || "Tin nhắn trực tiếp";
}

function getAvatarUrl(conversation, me) {
  if (!conversation) return "";
  if (conversation.type === "group") return conversation.avatarUrl || "";
  return getOtherMember(conversation, me)?.avatarUrl || "";
}

function formatMessageTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Right({
  me,
  conversation,
  messages = [],
  onSendMessage,
  setError,
  onlineUserIds,
  onBack,
}) {
  const [text, setText] = React.useState("");
  const [typingUserIds, setTypingUserIds] = React.useState(() => new Set());
  const [seenByOtherAt, setSeenByOtherAt] = React.useState(null);
  const [showJumpToLatest, setShowJumpToLatest] = React.useState(false);
  const typingTimeoutRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);
  const wasNearBottomRef = React.useRef(true);

  const isNearBottom = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - (el.scrollTop + el.clientHeight) <= 96;
  }, []);

  const jumpToLatest = React.useCallback((behavior = "auto") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    wasNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  React.useEffect(() => {
    setText("");
    setTypingUserIds(new Set());
    setSeenByOtherAt(null);
    if (inputRef.current) inputRef.current.style.height = "auto";
    requestAnimationFrame(() => jumpToLatest("auto"));
  }, [conversation?.id, jumpToLatest]);

  React.useEffect(() => {
    if (!conversation || conversation.type !== "direct") {
      setSeenByOtherAt(null);
      return;
    }
    const other = getOtherMember(conversation, me);
    const raw = other?.id
      ? conversation.lastReadAtByUser?.[String(other.id)]
      : null;
    setSeenByOtherAt(raw ? new Date(raw) : null);
  }, [conversation, me]);

  React.useEffect(() => {
    const onTypingUpdate = ({ conversationId, userId, isTyping }) => {
      if (!conversationId || !userId) return;
      if (String(conversationId) !== String(conversation?.id)) return;
      if (String(userId) === String(me?.id)) return;

      setTypingUserIds((prev) => {
        const next = new Set(prev);
        if (isTyping) next.add(String(userId));
        else next.delete(String(userId));
        return next;
      });
    };

    const onConversationSeen = ({ conversationId, userId, lastReadAt }) => {
      if (String(conversationId) !== String(conversation?.id)) return;
      if (String(userId) === String(me?.id) || !lastReadAt) return;
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
  }, [conversation, messages.length]);

  React.useEffect(() => {
    if (wasNearBottomRef.current) jumpToLatest("auto");
    else setShowJumpToLatest(true);
  }, [jumpToLatest, messages.length]);

  React.useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const sendTyping = React.useCallback(
    (isTyping) => {
      if (!conversation) return;
      socket.emit(isTyping ? "typing:start" : "typing:stop", {
        conversationId: conversation.id,
      });
    },
    [conversation],
  );

  const resizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const handleChange = (event) => {
    setText(event.target.value);
    resizeInput();
    if (!conversation) return;
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 900);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!conversation || !trimmed) return;

    try {
      const sent = onSendMessage?.({ conversationId: conversation.id, text: trimmed });
      if (!sent) return;
      setText("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      sendTyping(false);
      requestAnimationFrame(() => jumpToLatest("auto"));
    } catch (error) {
      setError?.(error.message);
    }
  };

  const title = getConversationTitle(conversation, me);
  const avatarUrl = getAvatarUrl(conversation, me);
  const typingNames = React.useMemo(() => {
    if (!conversation || typingUserIds.size === 0) return "";
    const names = Array.from(typingUserIds)
      .map(
        (id) =>
          (conversation.members || []).find((member) => String(member.id) === id)
            ?.username,
      )
      .filter(Boolean);
    if (names.length === 1) return `${names[0]} đang nhập...`;
    if (names.length > 1) return `${names.length} người đang nhập...`;
    return "Đang nhập...";
  }, [conversation, typingUserIds]);

  const statusText = React.useMemo(() => {
    if (!conversation) return "Chọn một cuộc trò chuyện để bắt đầu";
    if (typingNames) return typingNames;
    if (conversation.type === "group") {
      return `${(conversation.members || []).length} thành viên`;
    }
    const other = getOtherMember(conversation, me);
    return onlineUserIds?.has?.(String(other?.id))
      ? "Đang hoạt động"
      : "Không hoạt động";
  }, [conversation, me, onlineUserIds, typingNames]);

  return (
    <div className="chat-view">
      <header className="chat-header">
        <div className="chat-title">
          <button type="button" className="icon-button mobile-back" onClick={onBack} title="Quay lại">
            <FiArrowLeft />
          </button>
          <span className="avatar">
            {avatarUrl ? <img src={avatarUrl} alt={title} /> : initials(title)}
          </span>
          <span className="min-w-0">
            <strong>{conversation ? title : "Vibe Chat"}</strong>
            <small>{statusText}</small>
          </span>
        </div>
        <div className="icon-actions">
          <button type="button" title="Gọi thoại" aria-label="Gọi thoại">
            <FiPhone />
          </button>
          <button type="button" title="Gọi video" aria-label="Gọi video">
            <FiVideo />
          </button>
          <button type="button" title="Tìm tin nhắn" aria-label="Tìm tin nhắn">
            <FiSearch />
          </button>
        </div>
      </header>

      <div
        ref={listRef}
        className="message-list"
        onScroll={() => {
          const nearBottom = isNearBottom();
          wasNearBottomRef.current = nearBottom;
          setShowJumpToLatest(!nearBottom);
        }}
      >
        {conversation ? (
          messages.length ? (
            messages.map((message) => {
              const mine = String(message.sender?.id) === String(me?.id);
              const last = message.id === messages[messages.length - 1]?.id;
              const showSeen =
                mine &&
                last &&
                seenByOtherAt &&
                (!message.createdAt || seenByOtherAt >= new Date(message.createdAt));

              return (
                <div
                  className={`message-row ${mine ? "is-mine" : "is-other"}`}
                  key={message.id || message.clientMessageId}
                >
                  {!mine ? (
                    <span className="avatar small">
                      {message.sender?.avatarUrl ? (
                        <img
                          src={message.sender.avatarUrl}
                          alt={message.sender?.username || ""}
                        />
                      ) : (
                        initials(message.sender?.username || message.sender?.email)
                      )}
                    </span>
                  ) : null}
                  <div className={`message-bubble ${mine ? "mine" : "other"}`}>
                    {conversation.type === "group" && !mine ? (
                      <strong className="sender-name">
                        {message.sender?.username || "Thành viên"}
                      </strong>
                    ) : null}
                    <p>{message.text}</p>
                    <span>
                      {formatMessageTime(message.createdAt)}
                      {message.optimistic ? " · đang gửi" : ""}
                    </span>
                    {showSeen ? <em>Đã xem</em> : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state wide">
              <FiMessageSquare />
              <strong>Chưa có tin nhắn</strong>
              <span>Gửi lời chào đầu tiên cho cuộc trò chuyện này.</span>
            </div>
          )
        ) : (
          <div className="empty-state wide">
            <FiMessageSquare />
            <strong>Chọn một cuộc trò chuyện</strong>
            <span>Danh sách chat nằm ở màn hình chính.</span>
          </div>
        )}
      </div>

      {conversation && showJumpToLatest ? (
        <button
          type="button"
          className="jump-button"
          onClick={() => jumpToLatest("smooth")}
          title="Tin mới nhất"
          aria-label="Tin mới nhất"
        >
          <FiChevronDown />
        </button>
      ) : null}

      <form className="message-composer" onSubmit={handleSubmit}>
        <button type="button" title="Emoji" aria-label="Emoji">
          <FiSmile />
        </button>
        <button type="button" title="Đính kèm" aria-label="Đính kèm">
          <FiPaperclip />
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={handleChange}
          placeholder={conversation ? "Nhập tin nhắn..." : "Chọn chat để nhập"}
          disabled={!conversation}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit(event);
            }
          }}
        />
        <button
          type="submit"
          className="send-button"
          disabled={!conversation || !text.trim()}
          title="Gửi"
          aria-label="Gửi"
        >
          <FiSend />
        </button>
      </form>
    </div>
  );
}
