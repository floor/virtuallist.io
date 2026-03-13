// src/server/pages/about.ts
// About section renderer — three public-facing sub-pages under /about/*.
//
// Routes:
//   /about            → What virtuallist.io is, neutrality, open source
//   /about/api        → Public API reference for querying crowdsourced data
//   /about/contribute → How to add a library (audience: library authors)

import { SITE, IS_PROD } from "../config";
import { renderShell } from "../shell";
import { getLibraryCount } from "../registry";

// =============================================================================
// Types
// =============================================================================

type AboutSlug = "about" | "api" | "contribute";

// =============================================================================
// Cache
// =============================================================================

const pageCache = new Map<AboutSlug, string>();

export function clearAboutCache(): void {
  pageCache.clear();
}

// =============================================================================
// Helpers
// =============================================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// =============================================================================
// Shared Sidebar
// =============================================================================

interface SidebarItem {
  slug: AboutSlug;
  label: string;
  href: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { slug: "about",      label: "About",      href: "/about" },
  { slug: "api",        label: "API",        href: "/about/api" },
  { slug: "contribute", label: "Contribute", href: "/about/contribute" },
];

function buildSidebar(active: AboutSlug): string {
  const links = SIDEBAR_ITEMS.map((item) => {
    const cls = `about-sidebar__link${item.slug === active ? " about-sidebar__link--active" : ""}`;
    return `<a href="${item.href}" class="${cls}">${escapeHtml(item.label)}</a>`;
  }).join("\n      ");

  return `
    <aside class="about-sidebar">
      ${links}
    </aside>`;
}

// =============================================================================
// Page: /about
// =============================================================================

function buildAboutContent(): string {
  const count = getLibraryCount();

  return `
    <div class="about-page">
      <header class="about-header">
        <h1 class="about-header__title">About</h1>
        <p class="about-header__subtitle">
          virtuallist.io is an independent, open-source benchmark platform for
          virtual list libraries.
        </p>
      </header>

      <section class="about-section">
        <h2 class="about-section__title">What it is</h2>
        <p class="about-text">
          virtuallist.io measures the real-world performance of virtual list and virtual
          scroll libraries across React, Vue, SolidJS, Svelte, and Vanilla JS. Every
          benchmark runs live in the visitor's browser using real DOM operations —
          no pre-recorded results, no synthetic scores.
        </p>
        <p class="about-text">
          Currently benchmarking <strong>${count} libraries</strong>. Results from every run
          are stored anonymously and aggregated to build a statistically meaningful
          picture of performance across different hardware, browsers, and library versions.
        </p>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Neutrality</h2>
        <p class="about-text">
          Every library on this site is treated as an equal. There is one measurement
          pipeline — <code>benchmarkLibrary()</code> — and every library passes through it
          identically. No library gets a different warmup, a more forgiving timeout, or
          a different DOM template. The same 7-element row structure, the same 48&nbsp;px
          item height, the same overscan of 5 is applied to every benchmark.
        </p>
        <p class="about-text">
          Execution order is randomised per run with a coin flip to eliminate JIT warmth
          and garbage-collection bias. The full methodology is published at
          <a href="/methodology" class="about-link">/methodology</a>.
        </p>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Crowdsourced data</h2>
        <p class="about-text">
          Every time someone runs a benchmark, the result is silently persisted to a
          database — no account required, no tracking, no cookies. Over time this builds
          a dataset of real-world performance across a wide range of devices and browsers.
        </p>
        <p class="about-text">
          The aggregated data is queryable via the public
          <a href="/about/api" class="about-link">API</a>. Confidence indicators show
          how many runs back each result: high confidence requires at least 20 runs,
          moderate at least 5.
        </p>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Open source</h2>
        <p class="about-text">
          The entire platform — measurement engine, server, adapters, database schema —
          is open source and available on GitHub. Library authors are encouraged to
          review the adapter for their library, raise issues if they spot a measurement
          flaw, and submit pull requests to improve coverage or fairness.
        </p>
        <div class="about-cta-row">
          <a href="https://github.com/floor/virtuallist.io"
             class="about-cta-btn"
             target="_blank"
             rel="noopener noreferrer">
            View on GitHub
          </a>
          <a href="/about/contribute" class="about-cta-btn about-cta-btn--secondary">
            Add your library →
          </a>
        </div>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Privacy</h2>
        <p class="about-text">
          Running a benchmark submits anonymous performance data: metric values, item
          count, browser user agent, CPU core count, screen dimensions, and the stress
          level used. No IP addresses are stored. No cookies are set. No tracking scripts
          are loaded. The data is used solely for aggregated performance statistics.
        </p>
      </section>
    </div>`;
}

// =============================================================================
// Page: /about/api
// =============================================================================

function buildApiContent(): string {
  return `
    <div class="about-page">
      <header class="about-header">
        <h1 class="about-header__title">API</h1>
        <p class="about-header__subtitle">
          Query the crowdsourced benchmark database. All endpoints are public,
          read-only (except the submit endpoint), and return JSON with CORS headers.
        </p>
      </header>

      <section class="about-section">
        <h2 class="about-section__title">Base URL</h2>
        <pre class="about-pre">https://virtuallist.io/api</pre>
        <p class="about-text">
          All responses include <code>Access-Control-Allow-Origin: *</code> so the API
          can be queried from any origin, including browser scripts and local tools.
        </p>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Endpoints</h2>

        <div class="api-endpoint">
          <div class="api-endpoint__header">
            <span class="api-method api-method--get">GET</span>
            <code class="api-path">/api/benchmarks/stats</code>
          </div>
          <p class="api-desc">
            Aggregated statistics for a library — median, mean, p5, p95, stddev, and
            sample count for each metric, grouped by library version and item count.
          </p>
          <div class="api-params">
            <div class="api-param">
              <code class="api-param__name">librarySlug</code>
              <span class="api-param__desc">Filter by library slug (e.g. <code>react-window</code>)</span>
            </div>
            <div class="api-param">
              <code class="api-param__name">itemCount</code>
              <span class="api-param__desc">Filter by item count — <code>10000</code>, <code>100000</code>, or <code>1000000</code></span>
            </div>
            <div class="api-param">
              <code class="api-param__name">libraryVersion</code>
              <span class="api-param__desc">Filter by version string</span>
            </div>
            <div class="api-param">
              <code class="api-param__name">stressMs</code>
              <span class="api-param__desc">Filter by stress level — <code>0</code>, <code>3</code>, <code>5</code>, or <code>7</code></span>
            </div>
          </div>
          <pre class="about-pre">GET /api/benchmarks/stats?librarySlug=react-window&amp;itemCount=10000

{
  "items": [
    {
      "librarySlug": "react-window",
      "libraryVersion": "1.8.10",
      "itemCount": 10000,
      "totalRuns": 47,
      "metrics": [
        {
          "label": "Render",
          "unit": "ms",
          "better": "lower",
          "median": 8.7,
          "mean": 9.1,
          "p5": 6.9,
          "p95": 14.2,
          "stddev": 2.1,
          "sampleCount": 47
        }
      ]
    }
  ],
  "total": 1
}</pre>
        </div>

        <div class="api-endpoint">
          <div class="api-endpoint__header">
            <span class="api-method api-method--get">GET</span>
            <code class="api-path">/api/benchmarks/history</code>
          </div>
          <p class="api-desc">
            Daily aggregated time-series data for a single metric and library. Useful
            for drawing trend charts. Results are grouped by calendar day and library version.
          </p>
          <div class="api-params">
            <div class="api-param">
              <code class="api-param__name">librarySlug</code>
              <span class="api-param__req">required</span>
              <span class="api-param__desc">Library to query</span>
            </div>
            <div class="api-param">
              <code class="api-param__name">metric</code>
              <span class="api-param__req">required</span>
              <span class="api-param__desc">Metric label — <code>Render</code>, <code>Memory</code>, <code>Scroll FPS</code>, <code>P95 Frame</code></span>
            </div>
            <div class="api-param">
              <code class="api-param__name">days</code>
              <span class="api-param__desc">Lookback window in days, default <code>90</code>, max <code>365</code></span>
            </div>
            <div class="api-param">
              <code class="api-param__name">itemCount</code>
              <span class="api-param__desc">Filter by item count</span>
            </div>
          </div>
          <pre class="about-pre">GET /api/benchmarks/history?librarySlug=react-window&amp;metric=Render

{
  "items": [
    {
      "date": "2025-01-14",
      "libraryVersion": "1.8.10",
      "median": 8.5,
      "mean": 8.9,
      "p5": 7.1,
      "p95": 12.3,
      "sampleCount": 12
    }
  ],
  "total": 1
}</pre>
        </div>

        <div class="api-endpoint">
          <div class="api-endpoint__header">
            <span class="api-method api-method--get">GET</span>
            <code class="api-path">/api/benchmarks/libraries</code>
          </div>
          <p class="api-desc">
            All library slugs that have at least one successful run in the database,
            with version and run count information.
          </p>
          <pre class="about-pre">GET /api/benchmarks/libraries

{
  "items": [
    {
      "librarySlug": "react-window",
      "libraryVersion": "1.8.10",
      "totalRuns": 47,
      "lastSeen": "2025-01-15 11:42:00"
    }
  ],
  "total": 1
}</pre>
        </div>

        <div class="api-endpoint">
          <div class="api-endpoint__header">
            <span class="api-method api-method--get">GET</span>
            <code class="api-path">/api/benchmarks/summary</code>
          </div>
          <p class="api-desc">
            High-level counts across the entire database — total runs, unique libraries,
            first and last run timestamps, top libraries by run count.
          </p>
        </div>

        <div class="api-endpoint">
          <div class="api-endpoint__header">
            <span class="api-method api-method--get">GET</span>
            <code class="api-path">/api/benchmarks/browsers</code>
          </div>
          <p class="api-desc">
            Browser breakdown of all stored runs, parsed from user agent strings.
          </p>
        </div>

        <div class="api-endpoint">
          <div class="api-endpoint__header">
            <span class="api-method api-method--get">GET</span>
            <code class="api-path">/api/health</code>
          </div>
          <p class="api-desc">Server health check.</p>
          <pre class="about-pre">{ "status": "ok", "timestamp": "2025-01-15T12:00:00.000Z" }</pre>
        </div>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Rate limiting</h2>
        <p class="about-text">
          The <code>POST /api/benchmarks</code> endpoint (used internally by the
          benchmark runner) is rate-limited to 30 submissions per IP per minute.
          The read-only <code>GET</code> endpoints have no rate limit.
        </p>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Caching</h2>
        <p class="about-text">
          <code>GET</code> responses carry
          <code>Cache-Control: public, max-age=60, stale-while-revalidate=300</code>.
          Responses are safe to cache for up to a minute; stale responses may be
          served for up to 5 minutes while the cache revalidates in the background.
        </p>
      </section>
    </div>`;
}

// =============================================================================
// Page: /about/contribute
// =============================================================================

function buildContributeContent(): string {
  return `
    <div class="about-page">
      <header class="about-header">
        <h1 class="about-header__title">Contribute</h1>
        <p class="about-header__subtitle">
          Add your library to virtuallist.io so the community can compare its
          performance alongside every other virtual list implementation.
        </p>
      </header>

      <section class="about-section">
        <h2 class="about-section__title">How it works</h2>
        <p class="about-text">
          Every library is benchmarked through the same measurement pipeline using a
          small adapter file you provide. The adapter implements two functions —
          <code>create()</code> and <code>destroy()</code> — and the engine handles
          everything else: timing, memory snapshots, scroll measurement, and result
          storage.
        </p>
        <p class="about-text">
          Your library is treated identically to every other library on the site. Same
          item height, same DOM template, same scroll speeds, same measurement phases.
        </p>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Requirements</h2>
        <p class="about-text">
          Your adapter must follow these rules so the benchmarks stay comparable:
        </p>
        <div class="about-req-list">
          <div class="about-req">
            <span class="about-req__label">Item height</span>
            <span class="about-req__desc">
              Use the exported <code>ITEM_HEIGHT</code> constant (48 px). All libraries
              use the same row height so scroll measurements are directly comparable.
            </span>
          </div>
          <div class="about-req">
            <span class="about-req__label">Overscan</span>
            <span class="about-req__desc">
              Use <code>DEFAULT_OVERSCAN</code> (5 items) wherever your library exposes
              an overscan option, or <code>DEFAULT_OVERSCAN × ITEM_HEIGHT</code> for
              pixel-based overscan.
            </span>
          </div>
          <div class="about-req">
            <span class="about-req__label">DOM template</span>
            <span class="about-req__desc">
              Use one of the four shared template helpers — do not write a custom item
              template. All libraries must render the same 7-element DOM structure per row.
            </span>
          </div>
          <div class="about-req">
            <span class="about-req__label">Clean destroy</span>
            <span class="about-req__desc">
              <code>destroy()</code> must fully unmount the component and remove all
              DOM nodes. Leftover nodes contaminate subsequent measurements.
            </span>
          </div>
        </div>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Steps</h2>

        <div class="about-steps">
          <div class="about-step">
            <div class="about-step__number">1</div>
            <div class="about-step__content">
              <h3 class="about-step__title">Fork the repository</h3>
              <p class="about-step__desc">
                Fork
                <a href="https://github.com/floor/virtuallist.io"
                   class="about-link"
                   target="_blank"
                   rel="noopener noreferrer">github.com/floor/virtuallist.io</a>
                and clone it locally.
              </p>
            </div>
          </div>

          <div class="about-step">
            <div class="about-step__number">2</div>
            <div class="about-step__content">
              <h3 class="about-step__title">Register in the registry</h3>
              <p class="about-step__desc">
                Add an entry to <code>src/server/registry.ts</code> with your library's
                slug, name, tagline, ecosystem, npm package name, and GitHub URL. This
                one change makes the library appear in navigation, the sitemap, and the
                homepage grid.
              </p>
              <pre class="about-pre">{
  slug: "my-library",
  name: "My Library",
  tagline: "One sentence about what makes it different.",
  ecosystem: "react",
  npm: "my-library",
  github: "https://github.com/you/my-library",
  npmUrl: "https://www.npmjs.com/package/my-library",
  enabled: true,
  order: 70,
}</pre>
            </div>
          </div>

          <div class="about-step">
            <div class="about-step__number">3</div>
            <div class="about-step__content">
              <h3 class="about-step__title">Install the package</h3>
              <pre class="about-pre">bun add my-library</pre>
            </div>
          </div>

          <div class="about-step">
            <div class="about-step__number">4</div>
            <div class="about-step__content">
              <h3 class="about-step__title">Create the adapter</h3>
              <p class="about-step__desc">
                Copy <code>benchmarks/libraries/_TEMPLATE.js</code> to
                <code>benchmarks/libraries/my-library.js</code> and implement
                <code>create()</code> and <code>destroy()</code>.
              </p>
              <pre class="about-pre">import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  createRealisticReactChildren,
} from "../runner.js";

let React, ReactDOM, VirtualList;

const loadDependencies = async () => {
  if (!React) {
    React = await import("react");
    const client = await import("react-dom/client");
    ReactDOM = client.createRoot ? client : (client.default ?? client);
    const mod = await import("my-library");
    VirtualList = mod.VirtualList;
  }
  return true;
};

defineLibrary({
  slug: "my-library",
  name: "My Library",
  ecosystem: "react",

  create: async (container, itemCount) => {
    await loadDependencies();
    const root = ReactDOM.createRoot(container);
    root.render(
      React.createElement(VirtualList, {
        height: container.clientHeight || 600,
        itemCount,
        itemSize: ITEM_HEIGHT,
        overscanCount: DEFAULT_OVERSCAN,
        children: ({ index, style }) =>
          React.createElement(
            "div",
            { className: "bench-item", style },
            ...createRealisticReactChildren(React, index),
          ),
      })
    );
    return root;
  },

  destroy: async (root) => {
    root?.unmount();
  },
});</pre>
            </div>
          </div>

          <div class="about-step">
            <div class="about-step__number">5</div>
            <div class="about-step__content">
              <h3 class="about-step__title">Import in script.js</h3>
              <p class="about-step__desc">
                Add one line to <code>benchmarks/script.js</code>:
              </p>
              <pre class="about-pre">import "./libraries/my-library.js";</pre>
            </div>
          </div>

          <div class="about-step">
            <div class="about-step__number">6</div>
            <div class="about-step__content">
              <h3 class="about-step__title">Build and verify</h3>
              <pre class="about-pre">bun run seed:db
bun run build
bun run dev
# open http://localhost:3456/benchmarks/my-library
# click Run — all four metrics should complete</pre>
            </div>
          </div>

          <div class="about-step">
            <div class="about-step__number">7</div>
            <div class="about-step__content">
              <h3 class="about-step__title">Open a pull request</h3>
              <p class="about-step__desc">
                Submit the PR against the <code>main</code> branch. Describe the library
                briefly and confirm that all four core metrics complete without errors.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Template helpers</h2>
        <p class="about-text">
          Choose the helper that matches your library's rendering model. Every helper
          produces the same 7-element DOM structure — avatar, title, subtitle, badge,
          and timestamp — so all results are directly comparable.
        </p>
        <div class="about-helpers">
          <div class="about-helper">
            <code class="about-helper__name">createRealisticReactChildren(React, index)</code>
            <span class="about-helper__desc">Returns a <code>React.ReactElement[]</code>. Use for all React-based libraries.</span>
          </div>
          <div class="about-helper">
            <code class="about-helper__name">benchmarkTemplate(_item, index)</code>
            <span class="about-helper__desc">Returns an HTML string (inner content only). Use for libraries with an HTML template callback.</span>
          </div>
          <div class="about-helper">
            <code class="about-helper__name">populateRealisticDOMChildren(el, index)</code>
            <span class="about-helper__desc">Mutates a DOM element in place. Use for SolidJS or vanilla DOM approaches.</span>
          </div>
          <div class="about-helper">
            <code class="about-helper__name">generateRealisticItemHTML(index, height)</code>
            <span class="about-helper__desc">Returns a complete <code>&lt;div class="bench-item"&gt;</code> HTML string. Use for libraries that require pre-built row strings.</span>
          </div>
        </div>
      </section>

      <section class="about-section">
        <h2 class="about-section__title">Other ways to contribute</h2>
        <div class="about-contrib-list">
          <div class="about-contrib">
            <strong>Fix a measurement issue</strong>
            <span>If you spot a bias, an inaccuracy, or an unfair condition in any adapter or in the engine itself, open an issue or submit a fix.</span>
          </div>
          <div class="about-contrib">
            <strong>Run benchmarks</strong>
            <span>The simplest contribution: visit any library's benchmark page and click Run. Every result grows the crowdsourced dataset.</span>
          </div>
          <div class="about-contrib">
            <strong>Report a broken adapter</strong>
            <span>If a library's benchmark fails or produces incorrect results, open an issue with the library slug and the error message.</span>
          </div>
        </div>
      </section>
    </div>`;
}

// =============================================================================
// Page assembly
// =============================================================================

function assemblePage(
  slug: AboutSlug,
  title: string,
  description: string,
  content: string,
): string {
  const sidebar = buildSidebar(slug);

  return renderShell({
    title: `${title} — virtuallist.io`,
    description,
    url: `${SITE}/${slug === "about" ? "about" : `about/${slug}`}`,
    content: `
      <div class="about-layout">
        ${sidebar}
        <div class="about-layout__content">
          ${content}
        </div>
      </div>`,
    activeNav: "about",
    extraHead: `<style>${ABOUT_CSS}</style>`,
  });
}

// =============================================================================
// Public API
// =============================================================================

export function renderAboutPage(slug: string | null): Response | null {
  const resolved: AboutSlug =
    slug === null || slug === "about"
      ? "about"
      : slug === "api"
        ? "api"
        : slug === "contribute"
          ? "contribute"
          : null!;

  if (resolved === null) return null;

  if (IS_PROD) {
    const cached = pageCache.get(resolved);
    if (cached !== undefined) {
      return new Response(cached, htmlHeaders());
    }
  }

  let html: string;

  switch (resolved) {
    case "about":
      html = assemblePage(
        "about",
        "About",
        "virtuallist.io is an independent, open-source benchmark platform for virtual list libraries. " +
          "Learn about the neutrality principle, crowdsourced data, and how to contribute.",
        buildAboutContent(),
      );
      break;

    case "api":
      html = assemblePage(
        "api",
        "API",
        "Public API reference for virtuallist.io. Query aggregated benchmark statistics, " +
          "time-series history, and browser breakdowns from the crowdsourced dataset.",
        buildApiContent(),
      );
      break;

    case "contribute":
      html = assemblePage(
        "contribute",
        "Contribute",
        "Add your virtual list library to virtuallist.io. " +
          "Step-by-step guide for library authors: registry entry, adapter code, and submitting a pull request.",
        buildContributeContent(),
      );
      break;
  }

  pageCache.set(resolved, html);

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

// =============================================================================
// Page-specific CSS
// =============================================================================

const ABOUT_CSS = `
/* ── Layout ─────────────────────────────────────────────────────────────── */
.about-layout {
  display: flex;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 1.5rem;
  gap: 2.5rem;
  min-height: calc(100vh - 56px - 120px);
}
.about-layout__content {
  flex: 1;
  min-width: 0;
  padding: 2.5rem 0;
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.about-sidebar {
  position: sticky;
  top: 56px;
  align-self: flex-start;
  width: 180px;
  flex-shrink: 0;
  padding: 2.5rem 0 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.about-sidebar__link {
  display: block;
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  transition: color var(--transition), background var(--transition);
}
.about-sidebar__link:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.about-sidebar__link--active {
  color: var(--accent);
  background: var(--accent-glow);
}

/* ── Page chrome ─────────────────────────────────────────────────────────── */
.about-page {
  max-width: 720px;
}
.about-header {
  margin-bottom: 2.5rem;
}
.about-header__title {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text);
  margin-bottom: 0.5rem;
}
.about-header__subtitle {
  font-size: 1.05rem;
  color: var(--text-secondary);
  line-height: 1.7;
}

/* ── Sections ────────────────────────────────────────────────────────────── */
.about-section {
  margin-bottom: 2.75rem;
}
.about-section__title {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-subtle);
}
.about-text {
  font-size: 0.93rem;
  color: var(--text-secondary);
  line-height: 1.8;
  margin-bottom: 0.65rem;
}
.about-text strong {
  color: var(--text);
  font-weight: 600;
}
.about-text code,
.about-text a code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--accent);
}
.about-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
  transition: color var(--transition);
}
.about-link:hover {
  color: var(--accent-dim);
}

/* ── CTA row ─────────────────────────────────────────────────────────────── */
.about-cta-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 1.25rem;
}
.about-cta-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.55rem 1.25rem;
  border-radius: var(--radius);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 600;
  transition: background var(--transition), color var(--transition), box-shadow var(--transition);
  background: var(--accent);
  color: #fff;
}
.about-cta-btn:hover {
  background: var(--accent-dim);
  box-shadow: 0 0 18px var(--accent-glow);
}
.about-cta-btn--secondary {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.about-cta-btn--secondary:hover {
  color: var(--text);
  background: var(--bg-hover);
  box-shadow: none;
}

/* ── Pre / code blocks ───────────────────────────────────────────────────── */
.about-pre {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.8rem;
  line-height: 1.65;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  overflow-x: auto;
  color: var(--text-secondary);
  white-space: pre;
  margin: 0.75rem 0;
}

/* ── API endpoint cards ──────────────────────────────────────────────────── */
.api-endpoint {
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  margin-bottom: 0.75rem;
}
.api-endpoint__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.api-method {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.api-method--get {
  background: var(--green-dim);
  color: var(--green);
}
.api-method--post {
  background: var(--accent-glow);
  color: var(--accent);
}
.api-path {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.875rem;
  color: var(--text);
  font-weight: 600;
}
.api-desc {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 0.5rem;
}
.api-desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--accent);
}
.api-params {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}
.api-param {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.82rem;
}
.api-param__name {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.8rem;
  color: var(--accent);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  flex-shrink: 0;
}
.api-param__req {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--yellow);
  flex-shrink: 0;
}
.api-param__desc {
  color: var(--text-secondary);
  line-height: 1.5;
}
.api-param__desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

/* ── Requirements list ───────────────────────────────────────────────────── */
.about-req-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.about-req {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.about-req__label {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text);
}
.about-req__desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.55;
}
.about-req__desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--accent);
}

/* ── Steps ───────────────────────────────────────────────────────────────── */
.about-steps {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.about-step {
  display: flex;
  gap: 1rem;
  padding: 1.1rem 1.25rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.about-step__number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--accent-glow);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.85rem;
  flex-shrink: 0;
  margin-top: 0.1rem;
}
.about-step__content {
  flex: 1;
  min-width: 0;
}
.about-step__title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.3rem;
}
.about-step__desc {
  font-size: 0.84rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 0.4rem;
}
.about-step__desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--accent);
}
.about-step__desc a {
  color: var(--accent);
  text-decoration: none;
}
.about-step__desc a:hover {
  color: var(--accent-dim);
  text-decoration: underline;
}

/* ── Template helpers ────────────────────────────────────────────────────── */
.about-helpers {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.about-helper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.about-helper__name {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.78rem;
  color: var(--accent);
}
.about-helper__desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
}
.about-helper__desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

/* ── Other contributions ─────────────────────────────────────────────────── */
.about-contrib-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.about-contrib {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  font-size: 0.85rem;
}
.about-contrib strong {
  color: var(--text);
  font-weight: 600;
}
.about-contrib span {
  color: var(--text-secondary);
  line-height: 1.55;
}

/* ── Responsive ──────────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .about-layout {
    flex-direction: column;
    gap: 0;
    padding: 0 1.5rem;
  }
  .about-sidebar {
    position: static;
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 1rem 0 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .about-sidebar__link {
    font-size: 0.83rem;
    padding: 0.3rem 0.65rem;
  }
  .about-layout__content {
    padding-top: 2rem;
  }
}

@media (max-width: 640px) {
  .about-layout {
    padding: 0 1rem;
  }
  .about-header__title {
    font-size: 1.6rem;
  }
  .about-step {
    flex-direction: column;
    gap: 0.5rem;
  }
  .about-step__number {
    margin-top: 0;
  }
  .about-pre {
    font-size: 0.72rem;
    padding: 0.75rem 1rem;
  }
}
`.trim();
