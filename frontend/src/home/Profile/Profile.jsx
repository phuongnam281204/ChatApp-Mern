import React from "react";
import { FiArrowLeft, FiCalendar, FiEdit2, FiMail, FiUser } from "react-icons/fi";

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

export default function Profile({ me, onBack, onEditProfile }) {
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
        <div className="profile-content">
          <span className="avatar hero">
            {me?.avatarUrl ? <img src={me.avatarUrl} alt={displayName} /> : initials(displayName)}
          </span>
          <h2>{displayName}</h2>
          <p>{me?.email}</p>

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
        </div>
      </section>
    </div>
  );
}
