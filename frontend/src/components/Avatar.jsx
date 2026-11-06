import { initials } from "../lib/chat";

export default function Avatar({ src, name, size = "", online = false, children }) {
  return (
    <span className={`avatar ${size}`.trim()}>
      {src ? <img src={src} alt="" /> : initials(name)}
      {online ? <i className="online-dot" aria-label="Đang hoạt động" /> : null}
      {children}
    </span>
  );
}
