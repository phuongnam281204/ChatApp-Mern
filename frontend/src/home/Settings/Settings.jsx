import React from "react";
import {
  FiArrowLeft,
  FiBell,
  FiVolume2,
  FiSmartphone,
  FiEye,
  FiMoon,
  FiChevronRight,
} from "react-icons/fi";

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange?.(!checked)}
      className="relative inline-flex h-7 w-12 items-center rounded-full border transition-colors"
      style={{
        borderColor: "var(--app-border)",
        backgroundColor: checked ? "var(--accent)" : "var(--input-bg)",
      }}
    >
      <span
        className={`absolute left-1 top-1 h-5 w-5 rounded-full border transition-transform grid place-items-center ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
        style={{
          backgroundColor: checked ? "var(--surface)" : "var(--bubble-other)",
          borderColor: "var(--app-border)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 transition-opacity pointer-events-none ${
            checked ? "opacity-100" : "opacity-0"
          }`}
          style={{ color: "var(--accent)" }}
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M9.00039 16.17 4.83039 12l-1.42 1.41 5.59 5.59L20.0004 8l-1.41-1.41z"
          />
        </svg>
      </span>
    </button>
  );
}

const Row = ({ icon: Icon, title, right }) => (
  <div
    className="flex items-center justify-between gap-4 px-4 py-3"
    style={{ borderColor: "var(--app-border)" }}
  >
    <div className="flex items-center gap-3 min-w-0">
      <div
        className="h-10 w-10 rounded-2xl grid place-items-center border"
        style={{
          backgroundColor: "var(--input-bg)",
          borderColor: "var(--app-border)",
        }}
      >
        <Icon className="text-lg" />
      </div>
      <div className="min-w-0">
        <div className="font-medium truncate">{title}</div>
      </div>
    </div>
    {right}
  </div>
);

const Settings = ({
  me,
  onBack,
  onLogout,
  theme = "dark",
  onThemeChange,
  onOpenProfile,
}) => {
  const [notify, setNotify] = React.useState(true);
  const [sound, setSound] = React.useState(false);
  const [vibrate, setVibrate] = React.useState(true);
  const [preview, setPreview] = React.useState(true);

  const darkMode = theme !== "light";

  const displayName = me?.username || me?.email || "User";
  const handle = me?.username
    ? `@${me.username}`
    : me?.email
      ? `@${me.email}`
      : "";
  const meInitial = String(displayName).slice(0, 1).toUpperCase();

  return (
    <div className="flex-1 h-full overflow-y-auto chat-shell">
      <div className="max-w-xl mx-auto p-6">
        <div className="grid grid-cols-3 items-center mb-5">
          <div>
            <button
              type="button"
              className="rail-btn hover:bg-[var(--input-bg)]"
              onClick={onBack}
              title="Back"
            >
              <FiArrowLeft className="text-lg" />
            </button>
          </div>
          <div className="text-center font-semibold text-lg">Cài đặt</div>
          <div />
        </div>

        <button
          type="button"
          onClick={onOpenProfile}
          className="w-full text-left rounded-2xl border px-4 py-4 flex items-center justify-between gap-4 glass-card"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="avatar-circle" style={{ width: 48, height: 48 }}>
              {me?.avatarUrl ? (
                <img
                  src={me.avatarUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                meInitial
              )}
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate">{displayName}</div>
              <div className="text-sm muted truncate">{handle}</div>
            </div>
          </div>
          <FiChevronRight className="text-xl muted" />
        </button>

        <div className="mt-5">
          <div
            className="text-sm font-semibold mb-3"
            style={{ color: "var(--accent)" }}
          >
            Thông báo
          </div>
          <div className="rounded-2xl border overflow-hidden glass-card">
            <Row
              icon={FiBell}
              title="Thông báo đẩy"
              right={
                <Toggle
                  checked={notify}
                  onChange={setNotify}
                  label="Thông báo đẩy"
                />
              }
            />
            <div
              className="h-px"
              style={{ backgroundColor: "var(--app-border)" }}
            />
            <Row
              icon={FiVolume2}
              title="Âm thanh"
              right={
                <Toggle checked={sound} onChange={setSound} label="Âm thanh" />
              }
            />
            <div
              className="h-px"
              style={{ backgroundColor: "var(--app-border)" }}
            />
            <Row
              icon={FiSmartphone}
              title="Rung"
              right={
                <Toggle checked={vibrate} onChange={setVibrate} label="Rung" />
              }
            />
            <div
              className="h-px"
              style={{ backgroundColor: "var(--app-border)" }}
            />
            <Row
              icon={FiEye}
              title="Xem trước tin nhắn"
              right={
                <Toggle
                  checked={preview}
                  onChange={setPreview}
                  label="Xem trước tin nhắn"
                />
              }
            />
          </div>
        </div>

        <div className="mt-5">
          <div
            className="text-sm font-semibold mb-3"
            style={{ color: "var(--accent)" }}
          >
            Giao diện
          </div>
          <div className="rounded-2xl border overflow-hidden glass-card">
            <Row
              icon={FiMoon}
              title="Chế độ tối"
              right={
                <Toggle
                  checked={darkMode}
                  onChange={(next) => onThemeChange?.(next ? "dark" : "light")}
                  label="Chế độ tối"
                />
              }
            />
          </div>
        </div>

        <button
          type="button"
          className="w-full mt-6 py-3 rounded-2xl font-semibold btn-ghost"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          onClick={onLogout}
        >
          Đăng xuất
        </button>
      </div>
    </div>
  );
};

export default Settings;
