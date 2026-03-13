# Refactor: i18n Architecture

> Internal spec. Do not publish.

This document describes the complete refactor required to move virtuallist.io from
TypeScript string templates to an Eta + JSON locale architecture that supports
multiple languages.

---

## Why

The current implementation has every user-facing string embedded inside TypeScript
template literal functions in `src/server/pages/*.ts`. This means:

- A translator cannot edit content without touching TypeScript source files
- Every string change requires navigating through logic code to find the right spot
- There is no concept of a "content layer" that a translation pipeline can target
- Adding a second language would require duplicating entire page renderer functions

The target architecture separates three concerns that are currently mixed together:

```
BEFORE                          AFTER
──────────────────────────────  ──────────────────────────────────────────
src/server/pages/about.ts       locales/en/about.json     ← translatable strings
  - HTML structure              src/templates/about.eta   ← HTML structure
  - User-facing strings         src/server/pages/about.ts ← logic only
  - Page logic                  src/i18n.ts               ← locale loading
```

---

## Target Architecture

```
virtuallist.io/
├── locales/
│   ├── en/
│   │   ├── common.json        ← nav, footer, shared UI strings
│   │   ├── home.json
│   │   ├── benchmarks.json
│   │   ├── methodology.json
│   │   └── about.json         ← covers /about, /about/api, /about/contribute
│   └── fr/                    ← added later, same file names
│       ├── common.json
│       ├── home.json
│       └── ...
│
├── src/
│   ├── templates/             ← NEW: Eta template files
│   │   ├── shell.eta          ← replaces shell.ts buildNav/buildFooter HTML
│   │   ├── home.eta
│   │   ├── benchmarks-overview.eta
│   │   ├── benchmarks-library.eta
│   │   ├── methodology.eta
│   │   ├── about.eta
│   │   ├── about-api.eta
│   │   └── about-contribute.eta
│   │
│   ├── server/
│   │   ├── i18n.ts            ← NEW: locale loader + t() function
│   │   ├── shell.ts           ← keeps logic (critical CSS, ShellOptions); removes HTML strings
│   │   ├── config.ts          ← unchanged
│   │   ├── router.ts          ← add locale detection from Accept-Language / URL prefix
│   │   ├── registry.ts        ← unchanged
│   │   ├── static.ts          ← unchanged
│   │   ├── sitemap.ts         ← update for language-prefixed URLs
│   │   └── pages/
│   │       ├── home.ts        ← logic only: getLibraryCount(), pass data to template
│   │       ├── benchmarks.ts  ← logic only: registry lookups, pass data to template
│   │       ├── methodology.ts ← logic only: passes locale strings to template
│   │       └── about.ts       ← logic only: passes locale strings to template
```

---

## Step 1 — Locale JSON files

### Naming convention

- One directory per language code: `locales/en/`, `locales/fr/`, `locales/de/`, …
- Language codes follow BCP 47: `en`, `fr`, `de`, `pt-BR`, `zh-TW`, etc.
- One JSON file per page/section. Files are flat or one level deep — never more.
- The `en/` directory is the source of truth. All other languages are derived from it
  by the translation pipeline.

### What goes in JSON vs what stays in TypeScript

**Goes in JSON (translatable):**
- Any string a user reads: headings, paragraphs, button labels, link text, tooltips,
  error messages, ARIA labels, meta descriptions, page titles
- Strings with dynamic values use `{placeholder}` syntax:
  `"subtitle": "Benchmarking {count} libraries across {ecosystems}."`

**Stays in TypeScript (not translatable):**
- URL paths (`/benchmarks`, `/about/api`)
- CSS class names
- HTML attribute names
- Library slugs, npm package names, GitHub URLs (these come from the registry)
- Numbers and units (formatting is handled by the template with locale context)

### `locales/en/common.json`

Contains strings shared across all pages: navigation labels, footer text, and any
UI component strings used in multiple places.

```json
{
  "nav": {
    "benchmarks": "Benchmarks",
    "methodology": "Methodology",
    "about": "About",
    "github_label": "GitHub repository"
  },
  "footer": {
    "tagline": "Independent, open-source benchmark platform for virtual list libraries.",
    "disclaimer": "All benchmarks run locally in your browser. Results depend on your hardware.",
    "link_methodology": "Methodology",
    "link_about": "About",
    "link_contribute": "Contribute",
    "link_api": "API",
    "link_github": "GitHub"
  },
  "bench_tag": {
    "libraries": "{count} libraries",
    "metrics": "4 metrics per run",
    "scroll_speeds": "7 scroll speeds",
    "crowdsourced": "Crowdsourced results"
  },
  "controls": {
    "items_label": "Items",
    "stress_label": "Stress ms",
    "run": "▶ Run",
    "stop": "■ Stop"
  },
  "chrome_tag_full": "Chrome — full metrics",
  "chrome_tag_warning": "⚠️ Use Chrome for memory metrics",
  "cpu_tag": "{cores}-core CPU"
}
```

### `locales/en/home.json`

```json
{
  "meta": {
    "title": "virtuallist.io — Independent Virtual List Benchmarks",
    "description": "Fair, transparent performance benchmarks for virtual list libraries. Compare React, Vue, SolidJS, Svelte, and Vanilla JS implementations with live browser tests."
  },
  "hero": {
    "badge": "Open Source · Independent · Transparent",
    "title": "Virtual List\nBenchmarks",
    "subtitle": "Fair, transparent performance benchmarks for <strong>{count} virtual list libraries</strong> across React, Vue, SolidJS, Svelte, and Vanilla JS. Every benchmark runs live in your browser — no pre-recorded results, no bias.",
    "cta_primary": "Run Benchmarks",
    "cta_secondary": "Methodology"
  },
  "libraries": {
    "title": "Libraries",
    "desc": "Every library is treated equally — same test conditions, same DOM structure, same measurement pipeline. Click any library to run its benchmark."
  },
  "features": {
    "title": "Why virtuallist.io?",
    "fair_title": "Fair Methodology",
    "fair_desc": "Randomized execution order, GC barriers between runs, identical DOM templates. No library gets an unfair advantage from JIT warmth or GC timing.",
    "crowdsourced_title": "Crowdsourced Data",
    "crowdsourced_desc": "Every run is automatically stored and aggregated. See real-world performance across different hardware, browsers, and versions.",
    "metrics_title": "4 Key Metrics",
    "metrics_desc": "Initial render time, memory usage, scroll FPS, and P95 frame time. Comprehensive performance profiling in under 30 seconds.",
    "stress_title": "Stress Testing",
    "stress_desc": "Simulate real application overhead by burning CPU per frame. See which libraries hold up under pressure when your app does real work.",
    "speeds_title": "7 Scroll Speeds",
    "speeds_desc": "From 720 px/s crawl to 36,000 px/s extreme stress. Progressive speed testing reveals performance cliffs invisible at a single speed.",
    "open_title": "Open Source",
    "open_desc": "Every line of measurement code is open for review. Library authors are welcome to contribute and ensure fair representation."
  },
  "how": {
    "title": "How It Works",
    "step1_title": "Choose Libraries",
    "step1_desc": "Select any library to benchmark it. Each benchmark tests the library in isolation.",
    "step2_title": "Run in Your Browser",
    "step2_desc": "Benchmarks execute live using real DOM operations — no simulated or pre-recorded data.",
    "step3_title": "Compare Results",
    "step3_desc": "View side-by-side metrics with percentage differences and quality ratings.",
    "step4_title": "Contribute Data",
    "step4_desc": "Results are automatically stored for crowdsourced aggregation across devices and browsers."
  }
}
```

### `locales/en/benchmarks.json`

```json
{
  "meta": {
    "overview_title": "Benchmarks — virtuallist.io",
    "overview_description": "Live performance benchmarks for virtual list libraries. Compare render time, memory usage, scroll FPS, and P95 frame time across React, Vue, SolidJS, Svelte, and Vanilla JS implementations.",
    "library_title": "{name} Benchmark — virtuallist.io",
    "library_description": "Live performance benchmark for {name}. Measure render time, memory usage, scroll FPS, and P95 frame time with {npm} in your browser."
  },
  "overview": {
    "title": "Benchmarks",
    "desc": "Live performance benchmarks for <strong>{count} virtual list libraries</strong>. Each benchmark runs in your browser with identical test conditions — same DOM structure, same scroll patterns, same measurement pipeline. Select a library to begin.",
    "methodology_title": "Methodology",
    "methodology_desc": "All benchmarks follow identical methodology. Execution order is randomized per run to eliminate GC bleed and JIT warmth bias. GC barriers are placed between runs. All libraries render the same 7-element DOM template per item.",
    "methodology_link": "Read the full methodology →"
  },
  "sidebar": {
    "overview_link": "Overview"
  },
  "viewport_label": "Live Preview"
}
```

### `locales/en/methodology.json`

The methodology page has the most copy. Every section title and paragraph is a key.
Paragraphs that contain inline HTML (`<strong>`, `<code>`) use the string as-is —
the Eta template renders them with `<%~ %>` (unescaped output). The translation
pipeline must preserve inline tags.

```json
{
  "meta": {
    "title": "Methodology — virtuallist.io",
    "description": "How virtuallist.io measures virtual list performance. Detailed documentation of the benchmark methodology: three-phase measurement, randomized execution, 7 scroll speeds, CPU stress testing, and crowdsourced data collection."
  },
  "header": {
    "title": "Methodology",
    "subtitle": "How virtuallist.io measures virtual list performance — what we test, how we test it, and why you can trust the results."
  },
  "overview": {
    "title": "Overview",
    "p1": "Every benchmark on virtuallist.io runs <strong>live in your browser</strong>. There are no pre-recorded results, no synthetic scores, and no simulated environments. Each library creates real DOM elements, scrolls them programmatically, and has its frame times, render latency, and memory usage measured with native browser APIs.",
    "p2": "All libraries are treated as equals — no library gets special treatment in the measurement pipeline, DOM template, or display order. The same infrastructure benchmarks every library, from load to teardown."
  },
  "metrics": {
    "title": "What We Measure",
    "intro": "Every benchmark run produces four core metrics, chosen to capture the most important aspects of virtual list performance:",
    "render_name": "Initial Render",
    "render_unit": "Milliseconds · Lower is better",
    "render_desc": "Time from library instantiation to first paint. Measured as the median of 5 iterations using <code>performance.mark/measure</code> for DevTools integration. Each iteration creates a fresh instance and waits for the next animation frame.",
    "memory_name": "Memory Usage",
    "memory_unit": "Megabytes · Lower is better",
    "memory_desc": "JS heap delta after rendering the list. Uses Chrome's <code>performance.memory.usedJSHeapSize</code> API with up to 10 measurement attempts. Negative deltas (GC artifacts) are rejected; the median of valid readings is reported. Not available in Firefox.",
    "fps_name": "Scroll FPS",
    "fps_unit": "Frames per second · Higher is better",
    "fps_desc": "Sustained scroll performance measured over 2 seconds per speed level. A <code>requestAnimationFrame</code> paint counter records frame delivery times while a high-frequency <code>setTimeout</code> scroll driver advances <code>scrollTop</code> at a constant pixels-per-second rate. Median FPS is computed from recorded frame intervals.",
    "p95_name": "P95 Frame Time",
    "p95_unit": "Milliseconds · Lower is better",
    "p95_desc": "The 95th percentile frame time during scroll — a measure of consistency and jank. While median FPS shows average throughput, P95 reveals the worst-case stutters that users actually feel. Computed from the same frame time array as FPS."
  },
  "phases": {
    "title": "Three-Phase Measurement",
    "intro": "Each benchmark run executes three isolated phases to prevent cross-contamination between measurements:",
    "timing_title": "Timing Phase",
    "timing_desc": "The library is instantiated and destroyed 5 times. Each iteration is timed with <code>performance.mark/measure</code>. The median duration is reported as the render time. The container is cleaned and GC is triggered between iterations.",
    "memory_title": "Memory Phase",
    "memory_desc": "Completely separate from timing. The heap is aggressively settled (3 cycles of <code>gc()</code> + 150ms + 5 frames), a baseline snapshot is taken, the library is instantiated, a gentle GC reclaims transient allocations, and a second snapshot is taken. Up to 10 attempts are made; negative deltas are discarded.",
    "scroll_title": "Scroll Phase",
    "scroll_desc": "The instance from the last memory attempt is reused (it's still mounted). A dual-loop architecture drives the scroll: a <code>setTimeout(0)</code> loop updates <code>scrollTop</code> ~250 times/sec for smooth sub-pixel scrolling, while a <code>requestAnimationFrame</code> loop records frame delivery times. Each of 7 speed levels runs for 2 seconds with bidirectional scrolling (bouncing at edges)."
  },
  "fairness": {
    "title": "Fairness Guarantees",
    "intro": "Several mechanisms ensure no library gets an unfair advantage:",
    "order_label": "Randomized Execution Order",
    "order_desc": "A coin flip decides which library runs first in each comparison, eliminating JIT warmth bias and GC bleed-through from one library to another.",
    "gc_label": "GC Barriers",
    "gc_desc": "<code>tryGC()</code> + <code>waitFrames(5)</code> is called between library runs to flush residual garbage from the previous measurement.",
    "template_label": "Identical DOM Templates",
    "template_desc": "Every library renders the exact same 7-element DOM structure per item: avatar, content wrapper, title, subtitle, meta wrapper, badge, and timestamp.",
    "dimensions_label": "Same Container Dimensions",
    "dimensions_desc": "All libraries render into the same-sized container (600px height) with the same item height (48px), ensuring identical viewport and overscan conditions.",
    "container_label": "Fresh Container Per Run",
    "container_desc": "A new container element is created for each benchmark run. No leftover DOM, state, or event listeners from previous runs.",
    "overscan_label": "Consistent Overscan",
    "overscan_desc": "All libraries use an overscan of 5 items (where configurable) to ensure they render the same number of off-screen elements."
  },
  "speeds": {
    "title": "7 Scroll Speeds",
    "intro": "Testing at a single scroll speed can miss performance cliffs — a library might be perfect at casual speeds but fall apart under aggressive scrolling. Each benchmark tests at 7 progressive speeds:",
    "col_level": "Level",
    "col_speed": "Speed",
    "col_desc": "Description",
    "crawl": "Crawl — pure baseline overhead measurement",
    "gentle": "Gentle browsing — minimal DOM recycling",
    "slow": "Casual scrolling — light recycling",
    "normal": "Normal scroll speed — baseline reference",
    "fast": "Fast flick — aggressive touch/wheel gesture",
    "aggressive": "Aggressive scroll — heavy DOM churn",
    "extreme": "Extreme stress test — maximum pressure",
    "note": "All speeds are multiples of the base speed (7,200 px/s ≈ 2.5 items/frame at 60fps with 48px items). Time-based scrolling ensures consistent speed regardless of monitor refresh rate."
  },
  "stress": {
    "title": "CPU Stress Testing",
    "p1": "In real applications, the virtual list isn't the only thing running. State management, rendering other components, network handling, and business logic all compete for the same frame budget. The stress parameter simulates this by burning a configurable amount of CPU time in each <code>requestAnimationFrame</code> callback:",
    "col_level": "Level",
    "col_burn": "CPU Burn",
    "col_budget": "Remaining Budget (120Hz)",
    "col_use": "Use Case",
    "none_use": "Isolated library performance",
    "light_use": "Simple app with some overhead",
    "medium_use": "Moderate app complexity",
    "heavy_use": "Complex app — separates fast from slow libraries",
    "p2": "The burn uses a tight busy-wait loop with <code>performance.now()</code> as the exit condition. Because it runs inside the rAF callback, it directly competes with the library's own rendering for frame budget — the more CPU the stress burns, the less time the library has to complete its work."
  },
  "memory_detail": {
    "title": "Memory Measurement",
    "p1": "Memory measurement is the most challenging metric to get right. The JavaScript heap is a moving target — garbage collection can reclaim memory at any time, and transient allocations from the measurement infrastructure itself can pollute readings.",
    "strategy_title": "Strategy",
    "settling_label": "Aggressive Heap Settling",
    "settling_desc": "Before taking the baseline snapshot, 3 cycles of <code>gc()</code> + 150ms + 5 animation frames flush accumulated garbage from previous phases.",
    "delta_label": "Delta Measurement",
    "delta_desc": "The metric is the difference between <code>usedJSHeapSize</code> before and after creating the component — not the absolute value.",
    "rejection_label": "Negative Delta Rejection",
    "rejection_desc": "If GC reclaims more old garbage than the component allocated, the delta is negative — this is an artifact, not real data. These readings are discarded.",
    "retries_label": "Multiple Attempts",
    "retries_desc": "Up to 10 measurements are taken. The median of valid (positive) readings is reported. This dramatically reduces the chance of reporting \"—\" (unavailable).",
    "gentle_label": "Gentle Post-Create GC",
    "gentle_desc": "After creating the component but before the \"after\" snapshot, a light GC pass reclaims transient allocations (createElement temporaries) without destroying the component itself.",
    "limits_title": "Limitations",
    "limits_p": "Memory measurement requires Chrome with the <code>performance.memory</code> API. Firefox, Safari, and other browsers will show \"—\" for memory metrics. For the most accurate readings, launch Chrome with <code>--enable-precise-memory-info</code>."
  },
  "scroll_arch": {
    "title": "Scroll Architecture",
    "p1": "The scroll measurement uses a dual-loop design to separate concerns and ensure accurate timing:",
    "loop1_label": "Loop 1 — Paint Counter",
    "loop1_api": "requestAnimationFrame",
    "loop1_desc": "Records frame delivery timestamps.\nBurns CPU stress budget here.\nComputes FPS and frame times.",
    "loop2_label": "Loop 2 — Scroll Driver",
    "loop2_api": "setTimeout(fn, 0)",
    "loop2_desc": "Advances scrollTop at constant px/s.\n~250 updates/sec in Chrome.\nTime-based, not frame-based.",
    "p2": "This separation matters because coupling scroll updates to <code>requestAnimationFrame</code> produces visible stepping at slow scroll speeds — 60 scroll updates/sec doesn't look smooth at 720 px/s. The high-frequency <code>setTimeout</code> driver provides ~250 updates/sec, yielding sub-pixel-smooth movement at all speeds."
  },
  "crowdsourced": {
    "title": "Crowdsourced Results",
    "p1": "Every benchmark run is automatically persisted to a SQLite database via a fire-and-forget <code>POST /api/benchmarks</code> request. This happens transparently — it never blocks the UI or affects the benchmark itself.",
    "collected_title": "What's Collected",
    "metrics_label": "Metrics",
    "metrics_desc": "All 4 metric values with units, ratings, and \"better\" direction.",
    "library_label": "Library Info",
    "library_desc": "Library slug and version (where detectable).",
    "env_label": "Environment",
    "env_desc": "User agent, CPU core count, device memory, screen dimensions.",
    "config_label": "Configuration",
    "config_desc": "Item count, stress level, and scroll speed used for the run.",
    "not_collected_title": "What's NOT Collected",
    "not_collected_p": "No IP addresses are stored. No cookies are set. No tracking scripts are loaded. No personally identifiable information is collected. The data is used solely for aggregated performance statistics.",
    "confidence_title": "Confidence Levels",
    "confidence_intro": "Aggregated results display a confidence indicator based on sample count:",
    "high_label": "🟢 High confidence",
    "high_desc": "20 or more runs — statistically meaningful.",
    "moderate_label": "🟡 Moderate confidence",
    "moderate_desc": "5–19 runs — directionally useful but may shift with more data.",
    "low_label": "⚪ Low confidence",
    "low_desc": "Fewer than 5 runs — treat as preliminary."
  },
  "limitations": {
    "title": "Limitations",
    "p1": "These benchmarks test <strong>core virtualization performance</strong> only. They are intentionally focused and do not attempt to measure every possible use case.",
    "not_tested_title": "Not Tested",
    "templates_label": "Complex templates",
    "templates_desc": "Rich content with images, nested components, or heavy layout — all items use a simple 7-element template.",
    "variable_label": "Variable heights",
    "variable_desc": "All items are fixed at 48px. Variable-height virtualization is a different performance challenge.",
    "interactions_label": "User interactions",
    "interactions_desc": "Click handlers, selection state, hover effects, and input elements are not included.",
    "mobile_label": "Mobile devices",
    "mobile_desc": "Benchmarks are designed for desktop browsers. Mobile performance characteristics differ significantly.",
    "ssr_label": "Server-side rendering",
    "ssr_desc": "All benchmarks run client-side. SSR compatibility and hydration performance are not measured.",
    "partial_title": "Partially Addressed",
    "overhead_label": "Real-world application overhead",
    "overhead_desc": "The stress parameter simulates CPU contention but doesn't replicate actual application complexity.",
    "bundle_label": "Bundle size",
    "bundle_desc": "Listed in library metadata but not measured as part of the runtime benchmark.",
    "p2": "These constraints are intentional — by isolating library performance from external factors, the benchmarks produce consistent, reproducible results that are meaningful for library-to-library comparison."
  },
  "browsers": {
    "title": "Browser Requirements",
    "col_browser": "Browser",
    "col_support": "Support",
    "chrome_label": "Chrome (recommended)",
    "chrome_desc": "Full metrics including memory. Best accuracy with <code>--enable-precise-memory-info</code> flag.",
    "firefox_label": "Firefox",
    "firefox_desc": "Render time and scroll FPS work. Memory metrics show \"—\" (API not available).",
    "safari_label": "Safari",
    "safari_desc": "Render time and scroll FPS work. Memory metrics show \"—\" (API not available).",
    "edge_label": "Edge",
    "edge_desc": "Same as Chrome (Chromium-based). Full metrics available."
  },
  "contributing": {
    "title": "Contributing",
    "p1": "virtuallist.io is open source. Library authors, maintainers, and community members are welcome to:",
    "add_label": "Add new libraries",
    "add_desc": "Create a benchmark adapter and add an entry to the registry.",
    "report_label": "Report methodology issues",
    "report_desc": "If you find a measurement flaw, bias, or inaccuracy, please open a GitHub issue.",
    "improve_label": "Improve fairness",
    "improve_desc": "PRs that improve measurement accuracy, reduce bias, or add validation are always welcome.",
    "run_label": "Run benchmarks",
    "run_desc": "The simplest contribution: visit the site, run some benchmarks, and let the crowdsourced data grow.",
    "github_link": "View the source on GitHub →"
  }
}
```

### `locales/en/about.json`

Covers all three sub-pages (`/about`, `/about/api`, `/about/contribute`).

```json
{
  "meta": {
    "about_title": "About — virtuallist.io",
    "about_description": "virtuallist.io is an independent, open-source benchmark platform for virtual list libraries. Learn about the neutrality principle, crowdsourced data, and how to contribute.",
    "api_title": "API — virtuallist.io",
    "api_description": "Public API reference for virtuallist.io. Query aggregated benchmark statistics, time-series history, and browser breakdowns from the crowdsourced dataset.",
    "contribute_title": "Contribute — virtuallist.io",
    "contribute_description": "Add your virtual list library to virtuallist.io. Step-by-step guide for library authors: registry entry, adapter code, and submitting a pull request."
  },
  "sidebar": {
    "about": "About",
    "api": "API",
    "contribute": "Contribute"
  },
  "about": {
    "title": "About",
    "subtitle": "virtuallist.io is an independent, open-source benchmark platform for virtual list libraries.",
    "what_title": "What it is",
    "what_p1": "virtuallist.io measures the real-world performance of virtual list and virtual scroll libraries across React, Vue, SolidJS, Svelte, and Vanilla JS. Every benchmark runs live in the visitor's browser using real DOM operations — no pre-recorded results, no synthetic scores.",
    "what_p2": "Currently benchmarking <strong>{count} libraries</strong>. Results from every run are stored anonymously and aggregated to build a statistically meaningful picture of performance across different hardware, browsers, and library versions.",
    "neutrality_title": "Neutrality",
    "neutrality_p1": "Every library on this site is treated as an equal. There is one measurement pipeline — <code>benchmarkLibrary()</code> — and every library passes through it identically. No library gets a different warmup, a more forgiving timeout, or a different DOM template. The same 7-element row structure, the same 48\u00a0px item height, the same overscan of 5 is applied to every benchmark.",
    "neutrality_p2": "Execution order is randomised per run with a coin flip to eliminate JIT warmth and garbage-collection bias. The full methodology is published at <a href=\"/methodology\" class=\"about-link\">/methodology</a>.",
    "crowdsourced_title": "Crowdsourced data",
    "crowdsourced_p1": "Every time someone runs a benchmark, the result is silently persisted to a database — no account required, no tracking, no cookies. Over time this builds a dataset of real-world performance across a wide range of devices and browsers.",
    "crowdsourced_p2": "The aggregated data is queryable via the public <a href=\"/about/api\" class=\"about-link\">API</a>. Confidence indicators show how many runs back each result: high confidence requires at least 20 runs, moderate at least 5.",
    "opensource_title": "Open source",
    "opensource_p": "The entire platform — measurement engine, server, adapters, database schema — is open source and available on GitHub. Library authors are encouraged to review the adapter for their library, raise issues if they spot a measurement flaw, and submit pull requests to improve coverage or fairness.",
    "cta_github": "View on GitHub",
    "cta_contribute": "Add your library →",
    "privacy_title": "Privacy",
    "privacy_p": "Running a benchmark submits anonymous performance data: metric values, item count, browser user agent, CPU core count, screen dimensions, and the stress level used. No IP addresses are stored. No cookies are set. No tracking scripts are loaded. The data is used solely for aggregated performance statistics."
  },
  "api": {
    "title": "API",
    "subtitle": "Query the crowdsourced benchmark database. All endpoints are public, read-only (except the submit endpoint), and return JSON with CORS headers.",
    "base_title": "Base URL",
    "cors_note": "All responses include <code>Access-Control-Allow-Origin: *</code> so the API can be queried from any origin, including browser scripts and local tools.",
    "endpoints_title": "Endpoints",
    "stats_desc": "Aggregated statistics for a library — median, mean, p5, p95, stddev, and sample count for each metric, grouped by library version and item count.",
    "stats_param_slug": "Filter by library slug (e.g. <code>react-window</code>)",
    "stats_param_count": "Filter by item count — <code>10000</code>, <code>100000</code>, or <code>1000000</code>",
    "stats_param_version": "Filter by version string",
    "stats_param_stress": "Filter by stress level — <code>0</code>, <code>3</code>, <code>5</code>, or <code>7</code>",
    "history_desc": "Daily aggregated time-series data for a single metric and library. Useful for drawing trend charts. Results are grouped by calendar day and library version.",
    "history_param_slug": "Library to query",
    "history_param_metric": "Metric label — <code>Render</code>, <code>Memory</code>, <code>Scroll FPS</code>, <code>P95 Frame</code>",
    "history_param_days": "Lookback window in days, default <code>90</code>, max <code>365</code>",
    "history_param_count": "Filter by item count",
    "libraries_desc": "All library slugs that have at least one successful run in the database, with version and run count information.",
    "summary_desc": "High-level counts across the entire database — total runs, unique libraries, first and last run timestamps, top libraries by run count.",
    "browsers_desc": "Browser breakdown of all stored runs, parsed from user agent strings.",
    "health_desc": "Server health check.",
    "ratelimit_title": "Rate limiting",
    "ratelimit_p": "The <code>POST /api/benchmarks</code> endpoint (used internally by the benchmark runner) is rate-limited to 30 submissions per IP per minute. The read-only <code>GET</code> endpoints have no rate limit.",
    "caching_title": "Caching",
    "caching_p": "<code>GET</code> responses carry <code>Cache-Control: public, max-age=60, stale-while-revalidate=300</code>. Responses are safe to cache for up to a minute; stale responses may be served for up to 5 minutes while the cache revalidates in the background."
  },
  "contribute": {
    "title": "Contribute",
    "subtitle": "Add your library to virtuallist.io so the community can compare its performance alongside every other virtual list implementation.",
    "how_title": "How it works",
    "how_p1": "Every library is benchmarked through the same measurement pipeline using a small adapter file you provide. The adapter implements two functions — <code>create()</code> and <code>destroy()</code> — and the engine handles everything else: timing, memory snapshots, scroll measurement, and result storage.",
    "how_p2": "Your library is treated identically to every other library on the site. Same item height, same DOM template, same scroll speeds, same measurement phases.",
    "req_title": "Requirements",
    "req_intro": "Your adapter must follow these rules so the benchmarks stay comparable:",
    "req_height_label": "Item height",
    "req_height_desc": "Use the exported <code>ITEM_HEIGHT</code> constant (48 px). All libraries use the same row height so scroll measurements are directly comparable.",
    "req_overscan_label": "Overscan",
    "req_overscan_desc": "Use <code>DEFAULT_OVERSCAN</code> (5 items) wherever your library exposes an overscan option, or <code>DEFAULT_OVERSCAN × ITEM_HEIGHT</code> for pixel-based overscan.",
    "req_template_label": "DOM template",
    "req_template_desc": "Use one of the four shared template helpers — do not write a custom item template. All libraries must render the same 7-element DOM structure per row.",
    "req_destroy_label": "Clean destroy",
    "req_destroy_desc": "<code>destroy()</code> must fully unmount the component and remove all DOM nodes. Leftover nodes contaminate subsequent measurements.",
    "steps_title": "Steps",
    "step1_title": "Fork the repository",
    "step1_desc": "Fork <a href=\"https://github.com/floor/virtuallist.io\" class=\"about-link\" target=\"_blank\" rel=\"noopener noreferrer\">github.com/floor/virtuallist.io</a> and clone it locally.",
    "step2_title": "Register in the registry",
    "step2_desc": "Add an entry to <code>src/server/registry.ts</code> with your library's slug, name, tagline, ecosystem, npm package name, and GitHub URL. This one change makes the library appear in navigation, the sitemap, and the homepage grid.",
    "step3_title": "Install the package",
    "step4_title": "Create the adapter",
    "step4_desc": "Copy <code>benchmarks/libraries/_TEMPLATE.js</code> to <code>benchmarks/libraries/my-library.js</code> and implement <code>create()</code> and <code>destroy()</code>.",
    "step5_title": "Import in script.js",
    "step5_desc": "Add one line to <code>benchmarks/script.js</code>:",
    "step6_title": "Build and verify",
    "step7_title": "Open a pull request",
    "step7_desc": "Submit the PR against the <code>main</code> branch. Describe the library briefly and confirm that all four core metrics complete without errors.",
    "helpers_title": "Template helpers",
    "helpers_intro": "Choose the helper that matches your library's rendering model. Every helper produces the same 7-element DOM structure — avatar, title, subtitle, badge, and timestamp — so all results are directly comparable.",
    "helper_react_desc": "Returns a <code>React.ReactElement[]</code>. Use for all React-based libraries.",
    "helper_template_desc": "Returns an HTML string (inner content only). Use for libraries with an HTML template callback.",
    "helper_dom_desc": "Mutates a DOM element in place. Use for SolidJS or vanilla DOM approaches.",
    "helper_html_desc": "Returns a complete <code>&lt;div class=\"bench-item\"&gt;</code> HTML string. Use for libraries that require pre-built row strings.",
    "other_title": "Other ways to contribute",
    "other_fix_label": "Fix a measurement issue",
    "other_fix_desc": "If you spot a bias, an inaccuracy, or an unfair condition in any adapter or in the engine itself, open an issue or submit a fix.",
    "other_run_label": "Run benchmarks",
    "other_run_desc": "The simplest contribution: visit any library's benchmark page and click Run. Every result grows the crowdsourced dataset.",
    "other_report_label": "Report a broken adapter",
    "other_report_desc": "If a library's benchmark fails or produces incorrect results, open an issue with the library slug and the error message."
  }
}
```

---

## Step 2 — i18n loader (`src/server/i18n.ts`)

This module is responsible for:
1. Loading the correct locale JSON files at server startup
2. Providing a typed `t()` function to templates and renderers
3. Detecting the requested language from the HTTP request
4. Falling back to `en` for any missing key

```typescript
// src/server/i18n.ts

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

// =============================================================================
// Types
// =============================================================================

export type Locale = string; // "en", "fr", "de", "pt-BR", …

/** Flat or one-level-deep string map */
export type Messages = Record<string, string | Record<string, string>>;

/** Page namespace — corresponds to a JSON file name */
export type Namespace =
  | "common"
  | "home"
  | "benchmarks"
  | "methodology"
  | "about";

/** Merged messages for one request: common + page namespace */
export type T = (key: string, vars?: Record<string, string | number>) => string;

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_LOCALE: Locale = "en";
export const SUPPORTED_LOCALES: Locale[] = ["en"]; // extend as languages are added

const LOCALES_DIR = resolve("./locales");

// =============================================================================
// In-memory cache
// key: "{locale}/{namespace}" → Messages
// =============================================================================

const cache = new Map<string, Messages>();

// =============================================================================
// Loader
// =============================================================================

function loadMessages(locale: Locale, namespace: Namespace): Messages {
  const key = `${locale}/${namespace}`;

  if (cache.has(key)) return cache.get(key)!;

  const filePath = join(LOCALES_DIR, locale, `${namespace}.json`);

  if (!existsSync(filePath)) {
    // Fall back to English silently
    if (locale !== DEFAULT_LOCALE) {
      return loadMessages(DEFAULT_LOCALE, namespace);
    }
    throw new Error(`Missing locale file: ${filePath}`);
  }

  const messages = JSON.parse(readFileSync(filePath, "utf-8")) as Messages;
  cache.set(key, messages);
  return messages;
}

/**
 * Preload all namespaces for a locale into the cache.
 * Call this at startup to avoid cold-read latency on first requests.
 */
export function preloadLocale(locale: Locale): void {
  const namespaces: Namespace[] = [
    "common",
    "home",
    "benchmarks",
    "methodology",
    "about",
  ];
  for (const ns of namespaces) {
    try {
      loadMessages(locale, ns);
    } catch {
      // namespace file may not exist for a partially translated locale
    }
  }
}

/** Clear the entire message cache. Used in development to reflect edits. */
export function clearI18nCache(): void {
  cache.clear();
}

// =============================================================================
// Locale detection
// =============================================================================

/**
 * Detect the preferred locale from an HTTP request.
 *
 * Priority order:
 *   1. URL prefix: /fr/benchmarks → "fr"  (not yet implemented — Phase 2)
 *   2. Cookie: locale=fr
 *   3. Accept-Language header: fr-FR,fr;q=0.9,en;q=0.8
 *   4. Default: "en"
 *
 * Only returns a locale that exists in SUPPORTED_LOCALES.
 */
export function detectLocale(req: Request): Locale {
  // 1. Cookie (fast path for returning visitors who switched language)
  const cookie = req.headers.get("cookie") ?? "";
  const cookieMatch = cookie.match(/(?:^|;\s*)locale=([a-z]{2}(?:-[A-Z]{2})?)/);
  if (cookieMatch) {
    const candidate = cookieMatch[1];
    if (SUPPORTED_LOCALES.includes(candidate)) return candidate;
  }

  // 2. Accept-Language header
  const acceptLang = req.headers.get("accept-language") ?? "";
  for (const part of acceptLang.split(",")) {
    const tag = part.split(";")[0].trim();
    // Exact match first
    if (SUPPORTED_LOCALES.includes(tag)) return tag;
    // Language-only match (e.g. "fr" matches "fr-FR")
    const lang = tag.split("-")[0];
    if (SUPPORTED_LOCALES.includes(lang)) return lang;
  }

  return DEFAULT_LOCALE;
}

// =============================================================================
// t() factory
// =============================================================================

/**
 * Build a translation function for a specific locale and page namespace.
 *
 * The returned t() function looks up keys in this priority:
 *   1. page namespace (e.g. "home")
 *   2. common namespace
 *   3. Returns the key itself as fallback (never throws)
 *
 * Keys can be dot-separated for one-level nesting: "hero.title"
 * Variables use {placeholder} syntax: t("hero.subtitle", { count: 13 })
 */
export function makeT(locale: Locale, namespace: Namespace): T {
  const pageMessages = loadMessages(locale, namespace);
  const commonMessages = loadMessages(locale, "common");

  return function t(
    key: string,
    vars?: Record<string, string | number>,
  ): string {
    // Dot-notation lookup (one level only)
    const [section, field] = key.includes(".")
      ? key.split(".", 2)
      : [null, key];

    let value: string | undefined;

    if (section) {
      const pageSection = pageMessages[section];
      if (pageSection && typeof pageSection === "object") {
        value = (pageSection as Record<string, string>)[field];
      }
      if (value === undefined) {
        const commonSection = commonMessages[section];
        if (commonSection && typeof commonSection === "object") {
          value = (commonSection as Record<string, string>)[field];
        }
      }
    } else {
      value =
        (typeof pageMessages[field] === "string"
          ? (pageMessages[field] as string)
          : undefined) ??
        (typeof commonMessages[field] === "string"
          ? (commonMessages[field] as string)
          : undefined);
    }

    // Fallback to key
    if (value === undefined) {
      console.warn(`[i18n] Missing key: ${locale}/${namespace}/${key}`);
      return key;
    }

    // Variable substitution
    if (vars) {
      return value.replace(
        /\{(\w+)\}/g,
        (_, name) => String(vars[name] ?? `{${name}}`),
      );
    }

    return value;
  };
}
```

---

## Step 3 — Eta configuration (`src/server/eta.ts`)

A singleton Eta instance configured once. Page renderers import `renderTemplate()`
and pass it a template name, a `t()` function, and page-specific data.

```typescript
// src/server/eta.ts

import { Eta } from "eta";
import { resolve } from "path";

const TEMPLATES_DIR = resolve("./src/templates");

/** Singleton Eta instance with file-based template loading and caching */
const eta = new Eta({
  views: TEMPLATES_DIR,
  cache: true,          // compiled templates cached in memory across requests
  rmWhitespace: false,  // preserve whitespace — important for readable HTML output
  autoEscape: true,     // escape by default; use <%~ %> for trusted HTML
  useWith: false,       // explicit `it.` prefix — no implicit scope pollution
  varName: "it",
});

/**
 * Render a named template.
 *
 * @param name - Template file name without extension, e.g. "home"
 * @param data - Data object accessible as `it` in the template
 * @returns Rendered HTML string
 */
export function renderTemplate(name: string, data: Record<string, unknown>): string {
  return eta.render(name, data);
}

/**
 * Clear Eta's compiled template cache.
 * Call this in development when a .eta file changes.
 */
export function clearTemplateCache(): void {
  // Eta v4 exposes the internal cache via the instance
  (eta as any).templatesSync.cache.clear?.();
}
```

---

## Step 4 — Eta templates (`src/templates/`)

### Template conventions

- File extension: `.eta`
- Data is accessed via `it.` prefix: `it.t("hero.title")`
- Escaped output: `<%= it.t("key") %>` — for plain text (Eta escapes HTML)
- Unescaped output: `<%~ it.t("key") %>` — for values that already contain HTML
  (`<strong>`, `<code>`, `<a>`) — use only for keys from trusted locale files
- Dynamic values from the server: `it.count`, `it.libs`, `it.lib`, etc.
- The `it.t()` function is the `T` built by `makeT()` for this request's locale

### `src/templates/shell.eta`

The outer HTML document. Replaces the `renderShell()` function's HTML output.
The navigation and footer HTML currently embedded in `shell.ts` move here.
The TypeScript `shell.ts` becomes logic-only: it builds the data object and
calls `renderTemplate("shell", data)`.

```html
<!DOCTYPE html>
<html lang="<%= it.locale %>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><%= it.title %></title>
    <meta name="description" content="<%= it.description %>">
    <link rel="canonical" href="<%= it.url %>">
    <meta property="og:type" content="<%= it.ogType %>">
    <meta property="og:title" content="<%= it.title %>">
    <meta property="og:description" content="<%= it.description %>">
    <meta property="og:url" content="<%= it.url %>">
    <meta property="og:site_name" content="virtuallist.io">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="<%= it.title %>">
    <meta name="twitter:description" content="<%= it.description %>">
    <style><%~ it.criticalCss %></style>
    <link rel="stylesheet" href="/dist/benchmarks/styles.css">
    <%~ it.extraHead %>
</head>
<body>
    <header class="site-header">
      <nav class="nav">
        <a href="/" class="nav__logo">
          <span class="nav__logo-icon">⚡</span>
          <span class="nav__logo-text">virtuallist.io</span>
        </a>
        <div class="nav__links">
          <% it.navItems.forEach(function(item) { %>
            <a href="<%= item.href %>"
               class="nav__link<%= item.slug === it.activeNav ? ' nav__link--active' : '' %>">
              <%= it.t("nav." + item.slug) %>
            </a>
          <% }) %>
        </div>
        <a href="https://github.com/floor/virtuallist.io"
           class="nav__github"
           target="_blank"
           rel="noopener noreferrer"
           aria-label="<%= it.t('nav.github_label') %>">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
      </nav>
    </header>

    <main<%= it.mainClass ? ' class="' + it.mainClass + '"' : '' %>>
      <%~ it.content %>
    </main>

    <footer class="site-footer">
      <div class="footer__inner">
        <p class="footer__text">
          <strong>virtuallist.io</strong> — <%~ it.t("footer.tagline") %>
        </p>
        <p class="footer__text footer__text--secondary">
          <%= it.t("footer.disclaimer") %>
          <br>
          <a href="/methodology"><%= it.t("footer.link_methodology") %></a>
          ·
          <a href="/about"><%= it.t("footer.link_about") %></a>
          ·
          <a href="/about/contribute"><%= it.t("footer.link_contribute") %></a>
          ·
          <a href="/about/api"><%= it.t("footer.link_api") %></a>
          ·
          <a href="https://github.com/floor/virtuallist.io"
             target="_blank"
             rel="noopener noreferrer"><%= it.t("footer.link_github") %></a>
        </p>
      </div>
    </footer>

    <%~ it.extraBody %>
</body>
</html>
```

### `src/templates/home.eta`

Only the `<main>` content. The shell template wraps it. Library cards loop over
`it.libs` (grouped by ecosystem), features loop over `it.features` (array of
`{icon, titleKey, descKey}`), steps loop over `it.steps`.

```html
<section class="hero">
  <div class="hero__inner">
    <div class="hero__badge"><%= it.t("hero.badge") %></div>
    <h1 class="hero__title"><%~ it.t("hero.title").replace("\n", "<br>") %></h1>
    <p class="hero__subtitle"><%~ it.t("hero.subtitle", { count: it.count }) %></p>
    <div class="hero__actions">
      <a href="/benchmarks" class="hero__btn hero__btn--primary"><%= it.t("hero.cta_primary") %></a>
      <a href="/methodology" class="hero__btn hero__btn--secondary"><%= it.t("hero.cta_secondary") %></a>
    </div>
  </div>
</section>

<section class="libs">
  <div class="libs__inner">
    <h2 class="section-title"><%= it.t("libraries.title") %></h2>
    <p class="section-desc"><%= it.t("libraries.desc") %></p>
    <% it.ecosystems.forEach(function(group) { %>
      <div class="libs__ecosystem">
        <h3 class="libs__ecosystem-label"><%= group.label %></h3>
        <div class="libs__grid">
          <% group.libs.forEach(function(lib) { %>
            <a href="/benchmarks/<%= lib.slug %>" class="lib-card">
              <div class="lib-card__header">
                <span class="lib-card__name"><%= lib.name %></span>
              </div>
              <p class="lib-card__tagline"><%= lib.tagline %></p>
              <div class="lib-card__links">
                <span class="lib-card__npm"><%= lib.npm %></span>
              </div>
            </a>
          <% }) %>
        </div>
      </div>
    <% }) %>
  </div>
</section>

<section class="features">
  <div class="features__inner">
    <h2 class="section-title"><%= it.t("features.title") %></h2>
    <div class="features__grid">
      <% it.features.forEach(function(f) { %>
        <div class="feature-card">
          <div class="feature-card__icon"><%= f.icon %></div>
          <h3 class="feature-card__title"><%= it.t("features." + f.titleKey) %></h3>
          <p class="feature-card__desc"><%= it.t("features." + f.descKey) %></p>
        </div>
      <% }) %>
    </div>
  </div>
</section>

<section class="how-it-works">
  <div class="how-it-works__inner">
    <h2 class="section-title"><%= it.t("how.title") %></h2>
    <div class="steps">
      <% it.steps.forEach(function(step, i) { %>
        <div class="step">
          <div class="step__number"><%= i + 1 %></div>
          <div class="step__content">
            <h3 class="step__title"><%= it.t("how." + step.titleKey) %></h3>
            <p class="step__desc"><%= it.t("how." + step.descKey) %></p>
          </div>
        </div>
      <% }) %>
    </div>
  </div>
</section>
```

Templates for the remaining pages (`benchmarks-overview.eta`,
`benchmarks-library.eta`, `methodology.eta`, `about.eta`, `about-api.eta`,
`about-contribute.eta`) follow the same pattern and are built during the
refactor using the existing HTML in the current `.ts` files as the source of
truth for structure.

---

## Step 5 — Updated page renderers

Page renderers become pure logic: detect locale, load messages, collect data
from the registry, call `renderTemplate()`, return a `Response`.

### Example: `src/server/pages/home.ts` after refactor

```typescript
// src/server/pages/home.ts

import { SITE, IS_PROD } from "../config";
import { renderTemplate } from "../eta";
import { makeT, detectLocale, type Locale } from "../i18n";
import { getLibrariesByEcosystem, getEcosystemLabel, getLibraryCount } from "../registry";
import { CRITICAL_CSS, NAV_ITEMS } from "../shell";

const pageCache = new Map<Locale, string>();

export function clearHomeCache(): void {
  pageCache.clear();
}

export function renderHomepage(req: Request): Response {
  const locale = detectLocale(req);

  if (IS_PROD && pageCache.has(locale)) {
    return new Response(pageCache.get(locale)!, htmlHeaders());
  }

  const t = makeT(locale, "home");
  const tCommon = makeT(locale, "common");

  // Build data for the template
  const byEcosystem = getLibrariesByEcosystem();
  const ecosystemOrder = ["react", "vue", "solid", "svelte", "vanilla", "multi"] as const;

  const ecosystems = ecosystemOrder
    .map((eco) => ({
      label: getEcosystemLabel(eco),
      libs: (byEcosystem.get(eco) ?? []).map((lib) => ({
        slug: lib.slug,
        name: lib.name,
        tagline: lib.tagline,
        npm: lib.npm,
      })),
    }))
    .filter((g) => g.libs.length > 0);

  const features = [
    { icon: "🎯", titleKey: "fair_title",        descKey: "fair_desc" },
    { icon: "🌍", titleKey: "crowdsourced_title", descKey: "crowdsourced_desc" },
    { icon: "📊", titleKey: "metrics_title",      descKey: "metrics_desc" },
    { icon: "🔬", titleKey: "stress_title",       descKey: "stress_desc" },
    { icon: "⚡", titleKey: "speeds_title",       descKey: "speeds_desc" },
    { icon: "🔓", titleKey: "open_title",         descKey: "open_desc" },
  ];

  const steps = [
    { titleKey: "step1_title", descKey: "step1_desc" },
    { titleKey: "step2_title", descKey: "step2_desc" },
    { titleKey: "step3_title", descKey: "step3_desc" },
    { titleKey: "step4_title", descKey: "step4_desc" },
  ];

  // Render page content via Eta
  const content = renderTemplate("home", { t, ecosystems, features, steps, count: getLibraryCount() });

  // Wrap in shell
  const html = renderTemplate("shell", {
    locale,
    title: t("meta.title"),
    description: t("meta.description"),
    url: `${SITE}/`,
    content,
    ogType: "website",
    activeNav: undefined,
    navItems: NAV_ITEMS,
    t: tCommon,
    criticalCss: CRITICAL_CSS,
    extraHead: HOME_CSS_TAG,
    extraBody: "",
    mainClass: "",
  });

  if (IS_PROD) pageCache.set(locale, html);

  return new Response(html, htmlHeaders());
}

function htmlHeaders(): ResponseInit {
  return {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": IS_PROD
        ? "public, max-age=3600, must-revalidate"
        : "no-cache, no-store, must-revalidate",
    },
  };
}

// Page-specific CSS tag (the CSS string itself moves to a .css file or stays here)
const HOME_CSS_TAG = `<link rel="stylesheet" href="/dist/home.css">`;
// Note: during the refactor, inline CSS constants can stay as-is initially
// and be migrated to external files in a follow-up pass.
```

### Router change

The router must pass `req` to page renderers so they can detect the locale:

```typescript
// Before
function resolveHomepage(pathname: string): Response | null {
  if (pathname === "/" || pathname === "") return renderHomepage();
  return null;
}

// After
function resolveHomepage(pathname: string, req: Request): Response | null {
  if (pathname === "/" || pathname === "") return renderHomepage(req);
  return null;
}
```

---

## Step 6 — CSS files

The current architecture inlines page CSS as TypeScript string constants
(`HOME_CSS`, `BENCH_CSS`, `METHODOLOGY_CSS`, `ABOUT_CSS`). These do not
need to move in the same PR as the i18n refactor, but should be migrated
to proper `.css` files in a follow-up:

```
styles/
├── critical.css      ← moved from CRITICAL_CSS in shell.ts
├── home.css          ← moved from HOME_CSS in home.ts
├── benchmarks.css    ← moved from BENCH_CSS in benchmarks.ts
├── methodology.css   ← moved from METHODOLOGY_CSS in methodology.ts
└── about.css         ← moved from ABOUT_CSS in about.ts
```

The build script processes these with the existing CSS minifier and outputs
them to `dist/`. The shell template links `critical.css` inline (read at
startup with `readFileSync`) and each page links its own stylesheet via the
`extraHead` slot.

This can be done as a separate PR after the i18n refactor lands.

---

## Step 7 — Translation pipeline integration

Once the refactor is complete, `locales/en/` is the only source that needs
maintaining by hand. Adding a new language follows the same workflow as the
existing translations project:

1. Copy `locales/en/` to `locales/fr/`
2. Run the Claude translation script pointed at the new JSON files
3. Add `"fr"` to `SUPPORTED_LOCALES` in `src/server/i18n.ts`
4. Add language-prefixed sitemap entries (Phase 2 URL routing)

The JSON format (flat keys, `{placeholder}` syntax) is identical to what the
translation pipeline already handles for other projects. No translation
infrastructure changes are needed.

---

## Phase 2 — URL-prefixed routes (later)

Once multiple languages are live, visitors benefit from language-specific
URLs for SEO: `/fr/benchmarks`, `/de/methodology`, etc.

This requires:
- Router change: detect `/fr/` prefix, strip it, pass `locale: "fr"` through
  to renderers (instead of detecting from Accept-Language)
- Sitemap: emit `<xhtml:link rel="alternate">` hreflang entries per language
- A language switcher UI component in the shell
- 301 redirects from bare `/benchmarks` to `/{detected-locale}/benchmarks`
  (or serve both and set canonical to the language-prefixed URL)

This is a separate workstream and should not block the initial i18n refactor.

---

## Implementation order

Do these in sequence. Each step is independently mergeable.

1. **Create `locales/en/` JSON files** — no code changes, just content extraction.
   Verify every string currently in the `.ts` files has a corresponding key.

2. **Create `src/server/i18n.ts`** — the loader and `makeT()` factory. Write unit
   tests for key lookup, variable substitution, missing-key fallback, and locale
   detection.

3. **Create `src/server/eta.ts`** — the Eta singleton. Verify `renderTemplate()`
   works with a trivial template before touching any page.

4. **Create `src/templates/shell.eta`** — migrate the shell HTML. Update
   `src/server/shell.ts` to export `CRITICAL_CSS` and `NAV_ITEMS` as data, remove
   `buildNav()` and `buildFooter()` HTML functions, and call `renderTemplate("shell", …)`.
   All pages still work because they pass `content` as a string.

5. **Migrate one page at a time** — start with the simplest (home), confirm it
   works end-to-end (locale detection → template rendering → correct HTML output →
   200 response), then proceed to benchmarks, methodology, about.

6. **Update the router** to pass `req` to page renderers.

7. **Verify the page cache** still works correctly per locale key.

8. **Update the docs** (`docs/pages.md`, `docs/server.md`, `docs/architecture.md`,
   `docs/styling.md`) to reflect the new structure.

---

## Files touched

| Action | File |
|--------|------|
| Create | `locales/en/common.json` |
| Create | `locales/en/home.json` |
| Create | `locales/en/benchmarks.json` |
| Create | `locales/en/methodology.json` |
| Create | `locales/en/about.json` |
| Create | `src/server/i18n.ts` |
| Create | `src/server/eta.ts` |
| Create | `src/templates/shell.eta` |
| Create | `src/templates/home.eta` |
| Create | `src/templates/benchmarks-overview.eta` |
| Create | `src/templates/benchmarks-library.eta` |
| Create | `src/templates/methodology.eta` |
| Create | `src/templates/about.eta` |
| Create | `src/templates/about-api.eta` |
| Create | `src/templates/about-contribute.eta` |
| Rewrite | `src/server/shell.ts` (logic only, no HTML strings) |
| Rewrite | `src/server/pages/home.ts` (logic only) |
| Rewrite | `src/server/pages/benchmarks.ts` (logic only) |
| Rewrite | `src/server/pages/methodology.ts` (logic only) |
| Rewrite | `src/server/pages/about.ts` (logic only) |
| Update | `src/server/router.ts` (pass `req` to page renderers) |
| Update | `docs/architecture.md` |
| Update | `docs/server.md` |
| Update | `docs/pages.md` |
| Update | `docs/styling.md` |

No changes to: `benchmarks/`, `src/api/`, `src/server/registry.ts`,
`src/server/config.ts`, `src/server/static.ts`, `src/server/sitemap.ts`,
`scripts/`, `package.json` (Eta is already a dependency).