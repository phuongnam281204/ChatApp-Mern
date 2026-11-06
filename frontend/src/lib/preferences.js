// Per-browser preferences. Storage can be unavailable (private mode), so
// every access is guarded and falls back to the default.

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: preference just won't persist
  }
}

export const THEMES = ["light", "dark", "system"];

export function loadTheme() {
  const value = read("theme", "system");
  return THEMES.includes(value) ? value : "system";
}

export function saveTheme(value) {
  write("theme", value);
}

export function resolveTheme(theme) {
  if (theme !== "system") return theme;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function loadDesktopNotify() {
  return read("desktopNotify", "off") === "on";
}

export function saveDesktopNotify(on) {
  write("desktopNotify", on ? "on" : "off");
}

export function notificationPermission() {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}
