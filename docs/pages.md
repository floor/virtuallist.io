# Page Renderers

Four page renderers live in `src/server/pages/`. Each one is a TypeScript function that builds an HTML content string and passes it to `renderShell()` to produce a complete document. Rendered HTML is cached in a module-level variable after the first request and reused for all subsequent ones. In development (`IS_PROD = false`) the cache is bypassed so changes are reflected without restarting the server.

Page-specific CSS is passed via the `extraHead` slot as an inline `<style>` block. This co-locates styles with the markup that needs them and avoids loading benchmark-specific CSS on the methodology page and vice versa.

---

## Pages at a Glance

| URL | Renderer | JavaScript |
|-----|----------|-----------|
| `/` | `home.ts` | none |
| `/benchmarks` | `benchmarks.ts` → `assembleOverviewPage()` | none |
| `/benchmarks/compare` | `benchmarks.ts` → `assembleComparePage()` | `compare.js` |
| `/benchmarks/{slug}` | `benchmarks.ts` → `assembleLibraryPage()` | `script.js` |
| `/methodology` | `methodology.ts` | none |
| `/about` | `about.ts` | none |
| `/about/api` | `about.ts` | none |
| `/about/contribute` | `about.ts` | none |

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

## Compare Page (`src/server/pages/benchmarks.ts` → `assembleComparePage()`)

**URL:** `/benchmarks/compare`  
**Active nav:** "Benchmarks"  
**Sidebar active link:** "⚖ Compare"  
**JavaScript shipped:** `<script type="module" src="/dist/benchmarks/compare.js">` (injected via `extraBody`)

The compare page lets a visitor pick 2–4 libraries and run them head-to-head under exactly the same conditions as an individual library benchmark. Results are displayed as a metric × library table with per-cell winner badges and difference percentages.

### Library Selector

A surface card above the controls containing:
- A **"Libraries" label** and an **"+ Add library" button** (disabled and dimmed when 4 slots are already open)
- **Slot rows** — each slot has a `<select>` dropdown listing all registered libraries, a slot label ("Library 1", "Library 2", …), and a remove button (✕) that appears when more than 2 slots are present

Slots are rendered and wired by `compare.js`. When a duplicate library is selected across any two slots, the Run button is disabled and a warning message appears: "Please select a different library for each slot."

### Controls

Identical to the individual library page: item count segmented group (10K / 100K / 1M), stress level segmented group (0 / 3 / 5 / 7 ms), and a "▶ Run Comparison" button that becomes "■ Stop" during a run. All controls are disabled while a run is in progress.

### Status bar and progress

A `<div id="cmp-status">` text line shows the current phase ("Running React Window (1/3)…", "✅ Complete", etc.). A slim 3px progress bar below it fills as each library's sub-phases complete. Progress is derived by `parseLocalProgress()` in `compare.js`, which maps the same status message patterns used by `script.js` (render N/5, memory N/10, scroll N/7) into a fine-grained position within each library's equal slice of the bar (0–90%), with the final 10% reserved for result rendering.

### Execution order

When Run is clicked, `compare.js` shuffles the selected slugs with `[...slugs].sort(() => Math.random() - 0.5)` before running. This randomises which library runs cold and which runs warm, eliminating JIT warmth and GC bleed-through bias. A GC barrier (`tryGC()` + `waitFrames(5)`) is placed between each library run. Results are always rendered in the original slot order so the columns match what the user selected.

### Results table

Populated by `compare.js` once all libraries have run. Structure:

**Header row** — one column per library. Each column shows:
- The library name in bold
- A status sub-line: green "N wins" when the library won at least one metric, red "Failed" if the run threw an error, italic "Not run" if the run was aborted before this library ran

**Metric rows** — one row per core metric (Render, Memory, Scroll FPS, P95 Frame). Each row has:
- A left label column with the metric name in uppercase
- One value cell per library, containing:
  - The numeric value and unit in large bold type, coloured green/yellow/red based on the absolute rating thresholds from `buildMetrics()`
  - A diff badge: `✓ best` (green) for the winner, `≈ tie` (muted) when all values are within 3% of each other, or `N% worse` (muted) relative to the winner for non-winners

**Footer** — a one-line note: "Libraries ran in randomized order to reduce GC bleed-through and JIT warmth bias."

### Winner detection

Winner detection uses `pickWinner(entries, better)` exported from `runner.js` — the single source of truth. It accepts an array of `{ slug, value }` pairs and a `'lower' | 'higher'` direction, filters out zero/null values, and returns the winning slug, `"__tie__"` if all valid values are within 3% of each other, or `null` if fewer than 2 valid values exist. The same function and threshold are used for the per-cell diff badge calculation.

### Three cell states for aborted runs

If a run is aborted mid-way, libraries that never ran are absent from the `allMetrics` Map (distinguished from `null` which means "ran but failed"). The table handles three distinct states:

| State | How it arises | Cell rendering |
|-------|--------------|----------------|
| Absent (`!allMetrics.has(slug)`) | Run aborted before this library's turn | `—` with `.cmp-results__cell--pending` (italic) |
| `null` | Library ran but threw an error | `—` with `.cmp-results__cell--error` |
| `BenchmarkMetric[]` | Library ran successfully | Value, unit, diff badge |

### Live preview viewport

Same as the individual library page — a `<div id="cmp-viewport">` that expands to 400px during the run and collapses when complete. Each library renders into a fresh sub-container inside this viewport; the previous library's DOM is cleared before the next one mounts.

### CSS

The compare page uses `BENCH_CSS` (shared with all benchmark pages) plus `COMPARE_CSS`, both defined as string constants in `src/server/pages/benchmarks.ts` and injected via `extraHead`. `COMPARE_CSS` covers:

| Class prefix | What it covers |
|---|---|
| `.cmp-selector`, `.cmp-slots`, `.cmp-slot` | Library picker card and slot rows |
| `.cmp-slot__select`, `.cmp-slot__remove` | Dropdown and remove button |
| `.cmp-add-slot-btn` | Add library button |
| `.cmp-status`, `.cmp-progress` | Status text and progress bar |
| `.cmp-results`, `.cmp-results__header`, `.cmp-results__body`, `.cmp-results__row` | Results table structure |
| `.cmp-results__col-header`, `.cmp-results__lib-name`, `.cmp-results__lib-status` | Column header content |
| `.cmp-results__metric-label`, `.cmp-results__cell` | Row label and value cells |
| `.cmp-diff-badge--winner`, `.cmp-diff-badge--tie`, `.cmp-diff-badge--worse` | Diff badge variants |
| `.cmp-cell__value`, `.cmp-cell__unit`, `.cmp-cell__meta` | Cell value typography |
| `.cmp-results__footer` | Footer note |

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