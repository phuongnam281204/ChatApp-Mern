## Option A: VPS + Docker Compose + Nginx + MongoDB Atlas

### 1) Prereqs

- Docker + Docker Compose on your VPS
- A MongoDB Atlas connection string

### 2) Environment variables

Create a `.env` next to `docker-compose.yml`:

```
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority
JWT_SECRET=change_me_super_secret
# Same origin you will open in browser
CLIENT_ORIGIN=http://<your-vps-ip>
```

If you later enable HTTPS, set `CLIENT_ORIGIN=https://<your-domain>`.

Optional features (leave empty to turn them off):

```
# Images, files and avatars. Without it, uploads answer 503.
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
# Password-reset email. Without it, "Quên mật khẩu" answers 503 in production.
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<user>
SMTP_PASS=<password>
MAIL_FROM="Memo Chat <no-reply@your-domain>"
```

The reset email links to `CLIENT_ORIGIN/?reset=<token>`, so `CLIENT_ORIGIN` must be the public address.

### 3) Run

```
docker compose up -d --build
```

Open: `http://<your-vps-ip>`

### 4) HTTPS (recommended)

Use Nginx + Let's Encrypt on the VPS. Keep the app routing the same:

- `/` serves the frontend
- `/api` proxies to backend
- `/socket.io` proxies to backend

When HTTPS is enabled:

- set `CLIENT_ORIGIN` to `https://<your-domain>`
- cookies become `Secure` automatically because `CLIENT_ORIGIN` starts with `https://`
  (on plain `http://` they are not, so login still works before HTTPS is set up)
- voice messages need HTTPS: browsers only allow the microphone on `https://` (or `localhost`)

Health check: `GET /api/health` answers `{ "ok": true }`.
