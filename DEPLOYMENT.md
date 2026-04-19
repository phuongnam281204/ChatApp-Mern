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
- cookies will be `secure` automatically because `NODE_ENV=production`
