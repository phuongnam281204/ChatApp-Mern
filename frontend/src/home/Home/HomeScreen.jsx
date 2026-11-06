import React from "react";
import { apiFetch } from "../../lib/api";
import {
  FiBell,
  FiCheck,
  FiMessageSquare,
  FiPlus,
  FiSearch,
  FiSettings,
  FiUsers,
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

function otherMember(conversation, me) {
  if (conversation?.type !== "direct") return null;
  return (conversation.members || []).find(
    (member) => String(member.id) !== String(me?.id),
  );
}

function conversationTitle(conversation, me) {
  if (!conversation) return "";
  if (conversation.type === "group") return conversation.name || "Nhóm chat";
  return otherMember(conversation, me)?.username || "Tin nhắn trực tiếp";
}

function conversationAvatar(conversation, me) {
  if (!conversation) return "";
  if (conversation.type === "group") return conversation.avatarUrl || "";
  return otherMember(conversation, me)?.avatarUrl || "";
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) return "Hôm qua";
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function isUnread(conversation, me) {
  const lastMessageAt = conversation.lastMessageAt || conversation.updatedAt;
  if (!lastMessageAt || !me?.id) return false;
  const myReadAt = conversation.lastReadAtByUser?.[String(me.id)];
  return !myReadAt || new Date(lastMessageAt) > new Date(myReadAt);
}

export default function HomeScreen({
  me,
  conversations = [],
  selectedConversation,
  onSelectConversation,
  onOpenConversation,
  onCreatedConversation,
  onOpenProfile,
  onOpenSettings,
  setError,
  onlineUserIds,
}) {
  const [query, setQuery] = React.useState("");
  const [peopleQuery, setPeopleQuery] = React.useState("");
  const [people, setPeople] = React.useState([]);
  const [selectedUserIds, setSelectedUserIds] = React.useState(() => new Set());
  const [groupName, setGroupName] = React.useState("");
  const [searching, setSearching] = React.useState(false);

  const visibleConversations = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = Array.isArray(conversations) ? conversations.filter(Boolean) : [];
    if (!q) return items;
    return items.filter((conversation) => {
      const haystack = `${conversationTitle(conversation, me)} ${
        conversation.lastMessagePreview || ""
      }`.toLowerCase();
      return haystack.includes(q);
    });
  }, [conversations, me, query]);

  const onlineCount = React.useMemo(() => {
    return (conversations || []).filter((conversation) => {
      const other = otherMember(conversation, me);
      return other && onlineUserIds?.has?.(String(other.id));
    }).length;
  }, [conversations, me, onlineUserIds]);

  const searchPeople = async (event) => {
    event?.preventDefault();
    const q = peopleQuery.trim();
    if (!q) {
      setPeople([]);
      return;
    }

    setSearching(true);
    try {
      const data = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      setPeople(data.users || []);
    } catch (error) {
      setError?.(error.message);
    } finally {
      setSearching(false);
    }
  };

  const startDirect = async (userId) => {
    try {
      const data = await apiFetch("/api/conversations/direct", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      if (data?.conversation) {
        onCreatedConversation?.(data.conversation);
        setPeople([]);
        setPeopleQuery("");
      }
    } catch (error) {
      setError?.(error.message);
    }
  };

  const toggleSelectedUser = (userId) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      const id = String(userId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createGroup = async () => {
    const name = groupName.trim();
    const memberIds = Array.from(selectedUserIds);
    if (!name || memberIds.length < 2) {
      setError?.("Chọn ít nhất 2 người khác và đặt tên nhóm.");
      return;
    }

    try {
      const data = await apiFetch("/api/conversations/group", {
        method: "POST",
        body: JSON.stringify({ name, memberIds }),
      });
      if (data?.conversation) {
        onCreatedConversation?.(data.conversation);
        setGroupName("");
        setSelectedUserIds(new Set());
        setPeople([]);
        setPeopleQuery("");
      }
    } catch (error) {
      setError?.(error.message);
    }
  };

  const displayName = me?.username || me?.email || "Bạn";

  return (
    <div className="home-view">
      <aside className="side-panel">
        <header className="home-header">
          <button type="button" className="profile-chip" onClick={onOpenProfile}>
            <span className="avatar xl">
              {me?.avatarUrl ? <img src={me.avatarUrl} alt={displayName} /> : initials(displayName)}
            </span>
            <span>
              <strong>{displayName}</strong>
              <small>{me?.email || "Đang hoạt động"}</small>
            </span>
          </button>
          <div className="icon-actions">
            <button type="button" title="Thông báo" aria-label="Thông báo">
              <FiBell />
            </button>
            <button type="button" title="Cài đặt" aria-label="Cài đặt" onClick={onOpenSettings}>
              <FiSettings />
            </button>
          </div>
        </header>

        <div className="home-stats">
          <div>
            <strong>{conversations.length}</strong>
            <span>Cuộc trò chuyện</span>
          </div>
          <div>
            <strong>{onlineCount}</strong>
            <span>Đang online</span>
          </div>
          <div>
            <strong>{conversations.filter((c) => c.type === "group").length}</strong>
            <span>Nhóm</span>
          </div>
        </div>

        <label className="search-box">
          <FiSearch />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm trong cuộc trò chuyện"
          />
        </label>

        <section className="conversation-list" aria-label="Danh sách chat">
          {visibleConversations.map((conversation) => {
            const title = conversationTitle(conversation, me);
            const avatarUrl = conversationAvatar(conversation, me);
            const directOther = otherMember(conversation, me);
            const online = directOther && onlineUserIds?.has?.(String(directOther.id));
            const active =
              selectedConversation &&
              String(selectedConversation.id) === String(conversation.id);

            return (
              <button
                type="button"
                key={conversation.id}
                className={`conversation-item ${active ? "is-active" : ""}`}
                onClick={() => {
                  onSelectConversation?.(conversation);
                  onOpenConversation?.(conversation);
                }}
              >
                <span className="avatar">
                  {avatarUrl ? <img src={avatarUrl} alt={title} /> : initials(title)}
                  {online ? <i className="online-dot" /> : null}
                </span>
                <span className="conversation-main">
                  <span className="conversation-topline">
                    <strong>{title}</strong>
                    <small>{formatTime(conversation.lastMessageAt || conversation.updatedAt)}</small>
                  </span>
                  <span className="conversation-preview">
                    {conversation.lastMessagePreview || "Bắt đầu cuộc trò chuyện"}
                  </span>
                </span>
                {isUnread(conversation, me) ? <span className="unread-dot" /> : null}
              </button>
            );
          })}

          {visibleConversations.length === 0 ? (
            <div className="empty-state">
              <FiMessageSquare />
              <strong>Chưa có cuộc trò chuyện</strong>
              <span>Tìm một người ở khung bên cạnh để bắt đầu.</span>
            </div>
          ) : null}
        </section>
      </aside>

      <section className="compose-panel">
        <div className="compose-hero">
          <div>
            <span className="eyebrow">Tạo cuộc trò chuyện</span>
            <h2>Tìm người, chat riêng hoặc gom nhóm trong vài giây.</h2>
          </div>
          <div className="hero-icon">
            <FiUsers />
          </div>
        </div>

        <form className="people-search" onSubmit={searchPeople}>
          <label className="search-box">
            <FiSearch />
            <input
              value={peopleQuery}
              onChange={(event) => setPeopleQuery(event.target.value)}
              placeholder="Tìm theo username hoặc email"
            />
          </label>
          <button className="primary-action compact" disabled={searching}>
            {searching ? "Đang tìm..." : "Tìm"}
          </button>
        </form>

        {selectedUserIds.size > 0 ? (
          <div className="group-composer">
            <div>
              <strong>Tạo nhóm {selectedUserIds.size + 1} người</strong>
              <span>Chọn ít nhất 2 người khác để đủ điều kiện tạo nhóm.</span>
            </div>
            <div className="group-row">
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Tên nhóm"
              />
              <button
                type="button"
                className="primary-action compact"
                onClick={createGroup}
                disabled={!groupName.trim() || selectedUserIds.size < 2}
              >
                Tạo nhóm
              </button>
            </div>
          </div>
        ) : null}

        <div className="people-results">
          {people.map((person) => {
            const selected = selectedUserIds.has(String(person.id));
            return (
              <article className="person-row" key={person.id}>
                <span className="avatar">
                  {person.avatarUrl ? (
                    <img src={person.avatarUrl} alt={person.username} />
                  ) : (
                    initials(person.username || person.email)
                  )}
                </span>
                <span className="person-main">
                  <strong>{person.username}</strong>
                  <small>{person.email}</small>
                </span>
                <button
                  type="button"
                  title="Chat riêng"
                  aria-label="Chat riêng"
                  onClick={() => startDirect(person.id)}
                >
                  <FiMessageSquare />
                </button>
                <button
                  type="button"
                  className={selected ? "is-selected" : ""}
                  title="Chọn vào nhóm"
                  aria-label="Chọn vào nhóm"
                  onClick={() => toggleSelectedUser(person.id)}
                >
                  {selected ? <FiCheck /> : <FiPlus />}
                </button>
              </article>
            );
          })}

          {!people.length ? (
            <div className="empty-state wide">
              <FiSearch />
              <strong>Tìm bạn chat mới</strong>
              <span>Nhập vài ký tự để tìm người dùng đã đăng ký trong hệ thống.</span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
