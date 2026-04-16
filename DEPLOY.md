# EduCheck — Digital Ocean Deployment Guide

This guide walks you through hosting the **EduCheck API + Frontend** on Digital Ocean from scratch.
By the end you will have:

- A **PostgreSQL managed database** with all schools, questions, and submissions
- A **Node.js API** running as a systemd service on a Droplet
- The **frontend** (`index.html`) served by Nginx
- An optional **domain + HTTPS** via Let's Encrypt

---

## Architecture Overview

```
Browser  ──HTTPS──►  Nginx (port 443)
                        │
                        ├──►  /         → serves frontend/index.html (static)
                        │
                        └──►  /api/*    → proxies to Node.js API (port 3000)
                                               │
                                         PostgreSQL Managed DB
                                         (Digital Ocean DBaaS)
```

---

## STEP 1 — Create a PostgreSQL Managed Database

1. Log into [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. Click **Create → Databases**
3. Choose:
   - **Engine**: PostgreSQL 16
   - **Plan**: Basic (1 vCPU / 1 GB) — $15/month, fine for production
   - **Datacenter**: pick the region closest to your users (e.g. Frankfurt `fra1`)
   - **Database cluster name**: `educheck-db`
4. Click **Create Database Cluster** and wait ~3 minutes.

### Get the connection string

5. Open the new cluster → **Overview** tab
6. Under **Connection details**, switch the dropdown to **Connection string**
7. Copy the string — it looks like:

```
postgresql://doadmin:AVNS_xxxxxxxxxxxxxx@db-postgresql-fra1-xxxxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

Keep this string — you will use it as `DATABASE_URL`.

---

## STEP 2 — Create a Droplet (virtual server)

1. Click **Create → Droplets**
2. Choose:
   - **Image**: Ubuntu 24.04 LTS
   - **Plan**: Basic — Shared CPU — **Regular** — $6/month (1 vCPU / 1 GB RAM)
   - **Datacenter**: same region as the database (e.g. `fra1`)
   - **Authentication**: SSH Key (recommended) or Password
   - **Hostname**: `educheck-server`
3. Click **Create Droplet**. Note the public IP address (e.g. `164.90.xxx.xxx`).

### Add the Droplet to your DB's trusted sources

4. In your database cluster → **Settings** → **Trusted Sources**
5. Add your Droplet (select it by name from the dropdown)
6. Save — this allows the Droplet to connect to the database.

---

## STEP 3 — Configure the server

SSH into your new Droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

### Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node --version   # should print v20.x.x
```

### Install Git, Nginx, and certbot

```bash
apt-get install -y git nginx certbot python3-certbot-nginx
```

### Install PostgreSQL client (for running schema.sql)

```bash
apt-get install -y postgresql-client
```

---

## STEP 4 — Upload your project files

You have two options:

### Option A — Via Git (recommended)

Push your project to a GitHub/GitLab repo first, then:

```bash
cd /opt
git clone https://github.com/YOUR_USERNAME/educheck.git
cd educheck
```

### Option B — Via SCP from your local machine

From your local terminal (not the server):

```bash
scp -r ./educheck root@YOUR_DROPLET_IP:/opt/
```

Either way you should end up with:

```
/opt/educheck/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   └── db/
│       └── schema.sql
└── frontend/
    └── index.html
```

---

## STEP 5 — Install dependencies and configure environment

```bash
cd /opt/educheck/backend
npm install --omit=dev
```

Create the `.env` file from the example:

```bash
cp .env.example .env
nano .env
```

Fill it in:

```env
DATABASE_URL=postgresql://doadmin:AVNS_xxxx@db-postgresql-fra1-xxxxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require
PORT=3000
NODE_ENV=production
ALLOWED_ORIGIN=https://yourdomain.com
```

Save with `Ctrl+O`, exit with `Ctrl+X`.

---

## STEP 6 — Initialise the database

Run the schema + seed data SQL file against your managed database:

```bash
psql "$DATABASE_URL" -f /opt/educheck/backend/db/schema.sql
```

You should see output like:

```
DROP TABLE
CREATE TABLE
...
INSERT 0 5       ← schools
INSERT 0 15      ← service questions
...
```

Verify the data loaded:

```bash
psql "$DATABASE_URL" -c "SELECT name, province FROM schools ORDER BY id;"
```

---

## STEP 7 — Run the API as a systemd service

This keeps the API running automatically on reboot and restarts it if it crashes.

```bash
nano /etc/systemd/system/educheck-api.service
```

Paste this content:

```ini
[Unit]
Description=EduCheck API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/educheck/backend
EnvironmentFile=/opt/educheck/backend/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
# Give www-data ownership of the project
chown -R www-data:www-data /opt/educheck

systemctl daemon-reload
systemctl enable educheck-api
systemctl start  educheck-api
systemctl status educheck-api   # should say "active (running)"
```

Test the API directly:

```bash
curl http://localhost:3000/health
# → {"status":"ok"}

curl http://localhost:3000/api/schools | python3 -m json.tool | head -20
```

---

## STEP 8 — Configure Nginx

Nginx will serve the static frontend and proxy `/api/` requests to Node.js.

```bash
nano /etc/nginx/sites-available/educheck
```

Paste (replace `yourdomain.com` with your actual domain, or use the IP if you have no domain yet):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # ── Frontend (static files) ──────────────────────────
    root /opt/educheck/frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # ── API proxy ─────────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # ── Health endpoint ────────────────────────────────────
    location /health {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

Enable the site and reload Nginx:

```bash
ln -s /etc/nginx/sites-available/educheck /etc/nginx/sites-enabled/
nginx -t          # test configuration — must say "syntax is ok"
systemctl reload nginx
```

### Update the frontend API URL

Edit `index.html` to point to the same origin (since Nginx proxies `/api/`):

```bash
sed -i "s|window.EDUCHECK_API_URL || 'http://localhost:3000'|window.location.origin|g" \
  /opt/educheck/frontend/index.html
```

Now visit `http://YOUR_DROPLET_IP` in your browser — EduCheck should load with real data.

---

## STEP 9 — Add a domain name (optional but recommended)

1. In Digital Ocean → **Networking → Domains** → Add your domain
2. Create an **A record**:
   - Hostname: `@` (or `www`)
   - Value: your Droplet IP
3. Wait 5–15 minutes for DNS to propagate

Then run certbot to get a free HTTPS certificate:

```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts. Certbot will automatically edit your Nginx config for HTTPS
and set up auto-renewal.

Test renewal works:

```bash
certbot renew --dry-run
```

---

## STEP 10 — Verify everything works end-to-end

```bash
# 1. API health
curl https://yourdomain.com/health

# 2. Schools from DB
curl https://yourdomain.com/api/schools

# 3. Questions from DB
curl https://yourdomain.com/api/questions/service

# 4. All submissions
curl https://yourdomain.com/api/submissions
```

Open the browser at `https://yourdomain.com` — you should see EduCheck
loading all schools from the database, and new monitoring reports
will be saved to PostgreSQL.

---

## Updating the app later

```bash
# Pull new code
cd /opt/educheck
git pull

# Restart the API
systemctl restart educheck-api

# Re-run schema migrations if the DB changed
psql "$DATABASE_URL" -f backend/db/schema.sql
```

---

## Useful commands at a glance

| Task | Command |
|------|---------|
| View API logs | `journalctl -u educheck-api -f` |
| Restart API | `systemctl restart educheck-api` |
| Reload Nginx | `systemctl reload nginx` |
| Connect to DB | `psql "$DATABASE_URL"` |
| Check open ports | `ss -tlnp` |
| View Nginx errors | `tail -f /var/log/nginx/error.log` |

---

## Cost summary (Digital Ocean)

| Resource | Plan | Monthly Cost |
|----------|------|-------------|
| Droplet (Ubuntu, 1 vCPU / 1 GB) | Basic | ~$6 |
| PostgreSQL Managed Database | Basic 1-node | ~$15 |
| **Total** | | **~$21/month** |

> You can reduce cost by self-hosting PostgreSQL on the same Droplet,
> but a managed DB gives you automatic backups, failover, and zero maintenance.
