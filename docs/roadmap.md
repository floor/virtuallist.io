# Roadmap

Known gaps, unfinished work, and planned improvements. This document reflects the state of the project after the initial scaffold.

---

## Missing Features

### History / Trends Page

**What:** A page at `/benchmarks/{slug}/history` (or `/history`) that visualises the crowdsourced aggregate data over time.

**Status:** The API endpoints are fully implemented (`/api/benchmarks/history`, `/api/benchmarks/stats`). The data is being stored. The page renderer and client-side chart do not exist yet.

**What it needs:**
- A new page renderer in `src/server/pages/`
- A route in `src/server/router.ts`
- A client-side SVG or canvas chart drawing daily median + p5/p95 band
- A library version selector and metric selector
- Confidence badges (🟢 ≥20 runs, 🟡 5–19, ⚪ <5)

---

### Crowdsourced Data Display on Library Pages

**What:** Show aggregated results from all previous visitors on the individual library benchmark page, below the controls.

**Status:** Data is stored. No UI surfaces it.

**What it needs:**
- A fetch from `/api/benchmarks/stats?librarySlug={slug}&itemCount=10000` on page load
- A "Community results" card rendered below the controls using the same `.bench-metric` component classes
- Graceful empty state when no data exists yet

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

### `tanstack-solid-virtual.js` — Simplified render

The current implementation uses manual DOM construction rather than SolidJS's fine-grained reactivity system. The initial render is correct and measures render time and memory accurately, but the scroll phase does not exercise SolidJS's reactive update path — the list does not re-render items as the scroll position changes.

**What it needs:**
- A proper SolidJS component using `createVirtualizer` from `@tanstack/solid-virtual`
- Compiled with Babel + `babel-preset-solid` (already in `devDependencies`)
- The Bun build script updated to apply the Solid Babel transform to this adapter's output

---

### `vlist-solidjs.js` — Needs API validation

The adapter calls the VList component directly as a function. The actual `vlist-solidjs` package may export a Svelte-style component or require a different calling convention.

**What it needs:** Running the benchmark against the live package and verifying the output. The adapter may need to be rewritten once the actual API is confirmed.

---

### `vlist-svelte.js` — Depends on package export format

The adapter handles both Svelte 4 (`$destroy()`) and Svelte 5 (`unmount()`) APIs. Whether it works depends entirely on which format `vlist-svelte` uses.

**What it needs:** Running against the live package and verifying. If the package uses Svelte's component compilation differently, the adapter's instantiation logic may need to change.

---

### `legend-list.js` — API needs verification

The adapter assumes `LegendList` accepts `data`, `renderItem`, `keyExtractor`, `estimatedItemSize`, `recycleItems`, and `drawDistance` props. The `@legendapp/list` package is in beta and its API may differ.

**What it needs:** Running against the live package and verifying the prop names match.

---

### `vlist-react.js` — Container sizing assumption

The adapter passes a `style` prop with `height` and `width` to `VList`. The actual vlist-react API may size the component differently (e.g. expecting the container to handle sizing rather than the component itself).

**What it needs:** Running against the live package and verifying.

---

## Performance Improvements

### Bundle splitting per ecosystem

**Problem:** Every visitor downloads React, ReactDOM, Vue, and SolidJS even if they only benchmark a single library. The full bundle is ~1.5 MB.

**Option:** Split `script.js` into per-ecosystem chunks. A React-only page would download React + the React adapters but not Vue or SolidJS.

**Complexity:** High. Would require the benchmark page to know which adapters to load before the user interacts, or load adapters on demand after the page opens. Either way, dynamic `import()` calls at runtime would need to be measured carefully to ensure they do not contaminate render timing.

**Current stance:** Not worth the complexity at this stage. Reconsider if the bundle grows significantly or if page load time becomes a user complaint.

---

### Memory phase duration

**Problem:** The memory phase runs up to 10 attempts, each preceded by `settleHeap()` (3 cycles × ~650 ms = ~2 seconds). At 10 attempts, Phase 2 can take up to 20 seconds before reporting a result.

**Option:** Reduce `MEMORY_ATTEMPTS` from 10 to 5 or 3. The trade-off is fewer valid readings and a higher chance of reporting `"—"` instead of a number.

**Current stance:** 10 attempts with a 2-second settle per attempt was chosen for measurement accuracy. A future improvement could reduce settle time while maintaining attempt count, or show a live "attempt N/10" progress indicator to set visitor expectations.

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