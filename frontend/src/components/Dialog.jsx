import React from "react";

/** Modal shell: closes on Escape and on a click outside the panel. */
export default function Dialog({ label, onClose, children, className = "zalo-account-modal" }) {
  React.useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="zalo-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}
