// ecosystem.config.cjs
// PM2 process manager configuration for virtuallist.io.
//
// Usage:
//   pm2 start ecosystem.config.cjs          # start production
//   pm2 start ecosystem.config.cjs --env staging
//   pm2 reload ecosystem.config.cjs         # zero-downtime reload
//   pm2 stop ecosystem.config.cjs
//   pm2 logs virtuallist-io

module.exports = {
  apps: [
    {
      name: "virtuallist-io",
      script: "server.ts",
      interpreter: "bun",
      interpreter_args: "run",

      // ── Clustering ───────────────────────────────────────────────────
      // Use "fork" mode — Bun's Bun.serve() handles its own parallelism
      // via reusePort. Cluster mode with PM2 + Bun is not well supported.
      instances: 1,
      exec_mode: "fork",

      // ── Environment ──────────────────────────────────────────────────
      env: {
        NODE_ENV: "development",
        PORT: 3456,
      },
      env_staging: {
        NODE_ENV: "production",
        PORT: 3456,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3456,
      },

      // ── Reliability ──────────────────────────────────────────────────
      autorestart: true,
      watch: false,          // never watch in production
      max_restarts: 10,
      restart_delay: 2000,   // 2s between restart attempts
      min_uptime: "5s",      // must stay up 5s to be considered "stable"

      // ── Logging ──────────────────────────────────────────────────────
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      merge_logs: true,

      // ── Memory guard ─────────────────────────────────────────────────
      max_memory_restart: "512M",

      // ── Graceful shutdown ─────────────────────────────────────────────
      // Give the server time to finish in-flight requests
      kill_timeout: 5000,
      listen_timeout: 8000,

      // ── Ready signal ─────────────────────────────────────────────────
      // server.ts calls process.send("ready") after Bun.serve() starts
      wait_ready: true,
    },
  ],
};
