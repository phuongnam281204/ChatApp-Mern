import React from "react";

// A short, fixed set covers everyday chat without pulling in a picker library.
const GROUPS = [
  {
    label: "Cảm xúc",
    emojis: ["😀", "😄", "😁", "😂", "🤣", "😊", "😍", "🥰", "😘", "😉", "😎", "🤩", "🤔", "😅", "😐", "🙄", "😴", "😢", "😭", "😡", "😱", "🥳", "😇", "🤗"],
  },
  {
    label: "Cử chỉ",
    emojis: ["👍", "👎", "👌", "✌️", "🤞", "👏", "🙌", "🙏", "💪", "👋", "🤝", "☝️"],
  },
  {
    label: "Biểu tượng",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "💔", "🔥", "✨", "⭐", "🎉", "🎂", "✅", "❌", "⚠️", "💯", "☕", "🍜", "🍻", "🚀"],
  },
];

export default function EmojiPicker({ onPick, onClose }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const handle = (event) => {
      if (event.type === "keydown" ? event.key === "Escape" : !ref.current?.contains(event.target)) {
        onClose?.();
      }
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handle);
    };
  }, [onClose]);

  return (
    <div className="emoji-picker" ref={ref} role="dialog" aria-label="Chọn emoji">
      {GROUPS.map((group) => (
        <section key={group.label}>
          <h4>{group.label}</h4>
          <div className="emoji-grid">
            {group.emojis.map((emoji) => (
              <button type="button" key={emoji} onClick={() => onPick(emoji)} aria-label={emoji}>
                {emoji}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
