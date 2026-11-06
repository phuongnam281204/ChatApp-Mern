import React from "react";
import { FiBell, FiMonitor, FiShield, FiX } from "react-icons/fi";
import Dialog from "./Dialog";
import { apiFetch } from "../lib/api";
import { notificationPermission } from "../lib/preferences";

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`zalo-settings-switch ${checked ? "is-on" : ""}`}
      onClick={() => onChange?.(!checked)}
    >
      <span />
    </button>
  );
}

const SECTIONS = [
  { id: "appearance", label: "Giao diện", icon: FiMonitor },
  { id: "notifications", label: "Thông báo", icon: FiBell },
  { id: "security", label: "Tài khoản và bảo mật", icon: FiShield },
];

const THEME_OPTIONS = [
  { id: "light", label: "Sáng" },
  { id: "dark", label: "Tối" },
  { id: "system", label: "Theo hệ thống" },
];

function AppearanceSection({ theme, onThemeChange }) {
  return (
    <section className="zalo-settings-section">
      <h3>Giao diện</h3>
      <div className="zalo-theme-options" role="radiogroup" aria-label="Chế độ màu">
        {THEME_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.id}
            role="radio"
            aria-checked={theme === option.id}
            className={theme === option.id ? "is-selected" : ""}
            onClick={() => onThemeChange(option.id)}
          >
            <span className={`zalo-theme-preview is-${option.id}`}>
              <i />
              <b />
            </span>
            <span>
              <i /> {option.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function NotificationSection({ desktopNotify, onDesktopNotifyChange }) {
  const [permission, setPermission] = React.useState(notificationPermission);

  const toggle = async (next) => {
    if (!next) {
      onDesktopNotifyChange(false);
      return;
    }
    if (permission === "unsupported") return;
    let result = permission;
    if (result === "default") {
      result = await Notification.requestPermission();
      setPermission(result);
    }
    onDesktopNotifyChange(result === "granted");
  };

  const hint =
    permission === "unsupported"
      ? "Trình duyệt này không hỗ trợ thông báo."
      : permission === "denied"
        ? "Trình duyệt đang chặn thông báo của trang này. Mở quyền thông báo trong cài đặt trình duyệt rồi bật lại."
        : "Hiện thông báo khi có tin mới lúc bạn đang ở tab khác. Cuộc trò chuyện đã tắt thông báo sẽ không báo.";

  return (
    <section className="zalo-settings-section">
      <h3>Thông báo</h3>
      <div className="zalo-toggle-row">
        <span>Thông báo trên máy tính</span>
        <Switch
          label="Thông báo trên máy tính"
          checked={desktopNotify && permission === "granted"}
          disabled={permission === "unsupported" || permission === "denied"}
          onChange={toggle}
        />
      </div>
      <p className="settings-hint">{hint}</p>
    </section>
  );
}

function SecuritySection({ me }) {
  const [form, setForm] = React.useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const hasPassword = me?.hasPassword !== false;

  const submit = async (event) => {
    event.preventDefault();
    if (form.next.length < 6) {
      setNotice({ tone: "error", text: "Mật khẩu mới cần ít nhất 6 ký tự." });
      return;
    }
    if (form.next !== form.confirm) {
      setNotice({ tone: "error", text: "Mật khẩu nhập lại không khớp." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      });
      setForm({ current: "", next: "", confirm: "" });
      setNotice({ tone: "ok", text: hasPassword ? "Đã đổi mật khẩu." : "Đã đặt mật khẩu." });
    } catch (error) {
      setNotice({ tone: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, autoComplete) => (
    <label className="field">
      <span>{label}</span>
      <div className="field-control">
        <input
          type="password"
          autoComplete={autoComplete}
          value={form[key]}
          onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
          required
        />
      </div>
    </label>
  );

  return (
    <section className="zalo-settings-section">
      <h3>{hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu"}</h3>
      {!hasPassword ? (
        <p className="settings-hint">
          Tài khoản của bạn đang đăng nhập bằng Google. Đặt mật khẩu để có thể đăng nhập bằng email.
        </p>
      ) : null}
      <form className="settings-form" onSubmit={submit}>
        {hasPassword ? field("current", "Mật khẩu hiện tại", "current-password") : null}
        {field("next", "Mật khẩu mới", "new-password")}
        {field("confirm", "Nhập lại mật khẩu mới", "new-password")}
        <button className="primary-action compact" disabled={busy}>
          {busy ? "Đang lưu…" : hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu"}
        </button>
        {notice ? (
          <p className={`form-notice ${notice.tone === "error" ? "is-error" : ""}`} role="status">
            {notice.text}
          </p>
        ) : null}
      </form>
    </section>
  );
}

export default function SettingsModal({ me, theme, onThemeChange, desktopNotify, onDesktopNotifyChange, onClose }) {
  const [active, setActive] = React.useState("appearance");

  return (
    <Dialog label="Cài đặt" onClose={onClose} className="zalo-settings-modal">
      <aside className="zalo-settings-sidebar">
        <h2>Cài đặt</h2>
        <div className="zalo-settings-nav">
          {SECTIONS.map((section) => (
            <button
              type="button"
              key={section.id}
              className={active === section.id ? "is-active" : ""}
              aria-current={active === section.id ? "page" : undefined}
              onClick={() => setActive(section.id)}
            >
              {React.createElement(section.icon)}
              <span>{section.label}</span>
            </button>
          ))}
        </div>
      </aside>
      <main className="zalo-settings-content">
        <button type="button" className="zalo-settings-close" onClick={onClose} aria-label="Đóng">
          <FiX />
        </button>
        {active === "appearance" ? <AppearanceSection theme={theme} onThemeChange={onThemeChange} /> : null}
        {active === "notifications" ? (
          <NotificationSection desktopNotify={desktopNotify} onDesktopNotifyChange={onDesktopNotifyChange} />
        ) : null}
        {active === "security" ? <SecuritySection me={me} /> : null}
      </main>
    </Dialog>
  );
}
