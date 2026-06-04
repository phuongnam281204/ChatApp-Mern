import React from "react";
import User from "../Leftpart/User";
import { FiBell, FiEdit2, FiSearch, FiMonitor, FiCamera } from "react-icons/fi";

function uniqById(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const id = String(item?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function getOtherMember(conversation, me) {
  if (!conversation || conversation.type !== "direct") return null;
  return (conversation.members || []).find(
    (m) => String(m.id) !== String(me?.id),
  );
}

const StoryItem = ({ label, avatarUrl, fallbackText }) => (
  <div className="flex flex-col items-center gap-1 shrink-0 w-[64px]">
    <div className="relative">
      <div className="story-ring">
        <div className="story-inner">
          <div className="avatar-circle" style={{ width: 46, height: 46 }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={label}
                className="h-full w-full object-cover"
              />
            ) : (
              fallbackText
            )}
          </div>
        </div>
      </div>
      <span
        className="absolute right-1 bottom-1 h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor: "var(--accent)",
          border: "2px solid var(--surface)",
        }}
        aria-hidden
      />
    </div>
    <div className="text-[11px] truncate max-w-full muted">{label}</div>
  </div>
);

const HomeScreen = ({
  me,
  conversations,
  selectedConversation,
  onSelectConversation,
  onOpenConversation,
  onConversationsChanged,
  setError,
  onlineUserIds,
}) => {
  const [q, setQ] = React.useState("");

  const safeConversations = React.useMemo(() => {
    if (!Array.isArray(conversations)) return [];
    return conversations.filter(Boolean);
  }, [conversations]);

  const filteredConversations = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return safeConversations;
    return safeConversations.filter((c) => {
      const title =
        c.type === "group" ? c.name : getOtherMember(c, me)?.username;
      const hay = `${title || ""} ${c.lastMessagePreview || ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [q, safeConversations, me]);

  const storyUsers = React.useMemo(() => {
    const others = safeConversations
      .map((c) => getOtherMember(c, me))
      .filter(Boolean);
    return uniqById(others).slice(0, 5);
  }, [safeConversations, me]);

  return (
    <div className="h-full min-h-0 relative">
      <button
        type="button"
        className="absolute right-6 bottom-24 z-10 h-14 w-14 rounded-full grid place-items-center fab-btn"
        title="Soạn tin nhắn"
        onClick={() => {
          setError?.("Tính năng đang phát triển");
          Promise.resolve(onConversationsChanged?.()).catch(() => {});
        }}
      >
        <FiEdit2 className="text-xl" />
      </button>

      <div className="absolute inset-0 overflow-y-auto home-bg">
        <div className="max-w-[520px] mx-auto px-5 pt-6 pb-24">
          <div className="flex items-center gap-3 mb-5">
            <div
              className="h-10 w-10 rounded-2xl grid place-items-center border"
              style={{ borderColor: "var(--app-border)" }}
            >
              <FiMonitor className="text-lg" />
            </div>
            <div>
              <div className="font-semibold text-lg">Trang chu</div>
              <div className="text-xs muted">Noi bat hom nay</div>
            </div>
          </div>

          <div className="glass-card rounded-3xl overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <div className="grid grid-cols-3 items-center">
                <div className="flex items-center">
                  <div className="relative">
                    <div
                      className="avatar-circle"
                      style={{ width: 40, height: 40 }}
                    >
                      {me?.avatarUrl ? (
                        <img
                          src={me.avatarUrl}
                          alt={me?.username || me?.email || "Me"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        (me?.username || me?.email || "U")
                          .slice(0, 1)
                          .toUpperCase()
                      )}
                    </div>
                    <span className="status-dot" />
                  </div>
                </div>
                <div className="text-center font-semibold">The Velvet</div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rail-btn hover:bg-[var(--input-bg)]"
                    title="Thông báo"
                  >
                    <FiBell className="text-lg" />
                  </button>
                </div>
              </div>

              <label className="mt-4 input-soft rounded-full px-4 py-3 flex items-center gap-3">
                <FiSearch className="text-base muted" />
                <input
                  type="text"
                  className="grow outline-none bg-transparent text-sm"
                  placeholder="Tìm kiếm cuộc trò chuyện..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>

              <div className="mt-4 flex items-center gap-3 overflow-x-auto pb-1">
                <button type="button" className="shrink-0" title="Camera">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="h-[54px] w-[54px] rounded-full grid place-items-center border"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <FiCamera className="text-lg" />
                    </div>
                    <div className="text-[11px] muted">Toi</div>
                  </div>
                </button>

                {storyUsers.map((u) => (
                  <StoryItem
                    key={u.id}
                    label={u.username || "User"}
                    avatarUrl={u.avatarUrl}
                    fallbackText={(u.username || "U").slice(0, 1).toUpperCase()}
                  />
                ))}
              </div>
            </div>

            <div
              className="h-px"
              style={{ backgroundColor: "var(--app-border)" }}
            />

            <User
              me={me}
              conversations={filteredConversations}
              selectedConversation={selectedConversation}
              onSelectConversation={(c) => {
                onSelectConversation?.(c);
                onOpenConversation?.(c);
              }}
              onlineUserIds={onlineUserIds}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;
