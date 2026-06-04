import React from "react";
import {
  FiArrowLeft,
  FiEdit2,
  FiMail,
  FiUser,
  FiCalendar,
} from "react-icons/fi";
import settingsBg from "../../assets/settings-bg.png";

const Stat = ({ value, label }) => (
  <div className="flex-1 text-center">
    <div
      className="text-sm font-semibold"
      style={{ color: "var(--text-other)" }}
    >
      {value}
    </div>
    <div className="text-[11px] muted">{label}</div>
  </div>
);

const TabButton = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="px-1 pb-2 text-sm font-semibold"
    style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
  >
    {children}
    <div
      className="mt-2 h-0.5 rounded-full"
      style={{
        backgroundColor: active ? "var(--accent)" : "transparent",
      }}
    />
  </button>
);

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 px-4 py-3">
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
      <div className="text-xs muted">{label}</div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  </div>
);

const Profile = ({ me, conversationsCount = 0, onBack, onEditProfile }) => {
  const displayName = me?.username || me?.email || "User";
  const handle = me?.username
    ? `@${me.username}`
    : me?.email
      ? `@${me.email}`
      : "";
  const meInitial = String(displayName).slice(0, 1).toUpperCase();
  const [activeMediaTab, setActiveMediaTab] = React.useState("images");

  const createdAt = me?.createdAt ? new Date(me.createdAt) : null;
  const joinText = createdAt
    ? createdAt.toLocaleDateString("vi-VN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto chat-shell">
      <div className="max-w-xl mx-auto px-6 pt-6 pb-8">
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
          <div className="text-center font-semibold">Trang cá nhân</div>
          <div className="flex justify-end">
            <button
              type="button"
              className="rail-btn hover:bg-[var(--input-bg)]"
              onClick={onEditProfile}
              title="Edit"
            >
              <FiEdit2 className="text-lg" />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border relative glass-card">
          <div
            className="h-44 w-full rounded-t-2xl relative z-0"
            style={{
              backgroundImage: `url(${settingsBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />

          <div className="px-5 pb-5">
            <div className="-mt-10 flex items-end gap-4 relative z-10">
              <div
                className="rounded-full p-1 shrink-0"
                style={{ backgroundColor: "var(--surface)" }}
              >
                <div
                  className="avatar-circle"
                  style={{ width: 84, height: 84 }}
                >
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
              </div>

              <div className="min-w-0 pb-2">
                <div className="text-xl font-extrabold truncate">
                  {displayName}
                </div>
                <div
                  className="text-sm font-semibold truncate"
                  style={{ color: "var(--accent)" }}
                >
                  {handle}
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm muted">
              {me?.email ? `Email liên hệ: ${me.email}` : ""}
            </div>

            <button
              type="button"
              onClick={onEditProfile}
              className="w-full mt-4 py-3 rounded-2xl font-semibold btn-ghost"
            >
              Chỉnh sửa hồ sơ
            </button>

            <div
              className="mt-4 grid grid-cols-3 rounded-2xl border py-3"
              style={{ borderColor: "var(--app-border)" }}
            >
              <Stat value={conversationsCount} label="Chat" />
              <Stat value={0} label="Bạn bè" />
              <Stat value={0} label="Nhóm" />
            </div>

            <div
              className="mt-4 rounded-2xl border overflow-hidden"
              style={{ borderColor: "var(--app-border)" }}
            >
              {me?.username ? (
                <InfoRow icon={FiUser} label="Username" value={me.username} />
              ) : null}
              {me?.email ? (
                <InfoRow icon={FiMail} label="Email" value={me.email} />
              ) : null}
              {joinText ? (
                <InfoRow
                  icon={FiCalendar}
                  label="Ngày tham gia"
                  value={joinText}
                />
              ) : null}
            </div>

            <div className="mt-5 flex items-end gap-6">
              <TabButton
                active={activeMediaTab === "images"}
                onClick={() => setActiveMediaTab("images")}
              >
                Ảnh
              </TabButton>
              <TabButton
                active={activeMediaTab === "videos"}
                onClick={() => setActiveMediaTab("videos")}
              >
                Video
              </TabButton>
              <TabButton
                active={activeMediaTab === "files"}
                onClick={() => setActiveMediaTab("files")}
              >
                Files
              </TabButton>
            </div>

            <div
              className="mt-3 rounded-2xl border p-6 text-center text-sm muted"
              style={{ borderColor: "var(--app-border)" }}
            >
              Chưa có nội dung để hiển thị
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
