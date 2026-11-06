import React from "react";
import HomeScreen from "./home/Home/HomeScreen";
import Profile from "./home/Profile/Profile";
import Right from "./home/Rightpart/Right";
import Settings from "./home/Settings/Settings";
import { apiFetch } from "./lib/api";
import { socket } from "./lib/socket";
import {
  FiCheckCircle,
  FiLock,
  FiMail,
  FiMessageSquare,
  FiUser,
} from "react-icons/fi";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function isUnauthorized(error) {
  return String(error?.message || "").toLowerCase().includes("unauthorized");
}

function normalizeMessage(message) {
  if (!message) return null;
  return {
    ...message,
    id: String(message.id || message._id || ""),
    conversationId: String(message.conversationId || ""),
  };
}

export default function App() {
  const [theme, setTheme] = React.useState(() => {
    return localStorage.getItem("theme") === "light" ? "light" : "dark";
  });
  const [booting, setBooting] = React.useState(true);
  const [me, setMe] = React.useState(null);
  const [authMode, setAuthMode] = React.useState("login");
  const [authScreen, setAuthScreen] = React.useState("auth");
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authNotice, setAuthNotice] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(true);
  const [agreeTerms, setAgreeTerms] = React.useState(false);
  const [authForm, setAuthForm] = React.useState({
    username: "",
    email: "",
    password: "",
  });
  const [forgotForm, setForgotForm] = React.useState({
    email: "",
    token: "",
    password: "",
    confirmPassword: "",
  });

  const [conversations, setConversations] = React.useState([]);
  const [selectedConversation, setSelectedConversation] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [onlineUserIds, setOnlineUserIds] = React.useState(() => new Set());
  const [activeView, setActiveView] = React.useState("home");
  const [toast, setToast] = React.useState(null);

  const googleButtonRef = React.useRef(null);
  const googleInitRef = React.useRef(false);
  const selectedConversationIdRef = React.useRef(null);
  const toastTimerRef = React.useRef(null);

  const showToast = React.useCallback((text, tone = "info") => {
    if (!text) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const mergeIncomingMessage = React.useCallback((prev, rawIncoming) => {
    const incoming = normalizeMessage(rawIncoming);
    if (!incoming) return prev;

    const next = Array.isArray(prev) ? [...prev] : [];
    const incomingId = incoming.id ? String(incoming.id) : "";
    const incomingClientId = incoming.clientMessageId
      ? String(incoming.clientMessageId)
      : "";
    const incomingSenderId = incoming.sender?.id
      ? String(incoming.sender.id)
      : "";

    const byIdIndex = incomingId
      ? next.findIndex((m) => String(m?.id || "") === incomingId)
      : -1;
    if (byIdIndex !== -1) {
      next[byIdIndex] = { ...next[byIdIndex], ...incoming, optimistic: false };
      return next;
    }

    const byClientIdIndex = incomingClientId
      ? next.findIndex(
          (m) =>
            String(m?.clientMessageId || "") === incomingClientId &&
            String(m?.sender?.id || "") === incomingSenderId,
        )
      : -1;
    if (byClientIdIndex !== -1) {
      next[byClientIdIndex] = {
        ...next[byClientIdIndex],
        ...incoming,
        optimistic: false,
      };
      return next;
    }

    return [...next, incoming];
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  React.useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id || null;
  }, [selectedConversation?.id]);

  const refreshConversations = React.useCallback(async () => {
    const data = await apiFetch("/api/conversations");
    setConversations(data.conversations || []);
    return data.conversations || [];
  }, []);

  const loadMessages = React.useCallback(async (conversationId) => {
    if (!conversationId) return;
    const data = await apiFetch(
      `/api/conversations/${conversationId}/messages?limit=80`,
    );
    setMessages((data.messages || []).map(normalizeMessage).filter(Boolean));
  }, []);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await apiFetch("/api/users/me");
        if (!mounted) return;
        setMe(data.user);
        await refreshConversations();
      } catch (error) {
        if (!mounted) return;
        if (!isUnauthorized(error)) showToast(error.message, "error");
      } finally {
        if (mounted) setBooting(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [refreshConversations, showToast]);

  React.useEffect(() => {
    if (!me) return;

    socket.connect();

    const onMessageNew = ({ message }) => {
      setMessages((prev) => {
        if (
          selectedConversationIdRef.current &&
          String(message?.conversationId) ===
            String(selectedConversationIdRef.current)
        ) {
          return mergeIncomingMessage(prev, message);
        }
        return prev;
      });
      refreshConversations().catch(() => {});
    };

    const onPresenceState = ({ userIds }) => {
      setOnlineUserIds(new Set((userIds || []).map((id) => String(id))));
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

    const onConversationAdded = ({ conversation }) => {
      if (!conversation?.id) return;
      setConversations((prev) => [
        conversation,
        ...prev.filter((c) => String(c.id) !== String(conversation.id)),
      ]);
      showToast(`Bạn có cuộc trò chuyện mới: ${conversation.name || "Chat"}`);
    };

    const onWelcome = ({ text }) => {
      showToast(text || "Bạn vừa được thêm vào một nhóm mới");
    };

    const onConversationSeen = ({ conversationId, userId, lastReadAt }) => {
      if (!conversationId || !userId || !lastReadAt) return;
      const patchReadMap = (c) =>
        String(c.id) === String(conversationId)
          ? {
              ...c,
              lastReadAtByUser: {
                ...(c.lastReadAtByUser || {}),
                [String(userId)]:
                  typeof lastReadAt === "string"
                    ? lastReadAt
                    : new Date(lastReadAt).toISOString(),
              },
            }
          : c;

      setConversations((prev) => prev.map(patchReadMap));
      setSelectedConversation((prev) => (prev ? patchReadMap(prev) : prev));
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
    };
  }, [me, mergeIncomingMessage, refreshConversations, showToast]);

  React.useEffect(() => {
    const conversationId = selectedConversation?.id;
    if (!conversationId || !me) return;
    socket.emit("conversation:join", { conversationId });
    loadMessages(conversationId).catch((error) =>
      showToast(error.message, "error"),
    );
  }, [loadMessages, me, selectedConversation?.id, showToast]);

  const openConversation = React.useCallback((conversation) => {
    if (!conversation?.id) return;
    setSelectedConversation(conversation);
    setActiveView("chat");
  }, []);

  const upsertConversation = React.useCallback(
    (conversation) => {
      if (!conversation?.id) return;
      setConversations((prev) => [
        conversation,
        ...prev.filter((c) => String(c.id) !== String(conversation.id)),
      ]);
      openConversation(conversation);
    },
    [openConversation],
  );

  const sendMessage = React.useCallback(
    ({ conversationId, text }) => {
      const normalizedText = String(text || "").trim();
      if (!conversationId || !normalizedText) return false;

      const clientMessageId = `${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;

      setMessages((prev) =>
        mergeIncomingMessage(prev, {
          id: `temp-${clientMessageId}`,
          conversationId,
          sender: me,
          type: "text",
          text: normalizedText,
          clientMessageId,
          createdAt: new Date().toISOString(),
          optimistic: true,
        }),
      );

      socket.emit("message:send", {
        conversationId,
        text: normalizedText,
        clientMessageId,
      });
      return true;
    },
    [me, mergeIncomingMessage],
  );

  const submitAuth = async (event) => {
    event.preventDefault();
    if (authMode === "signup" && !agreeTerms) {
      setAuthNotice("Vui lòng đồng ý điều khoản trước khi tạo tài khoản.");
      return;
    }

    setAuthBusy(true);
    setAuthNotice("");
    try {
      const path = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const payload =
        authMode === "signup"
          ? {
              username: authForm.username.trim(),
              email: authForm.email.trim(),
              password: authForm.password,
              remember: rememberMe,
            }
          : {
              email: authForm.email.trim(),
              password: authForm.password,
              remember: rememberMe,
            };

      const data = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMe(data.user);
      setAuthForm({ username: "", email: "", password: "" });
      setAuthScreen("auth");
      setAuthNotice("");
      await refreshConversations();
    } catch (error) {
      setAuthNotice(error.message || "Đăng nhập thất bại");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleLogin = React.useCallback(
    async (credential) => {
      if (!credential) return;
      setAuthBusy(true);
      setAuthNotice("");
      try {
        const data = await apiFetch("/api/auth/google", {
          method: "POST",
          body: JSON.stringify({ credential, remember: rememberMe }),
        });
        setMe(data.user);
        await refreshConversations();
      } catch (error) {
        setAuthNotice(error.message || "Đăng nhập Google thất bại");
      } finally {
        setAuthBusy(false);
      }
    },
    [refreshConversations, rememberMe],
  );

  React.useEffect(() => {
    if (me || authScreen !== "auth" || !GOOGLE_CLIENT_ID) return;
    if (!googleButtonRef.current) return;

    const initGoogleButton = () => {
      if (!window.google?.accounts?.id || googleInitRef.current) return;
      googleInitRef.current = true;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => handleGoogleLogin(response?.credential),
      });
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        shape: "pill",
        theme: theme === "light" ? "outline" : "filled_black",
        text: "continue_with",
        width: 300,
        size: "large",
      });
    };

    if (window.google?.accounts?.id) {
      initGoogleButton();
      return;
    }

    let script = document.getElementById("google-identity-services");
    if (!script) {
      script = document.createElement("script");
      script.id = "google-identity-services";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGoogleButton;
      document.head.appendChild(script);
    } else {
      script.addEventListener("load", initGoogleButton, { once: true });
    }
  }, [authScreen, handleGoogleLogin, me, theme]);

  const submitForgotEmail = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthNotice("");
    try {
      const data = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotForm.email.trim() }),
      });
      setForgotForm((prev) => ({ ...prev, token: data?.resetToken || "" }));
      setAuthScreen("forgot-reset");
      setAuthNotice(
        data?.resetToken
          ? "Mã reset dev đã được tạo. Nhập mật khẩu mới để hoàn tất."
          : "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.",
      );
    } catch (error) {
      setAuthNotice(error.message || "Không thể xử lý yêu cầu");
    } finally {
      setAuthBusy(false);
    }
  };

  const submitResetPassword = async (event) => {
    event.preventDefault();
    if (forgotForm.password !== forgotForm.confirmPassword) {
      setAuthNotice("Xác nhận mật khẩu không khớp.");
      return;
    }

    setAuthBusy(true);
    setAuthNotice("");
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: forgotForm.token.trim(),
          password: forgotForm.password,
        }),
      });
      setAuthNotice("Đổi mật khẩu thành công. Hãy đăng nhập lại.");
      setAuthMode("login");
      setAuthScreen("auth");
      setForgotForm({ email: "", token: "", password: "", confirmPassword: "" });
    } catch (error) {
      setAuthNotice(error.message || "Đặt lại mật khẩu thất bại");
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    try {
      await apiFetch("/api/auth/logout");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setMe(null);
      setSelectedConversation(null);
      setMessages([]);
      setConversations([]);
      setOnlineUserIds(new Set());
      setActiveView("home");
    }
  };

  if (booting) {
    return (
      <main className="app-frame auth-frame">
        <div className="loading-card">
          <div className="brand-mark">
            <FiMessageSquare />
          </div>
          <div>
            <div className="loading-title">Vibe Chat</div>
            <div className="muted text-sm">Đang chuẩn bị không gian chat...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="app-frame auth-frame">
        <section className="auth-layout">
          <div className="auth-copy">
            <div className="brand-row">
              <div className="brand-mark">
                <FiMessageSquare />
              </div>
              <div>
                <div className="brand-name">Vibe Chat</div>
                <div className="brand-subtitle">Chat realtime cho team nhỏ</div>
              </div>
            </div>
            <h1>Nhắn tin nhanh, tạo nhóm gọn, biết ai đang online.</h1>
            <p>
              Đăng nhập để trò chuyện 1-1, tạo nhóm, xem trạng thái hoạt động,
              typing indicator và trạng thái đã xem.
            </p>
            <div className="auth-feature-list">
              <span>
                <FiCheckCircle /> Socket realtime
              </span>
              <span>
                <FiCheckCircle /> Google login
              </span>
              <span>
                <FiCheckCircle /> Dark/Light mode
              </span>
            </div>
          </div>

          <section className="auth-card">
            {authScreen === "auth" ? (
              <>
                <div className="auth-tabs" aria-label="Chọn chế độ">
                  <button
                    type="button"
                    className={authMode === "login" ? "is-active" : ""}
                    onClick={() => {
                      setAuthMode("login");
                      setAuthNotice("");
                    }}
                  >
                    Đăng nhập
                  </button>
                  <button
                    type="button"
                    className={authMode === "signup" ? "is-active" : ""}
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthNotice("");
                    }}
                  >
                    Đăng ký
                  </button>
                </div>

                <form className="auth-form" onSubmit={submitAuth}>
                  {authMode === "signup" ? (
                    <label className="field">
                      <span>Tên hiển thị</span>
                      <div className="field-control">
                        <FiUser />
                        <input
                          value={authForm.username}
                          onChange={(event) =>
                            setAuthForm((prev) => ({
                              ...prev,
                              username: event.target.value,
                            }))
                          }
                          placeholder="Nguyen An"
                          minLength={2}
                          maxLength={50}
                          required
                        />
                      </div>
                    </label>
                  ) : null}

                  <label className="field">
                    <span>Email</span>
                    <div className="field-control">
                      <FiMail />
                      <input
                        type="email"
                        value={authForm.email}
                        onChange={(event) =>
                          setAuthForm((prev) => ({
                            ...prev,
                            email: event.target.value,
                          }))
                        }
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </label>

                  <label className="field">
                    <span>Mật khẩu</span>
                    <div className="field-control">
                      <FiLock />
                      <input
                        type="password"
                        value={authForm.password}
                        onChange={(event) =>
                          setAuthForm((prev) => ({
                            ...prev,
                            password: event.target.value,
                          }))
                        }
                        placeholder="Ít nhất 6 ký tự"
                        minLength={6}
                        required
                      />
                    </div>
                  </label>

                  <div className="auth-options">
                    <label>
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(event) => setRememberMe(event.target.checked)}
                      />
                      Ghi nhớ đăng nhập
                    </label>
                    {authMode === "login" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthScreen("forgot-email");
                          setForgotForm((prev) => ({
                            ...prev,
                            email: authForm.email || prev.email,
                          }));
                          setAuthNotice("");
                        }}
                      >
                        Quên mật khẩu?
                      </button>
                    ) : null}
                  </div>

                  {authMode === "signup" ? (
                    <label className="auth-check">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(event) => setAgreeTerms(event.target.checked)}
                      />
                      Tôi đồng ý điều khoản dịch vụ và chính sách bảo mật.
                    </label>
                  ) : null}

                  <button
                    className="primary-action"
                    type="submit"
                    disabled={authBusy}
                  >
                    {authBusy
                      ? "Đang xử lý..."
                      : authMode === "signup"
                        ? "Tạo tài khoản"
                        : "Đăng nhập"}
                  </button>
                </form>

                <div className="divider">
                  <span>hoặc</span>
                </div>

                {GOOGLE_CLIENT_ID ? (
                  <div className="google-slot" ref={googleButtonRef} />
                ) : (
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() =>
                      setAuthNotice(
                        "Thiếu VITE_GOOGLE_CLIENT_ID nên Google login đang tắt.",
                      )
                    }
                  >
                    Tiếp tục với Google
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="back-link"
                  onClick={() => {
                    setAuthScreen("auth");
                    setAuthNotice("");
                  }}
                >
                  Quay lại đăng nhập
                </button>
                <h2>
                  {authScreen === "forgot-email"
                    ? "Khôi phục tài khoản"
                    : "Đặt lại mật khẩu"}
                </h2>
                <p className="muted">
                  {authScreen === "forgot-email"
                    ? "Nhập email để tạo mã reset. Ở môi trường dev, mã sẽ hiện trực tiếp."
                    : "Dán mã reset và nhập mật khẩu mới."}
                </p>

                {authScreen === "forgot-email" ? (
                  <form className="auth-form" onSubmit={submitForgotEmail}>
                    <label className="field">
                      <span>Email</span>
                      <div className="field-control">
                        <FiMail />
                        <input
                          type="email"
                          value={forgotForm.email}
                          onChange={(event) =>
                            setForgotForm((prev) => ({
                              ...prev,
                              email: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                    </label>
                    <button className="primary-action" disabled={authBusy}>
                      Tiếp tục
                    </button>
                  </form>
                ) : (
                  <form className="auth-form" onSubmit={submitResetPassword}>
                    <label className="field">
                      <span>Mã reset</span>
                      <div className="field-control">
                        <FiLock />
                        <input
                          value={forgotForm.token}
                          onChange={(event) =>
                            setForgotForm((prev) => ({
                              ...prev,
                              token: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                    </label>
                    <label className="field">
                      <span>Mật khẩu mới</span>
                      <div className="field-control">
                        <FiLock />
                        <input
                          type="password"
                          minLength={6}
                          value={forgotForm.password}
                          onChange={(event) =>
                            setForgotForm((prev) => ({
                              ...prev,
                              password: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                    </label>
                    <label className="field">
                      <span>Xác nhận mật khẩu</span>
                      <div className="field-control">
                        <FiLock />
                        <input
                          type="password"
                          minLength={6}
                          value={forgotForm.confirmPassword}
                          onChange={(event) =>
                            setForgotForm((prev) => ({
                              ...prev,
                              confirmPassword: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                    </label>
                    <button className="primary-action" disabled={authBusy}>
                      Cập nhật mật khẩu
                    </button>
                  </form>
                )}
              </>
            )}

            {authNotice ? <div className="notice">{authNotice}</div> : null}
          </section>
        </section>
      </main>
    );
  }

  const content =
    activeView === "settings" ? (
      <Settings
        me={me}
        theme={theme}
        onThemeChange={setTheme}
        onProfileUpdated={setMe}
        onBack={() => setActiveView("home")}
        onLogout={logout}
        onOpenProfile={() => setActiveView("profile")}
      />
    ) : activeView === "profile" ? (
      <Profile
        me={me}
        conversationsCount={conversations.length}
        onBack={() => setActiveView("home")}
        onEditProfile={() => setActiveView("settings")}
      />
    ) : activeView === "chat" ? (
      <Right
        me={me}
        conversation={selectedConversation}
        messages={messages}
        onSendMessage={sendMessage}
        setError={(message) => showToast(message, "error")}
        onlineUserIds={onlineUserIds}
        onBack={() => setActiveView("home")}
      />
    ) : (
      <HomeScreen
        me={me}
        conversations={conversations}
        selectedConversation={selectedConversation}
        onSelectConversation={setSelectedConversation}
        onOpenConversation={openConversation}
        onCreatedConversation={upsertConversation}
        onConversationsChanged={refreshConversations}
        onOpenProfile={() => setActiveView("profile")}
        onOpenSettings={() => setActiveView("settings")}
        setError={(message) => showToast(message, "error")}
        onlineUserIds={onlineUserIds}
      />
    );

  return (
    <main className="app-frame">
      <section className="app-shell">
        {toast ? (
          <div className={`app-toast ${toast.tone === "error" ? "is-error" : ""}`}>
            {toast.text}
          </div>
        ) : null}
        {content}
      </section>
    </main>
  );
}
