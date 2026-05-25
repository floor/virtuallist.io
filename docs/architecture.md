# Architecture

virtuallist.io is a Bun HTTP server that serves server-rendered HTML pages and a REST API. The only client-side JavaScript shipped is the benchmark engine itself — page navigation uses plain links, there is no client-side router, no hydration, and no UI framework on the server.

---

## Repository Structure

```
virtuallist.io/
├── server.ts                     # HTTP server entry point
├── package.json
├── tsconfig.json
├── ecosystem.config.cjs          # PM2 production config
│
├── src/
│   ├── server/
│   │   ├── config.ts             # PORT, IS_PROD, directory paths
│   │   ├── router.ts             # Main request router
│   │   ├── shell.ts              # HTML shell (nav, footer, critical CSS)
│   │   ├── registry.ts           # Library registry — central source of truth
│   │   ├── static.ts             # Static file resolver
│   │   ├── sitemap.ts            # sitemap.xml + robots.txt
│   │   ├── benchmark-runner.ts    # Puppeteer benchmark runner with queue management
│   │   └── pages/
│   │       ├── home.ts           # Homepage
│   │       ├── benchmarks.ts     # Benchmark overview + individual library pages
│   │       ├── methodology.ts    # Methodology documentation
│   │       └── about.ts          # About section (/about, /about/api, /about/contribute)
│   └── api/
│       ├── router.ts             # API route dispatcher
│       ├── benchmarks.ts         # Result storage + aggregation (SQLite)
│       └── run.ts                # Puppeteer benchmark run API (start, SSE progress, abort)
│
├── benchmarks/
│   ├── runner.js                 # Core measurement engine (browser, ESM)
│   ├── script.js                 # Browser entry point — triggers server-side runs via SSE
│   ├── headless.js               # Puppeteer entry point — exposes benchmark API on window
│   ├── progress.js               # Client-side SSE progress UI
│   ├── compare.js                # Compare page entry point — multi-library head-to-head
│   ├── results.js                # Results page entry point — filter controls + column sorting
│   ├── constants.js              # Shared constants (item height, iterations, scroll speeds)
│   ├── build.ts                  # Bun bundler build script
│   └── libraries/
│       ├── _TEMPLATE.js          # Template for new adapters
│       ├── react-window.js
│       ├── react-virtualized.js
│       ├── react-virtuoso.js
│       ├── tanstack-virtual.js
│       ├── tanstack-vue-virtual.js
│       ├── tanstack-solid-virtual.js
│       ├── virtua.js
│       ├── legend-list.js
│       ├── vue-virtual-scroller.js
│       ├── vlist.js
│       ├── vlist-react.js
│       ├── vlist-vue.js
│       ├── vlist-svelte.js
│       ├── vlist-solidjs.js
│       └── clusterize.js
│
├── scripts/
│   ├── seed-db.ts                # Creates data/benchmarks.db
│   ├── benchmark.ts              # CLI benchmark runner (--library, --items, --intensity, --runs)
│   └── lib/
│       ├── runner.ts             # Shared benchmark runner with SSE + retry
│       └── progress.ts           # Terminal progress bar with ETA
│
├── data/
│   └── benchmarks.db             # SQLite — gitignored
│
├── public/                       # Static assets (favicon, OG images, …)
├── dist/                         # Build output — gitignored
│   └── benchmarks/
│       ├── runner.js
│       ├── script.js             # Client-side UI (~small, no framework imports)
│       ├── headless.js           # Puppeteer bundle (~1.5 MB, all adapters + frameworks)
│       ├── compare.js            # Compare page bundle (~1.5 MB)
│       ├── results.js            # ~2 KB minified (filter navigation + column sorting)
│       └── styles.css            # vlist.css + any local overrides, minified
│
├── test/                         # Bun test files
└── docs/                         # This documentation
```

---

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Runtime | Bun ≥ 1.0 | Native TypeScript, built-in SQLite, built-in bundler, fast startup |
| HTTP server | `Bun.serve()` | No framework overhead; sync routes avoid Promise allocation |
| HTML rendering | TypeScript string functions | No hydration, no client framework, zero JS for static pages |
| Database | SQLite via `bun:sqlite` | Zero external deps, file-based, ideal for append-only crowdsourced data |
| Benchmark runner | Puppeteer (headless Chrome) | Controlled environment: uncapped rAF, precise memory, explicit GC |
| Measurement primitives | `@floor/virtuallist` | Shared measurement library — reusable across projects |
| Client bundle | Bun bundler | ESM output, framework deduplication, tree-shaking |
| Process manager | PM2 | Production daemonization, log rotation, memory guard |

---

## Request Flow

Every request enters `server.ts` → `handleRequest()` in `src/server/router.ts`.

The router tries sync routes first in a null-coalescing chain. A `Promise` is only allocated when the request reaches `/api/*`. This means page loads, static files, and system routes never allocate a Promise.

```
handleRequest(req)
  │
  ├── OPTIONS /api/*          →  CORS preflight (204, sync)
  │
  ├── routeSystem()           →  /sitemap.xml
  │                              /robots.txt
  │
  ├── resolveHomepage()       →  /
  │
  ├── resolveBenchmarks()     →  /benchmarks
  │                              /benchmarks/compare
  │                              /benchmarks/results
  │                              /benchmarks/{slug}
  │
  ├── resolveMethodology()    →  /methodology
  │
  ├── resolveAbout()          →  /about
  │                              /about/api
  │                              /about/contribute
  │
  ├── resolveStatic()         →  /dist/*
  │                              /public/*
  │                              /favicon.ico
  │
  └── handleAsync()           →  /api/*          (only path that allocates a Promise)
        └── routeApi()
              ├── routeRun()          POST /api/run, GET /api/run/:id/progress, etc.
              └── routeBenchmarks()
```

Each resolver returns a `Response` or `null`. The first non-null response wins. Unknown paths return 404 at the bottom of `handleAsync`.

---

## Site Map

| URL | Page | JavaScript |
|-----|------|-----------|
| `/` | Homepage | none |
| `/benchmarks` | Benchmark overview | none |
| `/benchmarks/compare` | Multi-library head-to-head comparison | `compare.js` |
| `/benchmarks/results` | Crowdsourced aggregated results | `results.js` |
| `/benchmarks/{slug}` | Individual library benchmark | `script.js` |
| `/methodology` | Methodology documentation | none |
| `/about` | About | none |
| `/about/api` | Public API reference | none |
| `/about/contribute` | Contributor guide | none |
| `/sitemap.xml` | Sitemap | — |
| `/robots.txt` | robots.txt | — |
| `/api/*` | REST API | — |
| `/dist/*` | Built assets | — |

---

## Three JavaScript Contexts

The project has three separate JS environments.

**Server** — TypeScript, runs in Bun, handles HTTP. Lives in `src/`. Has access to the filesystem, SQLite, and Puppeteer. Never imported by the browser.

**Puppeteer (headless benchmark execution)** — Plain JavaScript ESM, runs in headless Chrome launched by the server. Entry point is `benchmarks/headless.js`, built into `dist/benchmarks/headless.js`. Imports all library adapters, which self-register via `defineLibrary()`. Exposes the benchmark API on `window` for `page.evaluate()` to call. The server's `benchmark-runner.ts` orchestrates Puppeteer, injects the bundle, and streams progress back via SSE.

**Browser (client UI)** — Lightweight JavaScript that runs in the visitor's browser. `script.js` no longer runs benchmarks directly — it triggers server-side Puppeteer execution via `POST /api/run` and consumes progress via SSE (`EventSource`). `compare.js` still runs client-side comparisons. `results.js` handles filter navigation and column sorting.

The connection between browser and server is the `/api/run` endpoint: the browser starts a run, receives SSE progress events, and gets the final result. Results are auto-persisted to the database by the server — no client-side POST is needed.

The about section pages (`/about`, `/about/api`, `/about/contribute`) are purely server-rendered and ship zero JavaScript.

---

## Page Architecture

All pages are rendered server-side by TypeScript functions that return complete `<!DOCTYPE html>` strings. The pattern is:

```
renderSomePage()
  → builds content HTML string
  → calls renderShell({ title, description, url, content, extraHead, extraBody })
  → returns new Response(html, { headers })
```

`renderShell()` provides the consistent outer document: `<head>` with meta tags and critical CSS, sticky navigation header, `<main>` with the content, and footer.

Only benchmark pages load JavaScript. The `<script type="module" src="/dist/benchmarks/script.js">` tag is injected via `extraBody` on `/benchmarks/{slug}` pages. The compare page at `/benchmarks/compare` loads `compare.js` instead. The results page at `/benchmarks/results` loads `results.js` (a lightweight ~2 KB script for filter controls and column sorting). Every other page — homepage, overview, methodology, about — ships zero JavaScript.

---

## Benchmark Flow

When a visitor opens a library benchmark page and clicks Run:

```
User clicks Run
  → script.js reads data-library="{slug}" from the page DOM
  → POST /api/run { librarySlug, itemCount }
  → Server enqueues the run (one-at-a-time queue)
  → Server launches headless Chrome via Puppeteer
      → Injects dist/benchmarks/headless.js into the page
      → Calls window.__benchmarkLibrary({ create, destroy, intensity, ... })
          Phase 0: Warmup   — JIT optimisation iterations (not measured)
          Phase 1: Render   — N create/destroy iterations, median render time
          Phase 2: Memory   — up to N heap delta attempts, median of valid readings
          Phase 3: Scroll   — 5 speed levels, FPS + P95 frame time
          Phase 4: Jump     — scroll-to-index teleport timing
      → Progress streamed via SSE to the browser
  → Server auto-persists result to SQLite
  → Browser renders live bar chart as phases complete
```

When a visitor opens `/benchmarks/compare` and clicks Run Comparison:

```
User selects 2–4 libraries, clicks Run Comparison
  → compare.js collects selected slugs, shuffles execution order
      (randomised to eliminate JIT warmth / GC bleed-through bias)
  → for each library in shuffled order:
      → benchmarkLibrary({ create, destroy, ... })   ← same pipeline as above
      → stores raw results keyed by slug
      → GC barrier between each library
  → renderResults() in original slot order
      → pickWinner(entries, better) per metric   ← single source of truth in runner.js
      → metric × library table with ✓ best / ≈ tie / N% worse badges
      → win count totals in each column header
```

See [benchmark-engine.md](./benchmark-engine.md) for the full measurement pipeline.

---

## Data Flow (Benchmark Results)

```
Puppeteer benchmark run completes on server
  → Auto-persist via storeResult() in the onProgress callback
      → SQLite transaction: 1 run row + N metric rows
      → userAgent: "Puppeteer headless (server-side)"

External POST /api/benchmarks (crowdsourced, still supported)
      → validateResult()       validates and sanitizes input
      → isRateLimited(ip)      30 req/min per IP
      → storeResult()          same SQLite transaction
      → 201 { success, runId }

GET /api/benchmarks/stats?librarySlug=react-window&itemCount=10000
  → getStats()                 aggregates values per metric label
  → returns { median, mean, min, max, p5, p95, stddev, sampleCount }

GET /api/benchmarks/history?librarySlug=react-window&metric=Render
  → getHistory()               groups by day + version, daily aggregates
  → returns HistoryPoint[]     for time-series charts
```

The results page (`/benchmarks/results`) also consumes this data, but server-side: `assembleResultsPage()` calls `getStats()` and `getSummary()` directly (no HTTP round-trip) and renders the aggregated data into an HTML leaderboard table. This is the primary way visitors see crowdsourced results without running benchmarks themselves.

---

## Further Reading

| Topic | Document |
|-------|---------|
| Server layers in detail | [server.md](./server.md) |
| Library registry | [registry.md](./registry.md) |
| Page renderers (all pages) | [pages.md](./pages.md) |
| REST API | [api.md](./api.md) |
| Benchmark measurement engine | [benchmark-engine.md](./benchmark-engine.md) |
| Library adapters | [library-adapters.md](./library-adapters.md) |
| Database schema | [database.md](./database.md) |
| Build system | [build.md](./build.md) |
| CSS strategy | [styling.md](./styling.md) |
| Adding a library | [adding-a-library.md](./adding-a-library.md) |
| Development workflow | [development.md](./development.md) |
| Deployment | [deployment.md](./deployment.md) |
| Design decisions | [decisions.md](./decisions.md) |
| Roadmap | [roadmap.md](./roadmap.md) |