# Design Decisions

A record of the significant architectural and design choices made during the initial build of virtuallist.io, with the reasoning behind each one.

---

## Every library is a peer — no special-casing in the measurement code

**Decision:** A single `benchmarkLibrary()` function in `runner.js` handles every library. There is no separate fast path or special measurement function for any library.

**Why:** The most common criticism of third-party benchmarks is that the benchmark author's own library gets subtly favoured — different warmup, more memory settling, a more forgiving timeout. Having one function that every library passes through makes it structurally impossible for this to happen accidentally. Anyone auditing the code sees one path, not two.

**Trade-off:** Some libraries genuinely have different setup costs that a split approach could acknowledge (Clusterize.js's upfront HTML generation, for example). These are treated as part of the library's real cost rather than noise to be excluded.

---

## Adapter pattern for library isolation

**Decision:** Each library lives in its own file in `benchmarks/libraries/`. Adapters can only import from `runner.js` and from the library being benchmarked. They cannot see each other.

**Why:** Isolation means that a bug in one adapter cannot affect another library's measurement. It also means new libraries can be added by contributors who only need to understand one small file, not the whole codebase. The `_TEMPLATE.js` file documents exactly what is required.

**Trade-off:** Some boilerplate is repeated across adapters (the `loadDependencies` pattern, the React `createRoot` CJS fallback). This was accepted in favour of the clarity of each adapter being fully self-contained.

---

## Flat database schema — one table pair for all libraries

**Decision:** All benchmark results go into `benchmark_runs` and `benchmark_metrics`. There is no distinction between library types in the schema. The `library_slug` column identifies the library.

**Why:** A schema that treats different libraries differently at the data layer would encode a bias into the foundation of the system. A flat schema reinforces the peer principle: the database cannot tell you that one library is more important than another.

**Trade-off:** Some queries that would be simpler with separate tables (e.g. "show only React libraries") now require a `WHERE library_slug IN (...)` clause. This is a minor inconvenience.

---

## Server-rendered HTML with no client framework

**Decision:** Pages are TypeScript functions that return HTML strings. There is no React, Vue, or Svelte on the server. The only client-side JavaScript is the benchmark engine.

**Why:**
- The overview and methodology pages have no interactive content. Shipping a framework runtime for them is waste.
- Server rendering is simple to reason about: a function takes data and returns a string. There is no hydration, no state mismatch, no client bundle to manage for the server.
- Page caching is trivial — one module-level string variable per page.

**Trade-off:** Adding rich interactivity to pages (e.g. live-updating aggregate charts) would require either a full client framework or carefully hand-written DOM manipulation. The current design makes that second option the natural path.

---

## Page-specific CSS inlined as `<style>` blocks

**Decision:** Each page renderer defines its own CSS as a TypeScript string constant and injects it into the `<head>` via the `extraHead` slot.

**Why:**
- The methodology page does not need benchmark UI styles. The homepage does not need sidebar styles. One global bundle would load all of it on every page.
- CSS is physically next to the markup it styles, in the same file. This makes it easier to delete a page and be confident nothing else breaks.
- No additional HTTP request or build step is needed for styles to reach the page.

**Trade-off:** Duplicate CSS cannot be easily extracted into a shared file. If two pages both define `.bench-tag`, the definition exists twice. The current scale of the project makes this acceptable.

---

## Server-side Puppeteer execution for individual library benchmarks

**Decision:** Individual library benchmarks (`/benchmarks/{slug}`) run server-side in headless Chrome via Puppeteer. The browser page triggers a run via `POST /api/run` and receives progress via SSE. Compare page benchmarks still run client-side.

**Why:**
- Eliminates hardware variance between visitors. A benchmark run on the server always uses the same CPU, the same Chrome flags (`--disable-frame-rate-limit`, `--enable-precise-memory-info`, `--js-flags=--expose-gc`), and the same controlled environment. Results are reproducible and comparable across submissions.
- Visitors no longer need to download ~1.5 MB of framework code just to benchmark a single library.
- Explicit GC control and uncapped rAF produce cleaner measurements than any visitor's browser can.

**Trade-off:** Benchmarks are limited to one-at-a-time (CPU contention skews results), so concurrent visitors must queue. The compare page still runs client-side because head-to-head comparisons benefit from running on the same machine in the same conditions — which is guaranteed when everything runs in a single browser tab.

---

## Bundle all frameworks together in headless.js and compare.js

**Decision:** `dist/benchmarks/headless.js` (Puppeteer) and `dist/benchmarks/compare.js` (client-side) each contain React, ReactDOM, Vue (runtime + compiler), SolidJS, and all 15 library adapters in a single ~1.5 MB file.

**Why:** The alternative — loading framework code dynamically when each benchmark starts — would add a network round-trip that contaminates the initial render time measurement. A benchmark that measures "how fast does the library render?" should not include "how long does the browser take to fetch the library's code?" in that number.

**Trade-off:** The compare page still downloads ~1.5 MB on first visit. This is large but only happens once per browser cache. The headless bundle size is irrelevant since it runs on the server.

---

## Dynamic imports inside adapters are a structural pattern, not runtime laziness

**Decision:** All adapters use `const mod = await import("my-library")` inside a `loadDependencies()` function, even though the bundler resolves all imports at build time.

**Why:** The pattern keeps each adapter file self-contained and testable in isolation. If the build system were replaced with one that supports true code splitting, the adapters would already be structured correctly for lazy loading without any changes.

**Trade-off:** The dynamic import syntax is slightly misleading in a bundled context — it reads as lazy loading but behaves as eager loading. The comment in `_TEMPLATE.js` explains this.

---

## Dual-loop scroll measurement architecture

**Decision:** Scroll measurement uses two separate loops: a `setTimeout(fn, 0)` loop that advances `scrollTop`, and a `requestAnimationFrame` loop that records frame delivery timestamps.

**Why:** Coupling scroll updates to `requestAnimationFrame` produces visible stepping at slow scroll speeds. At 60fps with 1,800 px/s (gentle speed), each frame would jump exactly 30px. Real user scrolling is smooth because the OS delivers scroll events much faster than the display refresh rate. `setTimeout(0)` fires approximately 250 times per second in Chrome, giving sub-pixel smooth movement at all five speed levels.

The two loops serve different purposes and should not be entangled: the rAF loop measures time, the setTimeout loop moves the viewport.

**Trade-off:** Two loops are harder to follow than one. The separation is documented extensively in both the code and the methodology page.

---

## Auto-persist from the server (no client-side POST needed)

**Decision:** When a Puppeteer benchmark run completes, the server's `onProgress` callback intercepts the `result` event and calls `storeResult()` directly — no client-side POST is needed for individual library benchmarks.

**Why:** Since benchmarks now run server-side, the server already has the result data in memory when the run completes. Persisting it directly eliminates a network round-trip and removes the possibility of data loss from client-side failures.

**Trade-off:** The legacy `POST /api/benchmarks` endpoint is still supported for crowdsourced submissions from external clients and the compare page's client-side flow. The `persistResult()` function still exists in `runner.js` for this purpose.

---

## In-memory rate limiting with periodic cleanup

**Decision:** Rate limiting uses a `Map<ip, {count, resetAt}>` in memory rather than a database or external service like Redis.

**Why:** The API receives at most a few dozen requests per benchmark run, from a single browser tab. The traffic pattern does not justify the operational complexity of an external rate limiting service. In-memory limiting resets if the server process restarts, which is fine — rate limit windows are 60 seconds.

**Trade-off:** Rate limits are per-process, not per-server. If multiple server instances were run (e.g. with PM2 cluster mode), each would have its own limit map. Given the single-fork PM2 configuration, this is not a practical issue.

---

## Sitemap generated from the registry

**Decision:** `src/server/sitemap.ts` calls `getLibrarySlugs()` from the registry to build sitemap entries. There is no hand-maintained sitemap file.

**Why:** A static sitemap would go out of date every time a library is added or removed. Generating it from the registry makes the invariant trivially true: if a library is in the registry and enabled, its page is in the sitemap.

**Trade-off:** The sitemap is regenerated on the first request after server startup and then cached. If the registry were modified at runtime (it currently is not), the cache would need to be cleared via `clearSitemapCache()`.

---

## Sync-first router design

**Decision:** The main request router tries all non-API routes synchronously before entering the async path. A `Promise` is only allocated for `/api/*` requests.

**Why:** Every JavaScript engine has a cost for creating and scheduling Promise microtasks. For a server that receives thousands of requests for cached HTML pages, avoiding that cost on the hot path meaningfully reduces per-request overhead. The benchmark pages, overview, methodology, homepage, and static files all return without ever entering the async queue.

**Trade-off:** All route resolvers must return `Response | null` synchronously, which means they cannot do async work (no database queries, no filesystem reads that are not already cached). This constraint is acceptable because all server-rendered content is either statically built or derived from in-memory data structures.

---

## No compression middleware in the server

**Decision:** The Bun server does not implement gzip or brotli compression. Compression is delegated to Nginx.

**Why:** Nginx has a mature, battle-tested gzip implementation. Adding compression inside the Bun server would require a dependency or a manual `CompressionStream` implementation, both of which add complexity with no benefit — Nginx handles it better.

**Trade-off:** In development, responses are served uncompressed. This means bundle transfer sizes are larger locally than in production. This is a minor inconvenience for development workflow.