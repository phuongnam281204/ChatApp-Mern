import React from "react";
import { FiArrowLeft, FiBellOff, FiPlus, FiSearch, FiUsers } from "react-icons/fi";
import { apiFetch } from "../../lib/api";
import Avatar from "../../components/Avatar";
import PeopleSearch from "../../components/PeopleSearch";
import {
  conversationAvatar,
  conversationTitle,
  formatListTime,
  otherMember,
} from "../../lib/chat";

function NewChatPanel({ mode, onClose, onCreated, setError }) {
  const [selected, setSelected] = React.useState(() => new Map());
  const [groupName, setGroupName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const selectedIds = React.useMemo(() => new Set(selected.keys()), [selected]);

  const startDirect = async (person) => {
    setBusy(true);
    try {
      const data = await apiFetch("/api/conversations/direct", {
        method: "POST",
        body: JSON.stringify({ userId: person.id }),
      });
      if (data?.conversation) onCreated(data.conversation);
    } catch (error) {
      setError?.(error.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (person) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const id = String(person.id);
      if (next.has(id)) next.delete(id);
      else next.set(id, person);
      return next;
    });
  };

  const createGroup = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await apiFetch("/api/conversations/group", {
        method: "POST",
        body: JSON.stringify({ name: groupName.trim(), memberIds: Array.from(selected.keys()) }),
      });
      if (data?.conversation) onCreated(data.conversation);
    } catch (error) {
      setError?.(error.message);
    } finally {
      setBusy(false);
    }
  };

  const isGroup = mode === "group";
  return (
    <section className="new-chat-panel" aria-label={isGroup ? "Tạo nhóm" : "Tin nhắn mới"}>
      <header className="new-chat-header">
        <button type="button" onClick={onClose} title="Quay lại" aria-label="Quay lại danh sách">
          <FiArrowLeft />
        </button>
        <strong>{isGroup ? "Tạo nhóm" : "Tin nhắn mới"}</strong>
      </header>

      {isGroup ? (
        <form className="group-composer" onSubmit={createGroup}>
          <div>
            <strong>{selected.size ? `Đã chọn ${selected.size} người` : "Chưa chọn ai"}</strong>
            <span>Nhóm cần ít nhất 2 người khác ngoài bạn.</span>
          </div>
          {selected.size ? (
            <div className="chip-row">
              {Array.from(selected.values()).map((person) => (
                <button type="button" key={person.id} className="chip" onClick={() => toggle(person)} aria-label={`Bỏ ${person.username}`}>
                  {person.username} ×
                </button>
              ))}
            </div>
          ) : null}
          <div className="group-row">
            <input
              value={groupName}
              maxLength={80}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Tên nhóm"
              aria-label="Tên nhóm"
            />
            <button className="primary-action compact" disabled={busy || !groupName.trim() || selected.size < 2}>
              Tạo nhóm
            </button>
          </div>
        </form>
      ) : null}

      <PeopleSearch
        mode={isGroup ? "select" : "direct"}
        selectedIds={selectedIds}
        onToggle={toggle}
        onPick={startDirect}
        onError={setError}
        emptyHint={
          isGroup
            ? "Tìm từng người theo tên hoặc email đầy đủ rồi bấm + để thêm vào nhóm."
            : "Tìm người theo tên hoặc email đầy đủ để bắt đầu nhắn tin."
        }
      />
    </section>
  );
}

export default function HomeScreen({
  me,
  conversations = [],
  selectedConversation,
  onOpenConversation,
  onCreatedConversation,
  setError,
  onlineUserIds,
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [newChatMode, setNewChatMode] = React.useState(null);

  const unreadTotal = conversations.filter((c) => c.unreadCount > 0).length;

  const visibleConversations = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter(Boolean).filter((conversation) => {
      if (filter === "unread" && !(conversation.unreadCount > 0)) return false;
      if (!q) return true;
      return `${conversationTitle(conversation, me)} ${conversation.lastMessagePreview || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [conversations, filter, me, query]);

  if (newChatMode) {
    return (
      <div className="home-view is-list-only">
        <aside className="side-panel">
          <NewChatPanel
            key={newChatMode}
            mode={newChatMode}
            onClose={() => setNewChatMode(null)}
            onCreated={(conversation) => {
              setNewChatMode(null);
              onCreatedConversation?.(conversation);
            }}
            setError={setError}
          />
        </aside>
      </div>
    );
  }

  return (
    <div className="home-view is-list-only">
      <aside className="side-panel">
        <header className="zalo-list-header">
          <label className="search-box">
            <FiSearch />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm cuộc trò chuyện"
              aria-label="Tìm cuộc trò chuyện"
            />
          </label>
          <button type="button" title="Tin nhắn mới" aria-label="Tin nhắn mới" onClick={() => setNewChatMode("direct")}>
            <FiPlus />
          </button>
          <button type="button" title="Tạo nhóm" aria-label="Tạo nhóm" onClick={() => setNewChatMode("group")}>
            <FiUsers />
          </button>
        </header>

        <div className="zalo-list-tabs" role="tablist" aria-label="Lọc cuộc trò chuyện">
          <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>
            Tất cả
          </button>
          <button type="button" role="tab" aria-selected={filter === "unread"} className={filter === "unread" ? "is-active" : ""} onClick={() => setFilter("unread")}>
            Chưa đọc{unreadTotal ? ` (${unreadTotal})` : ""}
          </button>
        </div>

        <section className="conversation-list" aria-label="Danh sách cuộc trò chuyện">
          {visibleConversations.map((conversation) => {
            const title = conversationTitle(conversation, me);
            const direct = otherMember(conversation, me);
            const online = Boolean(direct && onlineUserIds?.has?.(String(direct.id)));
            const active = String(selectedConversation?.id) === String(conversation.id);
            const unread = active ? 0 : conversation.unreadCount || 0;

            return (
              <button
                type="button"
                key={conversation.id}
                className={`conversation-item ${active ? "is-active" : ""} ${unread ? "has-unread" : ""}`}
                aria-current={active ? "true" : undefined}
                onClick={() => onOpenConversation?.(conversation)}
              >
                <Avatar src={conversationAvatar(conversation, me)} name={title} online={online} />
                <span className="conversation-main">
                  <span className="conversation-topline">
                    <strong>{title}</strong>
                    <small>{formatListTime(conversation.lastMessageAt || conversation.updatedAt)}</small>
                  </span>
                  <span className="conversation-bottomline">
                    <span className="conversation-preview">
                      {conversation.lastMessagePreview || "Chưa có tin nhắn"}
                    </span>
                    {conversation.mutedByMe ? <FiBellOff className="muted-icon" aria-label="Đã tắt thông báo" /> : null}
                    {unread ? (
                      <span className="unread-badge" aria-label={`${unread} tin chưa đọc`}>
                        {unread > 99 ? "99+" : unread}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}

          {visibleConversations.length === 0 ? (
            <div className="empty-state">
              <strong>
                {filter === "unread" && !query.trim() ? "Không có tin chưa đọc" : "Không có cuộc trò chuyện"}
              </strong>
              <span>
                {query.trim()
                  ? "Không có cuộc trò chuyện nào khớp."
                  : filter === "unread"
                    ? "Bạn đã đọc hết tin nhắn."
                    : "Bấm + để nhắn tin cho ai đó, hoặc biểu tượng nhóm để tạo nhóm."}
              </span>
            </div>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
