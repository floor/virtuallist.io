# Deployment

---

## Overview

The server is a single Bun process managed by PM2. There is no container, no build pipeline beyond `bun run build`, and no external runtime dependency beyond Bun itself. A reverse proxy (Nginx) sits in front and handles TLS termination.

```
Internet → Nginx (TLS, :443) → Bun server (:3456)
```

---

## Prerequisites

- Bun ≥ 1.0 installed on the server
- PM2 installed globally: `npm install -g pm2`
- Nginx configured as a reverse proxy
- The repository cloned at the deployment path

---

## First-Time Setup

```bash
# 1. Install dependencies
bun install --frozen-lockfile

# 2. Create the database
bun run seed:db

# 3. Build the benchmark bundle (production mode)
NODE_ENV=production bun run build

# 4. Start with PM2
pm2 start ecosystem.config.cjs --env production

# 5. Save the PM2 process list so it survives reboots
pm2 save

# 6. Set PM2 to start on system boot
pm2 startup
# → follow the printed instructions
```

---

## PM2 Configuration (`ecosystem.config.cjs`)

```js
{
  name: "virtuallist-io",
  script: "server.ts",
  interpreter: "bun",
  interpreter_args: "run",
  exec_mode: "fork",
  instances: 1,
  wait_ready: true,       // waits for process.send("ready")
  max_memory_restart: "512M",
  kill_timeout: 5000,
  listen_timeout: 8000,
  autorestart: true,
  max_restarts: 10,
  restart_delay: 2000,
  min_uptime: "5s",
  log_date_format: "YYYY-MM-DD HH:mm:ss Z",
  error_file: "logs/error.log",
  out_file: "logs/out.log",
  merge_logs: true,
  env_production: {
    NODE_ENV: "production",
    PORT: 3456,
  },
}
```

### Key options explained

| Option | Value | Reason |
|--------|-------|--------|
| `exec_mode: "fork"` | (not "cluster") | `Bun.serve()` handles concurrency internally via `reusePort`; PM2 cluster mode with Bun is not well-supported |
| `wait_ready: true` | — | `server.ts` calls `process.send("ready")` after `Bun.serve()` binds successfully; PM2 waits for this signal before routing traffic |
| `max_memory_restart` | 512 MB | Restarts the process if it grows beyond this limit |
| `kill_timeout` | 5000 ms | Gives in-flight requests time to complete before the process is killed |
| `listen_timeout` | 8000 ms | How long PM2 waits for the `"ready"` signal before declaring startup failed |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | ✓ | — | Set to `"production"` to enable page caching and immutable `Cache-Control` headers on `/dist/*` assets |
| `PORT` | — | `3456` | HTTP listen port |

No `.env` file is used. Variables are set through PM2's `env_production` block in `ecosystem.config.cjs`, or via `export` before running the process.

---

## Nginx Configuration

Nginx handles TLS termination, HTTP→HTTPS redirect, and proxies all traffic to the Bun process. The `X-Forwarded-For` header must be forwarded so the API rate limiter can identify client IPs.

```nginx
server {
    listen 80;
    server_name virtuallist.io www.virtuallist.io;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name virtuallist.io www.virtuallist.io;

    ssl_certificate     /etc/letsencrypt/live/virtuallist.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/virtuallist.io/privkey.pem;

    # Recommended SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Gzip
    gzip on;
    gzip_types text/html text/css application/javascript application/json;
    gzip_min_length 1024;

    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 10s;
        proxy_send_timeout    30s;
        proxy_read_timeout    60s;
    }
}
```

### `X-Forwarded-For`

Set to `$remote_addr` (not `$proxy_add_x_forwarded_for`) to prevent IP spoofing — the API rate limiter reads the first value of this header. If there is another proxy in front of Nginx, adjust accordingly.

---

## Deploying Updates

```bash
# 1. Pull the latest code
git pull origin main

# 2. Install any new dependencies
bun install --frozen-lockfile

# 3. Rebuild the benchmark bundle
NODE_ENV=production bun run build

# 4. Reload the server (zero-downtime)
pm2 reload virtuallist-io
```

`pm2 reload` sends `SIGINT` to the old process after the new one signals `"ready"`, achieving a zero-downtime restart. The old process keeps accepting connections until the new one is ready.

---

## Database

The database file `data/benchmarks.db` is not in the repository. On first deploy, run the seed script. On subsequent deploys, do not run it — it is a no-op by default, but running `seed:db:force` would wipe all stored results.

```bash
# First deploy only
bun run seed:db

# Never run this in production unless intentionally resetting all data
# bun run seed:db:force
```

### Backups

The database is a single SQLite file. Back it up by copying the file while the server is running — WAL mode makes this safe:

```bash
# Copy the database (safe with WAL mode — no need to stop the server)
cp data/benchmarks.db /path/to/backup/benchmarks-$(date +%Y%m%d).db

# Or use SQLite's online backup command
sqlite3 data/benchmarks.db ".backup /path/to/backup/benchmarks-$(date +%Y%m%d).db"
```

---

## Logs

PM2 writes logs to `logs/` in the project directory:

| File | Contents |
|------|---------|
| `logs/out.log` | Standard output (server startup messages) |
| `logs/error.log` | Standard error (unhandled exceptions, startup failures) |

```bash
# Live log tail
pm2 logs virtuallist-io

# Last 100 lines
pm2 logs virtuallist-io --lines 100

# Clear logs
pm2 flush virtuallist-io
```

---

## Process Management

```bash
# Status
pm2 status

# Detailed info
pm2 show virtuallist-io

# Restart (with downtime)
pm2 restart virtuallist-io

# Reload (zero-downtime)
pm2 reload virtuallist-io

# Stop
pm2 stop virtuallist-io

# Remove from PM2
pm2 delete virtuallist-io
```

---

## Health Check

The `/api/health` endpoint can be used by monitoring tools or load balancers:

```bash
curl https://virtuallist.io/api/health
# {"status":"ok","timestamp":"2025-01-15T12:00:00.000Z"}
```

A 200 response with `"status": "ok"` indicates the server is running and accepting requests. It does not check the database — a separate database check can query `/api/benchmarks/summary`.

---

## Monitoring

Recommended checks:

| Check | Endpoint | Expected |
|-------|---------|---------|
| Server alive | `GET /api/health` | 200, `status: "ok"` |
| Homepage loads | `GET /` | 200 |
| API works | `GET /api/benchmarks/summary` | 200, JSON |
| Database accessible | `GET /api/benchmarks/summary` | `total_runs` key present |

---

## Troubleshooting

### Server won't start

```bash
# Check PM2 error log
pm2 logs virtuallist-io --err --lines 50

# Most common cause: missing database
bun run seed:db

# Try starting manually to see the error directly
NODE_ENV=production bun run start
```

### 500 errors on API routes

The most common cause is a missing or corrupted database:

```bash
# Check the database exists
ls -lh data/benchmarks.db

# Verify it's readable
sqlite3 data/benchmarks.db "SELECT COUNT(*) FROM benchmark_runs;"

# Recreate if corrupted (loses all data)
bun run seed:db:force
pm2 reload virtuallist-io
```

### Benchmark bundle returns 404

The `dist/` directory may be missing or empty:

```bash
ls dist/benchmarks/
# Should contain: runner.js  script.js  styles.css

# Rebuild if missing
NODE_ENV=production bun run build
pm2 reload virtuallist-io
```

### Rate limiter triggering unexpectedly

The rate limiter identifies IPs from `X-Forwarded-For`. If Nginx is not forwarding this header, all requests appear to come from `"unknown"` and share the same rate limit bucket. Verify the Nginx `proxy_set_header X-Forwarded-For $remote_addr` directive is present and active.