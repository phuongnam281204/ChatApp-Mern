import { API_URL } from "./config";

async function parse(res) {
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      typeof data === "object" && data?.message ? data.message : "Yêu cầu thất bại. Thử lại.";
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  return parse(res);
}

/** Multipart upload. The browser sets the multipart Content-Type itself. */
export async function apiUpload(path, fields) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) body.append(key, value);
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    body,
  });
  return parse(res);
}
