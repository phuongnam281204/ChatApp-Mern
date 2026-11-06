import React from "react";
import { FiArrowLeft, FiCamera, FiCheck, FiEdit2, FiImage, FiX } from "react-icons/fi";
import Avatar from "./Avatar";
import Dialog from "./Dialog";
import { apiFetch, apiUpload } from "../lib/api";
import { displayName } from "../lib/chat";

const MAX_INLINE_AVATAR_BYTES = 1_500_000;

function createAvatarDataUrl(label, background, foreground = "#ffffff") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="${background}"/><text x="50%" y="56%" text-anchor="middle" font-family="'Be Vietnam Pro',Arial,sans-serif" font-size="60" font-weight="600" fill="${foreground}">${label}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const AVATAR_CHOICES = [
  createAvatarDataUrl("M", "#611baf"),
  createAvatarDataUrl("N", "#cfa2fa", "#1e0b45"),
  createAvatarDataUrl("A", "#2a0d67"),
  createAvatarDataUrl("H", "#9f5ef0"),
];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Không đọc được ảnh đã chọn."));
    reader.readAsDataURL(file);
  });
}

export default function AccountModal({ me, onClose, onUpdated }) {
  const [view, setView] = React.useState("info");
  const [editingName, setEditingName] = React.useState(false);
  const [name, setName] = React.useState(me?.username || "");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const fileRef = React.useRef(null);

  const createdAt = me?.createdAt ? new Date(me.createdAt) : null;
  const joinedAt =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? createdAt.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "Chưa cập nhật";

  const saveProfile = async (fields) => {
    setBusy(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/users/me", { method: "PUT", body: JSON.stringify(fields) });
      onUpdated?.(data.user);
      return true;
    } catch (error) {
      setNotice(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveName = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      setNotice("Tên hiển thị cần từ 2 đến 50 ký tự.");
      return;
    }
    if (await saveProfile({ username: trimmed })) setEditingName(false);
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Vui lòng chọn một file ảnh.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const data = await apiUpload("/api/users/me/avatar", { file });
      onUpdated?.(data.user);
      setView("info");
    } catch (error) {
      // No file storage on the server: store small images inline instead.
      if (error.status === 503 && file.size <= MAX_INLINE_AVATAR_BYTES) {
        const dataUrl = await readFileAsDataUrl(file).catch(() => "");
        if (dataUrl && (await saveProfile({ avatarUrl: dataUrl }))) setView("info");
      } else if (error.status === 503) {
        setNotice("Máy chủ chưa bật lưu trữ ảnh, nên chỉ nhận ảnh nhỏ hơn 1,5MB.");
      } else {
        setNotice(error.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (view === "avatar") {
    const choices = me?.avatarUrl ? [me.avatarUrl, ...AVATAR_CHOICES] : AVATAR_CHOICES;
    return (
      <Dialog label="Đổi ảnh đại diện" onClose={onClose} className="zalo-account-modal zalo-avatar-modal">
        <header className="zalo-account-modal-header">
          <button type="button" onClick={() => setView("info")} aria-label="Quay lại">
            <FiArrowLeft />
          </button>
          <strong>Đổi ảnh đại diện</strong>
          <button type="button" onClick={onClose} aria-label="Đóng">
            <FiX />
          </button>
        </header>
        <section className="zalo-avatar-editor">
          <input ref={fileRef} type="file" accept="image/*" className="zalo-hidden-input" onChange={uploadAvatar} />
          <button type="button" className="zalo-upload-avatar" disabled={busy} onClick={() => fileRef.current?.click()}>
            <FiImage />
            {busy ? "Đang tải lên…" : "Tải ảnh từ máy"}
          </button>
          <h3>Hoặc chọn ảnh có sẵn</h3>
          <div className="zalo-avatar-choice-grid">
            {choices.map((url, index) => (
              <button
                type="button"
                key={`${index}-${url.slice(-24)}`}
                className={url === me?.avatarUrl ? "is-current" : ""}
                disabled={busy}
                onClick={async () => (await saveProfile({ avatarUrl: url })) && setView("info")}
                aria-label={`Chọn ảnh ${index + 1}`}
              >
                <img src={url} alt="" />
              </button>
            ))}
          </div>
          {notice ? <p className="zalo-avatar-notice">{notice}</p> : null}
        </section>
      </Dialog>
    );
  }

  return (
    <Dialog label="Hồ sơ của bạn" onClose={onClose}>
      <header className="zalo-account-modal-header">
        <strong>Hồ sơ của bạn</strong>
        <button type="button" onClick={onClose} aria-label="Đóng">
          <FiX />
        </button>
      </header>

      <div className="zalo-account-identity">
        <Avatar src={me?.avatarUrl} name={displayName(me)} size="xl">
          <button
            type="button"
            className="zalo-avatar-camera"
            onClick={() => {
              setNotice("");
              setView("avatar");
            }}
            aria-label="Đổi ảnh đại diện"
          >
            <FiCamera />
          </button>
        </Avatar>

        {editingName ? (
          <form className="inline-edit" onSubmit={saveName}>
            <input
              autoFocus
              value={name}
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && (event.stopPropagation(), setEditingName(false))}
              aria-label="Tên hiển thị"
            />
            <button type="submit" disabled={busy} aria-label="Lưu tên">
              <FiCheck />
            </button>
            <button type="button" onClick={() => setEditingName(false)} aria-label="Huỷ">
              <FiX />
            </button>
          </form>
        ) : (
          <strong>
            {displayName(me)}
            <button
              type="button"
              onClick={() => {
                setName(me?.username || "");
                setNotice("");
                setEditingName(true);
              }}
              aria-label="Sửa tên hiển thị"
            >
              <FiEdit2 />
            </button>
          </strong>
        )}
      </div>

      {notice ? <p className="zalo-avatar-notice account-notice">{notice}</p> : null}

      <section className="zalo-account-info">
        <h3>Thông tin cá nhân</h3>
        <dl>
          <div>
            <dt>Tên hiển thị</dt>
            <dd>{me?.username || "Chưa cập nhật"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{me?.email || "Chưa cập nhật"}</dd>
          </div>
          <div>
            <dt>Ngày tham gia</dt>
            <dd>{joinedAt}</dd>
          </div>
        </dl>
      </section>
    </Dialog>
  );
}

