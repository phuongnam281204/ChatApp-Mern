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

## Option B: AWS EC2 that already runs its own Nginx (Amazon Linux 2023)

Use this when ports 80/443 on the server are already taken by a host Nginx
(check with `sudo ss -tlnp | grep -E ':80 |:443 '`). Memo Chat then listens
only on `127.0.0.1:8080` and the host Nginx forwards one domain to it.

```
browser ──https──► host Nginx :443 ──► 127.0.0.1:8080 (nginx container) ──► backend :5000
```

### 1) AWS console

- Elastic IP: allocate one and associate it with the instance, otherwise the
  public IP changes on every stop/start.
- DNS: an `A` record `chat.<your-domain>` → the Elastic IP.
- Security group: inbound 80 and 443 open (they already are if the host Nginx serves a site).
- MongoDB Atlas → Network Access: add the Elastic IP.
- Google Cloud → OAuth client → Authorized JavaScript origins: add `https://chat.<your-domain>`.

### 2) Docker and the Compose plugin

```
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

Log out and back in, then check `docker compose version`. If `docker compose build`
asks for buildx, install it the same way from https://github.com/docker/buildx/releases
(file `buildx-<version>.linux-arm64` on Graviton, `linux-amd64` on Intel) as
`/usr/local/lib/docker/cli-plugins/docker-buildx`.

On a 2 GB instance add swap so the frontend build does not run out of memory:

```
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3) App

```
git clone https://github.com/phuongnam281204/ChatApp-Mern.git && cd ChatApp-Mern
```

Create `.env` next to `docker-compose.yml` with the variables from Option A, plus:

```
CLIENT_ORIGIN=https://chat.<your-domain>
GOOGLE_CLIENT_ID=<web client id>   # also baked into the frontend build
APP_PORT=127.0.0.1:8080            # do not fight the host Nginx for port 80
TRUST_PROXY=2                      # host Nginx + container nginx
```

```
docker compose up -d --build
curl http://127.0.0.1:8080/api/health   # {"ok":true}
```

### 4) Host Nginx site

`/etc/nginx/conf.d/memo-chat.conf`:

```
server {
  listen 80;
  server_name chat.<your-domain>;

  client_max_body_size 25m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

`X-Forwarded-For $remote_addr` (not `$proxy_add_x_forwarded_for`) stops clients
from faking their IP to dodge the rate limiter.

```
sudo nginx -t && sudo systemctl reload nginx
```

### 5) HTTPS with Let's Encrypt

```
sudo dnf install -y python3 augeas-libs
sudo python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install --upgrade pip certbot certbot-nginx
sudo ln -sf /opt/certbot/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d chat.<your-domain>
```

Certbot adds the `listen 443 ssl` block and the redirect. Renewal (Amazon Linux 2023 ships without cron):

```
sudo dnf install -y cronie && sudo systemctl enable --now crond
echo "0 3 * * * root /opt/certbot/bin/certbot renew -q --deploy-hook 'systemctl reload nginx'" | sudo tee /etc/cron.d/certbot
```

### 6) Updating

```
cd ~/ChatApp-Mern && git pull && docker compose up -d --build
```

## Continuous deployment (GitHub Actions)

`.github/workflows/deploy.yml` runs on every pull request and every push to `main`:

1. `backend`: `npm ci && npm test`
2. `frontend`: `npm ci && npm run lint && npm run build`
3. `deploy` (push to `main` or a manual "Run workflow" only, after 1 and 2 pass):
   SSH into the server, `git reset --hard <tested commit>`, `docker compose up -d --build`,
   then poll `http://127.0.0.1:8080/api/health` for up to 60 s. The job fails and prints
   the backend logs if the app does not come back.

Anything edited by hand inside `~/ChatApp-Mern` on the server, except the untracked
`.env`, is overwritten on each deploy.

### One-time setup

A dedicated deploy key, created on the server (the private half goes to GitHub, then is deleted):

```
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "github-actions"
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy        # copy into the EC2_SSH_KEY secret
rm ~/.ssh/github_deploy ~/.ssh/github_deploy.pub
```

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `EC2_HOST` | the Elastic IP |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | the private key, including the BEGIN/END lines |

Security group: GitHub-hosted runners use changing IPs, so SSH (22) must accept
`0.0.0.0/0`. Keep password login disabled (the Amazon Linux default) so only keys work.
