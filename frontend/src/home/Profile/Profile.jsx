import React from "react";
import { FiArrowLeft, FiCalendar, FiEdit2, FiMail, FiMessageSquare, FiUser } from "react-icons/fi";
import settingsBg from "../../assets/settings-bg.png";

function initials(name) {
  return String(name || "?").trim().slice(0, 1).toUpperCase();
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="info-row">
      <span>
        {React.createElement(icon)}
      </span>
      <div>
        <small>{label}</small>
        <strong>{value || "Chưa cập nhật"}</strong>
      </div>
    </div>
  );
}

export default function Profile({ me, conversationsCount = 0, onBack, onEditProfile }) {
  const displayName = me?.username || me?.email || "User";
  const createdAt = me?.createdAt ? new Date(me.createdAt) : null;

  return (
    <div className="profile-view">
      <header className="subpage-header">
        <button type="button" className="icon-button" onClick={onBack} title="Quay lại">
          <FiArrowLeft />
        </button>
        <strong>Hồ sơ</strong>
        <button type="button" className="icon-button" onClick={onEditProfile} title="Cài đặt">
          <FiEdit2 />
        </button>
      </header>

      <section className="profile-card">
        <div
          className="profile-cover"
          style={{ backgroundImage: `url(${settingsBg})` }}
        />
        <div className="profile-content">
          <span className="avatar hero">
            {me?.avatarUrl ? <img src={me.avatarUrl} alt={displayName} /> : initials(displayName)}
          </span>
          <h2>{displayName}</h2>
          <p>{me?.email}</p>

          <div className="profile-stats">
            <div>
              <strong>{conversationsCount}</strong>
              <span>Chat</span>
            </div>
            <div>
              <strong>Realtime</strong>
              <span>Trạng thái</span>
            </div>
            <div>
              <strong>Secure</strong>
              <span>Cookie JWT</span>
            </div>
          </div>

          <div className="info-card">
            <InfoRow icon={FiUser} label="Username" value={me?.username} />
            <InfoRow icon={FiMail} label="Email" value={me?.email} />
            <InfoRow
              icon={FiCalendar}
              label="Ngày tham gia"
              value={
                createdAt
                  ? createdAt.toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })
                  : "Chưa có dữ liệu"
              }
            />
          </div>

          <div className="empty-state wide">
            <FiMessageSquare />
            <strong>Kho media đang trống</strong>
            <span>Ảnh, video và file chia sẻ sẽ hiển thị tại đây khi app có upload.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
