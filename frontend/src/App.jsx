import React from "react";
import HomeScreen from "./home/Home/HomeScreen";
import Right from "./home/Rightpart/Right";
import AuthScreen from "./components/AuthScreen";
import AccountModal from "./components/AccountModal";
import InfoPanel from "./components/InfoPanel";
import NavRail from "./components/NavRail";
import SettingsModal from "./components/SettingsModal";
import { apiFetch, apiUpload } from "./lib/api";
import { socket } from "./lib/socket";
import {
  conversationTitle,
  normalizeConversation,
  normalizeMessage,
  previewFor,
} from "./lib/chat";
import {
  loadDesktopNotify,
  loadTheme,
  notificationPermission,
  resolveTheme,
  saveDesktopNotify,
  saveTheme,
} from "./lib/preferences";

const PAGE_SIZE = 40;
const MAX_JUMP_PAGES = 25;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const BLOCKED_EXTENSIONS = /\.(exe|bat|cmd|com|msi|scr|ps1|vbs|jar|apk|sh|dll|app|pif|reg)$/i;

function takeResetToken() {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("reset");
    if (!token) return "";
    url.searchParams.delete("reset");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    return token;
  } catch {
    return "";
  }
}

function upsert(list, conversation, { toTop = false } = {}) {
  const next = normalizeConversation(conversation);
  const index = list.findIndex((c) => String(c.id) === next.id);
  if (index === -1) return [next, ...list];
  const merged = { ...list[index], ...next };
  if (toTop) return [merged, ...list.filter((_, i) => i !== index)];
  return list.map((c, i) => (i === index ? merged : c));
}

export default function App() {
  const [theme, setTheme] = React.useState(loadTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState(() => resolveTheme(loadTheme()));
  const [desktopNotify, setDesktopNotify] = React.useState(loadDesktopNotify);
  const [resetToken] = React.useState(takeResetToken);

  const [booting, setBooting] = React.useState(true);
  const [me, setMe] = React.useState(null);
  const [conversations, setConversations] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [onlineUserIds, setOnlineUserIds] = React.useState(() => new Set());
  const [activeView, setActiveView] = React.useState("home");
  const [infoOpen, setInfoOpen] = React.useState(() => window.innerWidth > 1180);
  const [searchRequest, setSearchRequest] = React.useState(0);
  const [toast, setToast] = React.useState(null);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const toastTimerRef = React.useRef(null);
  const selectedIdRef = React.useRef(null);
  const meRef = React.useRef(null);
  const conversationsRef = React.useRef([]);
  const messagesRef = React.useRef([]);
  const cursorRef = React.useRef(null);
  const hasMoreRef = React.useRef(false);
  const desktopNotifyRef = React.useRef(desktopNotify);

  selectedIdRef.current = selectedId;
  meRef.current = me;
  conversationsRef.current = conversations;
  messagesRef.current = messages;
  hasMoreRef.current = hasMore;
  desktopNotifyRef.current = desktopNotify;

  const selectedConversation = React.useMemo(
    () => conversations.find((c) => String(c.id) === String(selectedId)) || null,
    [conversations, selectedId],
  );

  const showToast = React.useCallback((text, tone = "info") => {
    if (!text) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), 3600);
  }, []);
  const showError = React.useCallback((text) => showToast(text, "error"), [showToast]);

  // Theme: explicit choice or follow the OS.
  React.useEffect(() => {
    saveTheme(theme);
    setResolvedTheme(resolveTheme(theme));
    if (theme !== "system") return undefined;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => setResolvedTheme(resolveTheme("system"));
    media?.addEventListener?.("change", onChange);
    return () => media?.removeEventListener?.("change", onChange);
  }, [theme]);

  React.useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  const unreadTotal = conversations.filter(
    (c) => c.unreadCount > 0 && String(c.id) !== String(selectedId),
  ).length;
  React.useEffect(() => {
    document.title = unreadTotal ? `(${unreadTotal}) Memo Chat` : "Memo Chat";
  }, [unreadTotal]);

  const refreshConversations = React.useCallback(async () => {
    const data = await apiFetch("/api/conversations");
    setConversations((data.conversations || []).map(normalizeConversation));
  }, []);

  const refreshMe = React.useCallback(async () => {
    const data = await apiFetch("/api/users/me");
    setMe(data.user);
    return data.user;
  }, []);

  // Boot: restore the session from the cookie.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refreshMe();
        await refreshConversations();
      } catch (error) {
        if (alive && error.status !== 401) showError(error.message);
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshConversations, refreshMe, showError]);

  const onAuthenticated = React.useCallback(
    async (user) => {
      setMe(user);
      await Promise.all([refreshMe().catch(() => {}), refreshConversations().catch(() => {})]);
    },
    [refreshConversations, refreshMe],
  );

  const mergeMessage = React.useCallback((prev, raw) => {
    const incoming = normalizeMessage(raw);
    if (!incoming) return prev;
    const byId = prev.findIndex((m) => m.id === incoming.id);
    if (byId !== -1) return prev.map((m, i) => (i === byId ? { ...m, ...incoming, optimistic: false } : m));
    if (incoming.clientMessageId) {
      const byClient = prev.findIndex(
        (m) =>
          m.clientMessageId === incoming.clientMessageId &&
          String(m.sender?.id) === String(incoming.sender?.id),
      );
      if (byClient !== -1) {
        return prev.map((m, i) => (i === byClient ? { ...m, ...incoming, optimistic: false, failed: false } : m));
      }
    }
    return [...prev, incoming];
  }, []);

  const notify = React.useCallback((conversation, message) => {
    if (!desktopNotifyRef.current || notificationPermission() !== "granted") return;
    if (conversation?.mutedByMe || message.type === "system") return;
    const viewing = !document.hidden && String(selectedIdRef.current) === String(message.conversationId);
    if (viewing) return;
    try {
      const title = conversationTitle(conversation, meRef.current);
      const sender = message.sender?.username || "Tin nhắn mới";
      const body = conversation?.type === "group" ? `${sender}: ${previewFor(message)}` : previewFor(message);
      const n = new Notification(title, { body, tag: String(message.conversationId) });
      n.onclick = () => {
        window.focus();
        setSelectedId(String(message.conversationId));
        setActiveView("chat");
        n.close();
      };
    } catch {
      // Notifications can throw on some platforms (e.g. Android Chrome); ignore.
    }
  }, []);

  // Realtime.
  React.useEffect(() => {
    if (!me) return undefined;
    socket.connect();
    let connectedOnce = false;

    const onConnect = () => {
      if (selectedIdRef.current) socket.emit("conversation:join", { conversationId: selectedIdRef.current });
      if (connectedOnce) refreshConversations().catch(() => {});
      connectedOnce = true;
    };

    // The server closes sockets after a password change. This device has a
    // fresh cookie by then, so reconnect; socket.io won't do it on its own.
    const onDisconnect = (reason) => {
      if (reason === "io server disconnect") setTimeout(() => socket.connect(), 300);
    };

    // A rejected (re)connection usually means the session ended elsewhere
    // (password changed on another device). Confirm, then go to the login screen.
    const onConnectError = async () => {
      try {
        await apiFetch("/api/users/me");
      } catch (error) {
        if (error.status === 401) {
          socket.disconnect();
          setMe(null);
          setConversations([]);
          setSelectedId(null);
          setMessages([]);
          showToast("Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại.");
        }
      }
    };

    const onMessageNew = ({ message: raw }) => {
      const message = normalizeMessage(raw);
      if (!message) return;
      const mine = String(message.sender?.id) === String(meRef.current?.id);
      const isOpen = String(selectedIdRef.current) === message.conversationId;

      if (isOpen) setMessages((prev) => mergeMessage(prev, message));

      const conversation = conversationsRef.current.find((c) => c.id === message.conversationId);
      if (!conversation) {
        refreshConversations().catch(() => {});
        return;
      }
      const countsAsUnread = !mine && message.type !== "system" && !(isOpen && !document.hidden);
      setConversations((prev) =>
        upsert(
          prev,
          {
            ...conversation,
            lastMessageAt: message.createdAt,
            lastMessagePreview: previewFor(message),
            unreadCount: countsAsUnread ? (conversation.unreadCount || 0) + 1 : conversation.unreadCount || 0,
          },
          { toTop: true },
        ),
      );
      if (!mine) notify(conversation, message);
    };

    const onMessageUpdated = ({ message: raw }) => {
      const message = normalizeMessage(raw);
      if (!message) return;
      if (String(selectedIdRef.current) === message.conversationId) {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? mergeMessage(prev, message) : prev));
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === message.conversationId && new Date(c.lastMessageAt).getTime() === new Date(message.createdAt).getTime()
            ? { ...c, lastMessagePreview: previewFor(message) }
            : c,
        ),
      );
    };

    const onMessageHidden = ({ conversationId, messageId }) => {
      if (String(selectedIdRef.current) === String(conversationId)) {
        setMessages((prev) => prev.filter((m) => m.id !== String(messageId)));
      }
    };

    const onMessageError = ({ clientMessageId, message }) => {
      if (clientMessageId) {
        setMessages((prev) =>
          prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, optimistic: false, failed: true } : m)),
        );
      }
      showError(message || "Gửi tin nhắn thất bại.");
    };

    const onConversationAdded = ({ conversation }) => {
      if (!conversation?.id) return;
      setConversations((prev) => upsert(prev, conversation, { toTop: true }));
      showToast(`Bạn được thêm vào nhóm "${conversation.name || "Nhóm chat"}".`);
    };

    const onConversationUpdated = ({ conversation }) => {
      if (!conversation?.id) return;
      setConversations((prev) => upsert(prev, conversation));
    };

    const onConversationRemoved = ({ conversationId }) => {
      const removed = conversationsRef.current.find((c) => c.id === String(conversationId));
      setConversations((prev) => prev.filter((c) => c.id !== String(conversationId)));
      if (String(selectedIdRef.current) === String(conversationId)) {
        setSelectedId(null);
        setMessages([]);
        setActiveView("home");
      }
      if (removed) showToast(`Bạn không còn ở trong "${conversationTitle(removed, meRef.current)}".`);
    };

    const onConversationSeen = ({ conversationId, userId, lastReadAt }) => {
      if (!conversationId || !userId || !lastReadAt) return;
      const iso = new Date(lastReadAt).toISOString();
      const isMe = String(userId) === String(meRef.current?.id);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === String(conversationId)
            ? {
                ...c,
                lastReadAtByUser: { ...(c.lastReadAtByUser || {}), [String(userId)]: iso },
                unreadCount: isMe ? 0 : c.unreadCount,
              }
            : c,
        ),
      );
    };

    const onPresenceState = ({ userIds }) => setOnlineUserIds(new Set((userIds || []).map(String)));
    const onPresenceUpdate = ({ userId, isOnline }) => {
      if (!userId) return;
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(String(userId));
        else next.delete(String(userId));
        return next;
      });
    };

    const handlers = {
      connect: onConnect,
      disconnect: onDisconnect,
      connect_error: onConnectError,
      "message:new": onMessageNew,
      "message:updated": onMessageUpdated,
      "message:hidden": onMessageHidden,
      "message:error": onMessageError,
      "conversation:added": onConversationAdded,
      "conversation:updated": onConversationUpdated,
      "conversation:removed": onConversationRemoved,
      "conversation:seen": onConversationSeen,
      "presence:state": onPresenceState,
      "presence:update": onPresenceUpdate,
    };
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler);
      socket.disconnect();
    };
  }, [me, mergeMessage, notify, refreshConversations, showError, showToast]);

  // Re-mark as read when the user comes back to the tab.
  React.useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && selectedIdRef.current) {
        socket.emit("message:seen", { conversationId: selectedIdRef.current });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Load the latest page when a conversation opens.
  React.useEffect(() => {
    if (!selectedId || !me) return;
    let alive = true;
    setMessages([]);
    setHasMore(false);
    cursorRef.current = null;
    socket.emit("conversation:join", { conversationId: selectedId });
    apiFetch(`/api/conversations/${selectedId}/messages?limit=${PAGE_SIZE}`)
      .then((data) => {
        if (!alive) return;
        setMessages((data.messages || []).map(normalizeMessage).filter(Boolean));
        setHasMore(Boolean(data.hasMore));
        cursorRef.current = data.nextCursor;
      })
      .catch((error) => alive && showError(error.message));
    return () => {
      alive = false;
    };
  }, [me, selectedId, showError]);

  /** Prepend one older page. Returns how many messages were added. */
  const loadOlder = React.useCallback(async () => {
    const conversationId = selectedIdRef.current;
    if (!conversationId || !hasMoreRef.current || !cursorRef.current) return 0;
    setLoadingOlder(true);
    try {
      const data = await apiFetch(
        `/api/conversations/${conversationId}/messages?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursorRef.current)}`,
      );
      if (String(selectedIdRef.current) !== String(conversationId)) return 0;
      const older = (data.messages || []).map(normalizeMessage).filter(Boolean);
      const known = new Set(messagesRef.current.map((m) => m.id));
      const fresh = older.filter((m) => !known.has(m.id));
      messagesRef.current = [...fresh, ...messagesRef.current];
      setMessages(messagesRef.current);
      setHasMore(Boolean(data.hasMore));
      hasMoreRef.current = Boolean(data.hasMore);
      cursorRef.current = data.nextCursor;
      return fresh.length;
    } catch (error) {
      showError(error.message);
      return 0;
    } finally {
      setLoadingOlder(false);
    }
  }, [showError]);

  /** Page back until `messageId` is loaded (for search results). */
  const ensureLoaded = React.useCallback(
    async (messageId) => {
      for (let page = 0; page <= MAX_JUMP_PAGES; page += 1) {
        if (messagesRef.current.some((m) => m.id === String(messageId))) return true;
        if (!hasMoreRef.current) return false;
        if (!(await loadOlder())) return false;
      }
      return false;
    },
    [loadOlder],
  );

  const openConversation = React.useCallback((conversation) => {
    if (!conversation?.id) return;
    const id = String(conversation.id);
    setSelectedId(id);
    setActiveView("chat");
    // Cleared locally right away; the server confirms via conversation:seen.
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
  }, []);

  const upsertAndOpen = React.useCallback(
    (conversation) => {
      setConversations((prev) => upsert(prev, conversation, { toTop: true }));
      openConversation(conversation);
    },
    [openConversation],
  );

  const sendMessage = React.useCallback(
    ({ conversationId, text }) => {
      const normalizedText = String(text || "").trim();
      if (!conversationId || !normalizedText) return false;
      if (!socket.connected) {
        showError("Mất kết nối tới máy chủ. Tin nhắn chưa được gửi.");
        return false;
      }
      const clientMessageId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setMessages((prev) =>
        mergeMessage(prev, {
          id: `temp-${clientMessageId}`,
          conversationId,
          sender: meRef.current,
          type: "text",
          text: normalizedText,
          clientMessageId,
          createdAt: new Date().toISOString(),
          optimistic: true,
        }),
      );
      socket.emit("message:send", { conversationId, text: normalizedText, clientMessageId });
      return true;
    },
    [mergeMessage, showError],
  );

  const editMessage = React.useCallback(
    async (messageId, text) => {
      try {
        const data = await apiFetch(`/api/messages/${messageId}`, {
          method: "PATCH",
          body: JSON.stringify({ text }),
        });
        setMessages((prev) => mergeMessage(prev, data.message));
        return true;
      } catch (error) {
        showError(error.message);
        return false;
      }
    },
    [mergeMessage, showError],
  );

  const revokeMessage = React.useCallback(
    async (messageId) => {
      if (!window.confirm("Thu hồi tin nhắn này? Mọi người trong cuộc trò chuyện sẽ không xem được nữa.")) return;
      try {
        const data = await apiFetch(`/api/messages/${messageId}?scope=all`, { method: "DELETE" });
        setMessages((prev) => mergeMessage(prev, data.message));
      } catch (error) {
        showError(error.message);
      }
    },
    [mergeMessage, showError],
  );

  const deleteForMe = React.useCallback(
    async (messageId) => {
      try {
        await apiFetch(`/api/messages/${messageId}?scope=me`, { method: "DELETE" });
        setMessages((prev) => prev.filter((m) => m.id !== String(messageId)));
      } catch (error) {
        showError(error.message);
      }
    },
    [showError],
  );

  const sendFile = React.useCallback(
    async (conversationId, file, extra = {}) => {
      if (extra.kind === "audio") {
        try {
          await apiUpload(`/api/conversations/${conversationId}/attachments`, {
            file,
            kind: "audio",
            duration: String(Math.round(extra.duration * 10) / 10),
            clientMessageId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          });
        } catch (error) {
          showError(error.message);
        }
        return;
      }

      const isImage = file.type.startsWith("image/");
      if (BLOCKED_EXTENSIONS.test(file.name)) {
        showError("Không cho phép gửi loại file này.");
        return;
      }
      if (isImage && file.size > MAX_IMAGE_BYTES) {
        showError("Ảnh vượt quá 10MB.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        showError("File vượt quá 20MB.");
        return;
      }
      try {
        await apiUpload(`/api/conversations/${conversationId}/attachments`, {
          file,
          clientMessageId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        });
      } catch (error) {
        showError(error.message);
      }
    },
    [showError],
  );

  const searchMessages = React.useCallback(
    async (q) => {
      try {
        const data = await apiFetch(
          `/api/conversations/${selectedIdRef.current}/messages/search?q=${encodeURIComponent(q)}`,
        );
        return (data.messages || []).map(normalizeMessage);
      } catch (error) {
        showError(error.message);
        return [];
      }
    },
    [showError],
  );

  const logout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      showError(error.message);
    } finally {
      setMe(null);
      setSelectedId(null);
      setMessages([]);
      setConversations([]);
      setOnlineUserIds(new Set());
      setActiveView("home");
      setAccountOpen(false);
      setSettingsOpen(false);
    }
  };

  const changeDesktopNotify = (on) => {
    setDesktopNotify(on);
    saveDesktopNotify(on);
  };

  if (booting) {
    return (
      <main className="app-frame auth-frame">
        <div className="loading-card">
          <img className="brand-mark" src="/memo-mark.png" alt="" width="36" height="36" />
          <div>
            <div className="loading-title">Memo Chat</div>
            <div className="muted text-sm">Đang tải…</div>
          </div>
        </div>
      </main>
    );
  }

  if (!me) {
    return <AuthScreen theme={resolvedTheme} initialResetToken={resetToken} onAuthenticated={onAuthenticated} />;
  }

  return (
    <main className="app-frame zalo-app-frame">
      <section className={`app-shell zalo-shell ${activeView === "chat" ? "is-chat-open" : ""}`}>
        {toast ? (
          <div className={`app-toast ${toast.tone === "error" ? "is-error" : ""}`} role={toast.tone === "error" ? "alert" : "status"}>
            {toast.text}
          </div>
        ) : null}
        <div className={`zalo-layout ${infoOpen && selectedConversation ? "has-info" : ""}`}>
          <NavRail
            me={me}
            unreadTotal={unreadTotal}
            onOpenHome={() => setActiveView("home")}
            onOpenAccount={() => setAccountOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onLogout={logout}
          />
          <HomeScreen
            me={me}
            conversations={conversations}
            selectedConversation={selectedConversation}
            onOpenConversation={openConversation}
            onCreatedConversation={upsertAndOpen}
            setError={showError}
            onlineUserIds={onlineUserIds}
          />
          <section className="zalo-chat-area">
            <Right
              me={me}
              conversation={selectedConversation}
              messages={messages}
              hasMore={hasMore}
              loadingOlder={loadingOlder}
              onLoadOlder={loadOlder}
              onSendMessage={sendMessage}
              onEditMessage={editMessage}
              onRevokeMessage={revokeMessage}
              onDeleteForMe={deleteForMe}
              onSendFile={sendFile}
              onSearch={searchMessages}
              onEnsureLoaded={ensureLoaded}
              searchSignal={searchRequest}
              setError={showError}
              onlineUserIds={onlineUserIds}
              onBack={() => setActiveView("home")}
              onToggleInfo={() => setInfoOpen((open) => !open)}
            />
          </section>
          {infoOpen && selectedConversation ? (
            <InfoPanel
              conversation={selectedConversation}
              me={me}
              onlineUserIds={onlineUserIds}
              mediaVersion={messages.length}
              onConversationChanged={(conversation) => setConversations((prev) => upsert(prev, conversation))}
              onLeft={(conversationId) => {
                setConversations((prev) => prev.filter((c) => c.id !== String(conversationId)));
                setSelectedId(null);
                setMessages([]);
                setActiveView("home");
              }}
              onOpenSearch={() => setSearchRequest((n) => n + 1)}
              onClose={() => setInfoOpen(false)}
              setError={showError}
              showToast={showToast}
            />
          ) : null}
        </div>
        {accountOpen ? <AccountModal me={me} onClose={() => setAccountOpen(false)} onUpdated={setMe} /> : null}
        {settingsOpen ? (
          <SettingsModal
            me={me}
            theme={theme}
            onThemeChange={setTheme}
            desktopNotify={desktopNotify}
            onDesktopNotifyChange={changeDesktopNotify}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}
      </section>
    </main>
  );
}
