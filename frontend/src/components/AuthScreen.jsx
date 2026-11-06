import React from "react";
import { FiLock, FiMail, FiUser } from "react-icons/fi";
import { apiFetch } from "../lib/api";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = document.getElementById("google-identity-services");
    if (!script) {
      script = document.createElement("script");
      script.id = "google-identity-services";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("google")), { once: true });
  });
}

function Field({ label, icon, ...inputProps }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-control">
        {icon}
        <input {...inputProps} />
      </div>
    </label>
  );
}

/**
 * Sign in, sign up, and the two-step password reset.
 * `initialResetToken` comes from the ?reset= link in the reset email.
 */
export default function AuthScreen({ theme, initialResetToken, onAuthenticated }) {
  const [screen, setScreen] = React.useState(initialResetToken ? "forgot-reset" : "auth");
  const [mode, setMode] = React.useState("login");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(
    initialResetToken ? "Nhập mật khẩu mới cho tài khoản của bạn." : "",
  );
  const [rememberMe, setRememberMe] = React.useState(true);
  const [agreeTerms, setAgreeTerms] = React.useState(false);
  const [form, setForm] = React.useState({ username: "", email: "", password: "" });
  const [forgot, setForgot] = React.useState({
    email: "",
    token: initialResetToken || "",
    password: "",
    confirmPassword: "",
  });
  const [googleFailed, setGoogleFailed] = React.useState(false);
  const googleButtonRef = React.useRef(null);

  const setField = (setter, key) => (event) =>
    setter((prev) => ({ ...prev, [key]: event.target.value }));

  const finish = React.useCallback(
    async (user) => {
      await onAuthenticated(user);
    },
    [onAuthenticated],
  );

  const handleGoogle = React.useCallback(
    async (credential) => {
      if (!credential) return;
      setBusy(true);
      setNotice("");
      try {
        const data = await apiFetch("/api/auth/google", {
          method: "POST",
          body: JSON.stringify({ credential, remember: rememberMe }),
        });
        await finish(data.user);
      } catch (error) {
        setNotice(error.message || "Đăng nhập Google thất bại.");
      } finally {
        setBusy(false);
      }
    },
    [finish, rememberMe],
  );

  // Google warns against calling initialize() more than once, so it runs once
  // per page and calls through a ref that always holds the latest handler.
  const handleGoogleRef = React.useRef(handleGoogle);
  React.useEffect(() => {
    handleGoogleRef.current = handleGoogle;
  }, [handleGoogle]);

  // Render the button every time its container mounts (e.g. after logout).
  React.useEffect(() => {
    if (screen !== "auth" || !GOOGLE_CLIENT_ID) return undefined;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !googleButtonRef.current) return;
        if (!window.__memoGoogleInitialized) {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => handleGoogleRef.current(response?.credential),
          });
          window.__memoGoogleInitialized = true;
        }
        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: "standard",
          shape: "rectangular",
          theme: theme === "light" ? "outline" : "filled_black",
          text: "continue_with",
          width: 300,
          size: "large",
        });
      })
      .catch(() => !cancelled && setGoogleFailed(true));
    return () => {
      cancelled = true;
    };
  }, [screen, theme]);

  const submitAuth = async (event) => {
    event.preventDefault();
    if (mode === "signup" && !agreeTerms) {
      setNotice("Vui lòng đồng ý điều khoản trước khi tạo tài khoản.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const payload =
        mode === "signup"
          ? { username: form.username.trim(), email: form.email.trim(), password: form.password, remember: rememberMe }
          : { email: form.email.trim(), password: form.password, remember: rememberMe };
      const data = await apiFetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await finish(data.user);
    } catch (error) {
      setNotice(error.message || "Đăng nhập thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const submitForgotEmail = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgot.email.trim() }),
      });
      if (data?.resetToken) {
        setForgot((prev) => ({ ...prev, token: data.resetToken }));
        setScreen("forgot-reset");
        setNotice("Máy chủ chưa cấu hình email nên mã đặt lại đã được điền sẵn (chỉ ở môi trường dev).");
      } else {
        setNotice(
          "Nếu email này đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu trong vài phút. Kiểm tra cả mục Spam.",
        );
      }
    } catch (error) {
      setNotice(error.message || "Không xử lý được yêu cầu.");
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    if (forgot.password !== forgot.confirmPassword) {
      setNotice("Mật khẩu nhập lại không khớp.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: forgot.token.trim(), password: forgot.password }),
      });
      setNotice("Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.");
      setMode("login");
      setScreen("auth");
      setForgot({ email: "", token: "", password: "", confirmPassword: "" });
    } catch (error) {
      setNotice(error.message || "Đặt lại mật khẩu thất bại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-frame auth-frame">
      <section className="auth-layout">
        <section className="auth-card">
          <div className="brand-row">
            <img className="brand-mark" src="/memo-mark.png" alt="" width="36" height="36" />
            <div className="brand-name">Memo Chat</div>
          </div>

          {screen === "auth" ? (
            <>
              <div className="auth-tabs" role="tablist" aria-label="Chọn chế độ">
                {[
                  ["login", "Đăng nhập"],
                  ["signup", "Đăng ký"],
                ].map(([id, label]) => (
                  <button
                    type="button"
                    role="tab"
                    key={id}
                    aria-selected={mode === id}
                    className={mode === id ? "is-active" : ""}
                    onClick={() => {
                      setMode(id);
                      setNotice("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form className="auth-form" onSubmit={submitAuth}>
                {mode === "signup" ? (
                  <Field
                    label="Tên hiển thị"
                    icon={<FiUser />}
                    value={form.username}
                    onChange={setField(setForm, "username")}
                    placeholder="Nguyễn An"
                    autoComplete="name"
                    minLength={2}
                    maxLength={50}
                    required
                  />
                ) : null}
                <Field
                  label="Email"
                  icon={<FiMail />}
                  type="email"
                  value={form.email}
                  onChange={setField(setForm, "email")}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
                <Field
                  label="Mật khẩu"
                  icon={<FiLock />}
                  type="password"
                  value={form.password}
                  onChange={setField(setForm, "password")}
                  placeholder="Ít nhất 6 ký tự"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />

                <div className="auth-options">
                  <label>
                    <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                    Ghi nhớ đăng nhập
                  </label>
                  {mode === "login" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setScreen("forgot-email");
                        setForgot((prev) => ({ ...prev, email: form.email || prev.email }));
                        setNotice("");
                      }}
                    >
                      Quên mật khẩu?
                    </button>
                  ) : null}
                </div>

                {mode === "signup" ? (
                  <label className="auth-check">
                    <input type="checkbox" checked={agreeTerms} onChange={(event) => setAgreeTerms(event.target.checked)} />
                    Tôi đồng ý điều khoản dịch vụ và chính sách bảo mật.
                  </label>
                ) : null}

                <button className="primary-action" type="submit" disabled={busy}>
                  {busy ? "Đang xử lý…" : mode === "signup" ? "Tạo tài khoản" : "Đăng nhập"}
                </button>
              </form>

              {GOOGLE_CLIENT_ID && !googleFailed ? (
                <>
                  <div className="divider">
                    <span>hoặc</span>
                  </div>
                  <div className="google-slot" ref={googleButtonRef} />
                </>
              ) : null}
              {googleFailed ? (
                <p className="settings-hint">Không tải được nút đăng nhập Google. Kiểm tra kết nối mạng rồi tải lại trang.</p>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className="back-link"
                onClick={() => {
                  setScreen("auth");
                  setNotice("");
                }}
              >
                Quay lại đăng nhập
              </button>
              <h2>{screen === "forgot-email" ? "Quên mật khẩu" : "Đặt mật khẩu mới"}</h2>
              <p className="muted">
                {screen === "forgot-email"
                  ? "Nhập email đã đăng ký. Chúng tôi sẽ gửi liên kết đặt lại mật khẩu."
                  : "Liên kết đặt lại có hiệu lực trong 15 phút."}
              </p>

              {screen === "forgot-email" ? (
                <form className="auth-form" onSubmit={submitForgotEmail}>
                  <Field label="Email" icon={<FiMail />} type="email" autoComplete="email" value={forgot.email} onChange={setField(setForgot, "email")} required />
                  <button className="primary-action" disabled={busy}>
                    {busy ? "Đang gửi…" : "Gửi liên kết đặt lại"}
                  </button>
                </form>
              ) : (
                <form className="auth-form" onSubmit={submitReset}>
                  {!initialResetToken ? (
                    <Field label="Mã đặt lại" icon={<FiLock />} value={forgot.token} onChange={setField(setForgot, "token")} required />
                  ) : null}
                  <Field label="Mật khẩu mới" icon={<FiLock />} type="password" autoComplete="new-password" minLength={6} value={forgot.password} onChange={setField(setForgot, "password")} required />
                  <Field label="Nhập lại mật khẩu mới" icon={<FiLock />} type="password" autoComplete="new-password" minLength={6} value={forgot.confirmPassword} onChange={setField(setForgot, "confirmPassword")} required />
                  <button className="primary-action" disabled={busy}>
                    {busy ? "Đang lưu…" : "Đặt mật khẩu mới"}
                  </button>
                </form>
              )}
            </>
          )}

          {notice ? (
            <div className="notice" role="status">
              {notice}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
