// src/server/pages/benchmarks.ts
// Benchmark page renderer — overview and individual library benchmark pages.
//
// Renders:
//   /benchmarks          → Overview with all libraries grouped by ecosystem
//   /benchmarks/{slug}   → Individual library benchmark page (interactive)
//
// All HTML lives in src/templates/benchmarks-*.eta.
// All user-facing strings live in locales/{locale}/benchmarks.json + common.json.
// This file is logic only: data collection + template rendering.

import { SITE, IS_PROD } from "../config";
import { renderTemplate } from "../eta";
import { renderShell } from "../shell";
import { makeT, detectLocale, type Locale } from "../i18n";
import {
  getLibrary,
  getLibrariesByEcosystem,
  getEcosystemLabel,
  getLibraryCount,
  type LibraryInfo,
  type Ecosystem,
} from "../registry";

// =============================================================================
// Cache (keyed by locale + slug for multi-language support)
// =============================================================================

const pageCache = new Map<string, string>();

export function clearBenchmarkCache(): void {
  pageCache.clear();
}

// =============================================================================
// Constants
// =============================================================================

const ITEM_COUNTS = [10_000, 100_000, 1_000_000];
const INITIAL_ITEM_COUNT = ITEM_COUNTS[0];

const STRESS_LEVELS = [
  { id: "none", label: "0", ms: 0 },
  { id: "light", label: "3", ms: 3 },
  { id: "medium", label: "5", ms: 5 },
  { id: "heavy", label: "7", ms: 7 },
];

const ECOSYSTEM_ORDER: Ecosystem[] = [
  "react",
  "vue",
  "solid",
  "svelte",
  "vanilla",
  "multi",
];

// =============================================================================
// Helpers
// =============================================================================

function formatItemCount(count: number): string {
  if (count >= 1_000_000) return `${count / 1_000_000}M`;
  if (count >= 1_000) return `${count / 1_000}K`;
  return String(count);
}

let _ecosystemData: ReturnType<typeof _buildEcosystemData> | null = null;

function buildEcosystemData() {
  if (_ecosystemData) return _ecosystemData;
  _ecosystemData = _buildEcosystemData();
  return _ecosystemData;
}

function _buildEcosystemData() {
  const byEcosystem = getLibrariesByEcosystem();
  return ECOSYSTEM_ORDER.map((eco) => ({
    label: getEcosystemLabel(eco),
    libs: (byEcosystem.get(eco) ?? []).map((lib) => ({
      slug: lib.slug,
      name: lib.name,
      tagline: lib.tagline,
      npm: lib.npm,
      npmUrl: lib.npmUrl,
      github: lib.github,
      homepage: lib.homepage,
      ecosystem: lib.ecosystem,
    })),
  })).filter((g) => g.libs.length > 0);
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
// Page Assembly
// =============================================================================

function assembleOverviewPage(locale: string): string {
  const t = makeT(locale, "benchmarks");
  const count = getLibraryCount();
  const ecosystems = buildEcosystemData();

  // Render overview content
  const overviewContent = renderTemplate("benchmarks-overview", {
    t,
    count,
    ecosystems,
  });

  // Render sidebar
  const sidebar = renderTemplate("benchmarks-sidebar", {
    t,
    ecosystems,
    activeSlug: null,
  });

  return renderShell({
    locale,
    title: t("meta.overview_title"),
    description: t("meta.overview_description"),
    url: `${SITE}/benchmarks`,
    content: `
      <div class="bench-layout">
        ${sidebar}
        <div class="bench-layout__content">
          ${overviewContent}
        </div>
      </div>`,
    t,
    activeNav: "benchmarks",
    extraHead: `<style>${BENCH_CSS}</style>`,
    extraBody: "",
    mainClass: "",
  });
}

function assembleLibraryPage(lib: LibraryInfo, locale: string): string {
  const t = makeT(locale, "benchmarks");
  const ecosystems = buildEcosystemData();

  // Render library page content
  const libraryContent = renderTemplate("benchmarks-library", {
    t,
    lib,
    itemCounts: ITEM_COUNTS,
    initialItemCount: INITIAL_ITEM_COUNT,
    stressLevels: STRESS_LEVELS,
    formatItemCount,
  });

  // Render sidebar
  const sidebar = renderTemplate("benchmarks-sidebar", {
    t,
    ecosystems,
    activeSlug: lib.slug,
  });

  return renderShell({
    locale,
    title: t("meta.library_title", { name: lib.name }),
    description: t("meta.library_description", {
      name: lib.name,
      npm: lib.npm,
    }),
    url: `${SITE}/benchmarks/${lib.slug}`,
    content: `
      <div class="bench-layout">
        ${sidebar}
        <div class="bench-layout__content">
          ${libraryContent}
        </div>
      </div>`,
    t,
    activeNav: "benchmarks",
    extraHead: `<style>${BENCH_CSS}</style>`,
    extraBody: `<script type="module" src="/dist/benchmarks/script.js"></script>`,
    mainClass: "",
  });
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Render a benchmark page.
 *
 * @param slug - Library slug, or null for the overview page.
 * @param req  - HTTP request (for locale detection).
 * @returns Response or null if the slug doesn't match any library.
 */
export function renderBenchmarkPage(
  slug: string | null,
  req: Request,
): Response | null {
  const locale = detectLocale(req);
  const cacheKey = `${locale}/${slug ?? "__overview__"}`;

  // Return cached page in production
  if (IS_PROD) {
    const cached = pageCache.get(cacheKey);
    if (cached !== undefined) {
      return new Response(cached, htmlHeaders());
    }
  }

  let html: string;

  if (slug === null) {
    html = assembleOverviewPage(locale);
  } else {
    const lib = getLibrary(slug);
    if (!lib || !lib.enabled) return null;
    html = assembleLibraryPage(lib, locale);
  }

  pageCache.set(cacheKey, html);

  return new Response(html, htmlHeaders());
}

// =============================================================================
// Page-specific CSS
// =============================================================================

const BENCH_CSS = `
/* ── Layout ─────────────────────────────────────────────────────────────── */
.bench-layout {
  display: flex;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 1.5rem;
  gap: 2rem;
  min-height: calc(100vh - 56px - 120px);
}
.bench-layout__content {
  flex: 1;
  min-width: 0;
  padding: 2rem 0;
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */
.sidebar {
  position: sticky;
  top: 56px;
  align-self: flex-start;
  width: 220px;
  flex-shrink: 0;
  padding: 1.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  max-height: calc(100vh - 56px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.sidebar__group {
  margin-top: 0.75rem;
}
.sidebar__group:first-child {
  margin-top: 0;
}
.sidebar__group-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  padding: 0.25rem 0.75rem;
  margin-bottom: 0.15rem;
}
.sidebar__link {
  display: block;
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.84rem;
  font-weight: 500;
  transition: color var(--transition), background var(--transition);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar__link:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.sidebar__link--active {
  color: var(--accent);
  background: var(--accent-glow);
}

/* ── Overview ───────────────────────────────────────────────────────────── */
.bench-overview__header {
  margin-bottom: 2.5rem;
}
.bench-overview__title {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text);
  margin-bottom: 0.75rem;
}
.bench-overview__desc {
  font-size: 1rem;
  color: var(--text-secondary);
  line-height: 1.7;
  max-width: 640px;
  margin-bottom: 1rem;
}
.bench-overview__desc strong {
  color: var(--text);
  font-weight: 600;
}
.bench-overview__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.bench-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 100px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}
.bench-tag code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.72rem;
}
.bench-tag--accent {
  background: var(--accent-glow);
  border-color: transparent;
  color: var(--accent);
}

/* ── Overview Cards ─────────────────────────────────────────────────────── */
.bench-overview__section {
  margin-bottom: 2rem;
}
.bench-overview__ecosystem-label {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  padding-left: 0.125rem;
}
.bench-overview__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}
.bench-overview-card {
  display: flex;
  flex-direction: column;
  padding: 1.1rem 1.25rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  text-decoration: none;
  color: var(--text);
  transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
}
.bench-overview-card:hover {
  border-color: var(--border);
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
}
.bench-overview-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.bench-overview-card__name {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text);
}
.bench-overview-card__ecosystem {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-muted);
  padding: 0.1rem 0.5rem;
  border-radius: 100px;
  background: var(--bg);
}
.bench-overview-card__desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
  flex: 1;
  margin-bottom: 0.75rem;
}
.bench-overview-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.bench-overview-card__npm {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  background: var(--bg);
}
.bench-overview-card__arrow {
  color: var(--text-muted);
  font-size: 0.9rem;
  transition: color var(--transition), transform var(--transition);
}
.bench-overview-card:hover .bench-overview-card__arrow {
  color: var(--accent);
  transform: translateX(2px);
}

/* ── Overview Methodology ───────────────────────────────────────────────── */
.bench-overview__methodology {
  margin-top: 2.5rem;
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.bench-overview__methodology-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.5rem;
}
.bench-overview__methodology-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 0.75rem;
}
.bench-overview__methodology-link {
  font-size: 0.85rem;
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
  transition: color var(--transition);
}
.bench-overview__methodology-link:hover {
  color: var(--accent-dim);
}

/* ── Benchmark Page ─────────────────────────────────────────────────────── */
.bench-header {
  margin-bottom: 1.5rem;
}
.bench-header__top {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.4rem;
}
.bench-header__title {
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
}
.bench-header__links {
  display: flex;
  gap: 0.4rem;
}
.bench-header__ext-link {
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  text-decoration: none;
  transition: color var(--transition), border-color var(--transition);
}
.bench-header__ext-link:hover {
  color: var(--text);
  border-color: var(--border);
}
.bench-header__desc {
  font-size: 0.95rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 0.75rem;
}
.bench-header__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

/* ── Controls ───────────────────────────────────────────────────────────── */
.bench-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  margin-bottom: 1.5rem;
}
.bench-controls__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.bench-controls__sep {
  width: 1px;
  height: 24px;
  background: var(--border-subtle);
  margin: 0 0.25rem;
}

/* ── Segmented Buttons ──────────────────────────────────────────────────── */
.ui-segmented {
  display: inline-flex;
  border-radius: var(--radius);
  background: var(--bg);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
}
.ui-segmented__btn {
  padding: 0.35rem 0.65rem;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color var(--transition), background var(--transition);
  border-right: 1px solid var(--border-subtle);
}
.ui-segmented__btn:last-child {
  border-right: none;
}
.ui-segmented__btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.ui-segmented__btn--active {
  color: var(--accent);
  background: var(--accent-glow);
}

/* ── Run Button ─────────────────────────────────────────────────────────── */
.ui-btn {
  padding: 0.4rem 1rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition), color var(--transition), box-shadow var(--transition);
}
.ui-btn--primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.ui-btn--primary:hover {
  background: var(--accent-dim);
  box-shadow: 0 0 16px var(--accent-glow);
}
.bench-run-btn--stop {
  background: var(--red);
  border-color: var(--red);
}
.bench-run-btn--stop:hover {
  background: var(--red);
  opacity: 0.85;
}

/* ── Suite Cards (populated by JS) ──────────────────────────────────────── */
.bench-suites {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.bench-suite-wrapper {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* ── Metrics (populated by JS) ──────────────────────────────────────────── */
.bench-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.5rem;
}
.bench-metric {
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
}
.bench-metric__label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}
.bench-metric__meta {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
}
.bench-metric__value {
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--text);
}
.bench-metric__unit {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 0.15rem;
}
.bench-metric--good .bench-metric__value { color: var(--green); }
.bench-metric--ok .bench-metric__value { color: var(--yellow); }
.bench-metric--bad .bench-metric__value { color: var(--red); }

.bench-metric--info {
  background: transparent;
  border-color: transparent;
}
.bench-metric--info .bench-metric__label {
  color: var(--text-secondary);
}
.bench-metric--info .bench-metric__meta {
  color: var(--text-muted);
}

.bench-metric--empty {
  opacity: 0.5;
}
.bench-metric--empty .bench-metric__value {
  color: var(--text-muted);
  font-size: 1.1rem;
}

/* ── Status & Progress ──────────────────────────────────────────────────── */
.bench-suite__status {
  font-size: 0.82rem;
  color: var(--text-secondary);
  padding: 0.5rem 0;
  min-height: 1.5rem;
}
.bench-suite__status--running {
  color: var(--accent);
}
.bench-progress {
  height: 3px;
  border-radius: 2px;
  background: var(--bg);
  margin-bottom: 0.75rem;
  overflow: hidden;
  opacity: 0;
  transition: opacity var(--transition);
}
.bench-progress--active {
  opacity: 1;
}
.bench-progress__bar {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 200ms ease;
  width: 0%;
}
.bench-progress__text {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
  min-height: 0.9rem;
}

/* ── Viewport (live preview) ────────────────────────────────────────────── */
.bench-viewport {
  position: relative;
  height: 0;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  transition: height 300ms ease;
  margin-top: 1rem;
}
.bench-viewport--active {
  height: 400px;
}
.bench-viewport__inner {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}
.bench-viewport__label {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  opacity: 0;
  transition: opacity var(--transition);
}
.bench-viewport--active .bench-viewport__label {
  opacity: 1;
}

/* ── Bench Item (identical template for all libraries) ──────────────────── */
.bench-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1rem;
  height: 48px;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--border-subtle);
}
.bench-item__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-glow);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.72rem;
  flex-shrink: 0;
}
.bench-item__content {
  flex: 1;
  min-width: 0;
}
.bench-item__title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bench-item__sub {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bench-item__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.bench-item__badge {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: var(--green-dim);
  color: var(--green);
}
.bench-item__time {
  font-size: 0.7rem;
  color: var(--text-muted);
}

/* ── Error State ────────────────────────────────────────────────────────── */
.bench-suite__error {
  padding: 1rem;
  border-radius: var(--radius);
  background: var(--red-dim);
  color: var(--red);
  font-size: 0.85rem;
  line-height: 1.5;
}

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .bench-layout {
    flex-direction: column;
    gap: 0;
  }
  .sidebar {
    position: static;
    width: 100%;
    max-height: none;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .sidebar__group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: center;
    margin-top: 0;
  }
  .sidebar__group-label {
    padding: 0.25rem 0.5rem;
    margin-bottom: 0;
  }
  .sidebar__link {
    font-size: 0.78rem;
    padding: 0.3rem 0.6rem;
  }
}

@media (max-width: 640px) {
  .bench-layout {
    padding: 0 1rem;
  }
  .bench-overview__title {
    font-size: 1.5rem;
  }
  .bench-header__title {
    font-size: 1.4rem;
  }
  .bench-controls {
    padding: 0.6rem 0.75rem;
  }
  .bench-controls__sep {
    display: none;
  }
  .bench-overview__grid {
    grid-template-columns: 1fr;
  }
  .bench-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .bench-viewport--active {
    height: 300px;
  }
}

@media (max-width: 480px) {
  .bench-metrics {
    grid-template-columns: 1fr;
  }
}
`.trim();
