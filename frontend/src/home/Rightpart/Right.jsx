import React from "react";
import { socket } from "../../lib/socket";
import {
  FiArrowLeft,
  FiChevronDown,
  FiCopy,
  FiCornerUpLeft,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiInfo,
  FiMoreHorizontal,
  FiMic,
  FiPaperclip,
  FiSearch,
  FiSend,
  FiSmile,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import Avatar from "../../components/Avatar";
import EmojiPicker from "../../components/EmojiPicker";
import AudioPlayer from "../../components/AudioPlayer";
import { MAX_VOICE_SECONDS, useVoiceRecorder } from "../../lib/useVoiceRecorder";
import {
  canEdit,
  canRevoke,
  conversationAvatar,
  conversationTitle,
  formatBytes,
  formatDayLabel,
  formatDuration,
  formatMessageTime,
  otherMember,
  splitLinks,
} from "../../lib/chat";

const NEAR_BOTTOM_PX = 96;
const LOAD_OLDER_AT_PX = 80;
const MAX_TEXT_LENGTH = 4000;

function MessageText({ text }) {
  return (
    <p>
      {splitLinks(text).map((part, index) =>
        typeof part === "string" ? (
          <React.Fragment key={index}>{part}</React.Fragment>
        ) : (
          <a key={index} href={part.url} target="_blank" rel="noopener noreferrer">
            {part.url}
          </a>
        ),
      )}
    </p>
  );
}

function Attachment({ message, onImageLoad }) {
  if (message.type === "audio") {
    return <AudioPlayer src={message.fileUrl} duration={message.duration} />;
  }
  if (message.type === "image") {
    return (
      <a className="message-image" href={message.fileUrl} target="_blank" rel="noopener noreferrer">
        {/* Not lazy: the image has no size until it loads, so a lazy one may never be
            seen as "in view" and never load. A page is only 40 messages anyway. */}
        <img src={message.fileUrl} alt={message.fileName || "Ảnh"} decoding="async" onLoad={onImageLoad} />
      </a>
    );
  }
  return (
    <a className="message-file" href={message.fileUrl} target="_blank" rel="noopener noreferrer" download={message.fileName}>
      <FiFileText />
      <span>
        <strong>{message.fileName || "File"}</strong>
        <small>{formatBytes(message.fileSize)}</small>
      </span>
      <FiDownload />
    </a>
  );
}

function MessageMenu({ message, me, onEdit, onRevoke, onDeleteForMe, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const handle = (event) => {
      if (event.type === "keydown" ? event.key === "Escape" : !ref.current?.contains(event.target)) onClose();
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handle);
    };
  }, [onClose]);

  const act = (fn) => () => {
    onClose();
    fn();
  };

  return (
    <div className="message-menu" role="menu" ref={ref}>
      {message.type === "text" && !message.revoked ? (
        <button type="button" role="menuitem" onClick={act(() => navigator.clipboard?.writeText(message.text))}>
          <FiCopy /> Sao chép
        </button>
      ) : null}
      {canEdit(message, me) ? (
        <button type="button" role="menuitem" onClick={act(onEdit)}>
          <FiEdit2 /> Sửa
        </button>
      ) : null}
      {canRevoke(message, me) ? (
        <button type="button" role="menuitem" onClick={act(onRevoke)}>
          <FiCornerUpLeft /> Thu hồi
        </button>
      ) : null}
      <button type="button" role="menuitem" className="is-danger" onClick={act(onDeleteForMe)}>
        <FiTrash2 /> Xoá ở phía tôi
      </button>
    </div>
  );
}

function SearchBar({ onSearch, onJumpTo, onClose }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      setResults(await onSearch(query.trim()));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-search">
      <form onSubmit={submit}>
        <label className="search-box">
          <FiSearch />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && onClose()}
            placeholder="Tìm trong cuộc trò chuyện (ít nhất 2 ký tự)"
            aria-label="Tìm tin nhắn"
          />
        </label>
        <button className="primary-action compact" disabled={busy || query.trim().length < 2}>
          {busy ? "Đang tìm…" : "Tìm"}
        </button>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng tìm kiếm">
          <FiX />
        </button>
      </form>
      {results ? (
        <ul className="chat-search-results">
          {results.length ? (
            results.map((message) => (
              <li key={message.id}>
                <button type="button" onClick={() => onJumpTo(message.id)}>
                  <strong>{message.sender?.username || "Thành viên"}</strong>
                  <span>{message.text}</span>
                  <small>
                    {formatDayLabel(message.createdAt)} {formatMessageTime(message.createdAt)}
                  </small>
                </button>
              </li>
            ))
          ) : (
            <li className="empty-state">
              <span>Không có tin nhắn nào khớp.</span>
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default function Right({
  me,
  conversation,
  messages = [],
  hasMore,
  loadingOlder,
  onLoadOlder,
  onSendMessage,
  onEditMessage,
  onRevokeMessage,
  onDeleteForMe,
  onSendFile,
  onSearch,
  onEnsureLoaded,
  setError,
  onlineUserIds,
  onBack,
  onToggleInfo,
  searchSignal,
}) {
  const [text, setText] = React.useState("");
  const [editing, setEditing] = React.useState(null);
  const [typingUserIds, setTypingUserIds] = React.useState(() => new Set());
  const [seenByOtherAt, setSeenByOtherAt] = React.useState(null);
  const [showJumpToLatest, setShowJumpToLatest] = React.useState(false);
  const [menuFor, setMenuFor] = React.useState(null);
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [highlightId, setHighlightId] = React.useState(null);
  const voice = useVoiceRecorder({ onError: setError });
  const voiceReset = voice.reset;

  const typingTimeoutRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const listRef = React.useRef(null);
  const wasNearBottomRef = React.useRef(true);
  const prependAnchorRef = React.useRef(null);
  const lastMessageIdRef = React.useRef(null);

  const isNearBottom = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - (el.scrollTop + el.clientHeight) <= NEAR_BOTTOM_PX;
  }, []);

  const jumpToLatest = React.useCallback((behavior = "auto") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    wasNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const resizeInput = React.useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  // Reset per conversation.
  React.useEffect(() => {
    setText("");
    setEditing(null);
    setTypingUserIds(new Set());
    setSeenByOtherAt(null);
    setMenuFor(null);
    setSearchOpen(false);
    setEmojiOpen(false);
    voiceReset(); // switching chats drops an unsent recording and frees the mic
    lastMessageIdRef.current = null;
    if (inputRef.current) inputRef.current.style.height = "auto";
    requestAnimationFrame(() => jumpToLatest("auto"));
  }, [conversation?.id, jumpToLatest, voiceReset]);

  // "Tìm tin nhắn" in the info panel opens the search bar here.
  React.useEffect(() => {
    if (searchSignal) setSearchOpen(true);
  }, [searchSignal]);

  React.useEffect(() => {
    if (!conversation || conversation.type !== "direct") {
      setSeenByOtherAt(null);
      return;
    }
    const other = otherMember(conversation, me);
    const raw = other?.id ? conversation.lastReadAtByUser?.[String(other.id)] : null;
    setSeenByOtherAt(raw ? new Date(raw) : null);
  }, [conversation, me]);

  React.useEffect(() => {
    const onTypingUpdate = ({ conversationId, userId, isTyping }) => {
      if (String(conversationId) !== String(conversation?.id)) return;
      if (String(userId) === String(me?.id)) return;
      setTypingUserIds((prev) => {
        const next = new Set(prev);
        if (isTyping) next.add(String(userId));
        else next.delete(String(userId));
        return next;
      });
    };
    socket.on("typing:update", onTypingUpdate);
    return () => socket.off("typing:update", onTypingUpdate);
  }, [conversation?.id, me?.id]);

  // Mark as read whenever a new last message arrives in the open conversation.
  // Depends on the id only: the conversation object changes on every read
  // receipt, and depending on it would loop (seen -> update -> seen ...).
  const lastId = messages[messages.length - 1]?.id;
  const conversationId = conversation?.id;
  React.useEffect(() => {
    if (!conversationId || !lastId || String(lastId).startsWith("temp-")) return;
    socket.emit("message:seen", { conversationId });
  }, [conversationId, lastId]);

  // Keep the view pinned: older messages prepended keep their position,
  // a new last message scrolls down only if the reader was at the bottom.
  React.useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prependAnchorRef.current) {
      el.scrollTop = el.scrollHeight - prependAnchorRef.current;
      prependAnchorRef.current = null;
      return;
    }
    if (lastId && lastId !== lastMessageIdRef.current) {
      const isFirstLoad = lastMessageIdRef.current === null;
      const mine = String(messages[messages.length - 1]?.sender?.id) === String(me?.id);
      lastMessageIdRef.current = lastId;
      if (isFirstLoad || wasNearBottomRef.current || mine) jumpToLatest("auto");
      else setShowJumpToLatest(true);
    }
  }, [jumpToLatest, lastId, me?.id, messages]);

  React.useEffect(() => () => typingTimeoutRef.current && clearTimeout(typingTimeoutRef.current), []);

  const loadOlder = React.useCallback(async () => {
    const el = listRef.current;
    if (!el || !hasMore || loadingOlder) return;
    prependAnchorRef.current = el.scrollHeight - el.scrollTop;
    const added = await onLoadOlder?.();
    if (!added) prependAnchorRef.current = null;
  }, [hasMore, loadingOlder, onLoadOlder]);

  const sendTyping = React.useCallback(
    (isTyping) => {
      if (!conversation) return;
      socket.emit(isTyping ? "typing:start" : "typing:stop", { conversationId: conversation.id });
    },
    [conversation],
  );

  const handleChange = (event) => {
    setText(event.target.value);
    resizeInput();
    if (!conversation || editing) return;
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 900);
  };

  const startEdit = (message) => {
    setEditing(message);
    setText(message.text || "");
  };

  const cancelEdit = () => {
    setEditing(null);
    setText("");
  };

  // After entering or leaving edit mode: size the box to its text and focus it.
  React.useEffect(() => {
    resizeInput();
    if (editing) {
      const el = inputRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing, resizeInput]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!conversation || !trimmed) return;
    if (trimmed.length > MAX_TEXT_LENGTH) {
      setError?.(`Tin nhắn tối đa ${MAX_TEXT_LENGTH} ký tự.`);
      return;
    }

    if (editing) {
      if (trimmed !== editing.text && !(await onEditMessage?.(editing.id, trimmed))) return;
      cancelEdit();
      return;
    }

    if (!onSendMessage?.({ conversationId: conversation.id, text: trimmed })) return;
    setText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    sendTyping(false);
  };

  const insertEmoji = (emoji) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
      resizeInput();
    });
  };

  const sendVoice = async () => {
    if (!conversation) return;
    const clip = await voice.stop();
    if (!clip || clip.duration < 0.5 || !clip.blob.size) {
      setError?.("Đoạn ghi âm quá ngắn.");
      voice.reset();
      return;
    }
    const ext = clip.mimeType.includes("mp4") ? "m4a" : clip.mimeType.includes("ogg") ? "ogg" : "webm";
    const file = new File([clip.blob], `voice-${Date.now()}.${ext}`, { type: clip.mimeType.split(";")[0] });
    setUploading(true);
    try {
      await onSendFile?.(conversation.id, file, { kind: "audio", duration: clip.duration });
    } finally {
      setUploading(false);
      voice.reset();
    }
  };

  const pickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !conversation) return;
    setUploading(true);
    try {
      await onSendFile?.(conversation.id, file);
    } finally {
      setUploading(false);
    }
  };

  const jumpTo = async (messageId) => {
    if (!(await onEnsureLoaded?.(messageId))) {
      setError?.("Không tìm thấy tin nhắn này trong lịch sử đã tải.");
      return;
    }
    // Wait one tick so freshly loaded older messages are in the DOM.
    setTimeout(() => {
      const node = listRef.current?.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`);
      node?.scrollIntoView({ block: "center" });
      setHighlightId(String(messageId));
      setTimeout(() => setHighlightId(null), 2000);
    }, 0);
  };

  const title = conversationTitle(conversation, me);
  const typingText = React.useMemo(() => {
    if (!conversation || typingUserIds.size === 0) return "";
    const names = Array.from(typingUserIds)
      .map((id) => (conversation.members || []).find((m) => String(m.id) === id)?.username)
      .filter(Boolean);
    if (names.length === 1) return `${names[0]} đang nhập…`;
    if (names.length > 1) return `${names.length} người đang nhập…`;
    return "Đang nhập…";
  }, [conversation, typingUserIds]);

  const statusText = React.useMemo(() => {
    if (!conversation) return "";
    if (typingText) return typingText;
    if (conversation.type === "group") return `${(conversation.members || []).length} thành viên`;
    const other = otherMember(conversation, me);
    return onlineUserIds?.has?.(String(other?.id)) ? "Đang hoạt động" : "Không hoạt động";
  }, [conversation, me, onlineUserIds, typingText]);

  if (!conversation) {
    return (
      <div className="chat-view is-empty">
        <div className="empty-state wide">
          <strong>Chọn một cuộc trò chuyện</strong>
          <span>Chọn một người hoặc nhóm trong danh sách bên trái.</span>
        </div>
      </div>
    );
  }

  const lastMineId = [...messages].reverse().find((m) => String(m.sender?.id) === String(me?.id))?.id;

  return (
    <div className="chat-view">
      <header className="chat-header">
        <div className="chat-title">
          <button type="button" className="icon-button mobile-back" onClick={onBack} aria-label="Quay lại danh sách">
            <FiArrowLeft />
          </button>
          <Avatar src={conversationAvatar(conversation, me)} name={title} />
          <span className="min-w-0">
            <strong>{title}</strong>
            <small className={typingText ? "is-typing" : ""}>{statusText}</small>
          </span>
        </div>
        <div className="icon-actions">
          <button
            type="button"
            title="Tìm tin nhắn"
            aria-label="Tìm tin nhắn"
            aria-pressed={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <FiSearch />
          </button>
          <button type="button" className="info-toggle" title="Thông tin" aria-label="Thông tin cuộc trò chuyện" onClick={onToggleInfo}>
            <FiInfo />
          </button>
        </div>
      </header>

      {searchOpen ? <SearchBar onSearch={onSearch} onJumpTo={jumpTo} onClose={() => setSearchOpen(false)} /> : null}

      <div
        ref={listRef}
        className="message-list"
        onScroll={() => {
          const el = listRef.current;
          const nearBottom = isNearBottom();
          wasNearBottomRef.current = nearBottom;
          if (nearBottom) setShowJumpToLatest(false);
          if (el && el.scrollTop < LOAD_OLDER_AT_PX) loadOlder();
        }}
      >
        {hasMore ? (
          <div className="history-marker">{loadingOlder ? "Đang tải tin cũ…" : "Kéo lên để xem tin cũ hơn"}</div>
        ) : messages.length ? (
          <div className="history-marker">Đầu cuộc trò chuyện</div>
        ) : null}

        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const newDay =
            !prev || new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
          const dayDivider = newDay ? (
            <div className="day-divider" key={`day-${message.id}`}>
              <span>{formatDayLabel(message.createdAt)}</span>
            </div>
          ) : null;

          if (message.type === "system") {
            return (
              <React.Fragment key={message.id || message.clientMessageId}>
                {dayDivider}
                <div className="system-message" data-message-id={message.id}>
                  {message.text}
                </div>
              </React.Fragment>
            );
          }

          const mine = String(message.sender?.id) === String(me?.id);
          const showSeen =
            mine &&
            message.id === lastMineId &&
            message.id === lastId &&
            seenByOtherAt &&
            seenByOtherAt >= new Date(message.createdAt);
          const showAvatar = !mine && (!messages[index + 1] || String(messages[index + 1].sender?.id) !== String(message.sender?.id) || messages[index + 1].type === "system");

          return (
            <React.Fragment key={message.id || message.clientMessageId}>
              {dayDivider}
              <div
                className={`message-row ${mine ? "is-mine" : "is-other"} ${highlightId === String(message.id) ? "is-highlighted" : ""}`}
                data-message-id={message.id}
              >
                {!mine ? (
                  showAvatar ? (
                    <Avatar src={message.sender?.avatarUrl} name={message.sender?.username} size="small" />
                  ) : (
                    <span className="avatar-spacer" />
                  )
                ) : null}
                <div className={`message-bubble ${mine ? "mine" : "other"} ${message.revoked ? "is-revoked" : ""} ${message.type !== "text" && !message.revoked ? "has-attachment" : ""}`}>
                  {conversation.type === "group" && !mine && !message.revoked ? (
                    <strong className="sender-name">{message.sender?.username || "Thành viên"}</strong>
                  ) : null}
                  {message.revoked ? (
                    <p>Tin nhắn đã bị thu hồi</p>
                  ) : (
                    <>
                      {message.type !== "text" ? (
                        <Attachment
                          message={message}
                          // Images get their height only once loaded; stay pinned to
                          // the newest message if the reader was already at the bottom.
                          onImageLoad={() => wasNearBottomRef.current && jumpToLatest("auto")}
                        />
                      ) : null}
                      {message.text ? <MessageText text={message.text} /> : null}
                    </>
                  )}
                  <span>
                    {formatMessageTime(message.createdAt)}
                    {message.editedAt && !message.revoked ? " · đã sửa" : ""}
                    {message.optimistic ? " · đang gửi" : ""}
                    {message.failed ? " · gửi lỗi" : ""}
                  </span>
                  {showSeen ? <em>Đã xem</em> : null}
                </div>
                {!message.optimistic && !message.failed ? (
                  <div className="message-actions">
                    <button
                      type="button"
                      className="message-more"
                      aria-label="Tuỳ chọn tin nhắn"
                      aria-haspopup="menu"
                      aria-expanded={menuFor === message.id}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={() => setMenuFor(menuFor === message.id ? null : message.id)}
                    >
                      <FiMoreHorizontal />
                    </button>
                    {menuFor === message.id ? (
                      <MessageMenu
                        message={message}
                        me={me}
                        onClose={() => setMenuFor(null)}
                        onEdit={() => startEdit(message)}
                        onRevoke={() => onRevokeMessage?.(message.id)}
                        onDeleteForMe={() => onDeleteForMe?.(message.id)}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}

        {!messages.length ? (
          <div className="empty-state wide">
            <strong>Chưa có tin nhắn</strong>
            <span>Gửi tin nhắn đầu tiên ở ô bên dưới.</span>
          </div>
        ) : null}
      </div>

      {showJumpToLatest ? (
        <button type="button" className="jump-button" onClick={() => jumpToLatest("smooth")} aria-label="Xuống tin mới nhất">
          <FiChevronDown />
        </button>
      ) : null}

      <div className="composer-wrap">
        {editing ? (
          <div className="composer-banner">
            <FiEdit2 />
            <span>
              Đang sửa tin nhắn
              <small>{editing.text}</small>
            </span>
            <button type="button" className="icon-button" onClick={cancelEdit} aria-label="Huỷ sửa">
              <FiX />
            </button>
          </div>
        ) : null}
        {uploading ? (
          <div className="composer-banner" role="status">
            {voice.status === "idle" ? "Đang gửi file…" : "Đang gửi tin nhắn thoại…"}
          </div>
        ) : null}

        {voice.status === "recording" || voice.status === "stopped" ? (
          <div className="message-composer voice-recording" role="group" aria-label="Đang ghi âm">
            <button type="button" className="voice-cancel" onClick={voice.cancel} disabled={uploading} aria-label="Huỷ ghi âm" title="Huỷ">
              <FiTrash2 />
            </button>
            <span className={`voice-dot ${voice.status === "recording" ? "is-live" : ""}`} aria-hidden="true" />
            <span className="voice-elapsed" aria-live="polite">
              {formatDuration(voice.elapsed)}
              <small>
                {voice.status === "recording"
                  ? ` / ${formatDuration(MAX_VOICE_SECONDS)}`
                  : " · Đã đạt giới hạn, bấm Gửi hoặc Huỷ"}
              </small>
            </span>
            <button type="button" className="send-button voice-send" onClick={sendVoice} disabled={uploading} aria-label="Gửi tin nhắn thoại" title="Gửi">
              <FiSend />
            </button>
          </div>
        ) : (
        <form className="message-composer" onSubmit={handleSubmit}>
          <div className="emoji-anchor">
            <button
              type="button"
              title="Emoji"
              aria-label="Chèn emoji"
              aria-expanded={emojiOpen}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => setEmojiOpen((open) => !open)}
            >
              <FiSmile />
            </button>
            {emojiOpen ? <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} /> : null}
          </div>
          {!editing ? (
            <>
              <button type="button" title="Gửi ảnh hoặc file" aria-label="Gửi ảnh hoặc file" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <FiPaperclip />
              </button>
              <input ref={fileRef} type="file" className="zalo-hidden-input" onChange={pickFile} />
            </>
          ) : null}
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={MAX_TEXT_LENGTH}
            onChange={handleChange}
            placeholder={editing ? "Sửa tin nhắn…" : "Nhập tin nhắn…"}
            aria-label={editing ? "Sửa tin nhắn" : "Nhập tin nhắn"}
            onKeyDown={(event) => {
              if (event.key === "Escape" && editing) {
                event.preventDefault();
                cancelEdit();
              }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
          />
          {/* Empty box: the button records a voice message instead of sending text. */}
          {!editing && !text.trim() ? (
            <button
              type="button"
              className="send-button voice-start"
              onClick={voice.start}
              disabled={uploading || voice.status === "starting"}
              title="Ghi tin nhắn thoại"
              aria-label="Ghi tin nhắn thoại"
            >
              <FiMic />
            </button>
          ) : (
            <button type="submit" className="send-button" disabled={!text.trim()} title={editing ? "Lưu" : "Gửi"} aria-label={editing ? "Lưu tin nhắn" : "Gửi"}>
              <FiSend />
            </button>
          )}
        </form>
        )}
      </div>
    </div>
  );
}
