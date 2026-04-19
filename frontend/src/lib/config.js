// In production behind Nginx (same origin), keep this empty to use relative URLs.
// In development, set VITE_API_URL=http://localhost:5000
export const API_URL = import.meta.env.VITE_API_URL ?? "";
