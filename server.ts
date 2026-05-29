// server.ts
// virtuallist.io — Entry point. Starts the Bun HTTP server.
//
// Serves:
//   /                             → Landing page
//   /benchmarks/*                 → Benchmark pages (server-rendered)
//   /methodology                  → Methodology documentation
//   /api/*                        → API routes (benchmark results)
//   /dist/*                       → Built assets (JS, CSS)
//   /sitemap.xml                  → Dynamic sitemap
//   /robots.txt                   → robots.txt

import { PORT } from "./src/server/config";
import { handleRequest } from "./src/server/router";
import { closeBrowser } from "./src/server/benchmark-runner";

// =============================================================================
// Start
// =============================================================================

console.log(`
  🏁  virtuallist.io

  Local:        http://localhost:${PORT}
  Benchmarks:   http://localhost:${PORT}/benchmarks
  Methodology:  http://localhost:${PORT}/methodology
  API:          http://localhost:${PORT}/api

  Press Ctrl+C to stop
`);

Bun.serve({
  port: PORT,
  fetch: handleRequest,
  reusePort: true,
  idleTimeout: 255,
});

// Signal PM2 cluster that this instance is ready to accept connections
if (process.send) process.send("ready");

// Clean up Puppeteer browser on shutdown
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await closeBrowser();
    process.exit(0);
  });
}
