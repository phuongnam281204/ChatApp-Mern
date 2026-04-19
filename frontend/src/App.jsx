import React from "react";
import Left from "./home/Leftpart/Left";
import Right from "./home/Rightpart/Right";
import { apiFetch } from "./lib/api";
import { socket } from "./lib/socket";

const App = () => {
  const [me, setMe] = React.useState(null);
  const [conversations, setConversations] = React.useState([]);
  const [selectedConversation, setSelectedConversation] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [onlineUserIds, setOnlineUserIds] = React.useState(() => new Set());
  const selectedConversationIdRef = React.useRef(null);
  const [toast, setToast] = React.useState(null);
  const toastTimerRef = React.useRef(null);
  const [authNeeded, setAuthNeeded] = React.useState(false);
  const [authMode, setAuthMode] = React.useState("login");
  const [authForm, setAuthForm] = React.useState({
    username: "",
    email: "",
    password: "",
  });

  const reportError = React.useCallback((message) => {
    if (!message) return;
    console.error(message);
  }, []);

  const refreshConversations = React.useCallback(async () => {
    const data = await apiFetch("/api/conversations");
    setConversations(data.conversations || []);
  }, []);

  const loadMessages = React.useCallback(async (conversationId) => {
    const data = await apiFetch(
      `/api/conversations/${conversationId}/messages?limit=50`,
    );
    setMessages(data.messages || []);
  }, []);

  React.useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id || null;
  }, [selectedConversation?.id]);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const meData = await apiFetch("/api/users/me");
        if (!mounted) return;
        setMe(meData.user);
        setAuthNeeded(false);
        await refreshConversations();
      } catch (e) {
        if (!mounted) return;
        if (String(e.message).toLowerCase().includes("unauthorized")) {
          setAuthNeeded(true);
        } else {
          reportError(e.message);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [refreshConversations, reportError]);

  React.useEffect(() => {
    if (!me) return;

    socket.connect();

    const onMessageNew = ({ message }) => {
      setMessages((prev) => {
        if (!message) return prev;
        if (
          !selectedConversationIdRef.current ||
          String(message.conversationId) !==
            String(selectedConversationIdRef.current)
        ) {
          return prev;
        }
        return [...prev, message];
      });
      refreshConversations().catch(() => {});
    };

    const onPresenceUpdate = ({ userId, isOnline }) => {
      if (!userId) return;
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(String(userId));
        else next.delete(String(userId));
        return next;
      });
    };

    const onPresenceState = ({ userIds }) => {
      if (!Array.isArray(userIds)) return;
      setOnlineUserIds(new Set(userIds.map((id) => String(id))));
    };

    const upsertConversationToTop = (conversation) => {
      if (!conversation?.id) return;
      setConversations((prev) => {
        const next = [
          conversation,
          ...prev.filter((c) => String(c.id) !== String(conversation.id)),
        ];
        return next;
      });
    };

    const onConversationAdded = ({ conversation }) => {
      if (!conversation?.id) return;
      upsertConversationToTop(conversation);
      setSelectedConversation(conversation);
    };

    const onWelcome = ({ text, conversation }) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ text: text || "Bạn có nhóm mới", conversation });
      toastTimerRef.current = setTimeout(() => setToast(null), 3500);
    };

    const onConversationSeen = ({ conversationId, userId, lastReadAt }) => {
      if (!conversationId || !userId || !lastReadAt) return;

      setConversations((prev) =>
        prev.map((c) => {
          if (String(c.id) !== String(conversationId)) return c;
          return {
            ...c,
            lastReadAtByUser: {
              ...(c.lastReadAtByUser || {}),
              [String(userId)]:
                typeof lastReadAt === "string"
                  ? lastReadAt
                  : new Date(lastReadAt).toISOString(),
            },
          };
        }),
      );

      setSelectedConversation((prev) => {
        if (!prev || String(prev.id) !== String(conversationId)) return prev;
        return {
          ...prev,
          lastReadAtByUser: {
            ...(prev.lastReadAtByUser || {}),
            [String(userId)]:
              typeof lastReadAt === "string"
                ? lastReadAt
                : new Date(lastReadAt).toISOString(),
          },
        };
      });
    };

    socket.on("message:new", onMessageNew);
    socket.on("presence:state", onPresenceState);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("conversation:added", onConversationAdded);
    socket.on("notification:welcome", onWelcome);
    socket.on("conversation:seen", onConversationSeen);

    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("presence:state", onPresenceState);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("conversation:added", onConversationAdded);
      socket.off("notification:welcome", onWelcome);
      socket.off("conversation:seen", onConversationSeen);
      socket.disconnect();

      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [me, refreshConversations]);

  const logout = async () => {
    try {
      await apiFetch("/api/auth/logout");
    } catch (e) {
      reportError(e.message);
    } finally {
      setMe(null);
      setSelectedConversation(null);
      setMessages([]);
      setOnlineUserIds(new Set());
      setAuthNeeded(true);
    }
  };

  React.useEffect(() => {
    if (!selectedConversation) return;

    socket.emit("conversation:join", {
      conversationId: selectedConversation.id,
    });
    loadMessages(selectedConversation.id).catch((e) => reportError(e.message));
  }, [selectedConversation, loadMessages, reportError]);

  const submitAuth = async (e) => {
    e.preventDefault();
    try {
      if (authMode === "signup") {
        const data = await apiFetch("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            username: authForm.username,
            email: authForm.email,
            password: authForm.password,
          }),
        });
        setMe(data.user);
      } else {
        const data = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: authForm.email,
            password: authForm.password,
          }),
        });
        setMe(data.user);
      }

      setAuthNeeded(false);
      setAuthForm({ username: "", email: "", password: "" });
      await refreshConversations();
    } catch (err) {
      reportError(err.message);
    }
  };

  if (authNeeded || !me) {
    return (
      <div className="flex h-screen chat-shell">
        <div className="w-1/3 header-bar flex flex-col p-6">
          <div className="text-white text-xl font-semibold">ChatApp</div>
          <div className="text-white/80 mt-2">
            Login để bắt đầu chat realtime.
          </div>
        </div>

        <div className="flex-1 h-full flex items-center justify-center p-6">
          <form
            onSubmit={submitAuth}
            className="w-full max-w-md bg-white border rounded-lg p-6"
          >
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                className={`px-3 py-2 rounded ${authMode === "login" ? "btn-primary" : "bg-gray-100"}`}
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={`px-3 py-2 rounded ${authMode === "signup" ? "btn-primary" : "bg-gray-100"}`}
                onClick={() => setAuthMode("signup")}
              >
                Signup
              </button>
            </div>

            {authMode === "signup" ? (
              <div className="mb-3">
                <label className="block text-sm text-gray-600 mb-1">
                  Username
                </label>
                <input
                  className="w-full input-soft rounded px-3 py-2 outline-none"
                  value={authForm.username}
                  onChange={(e) =>
                    setAuthForm((p) => ({ ...p, username: e.target.value }))
                  }
                  required
                />
              </div>
            ) : null}

            <div className="mb-3">
              <label className="block text-sm text-gray-600 mb-1">Email</label>
              <input
                type="email"
                className="w-full input-soft rounded px-3 py-2 outline-none"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm((p) => ({ ...p, email: e.target.value }))
                }
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">
                Password
              </label>
              <input
                type="password"
                className="w-full input-soft rounded px-3 py-2 outline-none"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((p) => ({ ...p, password: e.target.value }))
                }
                required
              />
            </div>

            <button className="w-full btn-primary rounded py-2" type="submit">
              {authMode === "signup" ? "Create account" : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen chat-shell relative">
      {toast?.text ? (
        <div className="toast">
          <div className="toast-title">Thông báo</div>
          <div className="toast-body">{toast.text}</div>
          {toast.conversation?.name ? (
            <div className="toast-body muted truncate">
              {toast.conversation.name}
            </div>
          ) : null}
        </div>
      ) : null}
      <Left
        me={me}
        conversations={conversations}
        selectedConversation={selectedConversation}
        onSelectConversation={setSelectedConversation}
        onConversationsChanged={refreshConversations}
        setError={reportError}
        onLogout={logout}
        onlineUserIds={onlineUserIds}
      />
      <Right
        me={me}
        conversation={selectedConversation}
        messages={messages}
        setError={reportError}
        onlineUserIds={onlineUserIds}
      />
    </div>
  );
};

export default App;
