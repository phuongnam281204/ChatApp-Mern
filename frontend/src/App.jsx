import React from "react";
import Right from "./home/Rightpart/Right";
import Settings from "./home/Settings/Settings";
import HomeScreen from "./home/Home/HomeScreen";
import Profile from "./home/Profile/Profile";
import { apiFetch } from "./lib/api";
import { socket } from "./lib/socket";
import { FiHome, FiMessageSquare, FiUser, FiSettings } from "react-icons/fi";
import { FiMail, FiLock, FiEyeOff } from "react-icons/fi";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiCircle,
  FiRotateCcw,
} from "react-icons/fi";

const App = () => {
  const [theme, setTheme] = React.useState(() => {
    const saved = localStorage.getItem("theme");
    return saved === "light" ? "light" : "dark";
  });
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
  const [activeTab, setActiveTab] = React.useState("home");
  const [authForm, setAuthForm] = React.useState({
    username: "",
    email: "",
    password: "",
  });
  const [rememberMe, setRememberMe] = React.useState(false);
  const [authScreen, setAuthScreen] = React.useState("auth");
  const [authNotice, setAuthNotice] = React.useState("");
  const [forgotForm, setForgotForm] = React.useState({
    email: "",
    token: "",
    password: "",
    confirmPassword: "",
  });
  const googleButtonRef = React.useRef(null);
  const googleInitRef = React.useRef(false);
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  const mergeIncomingMessage = React.useCallback((prev, incoming) => {
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
        return mergeIncomingMessage(prev, message);
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
  }, [me, mergeIncomingMessage, refreshConversations]);

  const sendMessage = React.useCallback(
    ({ conversationId, text }) => {
      const normalizedText = String(text || "").trim();
      if (!conversationId || !normalizedText) return false;

      const clientMessageId = `${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;

      const optimisticMessage = {
        id: `temp-${clientMessageId}`,
        conversationId,
        sender: {
          id: me?.id,
          username: me?.username,
          email: me?.email,
          avatarUrl: me?.avatarUrl,
        },
        type: "text",
        text: normalizedText,
        clientMessageId,
        createdAt: new Date().toISOString(),
        optimistic: true,
      };

      setMessages((prev) => mergeIncomingMessage(prev, optimisticMessage));

      socket.emit("message:send", {
        conversationId,
        text: normalizedText,
        clientMessageId,
      });
      return true;
    },
    [me, mergeIncomingMessage],
  );

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
      setActiveTab("home");
    }
  };

  React.useEffect(() => {
    const conversationId = selectedConversation?.id;
    if (!conversationId) return;

    socket.emit("conversation:join", {
      conversationId,
    });
    loadMessages(conversationId).catch((e) => reportError(e.message));
  }, [selectedConversation?.id, loadMessages, reportError]);

  const submitAuth = async (e) => {
    e.preventDefault();
    setAuthNotice("");
    try {
      if (authMode === "signup") {
        const data = await apiFetch("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            username: authForm.username,
            email: authForm.email,
            password: authForm.password,
            remember: rememberMe,
          }),
        });
        setMe(data.user);
      } else {
        const data = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: authForm.email,
            password: authForm.password,
            remember: rememberMe,
          }),
        });
        setMe(data.user);
      }

      setAuthNeeded(false);
      setAuthForm({ username: "", email: "", password: "" });
      setAuthScreen("auth");
      await refreshConversations();
    } catch (err) {
      setAuthNotice(err.message || "Đăng nhập thất bại");
    }
  };

  const handleGoogleLogin = React.useCallback(
    async (credential) => {
      if (!credential) return;
      setAuthNotice("");
      try {
        const data = await apiFetch("/api/auth/google", {
          method: "POST",
          body: JSON.stringify({ credential, remember: rememberMe }),
        });
        setMe(data.user);
        setAuthNeeded(false);
        setAuthScreen("auth");
        await refreshConversations();
      } catch (err) {
        setAuthNotice(err.message || "Đăng nhập Google thất bại");
      }
    },
    [rememberMe, refreshConversations],
  );

  React.useEffect(() => {
    if (!authNeeded || authScreen !== "auth") return;
    if (!GOOGLE_CLIENT_ID) return;
    if (!googleButtonRef.current) return;

    const initGoogleButton = () => {
      if (!window.google?.accounts?.id || googleInitRef.current) return;
      googleInitRef.current = true;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          handleGoogleLogin(response?.credential);
        },
      });
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        shape: "pill",
        theme: "filled_black",
        text: "continue_with",
        width: 320,
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
  }, [GOOGLE_CLIENT_ID, authNeeded, authScreen, handleGoogleLogin]);

  const submitForgotEmail = async (e) => {
    e.preventDefault();
    setAuthNotice("");
    try {
      const data = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotForm.email }),
      });
      setForgotForm((prev) => ({
        ...prev,
        token: data?.resetToken || "",
      }));
      setAuthScreen("forgot-reset");
      setAuthNotice(
        data?.resetToken
          ? "Đã tạo mã reset (dev). Tiếp tục nhập mật khẩu mới."
          : "Nếu email tồn tại, hệ thống đã gửi hướng dẫn đặt lại mật khẩu.",
      );
    } catch (err) {
      setAuthNotice(err.message || "Không thể xử lý yêu cầu");
    }
  };

  const submitResetPassword = async (e) => {
    e.preventDefault();
    setAuthNotice("");
    if (forgotForm.password !== forgotForm.confirmPassword) {
      setAuthNotice("Xác nhận mật khẩu không khớp");
      return;
    }
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: forgotForm.token,
          password: forgotForm.password,
        }),
      });
      setAuthNotice("Đổi mật khẩu thành công. Hãy đăng nhập lại.");
      setAuthScreen("auth");
      setAuthMode("login");
      setForgotForm({
        email: "",
        token: "",
        password: "",
        confirmPassword: "",
      });
      setAuthForm((prev) => ({ ...prev, password: "" }));
    } catch (err) {
      setAuthNotice(err.message || "Đặt lại mật khẩu thất bại");
    }
  };

  if (authNeeded || !me) {
    return (
      <div className="min-h-[100dvh] w-full flex justify-center p-4">
        <div className="w-full max-w-[1100px] h-[100dvh] glass-card overflow-hidden flex">
          <div
            className="hidden lg:flex w-[45%] p-10 flex-col justify-between"
            style={{
              background:
                "linear-gradient(160deg, rgba(14,165,233,0.22) 0%, rgba(15,23,42,0.85) 55%, rgba(245,158,11,0.24) 100%)",
            }}
          >
            <div>
              <div className="text-xs uppercase tracking-[0.3em] muted">
                Velvet Chat
              </div>
              <div className="display-title text-4xl font-semibold mt-4">
                Trai nghiem ket noi
              </div>
              <div className="text-sm muted mt-3">
                Nhanh, an toan, day cam xuc. Gan ket hoi tho va y tuong trong
                tung cuoc tro chuyen.
              </div>
            </div>
            <div className="grid gap-3 text-sm">
              {[
                "Tin nhan thoi gian thuc",
                "Ho so ca nhan",
                "Tuy chinh giao dien",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-2xl border px-4 py-3"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: "var(--accent)" }}
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 px-5 py-6 home-bg overflow-y-auto">
            <div className="mb-4">
              <div
                className="mt-2 text-2xl font-bold"
                style={{ color: "var(--text-other)" }}
              >
                {authScreen === "auth"
                  ? "Chào mừng trở lại"
                  : "Khôi phục tài khoản"}
              </div>
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                {authScreen === "auth"
                  ? "Đăng nhập hoặc tạo tài khoản để tiếp tục trò chuyện."
                  : "Làm theo các bước để đặt lại mật khẩu mới."}
              </div>
            </div>

            <div
              className="rounded-[30px] border p-4"
              style={{
                borderColor: "rgba(124,58,237,0.55)",
                background:
                  "linear-gradient(160deg, rgba(10,16,40,0.96) 0%, rgba(7,12,32,0.96) 58%, rgba(43,23,70,0.85) 100%)",
                boxShadow: "0 22px 48px rgba(18, 10, 40, 0.45)",
              }}
            >
              <div
                className="rounded-[24px] border p-6"
                style={{
                  borderColor: "rgba(255,255,255,0.08)",
                  background:
                    "linear-gradient(180deg, rgba(17,24,52,0.78) 0%, rgba(11,16,34,0.78) 100%)",
                }}
              >
                <div className="text-center mb-6">
                  <div
                    className="text-5xl font-extrabold tracking-tight"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--accent) 0%, var(--accent-warm) 95%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    Velvet
                  </div>
                  <div
                    className="text-sm mt-1"
                    style={{ color: "rgba(233,237,255,0.7)" }}
                  >
                    Kết nối không giới hạn
                  </div>
                </div>

                {authScreen === "auth" ? (
                  <form onSubmit={submitAuth}>
                    <div
                      className="flex gap-2 mb-5 p-1.5 rounded-full"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                    >
                      <button
                        type="button"
                        className={`flex-1 py-2 rounded-full text-sm font-semibold transition ${
                          authMode === "login" ? "btn-primary" : "btn-ghost"
                        }`}
                        onClick={() => setAuthMode("login")}
                      >
                        Đăng nhập
                      </button>
                      <button
                        type="button"
                        className={`flex-1 py-2 rounded-full text-sm font-semibold transition ${
                          authMode === "signup" ? "btn-primary" : "btn-ghost"
                        }`}
                        onClick={() => setAuthMode("signup")}
                      >
                        Đăng ký
                      </button>
                    </div>

                    {authMode === "signup" ? (
                      <label
                        className="mb-3 rounded-2xl px-4 py-3 flex items-center gap-3"
                        style={{
                          border: "1px solid rgba(255,255,255,0.1)",
                          backgroundColor: "rgba(255,255,255,0.05)",
                        }}
                      >
                        <FiUser
                          className="text-base"
                          style={{ color: "rgba(233,237,255,0.7)" }}
                        />
                        <input
                          className="w-full bg-transparent outline-none text-sm"
                          style={{ color: "#f5f7ff" }}
                          placeholder="Username"
                          value={authForm.username}
                          onChange={(e) =>
                            setAuthForm((p) => ({
                              ...p,
                              username: e.target.value,
                            }))
                          }
                          required
                        />
                      </label>
                    ) : null}

                    <label
                      className="mb-3 rounded-2xl px-4 py-3 flex items-center gap-3"
                      style={{
                        border: "1px solid rgba(255,255,255,0.1)",
                        backgroundColor: "rgba(255,255,255,0.05)",
                      }}
                    >
                      <FiMail
                        className="text-base"
                        style={{ color: "rgba(233,237,255,0.7)" }}
                      />
                      <input
                        type="email"
                        className="w-full bg-transparent outline-none text-sm"
                        style={{ color: "#f5f7ff" }}
                        placeholder="Email"
                        value={authForm.email}
                        onChange={(e) =>
                          setAuthForm((p) => ({ ...p, email: e.target.value }))
                        }
                        required
                      />
                    </label>

                    <label
                      className="mb-3 rounded-2xl px-4 py-3 flex items-center gap-3"
                      style={{
                        border: "1px solid rgba(255,255,255,0.1)",
                        backgroundColor: "rgba(255,255,255,0.05)",
                      }}
                    >
                      <FiLock
                        className="text-base"
                        style={{ color: "rgba(233,237,255,0.7)" }}
                      />
                      <input
                        type="password"
                        className="w-full bg-transparent outline-none text-sm"
                        style={{ color: "#f5f7ff" }}
                        placeholder="Mật khẩu"
                        value={authForm.password}
                        onChange={(e) =>
                          setAuthForm((p) => ({
                            ...p,
                            password: e.target.value,
                          }))
                        }
                        required
                      />
                      <FiEyeOff
                        className="text-base"
                        style={{ color: "rgba(233,237,255,0.6)" }}
                      />
                    </label>

                    <div className="flex items-center justify-between mb-5">
                      <label
                        className="flex items-center gap-2 text-xs select-none"
                        style={{ color: "rgba(233,237,255,0.7)" }}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                        />
                        Ghi nhớ đăng nhập
                      </label>
                      <button
                        type="button"
                        className="text-xs font-medium"
                        style={{ color: "var(--accent)" }}
                        onClick={() => {
                          setAuthScreen("forgot-email");
                          setAuthNotice("");
                          setForgotForm((prev) => ({
                            ...prev,
                            email: authForm.email || prev.email,
                          }));
                        }}
                      >
                        Quên mật khẩu?
                      </button>
                    </div>

                    <button
                      className="w-full rounded-full py-3.5 font-semibold text-base"
                      style={{
                        background:
                          "linear-gradient(90deg, var(--accent) 0%, var(--accent-warm) 100%)",
                        color: "#ffffff",
                        boxShadow: "0 12px 26px rgba(14,165,233,0.35)",
                      }}
                      type="submit"
                    >
                      {authMode === "signup" ? "Tạo tài khoản" : "Đăng nhập"}
                    </button>

                    <div
                      className="mt-6 mb-4 text-center text-xs"
                      style={{ color: "rgba(233,237,255,0.45)" }}
                    >
                      HOẶC TIẾP TỤC VỚI
                    </div>

                    <div className="grid gap-3">
                      <div
                        className="w-full rounded-2xl p-2"
                        style={{
                          border: "1px solid rgba(255,255,255,0.1)",
                          backgroundColor: "rgba(255,255,255,0.05)",
                        }}
                      >
                        {GOOGLE_CLIENT_ID ? (
                          <div
                            ref={googleButtonRef}
                            className="flex justify-center"
                          />
                        ) : (
                          <button
                            type="button"
                            className="w-full rounded-xl py-2 text-sm font-semibold"
                            style={{ color: "rgba(233,237,255,0.9)" }}
                            onClick={() =>
                              setAuthNotice(
                                "Thiếu VITE_GOOGLE_CLIENT_ID để bật đăng nhập Google",
                              )
                            }
                          >
                            Google
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="w-full rounded-2xl py-3 text-sm font-semibold"
                        style={{
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "rgba(233,237,255,0.9)",
                          backgroundColor: "rgba(255,255,255,0.05)",
                        }}
                        onClick={() =>
                          setAuthNotice("Đăng nhập Apple đang phát triển")
                        }
                      >
                        Apple (Đang phát triển)
                      </button>
                    </div>
                  </form>
                ) : authScreen === "forgot-email" ? (
                  <form onSubmit={submitForgotEmail}>
                    <div
                      className="text-sm mb-4"
                      style={{ color: "rgba(233,237,255,0.75)" }}
                    >
                      Nhập email để tạo mã đặt lại mật khẩu.
                    </div>
                    <label
                      className="mb-4 rounded-2xl px-4 py-3 flex items-center gap-3"
                      style={{
                        border: "1px solid rgba(255,255,255,0.1)",
                        backgroundColor: "rgba(255,255,255,0.05)",
                      }}
                    >
                      <FiMail
                        className="text-base"
                        style={{ color: "rgba(233,237,255,0.7)" }}
                      />
                      <input
                        type="email"
                        className="w-full bg-transparent outline-none text-sm"
                        style={{ color: "#f5f7ff" }}
                        placeholder="Email tài khoản"
                        value={forgotForm.email}
                        onChange={(e) =>
                          setForgotForm((p) => ({
                            ...p,
                            email: e.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <button
                      className="w-full rounded-full py-3.5 font-semibold text-base"
                      style={{
                        background:
                          "linear-gradient(90deg, var(--accent) 0%, var(--accent-warm) 100%)",
                        color: "#ffffff",
                      }}
                      type="submit"
                    >
                      Tiếp tục
                    </button>
                    <button
                      type="button"
                      className="w-full mt-3 rounded-full py-3 text-sm font-semibold"
                      style={{
                        color: "rgba(233,237,255,0.9)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                      onClick={() => setAuthScreen("auth")}
                    >
                      Quay lại đăng nhập
                    </button>
                  </form>
                ) : (
                  <form onSubmit={submitResetPassword}>
                    <div
                      className="h-1 w-full rounded-full mb-4"
                      style={{
                        background:
                          "linear-gradient(90deg, rgba(14,165,233,0.95) 0%, rgba(245,158,11,0.95) 64%, rgba(255,255,255,0.15) 64%)",
                      }}
                    />
                    {forgotForm.token ? (
                      <div
                        className="mb-3 rounded-xl px-3 py-2 text-xs"
                        style={{
                          color: "rgba(233,237,255,0.85)",
                          border: "1px dashed rgba(255,255,255,0.2)",
                        }}
                      >
                        Mã reset (dev): {forgotForm.token}
                      </div>
                    ) : null}
                    <label
                      className="mb-3 rounded-2xl px-4 py-3 flex items-center gap-3"
                      style={{
                        border: "1px solid rgba(255,255,255,0.1)",
                        backgroundColor: "rgba(255,255,255,0.05)",
                      }}
                    >
                      <FiLock
                        className="text-base"
                        style={{ color: "rgba(233,237,255,0.7)" }}
                      />
                      <input
                        type="password"
                        className="w-full bg-transparent outline-none text-sm"
                        style={{ color: "#f5f7ff" }}
                        placeholder="Mật khẩu mới"
                        value={forgotForm.password}
                        onChange={(e) =>
                          setForgotForm((p) => ({
                            ...p,
                            password: e.target.value,
                          }))
                        }
                        required
                      />
                      <FiEyeOff
                        className="text-base"
                        style={{ color: "rgba(233,237,255,0.6)" }}
                      />
                    </label>
                    <label
                      className="mb-4 rounded-2xl px-4 py-3 flex items-center gap-3"
                      style={{
                        border: "1px solid rgba(255,255,255,0.1)",
                        backgroundColor: "rgba(255,255,255,0.05)",
                      }}
                    >
                      <FiRotateCcw
                        className="text-base"
                        style={{ color: "rgba(233,237,255,0.7)" }}
                      />
                      <input
                        type="password"
                        className="w-full bg-transparent outline-none text-sm"
                        style={{ color: "#f5f7ff" }}
                        placeholder="Xác nhận mật khẩu"
                        value={forgotForm.confirmPassword}
                        onChange={(e) =>
                          setForgotForm((p) => ({
                            ...p,
                            confirmPassword: e.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <div
                      className="rounded-2xl px-4 py-3 mb-4"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                    >
                      {[
                        {
                          ok: forgotForm.password.length >= 8,
                          label: "Tối thiểu 8 ký tự",
                        },
                        {
                          ok: /[A-Z]/.test(forgotForm.password),
                          label: "Ít nhất 1 chữ hoa",
                        },
                        {
                          ok: /\d/.test(forgotForm.password),
                          label: "Ít nhất 1 chữ số",
                        },
                      ].map((rule) => (
                        <div
                          key={rule.label}
                          className="flex items-center gap-2 text-xs mb-1 last:mb-0"
                        >
                          {rule.ok ? (
                            <FiCheckCircle style={{ color: "var(--accent)" }} />
                          ) : (
                            <FiCircle
                              style={{ color: "rgba(233,237,255,0.45)" }}
                            />
                          )}
                          <span
                            style={{
                              color: rule.ok
                                ? "#d5c8ff"
                                : "rgba(233,237,255,0.65)",
                            }}
                          >
                            {rule.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      className="w-full rounded-full py-3.5 font-semibold text-base"
                      style={{
                        background:
                          "linear-gradient(90deg, var(--accent) 0%, var(--accent-warm) 100%)",
                        color: "#ffffff",
                      }}
                      type="submit"
                      disabled={!forgotForm.token}
                    >
                      Cập nhật mật khẩu
                    </button>
                  </form>
                )}

                {authNotice ? (
                  <div
                    className="mt-4 text-xs rounded-xl px-3 py-2"
                    style={{
                      color: "rgba(233,237,255,0.88)",
                      border: "1px solid rgba(255,255,255,0.13)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                    }}
                  >
                    {authNotice}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const openConversation = (conversation) => {
    if (!conversation?.id) return;
    setSelectedConversation(conversation);
    setActiveTab("chat");
  };

  const content =
    activeTab === "settings" ? (
      <Settings
        me={me}
        onBack={() => setActiveTab("home")}
        onLogout={logout}
        theme={theme}
        onThemeChange={setTheme}
        onOpenProfile={() => setActiveTab("profile")}
      />
    ) : activeTab === "profile" ? (
      <Profile
        me={me}
        conversationsCount={conversations.length}
        onBack={() => setActiveTab("home")}
        onEditProfile={() => setActiveTab("settings")}
      />
    ) : activeTab === "chat" ? (
      <Right
        me={me}
        conversation={selectedConversation}
        messages={messages}
        onSendMessage={sendMessage}
        setError={reportError}
        onlineUserIds={onlineUserIds}
        onBack={() => setActiveTab("home")}
      />
    ) : (
      <HomeScreen
        me={me}
        conversations={conversations}
        selectedConversation={selectedConversation}
        onSelectConversation={setSelectedConversation}
        onOpenConversation={openConversation}
        onConversationsChanged={refreshConversations}
        setError={reportError}
        onlineUserIds={onlineUserIds}
      />
    );

  const tabs = [
    { key: "home", label: "Trang chủ", icon: FiHome },
    { key: "chat", label: "Chat", icon: FiMessageSquare },
    { key: "profile", label: "Cá nhân", icon: FiUser },
    { key: "settings", label: "Cài đặt", icon: FiSettings },
  ];

  return (
    <div className="min-h-[100dvh] w-full flex justify-center p-4">
      <div className="w-full max-w-[1200px] h-[100dvh] glass-card overflow-hidden flex flex-col relative">
        {toast?.text ? (
          <div className="app-toast">
            <div className="app-toast-title">Thong bao</div>
            <div className="app-toast-body">{toast.text}</div>
            {toast.conversation?.name ? (
              <div className="app-toast-body muted truncate">
                {toast.conversation.name}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex-1 min-h-0 panel">{content}</div>

        {activeTab !== "chat" ? (
          <div
            className="h-16 border-t panel flex items-center justify-around"
            style={{ borderColor: "var(--app-border)" }}
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className="flex flex-col items-center justify-center gap-1 w-full h-full"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                  title={t.label}
                >
                  <Icon className="text-xl" />
                  <div className="text-[11px] font-medium">{t.label}</div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default App;
