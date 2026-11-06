import React from "react";
import { apiFetch } from "../../lib/api";
import {
  FiArrowLeft,
  FiBell,
  FiEye,
  FiLogOut,
  FiMoon,
  FiUser,
  FiVolume2,
} from "react-icons/fi";

function initials(name) {
  return String(name || "?").trim().slice(0, 1).toUpperCase();
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? "is-on" : ""}`}
      onClick={() => onChange?.(!checked)}
    >
      <span />
    </button>
  );
}

function SettingRow({ icon, title, subtitle, right }) {
  return (
    <div className="setting-row">
      <span className="setting-icon">
        {React.createElement(icon)}
      </span>
      <span className="setting-main">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
      {right}
    </div>
  );
}

export default function Settings({
  me,
  onBack,
  onLogout,
  theme = "dark",
  onThemeChange,
  onOpenProfile,
  onProfileUpdated,
}) {
  const [notify, setNotify] = React.useState(true);
  const [sound, setSound] = React.useState(true);
  const [preview, setPreview] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [profileForm, setProfileForm] = React.useState({
    username: me?.username || "",
    avatarUrl: me?.avatarUrl || "",
  });
  const displayName = me?.username || me?.email || "User";

  React.useEffect(() => {
    setProfileForm({
      username: me?.username || "",
      avatarUrl: me?.avatarUrl || "",
    });
  }, [me?.avatarUrl, me?.username]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/users/me", {
        method: "PUT",
        body: JSON.stringify(profileForm),
      });
      onProfileUpdated?.(data.user);
      setNotice("Đã cập nhật hồ sơ.");
    } catch (error) {
      setNotice(error.message || "Không thể cập nhật hồ sơ.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-view">
      <header className="subpage-header">
        <button type="button" className="icon-button" onClick={onBack} title="Quay lại">
          <FiArrowLeft />
        </button>
        <strong>Cài đặt</strong>
        <span />
      </header>

      <section className="profile-summary" onClick={onOpenProfile} role="button" tabIndex={0}>
        <span className="avatar xl">
          {me?.avatarUrl ? <img src={me.avatarUrl} alt={displayName} /> : initials(displayName)}
        </span>
        <span>
          <strong>{displayName}</strong>
          <small>{me?.email}</small>
        </span>
      </section>

      <section className="settings-card">
        <form className="profile-form" onSubmit={saveProfile}>
          <label className="field">
            <span>Tên hiển thị</span>
            <div className="field-control">
              <FiUser />
              <input
                value={profileForm.username}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    username: event.target.value,
                  }))
                }
                minLength={2}
                maxLength={50}
                required
              />
            </div>
          </label>
          <label className="field">
            <span>Avatar URL</span>
            <div className="field-control">
              <FiUser />
              <input
                value={profileForm.avatarUrl}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    avatarUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
              />
            </div>
          </label>
          <button className="primary-action" disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu hồ sơ"}
          </button>
          {notice ? <div className="notice inline">{notice}</div> : null}
        </form>
      </section>

      <section className="settings-card">
        <SettingRow
          icon={FiBell}
          title="Thông báo"
          subtitle="Nhận thông báo khi có tin mới"
          right={<Toggle checked={notify} onChange={setNotify} label="Thông báo" />}
        />
        <SettingRow
          icon={FiVolume2}
          title="Âm thanh"
          subtitle="Phát âm báo trong ứng dụng"
          right={<Toggle checked={sound} onChange={setSound} label="Âm thanh" />}
        />
        <SettingRow
          icon={FiEye}
          title="Xem trước tin nhắn"
          subtitle="Hiển thị preview trong danh sách chat"
          right={<Toggle checked={preview} onChange={setPreview} label="Xem trước" />}
        />
      </section>

      <section className="settings-card">
        <SettingRow
          icon={FiMoon}
          title="Chế độ tối"
          subtitle="Đổi theme cho toàn bộ ứng dụng"
          right={
            <Toggle
              checked={theme !== "light"}
              onChange={(next) => onThemeChange?.(next ? "dark" : "light")}
              label="Chế độ tối"
            />
          }
        />
        <SettingRow
          icon={FiUser}
          title="Hồ sơ"
          subtitle="Xem thông tin tài khoản"
          right={
            <button type="button" className="secondary-action mini" onClick={onOpenProfile}>
              Mở
            </button>
          }
        />
      </section>

      <button type="button" className="logout-button" onClick={onLogout}>
        <FiLogOut />
        Đăng xuất
      </button>
    </div>
  );
}
