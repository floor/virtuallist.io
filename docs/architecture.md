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
│   │   └── pages/
│   │       ├── home.ts           # Homepage
│   │       ├── benchmarks.ts     # Benchmark overview + individual library pages
│   │       ├── methodology.ts    # Methodology documentation
│   │       └── about.ts          # About section (/about, /about/api, /about/contribute)
│   └── api/
│       ├── router.ts             # API route dispatcher
│       └── benchmarks.ts         # Result storage + aggregation (SQLite)
│
├── benchmarks/
│   ├── runner.js                 # Core measurement engine (browser, ESM)
│   ├── script.js                 # Browser entry point — wires UI and runner
│   ├── compare.js                # Compare page entry point — multi-library head-to-head
│   ├── results.js                # Results page entry point — filter controls + column sorting
│   ├── build.ts                  # Bun bundler build script
│   └── libraries/
│       ├── _TEMPLATE.js          # Template for new adapters
│       ├── react-window.js
│       ├── tanstack-virtual.js
│       ├── react-virtuoso.js
│       ├── virtua.js
│       ├── legend-list.js
│       ├── vue-virtual-scroller.js
│       ├── tanstack-solid-virtual.js
│       ├── clusterize.js
│       └── vlist.js
│
├── scripts/
│   └── seed-db.ts                # Creates data/benchmarks.db
│
├── data/
│   └── benchmarks.db             # SQLite — gitignored
│
├── public/                       # Static assets (favicon, OG images, …)
├── dist/                         # Build output — gitignored
│   └── benchmarks/
│       ├── runner.js
│       ├── script.js             # ~1.5 MB minified (all adapters + frameworks)
│       ├── compare.js            # ~1.5 MB minified (same adapters, compare UI)
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

## Two Distinct JavaScript Contexts

The project has two completely separate JS environments that never share code at runtime.

**Server** — TypeScript, runs in Bun, handles HTTP. Lives in `src/`. Has access to the filesystem and SQLite. Never imported by the browser.

**Browser (benchmark engine)** — Plain JavaScript ESM, runs in the visitor's browser. Lives in `benchmarks/`. Built by the Bun bundler into `dist/benchmarks/script.js` (individual library pages) and `dist/benchmarks/compare.js` (compare page). Has access to the DOM and browser APIs. Never imported by Bun.

The only connection between them is the `/api/benchmarks` HTTP endpoint: the browser engine POSTs results there, and the server stores them.

There is one exception to the strict server/browser separation: `results.js` is a lightweight client-side script (~2 KB) that handles filter navigation and column sorting on the `/benchmarks/results` page. It does not import any benchmark adapters or frameworks — it only manipulates the server-rendered DOM.

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
  → looks up the registered adapter by slug
  → calls runBenchmarks({ librarySlug, itemCounts, stressMs, ... })
      → benchmarkLibrary({ create, destroy, ... })
          Phase 1: Timing   — 5 create/destroy iterations, median render time
          Phase 2: Memory   — up to 10 heap delta attempts, median of valid readings
          Phase 3: Scroll   — 7 speed levels × 2s each, FPS + P95 frame time
  → calls onResult(result) → renders metric cards in the DOM
  → calls persistResult()  → POST /api/benchmarks (fire-and-forget)
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

## Data Flow (Crowdsourced Results)

```
Browser benchmark run
  → POST /api/benchmarks
      → validateResult()       validates and sanitizes input
      → isRateLimited(ip)      30 req/min per IP
      → storeResult()          SQLite transaction: 1 run row + N metric rows
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