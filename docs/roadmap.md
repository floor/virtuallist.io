# Roadmap

Known gaps, unfinished work, and planned improvements. This document reflects the state of the project after the initial scaffold.

---

## Missing Features

### ~~History / Trends Page~~ → Partially resolved by Results page

**What:** A page that surfaces crowdsourced aggregate data so visitors can see benchmark results without running benchmarks themselves.

**Status:** ✅ **Partially resolved.** The **Results page** (`/benchmarks/results`) now exists. It shows a server-rendered leaderboard table with median values for all 4 core metrics, confidence badges, p5–p95 ranges, best-in-column highlighting, and filters for item count + stress level. Column headers are sortable client-side.

**What was built:**
- `assembleResultsPage()` in `src/server/pages/benchmarks.ts` — queries `getStats()` and `getSummary()` directly (no HTTP round-trip)
- `benchmarks-results.eta` template — leaderboard table with confidence badges
- `benchmarks/results.js` — lightweight (~2 KB) client-side script for filter navigation and column sorting
- Route at `/benchmarks/results` in `src/server/router.ts`
- Sidebar link ("📊 Results") visible on all benchmark pages
- Sitemap entry

**Still missing — time-series trends:**
- A chart visualising performance over time (daily median + p5/p95 band)
- The `/api/benchmarks/history` endpoint is fully implemented but no UI consumes it yet
- A library version selector and metric selector for the chart
- This could be added as an expansion of the results page or as a separate `/benchmarks/trends` page

---

### Crowdsourced Data Display on Library Pages

**What:** Show aggregated results from all previous visitors on the individual library benchmark page, below the controls.

**Status:** Partially addressed. The Results page (`/benchmarks/results`) now shows aggregated data for all libraries. However, individual library pages (`/benchmarks/{slug}`) still do not show crowdsourced data inline.

**What it needs:**
- A fetch from `/api/benchmarks/stats?librarySlug={slug}&itemCount=10000` on page load
- A "Community results" card rendered below the controls using the same `.bench-metric` component classes
- Graceful empty state when no data exists yet
- Alternatively, a server-side approach like the results page (call `getStats()` directly during page assembly)

---

### Favicon and Open Graph Image

**What:** A favicon at `public/favicon.ico` and an OG image at `public/og-image.png`.

**Status:** The `public/` directory is empty. The `<link rel="canonical">` and OG tags are in the shell template, but `og:image` is not set.

**What it needs:**
- A favicon (SVG preferred, with `.ico` fallback)
- An OG image (1200×630px) for social sharing previews
- `og:image` meta tag added to `renderShell()` in `src/server/shell.ts`

---

### Library Version Detection

**What:** Automatically detect and store the version of each benchmarked library.

**Status:** The `library_version` column exists in `benchmark_runs` and the API accepts it. No adapter currently detects or reports a version.

**What it needs:**
- Each adapter imports the library's `package.json` or reads its version from the module
- The version is passed to `persistResult()` via `extraData` or by adding a `version` field to `LibraryAdapter`
- `runner.js` exposes the version in the `BenchmarkResult`

---

### Compression

**What:** Gzip or Brotli compression for served responses.

**Status:** The server serves uncompressed responses. Nginx (when deployed) handles compression. In development, responses are uncompressed.

**Options:**
- Delegate entirely to Nginx (`gzip on` in the Nginx config — already documented in [deployment.md](./deployment.md))
- Add Bun's `CompressionStream` for development accuracy
- Pre-compress `dist/` assets at build time and serve `.gz` files directly

The Nginx approach is sufficient for production. Development compression is a quality-of-life improvement only.

---

### Test Suite

**What:** Unit and integration tests for the server and API layers.

**Status:** The `test/` directory is scaffolded but empty. The API module exports `setDbPath()` and `resetDb()` specifically to support test isolation.

**Priority areas:**
- `src/api/benchmarks.ts` — `validateResult()`, `storeResult()`, `getStats()`, `getHistory()`, rate limiter
- `src/server/registry.ts` — lookup functions, ecosystem grouping
- `src/server/router.ts` — route matching, 404 handling, CORS preflight

---

## Adapters That Need Validation or Improvement

### ~~`tanstack-solid-virtual.js` — Simplified render~~ ✅ Done

Resolved: the adapter now uses Solid's imperative reactive APIs (`createSignal`, `createEffect`) with direct DOM manipulation. The virtualizer's `getVirtualItems()` reactive store and `getTotalSize()` signal drive a `createEffect` that reconciles DOM nodes on every scroll update — exercising the real Solid reactive pipeline without needing JSX or a Babel transform.

---

### `legend-list.js` — API needs verification

The adapter assumes `LegendList` accepts `data`, `renderItem`, `keyExtractor`, `estimatedItemSize`, `recycleItems`, and `drawDistance` props. The `@legendapp/list` package is in beta and its API may differ.

**What it needs:** Running against the live package and verifying the prop names match.

---

## Performance Improvements

### Bundle splitting per ecosystem

**Problem:** Every visitor downloads React, ReactDOM, Vue, and SolidJS even if they only benchmark a single library. The full bundle is ~1.5 MB.

**Option:** Split `script.js` into per-ecosystem chunks. A React-only page would download React + the React adapters but not Vue or SolidJS.

**Complexity:** High. Would require the benchmark page to know which adapters to load before the user interacts, or load adapters on demand after the page opens. Either way, dynamic `import()` calls at runtime would need to be measured carefully to ensure they do not contaminate render timing.

**Current stance:** Not worth the complexity at this stage. Reconsider if the bundle grows significantly or if page load time becomes a user complaint.

---

### Memory phase duration

**Problem:** The memory phase runs up to `MEMORY_ATTEMPTS` attempts, each preceded by `settleHeap()` (3 cycles × ~650 ms = ~2 seconds).

**Current setting:** `MEMORY_ATTEMPTS = 5` (reduced from 10). Most valid readings come in the first 3–5 attempts, and 5 gives a reliable median while cutting Phase 2 time roughly in half. A future improvement could reduce settle time per attempt for further gains.

---

## Potential New Libraries

The following libraries are worth adding as benchmark coverage grows:

| Library | Ecosystem | npm |
|---------|-----------|-----|
| `@tanstack/vue-virtual` | Vue | `@tanstack/vue-virtual` |
| `vue-virtual-scroll-grid` | Vue | `vue-virtual-scroll-grid` |
| `solid-virtual` | SolidJS | `solid-virtual` |
| `svelte-virtual` | Svelte | `svelte-virtual` |
| `@lit-labs/virtualizer` | Vanilla (Lit) | `@lit-labs/virtualizer` |
| `react-virtualized` | React | `react-virtualized` |

Each requires a registry entry and a benchmark adapter. See [adding-a-library.md](./adding-a-library.md).

---

## Infrastructure

### ETag support for static assets

Currently static assets use only `Cache-Control`. ETags would allow browsers to revalidate stale assets with a conditional `If-None-Match` request, receiving a 304 if the file has not changed. This is most useful in development where `no-cache` causes assets to be re-fetched on every request.

### `www.` redirect

The Nginx config in [deployment.md](./deployment.md) includes `www.virtuallist.io` in `server_name` but does not explicitly redirect `www.` to the apex domain. A `301` redirect should be added.

### Content Security Policy

No CSP header is currently set. Adding one would require allowing `unsafe-inline` for the inline `<style>` blocks (or switching to nonces) and `blob:` for the Web Workers that some framework runtimes use.