# Page Renderers

Four page renderers live in `src/server/pages/`. Each one is a TypeScript function that builds an HTML content string and passes it to `renderShell()` to produce a complete document. Rendered HTML is cached in a module-level variable after the first request and reused for all subsequent ones. In development (`IS_PROD = false`) the cache is bypassed so changes are reflected without restarting the server.

Page-specific CSS is passed via the `extraHead` slot as an inline `<style>` block. This co-locates styles with the markup that needs them and avoids loading benchmark-specific CSS on the methodology page and vice versa.

---

## Homepage (`src/server/pages/home.ts`)

**URL:** `/`  
**Active nav:** none  
**JavaScript shipped:** none

### Sections

**Hero**  
A centered banner at the top of the page. Contains:
- A pill badge: "Open Source · Independent · Transparent"
- A large display title: "Virtual List Benchmarks"
- A subtitle that includes the total library count (fetched from `getLibraryCount()` — updates automatically when libraries are added)
- Two CTA buttons: "Run Benchmarks" → `/benchmarks` and "Methodology" → `/methodology`

**Library Grid**  
All enabled libraries grouped by ecosystem, rendered as clickable cards. Ecosystem order: React → Vue → SolidJS → Svelte → Vanilla JS → Multi-Framework. Each card shows the library name, tagline, and npm package name. Clicking a card navigates to `/benchmarks/{slug}`.

The grid is generated from `getLibrariesByEcosystem()` so no HTML needs to be changed when a library is added to the registry.

**Features**  
Six cards explaining the value proposition of the benchmark platform:
- Fair Methodology — randomized execution order, GC barriers, identical DOM templates
- Crowdsourced Data — every run is stored for aggregate trend analysis
- 4 Key Metrics — render time, memory, scroll FPS, P95 frame time
- Stress Testing — configurable CPU burn per frame to simulate real app overhead
- 7 Scroll Speeds — progressive testing from 720 px/s to 36,000 px/s
- Open Source — source code open to review and contribution

**How It Works**  
Four numbered steps explaining the benchmark process: Choose Libraries → Run in Your Browser → Compare Results → Contribute Data.

---

## Benchmark Pages (`src/server/pages/benchmarks.ts`)

**URLs:** `/benchmarks` (overview) and `/benchmarks/{slug}` (individual library)  
**Active nav:** "Benchmarks"

All benchmark pages share a two-column layout: a sticky sidebar on the left lists all libraries grouped by ecosystem, and the main content area sits on the right. Below 900px the sidebar collapses to a horizontal scrolling strip at the top.

### Overview page (`slug = null`)

**JavaScript shipped:** none

The overview renders a static header and a library grid — the same ecosystem-grouped cards as the homepage but with additional metadata. Each card shows the library name, ecosystem tag, tagline, and npm package name, plus a right-pointing arrow that animates on hover.

Below the library cards, a "Methodology" callout box summarises the measurement approach and links to `/methodology`.

The `.bench-overview__meta` strip shows four `.bench-tag` pills: the total library count, "4 metrics per run", "7 scroll speeds", and "Crowdsourced results".

### Individual library page (`slug = "react-window"`, etc.)

**JavaScript shipped:** `<script type="module" src="/dist/benchmarks/script.js">` (injected via `extraBody`)

The page is validated before rendering: `getLibrary(slug)` is called, and if the slug is not in the registry or the library has `enabled: false`, the renderer returns `null` and the router responds with 404.

**Header**  
- Library name as `<h1>`
- External links: npm, GitHub, and homepage (if the library has one) — each as a small pill button
- Tagline as a subtitle paragraph
- Environment tags: ecosystem badge, npm package in monospace, a Chrome detection tag (populated client-side by `script.js`), and a CPU cores tag (also populated client-side)

**Controls bar**  
A surface card containing:
- Item count segmented button group: 10K / 100K / 1M (default: 10K)
- Stress level segmented button group: 0 / 3 / 5 / 7 ms (default: 0)
- A "▶ Run" button that becomes "■ Stop" while a benchmark is running

The controls bar is rendered with the correct default button active. All interactivity (selection state, run/stop toggling, disabling during a run) is handled by `script.js` client-side.

**Benchmark result area**  
An empty `<div id="bench-suites">` container. When the user clicks Run, `script.js` injects a suite card here containing status text, a progress bar, and metric cards populated as each phase completes.

**Live preview viewport**  
A `<div id="bench-viewport">` container with `height: 0` initially. During a run, `script.js` adds `.bench-viewport--active` which transitions it to `height: 400px`. The virtual list renders inside this visible area so scrolling is measured on a visible element. When the run completes the viewport collapses back to zero height and its DOM is cleared.

**`data-library` attribute**  
The `.bench-page` wrapper element carries `data-library="{slug}"`. This is how `script.js` detects which library to benchmark when it initialises.

---

## Methodology Page (`src/server/pages/methodology.ts`)

**URL:** `/methodology`  
**Active nav:** "Methodology"  
**JavaScript shipped:** none

A long-form static documentation page. Content is hardcoded TypeScript strings — no dynamic data is used. The page is rendered into a single-column `800px` content area with generous vertical spacing between sections.

### Sections

| Section | Content |
|---------|---------|
| Overview | What "live in your browser" means; neutrality guarantee |
| What We Measure | Four metric cards: Render (ms, lower), Memory (MB, lower), Scroll FPS (fps, higher), P95 Frame Time (ms, lower) |
| Three-Phase Measurement | Numbered cards for Phase 1 (Timing), Phase 2 (Memory), Phase 3 (Scroll) with implementation details |
| Fairness Guarantees | Six list items: randomized execution order, GC barriers, identical DOM templates, same container dimensions, fresh container per run, consistent overscan |
| 7 Scroll Speeds | Table: multiplier × px/s × description for all seven speed levels |
| CPU Stress Testing | Table: level × burn × remaining frame budget × use case; explanation of the busy-wait burn loop |
| Memory Measurement | Strategy (settling, delta, rejection, retries, gentle GC); limitations (Chrome-only) |
| Scroll Architecture | Diagram showing the dual-loop design: rAF paint counter + setTimeout scroll driver |
| Crowdsourced Results | What is collected; what is NOT collected (no IP, no cookies, no tracking); confidence level thresholds |
| Limitations | Not tested (variable heights, complex templates, user interactions, mobile, SSR); partially addressed (stress testing, bundle size) |
| Browser Requirements | Per-browser table (Chrome, Firefox, Safari, Edge) |
| Contributing | Four ways to contribute; GitHub repository link |

### Key claims documented on this page

- Execution order is randomised per run with a coin flip to eliminate JIT warmth and GC bleed-through bias
- GC barriers (`tryGC()` + `waitFrames(5)`) are placed between library runs
- All libraries render a 7-element DOM structure per item: avatar, content wrapper, title, subtitle, meta wrapper, badge, timestamp
- Container dimensions are fixed: 600px height, 48px item height, overscan 5
- Memory uses `performance.memory.usedJSHeapSize` delta; negative deltas (GC artifacts) are rejected; up to 10 attempts are made
- No personally identifiable information is collected from visitors who run benchmarks

---

## About Section (`src/server/pages/about.ts`)

**URLs:** `/about`, `/about/api`, `/about/contribute`  
**Active nav:** "About"  
**JavaScript shipped:** none

A single renderer handles all three sub-pages. The `renderAboutPage(slug)` function accepts `null` or `"about"` for the root page, `"api"` for the API reference, and `"contribute"` for the contributor guide. Unknown slugs return `null` (router responds 404). All three pages share a sidebar layout with a sticky left navigation strip (About · API · Contribute) that collapses to a horizontal strip below 900px.

Page-specific CSS lives in the `ABOUT_CSS` constant at the bottom of the file and is injected via `extraHead`. The cache is keyed by the `AboutSlug` type so each sub-page is cached independently.

### `/about`

**Purpose:** Explains what the project is for a first-time visitor or library author evaluating whether to submit their library.

**Sections:**
- **What it is** — browser-based live benchmarks, library count (from `getLibraryCount()`), anonymous crowdsourcing
- **Neutrality** — one `benchmarkLibrary()` function for every library, randomised execution order, link to `/methodology`
- **Crowdsourced data** — anonymous storage, public API, confidence indicators
- **Open source** — GitHub link + "Add your library →" CTA button pointing to `/about/contribute`
- **Privacy** — explicit list of what is and is not collected (no IP, no cookies, no tracking)

### `/about/api`

**Purpose:** Public API reference for developers querying the crowdsourced dataset from external tools or scripts.

**Sections:**
- **Base URL** — `https://virtuallist.io/api` with a note about CORS
- **Endpoints** — one card per endpoint using `.api-endpoint` component:

  | Endpoint | Description |
  |----------|-------------|
  | `GET /api/benchmarks/stats` | Aggregated statistics with all query parameters and example JSON response |
  | `GET /api/benchmarks/history` | Daily time-series data with required/optional parameters and example JSON |
  | `GET /api/benchmarks/libraries` | Known library slugs in the database |
  | `GET /api/benchmarks/summary` | High-level database counts |
  | `GET /api/benchmarks/browsers` | Browser breakdown |
  | `GET /api/health` | Server health check |

- **Rate limiting** — 30 submissions/min on POST only; GET endpoints have no limit
- **Caching** — `Cache-Control: public, max-age=60, stale-while-revalidate=300` on all GET responses

### `/about/contribute`

**Purpose:** Step-by-step guide for library authors who want to add their library to the benchmark platform.

**Sections:**
- **How it works** — adapter pattern, `create()` / `destroy()`, engine handles everything else
- **Requirements** — four non-negotiable fairness rules presented as cards:
  - `ITEM_HEIGHT` (48 px) for row height
  - `DEFAULT_OVERSCAN` (5) for overscan configuration
  - Shared DOM template helper (no custom item templates)
  - Complete `destroy()` cleanup
- **Steps** — seven numbered steps with code examples:
  1. Fork the repository
  2. Register in `src/server/registry.ts` (with example entry object)
  3. Install the package (`bun add my-library`)
  4. Create the adapter (full React example code block)
  5. Import in `benchmarks/script.js`
  6. Build and verify (`bun run seed:db && bun run build && bun run dev`)
  7. Open a pull request
- **Template helpers** — reference cards for all four helpers (`createRealisticReactChildren`, `benchmarkTemplate`, `populateRealisticDOMChildren`, `generateRealisticItemHTML`) with one-line descriptions of when to use each
- **Other ways to contribute** — fix measurement issues, run benchmarks, report broken adapters

### About section CSS classes

| Prefix | What it covers |
|--------|---------------|
| `.about-layout`, `.about-layout__content` | Two-column layout |
| `.about-sidebar`, `.about-sidebar__link` | Left sidebar navigation |
| `.about-page`, `.about-header`, `.about-header__*` | Page chrome |
| `.about-section`, `.about-section__title` | Section dividers |
| `.about-text` | Body text paragraphs |
| `.about-link` | Inline accent-coloured links |
| `.about-pre` | Monospace code blocks |
| `.about-cta-row`, `.about-cta-btn` | CTA button row (About page) |
| `.api-endpoint`, `.api-endpoint__header` | API endpoint cards |
| `.api-method`, `.api-method--get`, `.api-method--post` | HTTP method badges |
| `.api-path` | Endpoint path in monospace |
| `.api-desc`, `.api-params`, `.api-param`, `.api-param__*` | Parameter documentation |
| `.about-req-list`, `.about-req`, `.about-req__*` | Requirements list (Contribute page) |
| `.about-steps`, `.about-step`, `.about-step__*` | Numbered step cards |
| `.about-helpers`, `.about-helper`, `.about-helper__*` | Template helper reference cards |
| `.about-contrib-list`, `.about-contrib` | Other contributions list |