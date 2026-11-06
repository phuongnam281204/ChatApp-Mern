import React from "react";
import { FiLogOut, FiMessageSquare, FiSettings, FiUser } from "react-icons/fi";
import Avatar from "./Avatar";
import { displayName } from "../lib/chat";

export default function NavRail({ me, unreadTotal, onOpenHome, onOpenAccount, onOpenSettings, onLogout }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const anchorRef = React.useRef(null);

  React.useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "mousedown" && anchorRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const pick = (action) => () => {
    setMenuOpen(false);
    action?.();
  };

  return (
    <nav className="zalo-nav-rail" aria-label="Điều hướng chính">
      <img className="rail-logo" src="/memo-mark.png" alt="Memo Chat" width="32" height="32" />
      <div className="zalo-account-anchor" ref={anchorRef}>
        <button
          type="button"
          className="zalo-user-avatar"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Mở menu tài khoản"
        >
          <Avatar src={me?.avatarUrl} name={displayName(me)} />
        </button>
        {menuOpen ? (
          <div className="zalo-account-menu" role="menu">
            <strong>{displayName(me)}</strong>
            <button type="button" role="menuitem" onClick={pick(onOpenAccount)}>
              <span>Hồ sơ của bạn</span>
              <FiUser />
            </button>
            <button type="button" role="menuitem" onClick={pick(onOpenSettings)}>
              <span>Cài đặt</span>
              <FiSettings />
            </button>
            <button type="button" role="menuitem" className="is-danger" onClick={pick(onLogout)}>
              <span>Đăng xuất</span>
              <FiLogOut />
            </button>
          </div>
        ) : null}
      </div>

      <div className="zalo-nav-stack">
        <button
          type="button"
          className="is-active"
          title="Tin nhắn"
          aria-label={unreadTotal ? `Tin nhắn, ${unreadTotal} chưa đọc` : "Tin nhắn"}
          onClick={onOpenHome}
        >
          <FiMessageSquare />
          {unreadTotal ? <span className="nav-badge">{unreadTotal > 99 ? "99+" : unreadTotal}</span> : null}
        </button>
      </div>

      <div className="zalo-nav-stack is-bottom">
        <button type="button" title="Cài đặt" aria-label="Cài đặt" onClick={onOpenSettings}>
          <FiSettings />
        </button>
      </div>
    </nav>
  );
}
