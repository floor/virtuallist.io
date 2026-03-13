// src/server/pages/benchmarks.ts
// Benchmark page renderer — overview, individual, compare, and results pages.
//
// Renders:
//   /benchmarks          → Overview with all libraries grouped by ecosystem
//   /benchmarks/{slug}   → Individual library benchmark page (interactive)
//   /benchmarks/compare  → Head-to-head live comparison
//   /benchmarks/results  → Crowdsourced aggregated results from the database
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
  getLibraries as getRegistryLibraries,
  getLibrariesByEcosystem,
  getEcosystemLabel,
  getLibraryCount,
  type LibraryInfo,
  type Ecosystem,
} from "../registry";
import {
  getStats,
  getSummary,
  type StatsResult,
  type AggregatedMetric,
} from "../../api/benchmarks";

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
    extraHead: `<style>${BENCH_CSS}${COMPARE_CSS}</style>`,
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
    extraHead: `<style>${BENCH_CSS}${COMPARE_CSS}</style>`,
    extraBody: `<script type="module" src="/dist/benchmarks/script.js"></script>`,
    mainClass: "",
  });
}

function assembleComparePage(locale: string): string {
  const t = makeT(locale, "benchmarks");
  const ecosystems = buildEcosystemData();

  // Render compare page content
  const compareContent = renderTemplate("benchmarks-compare", {
    t,
    itemCounts: ITEM_COUNTS,
    initialItemCount: INITIAL_ITEM_COUNT,
    stressLevels: STRESS_LEVELS,
    formatItemCount,
  });

  // Render sidebar — pass "compare" as activeSlug so the Compare link lights up
  const sidebar = renderTemplate("benchmarks-sidebar", {
    t,
    ecosystems,
    activeSlug: "compare",
  });

  return renderShell({
    locale,
    title: t("meta.compare_title"),
    description: t("meta.compare_description"),
    url: `${SITE}/benchmarks/compare`,
    content: `
      <div class="bench-layout">
        ${sidebar}
        <div class="bench-layout__content">
          ${compareContent}
        </div>
      </div>`,
    t,
    activeNav: "benchmarks",
    extraHead: `<style>${BENCH_CSS}${COMPARE_CSS}</style>`,
    extraBody: `<script type="module" src="/dist/benchmarks/compare.js"></script>`,
    mainClass: "",
  });
}

// =============================================================================
// Results Page — Crowdsourced Aggregated Data
// =============================================================================

/** Metric labels in display order. */
const METRIC_ORDER = ["Render", "Memory", "Scroll FPS", "P95 Frame"] as const;

/** Map a metric label to a short key used in template row objects. */
function metricKey(label: string): "render" | "memory" | "fps" | "p95" {
  switch (label) {
    case "Render":
      return "render";
    case "Memory":
      return "memory";
    case "Scroll FPS":
      return "fps";
    case "P95 Frame":
      return "p95";
    default:
      return "render";
  }
}

/** Confidence tier based on sample count. */
function confidenceTier(runs: number): "high" | "moderate" | "low" {
  if (runs >= 20) return "high";
  if (runs >= 5) return "moderate";
  return "low";
}

/** Format a numeric value for display (2 decimal places, strip trailing zeros). */
function formatMetricValue(value: number, unit: string): string {
  if (unit === "fps") return value.toFixed(1);
  if (unit === "MB") return value.toFixed(2);
  return value.toFixed(1);
}

interface MetricCell {
  value: number | null;
  display: string;
  unit: string;
  range: string | null;
  best: boolean;
}

interface ResultRow {
  slug: string;
  name: string;
  ecosystem: string;
  totalRuns: number;
  confidence: "high" | "moderate" | "low";
  render: MetricCell;
  memory: MetricCell;
  fps: MetricCell;
  p95: MetricCell;
}

function emptyCell(): MetricCell {
  return { value: null, display: "", unit: "", range: null, best: false };
}

function buildResultRows(
  stats: StatsResult[],
  registryLibs: ReadonlyArray<LibraryInfo>,
): ResultRow[] {
  // Build a slug→name+ecosystem lookup from the registry
  const libInfo = new Map<string, { name: string; ecosystem: string }>();
  for (const lib of registryLibs) {
    libInfo.set(lib.slug, {
      name: lib.name,
      ecosystem: getEcosystemLabel(lib.ecosystem),
    });
  }

  // Merge stats by slug (getStats may return multiple version groups per slug)
  // We take the group with the most runs per slug.
  const bySlug = new Map<string, StatsResult>();
  for (const s of stats) {
    const existing = bySlug.get(s.librarySlug);
    if (!existing || s.totalRuns > existing.totalRuns) {
      bySlug.set(s.librarySlug, s);
    }
  }

  // Build rows
  const rows: ResultRow[] = [];

  for (const [slug, stat] of bySlug) {
    const info = libInfo.get(slug);
    if (!info) continue; // skip unknown slugs not in registry

    const row: ResultRow = {
      slug,
      name: info.name,
      ecosystem: info.ecosystem,
      totalRuns: stat.totalRuns,
      confidence: confidenceTier(stat.totalRuns),
      render: emptyCell(),
      memory: emptyCell(),
      fps: emptyCell(),
      p95: emptyCell(),
    };

    for (const metric of stat.metrics) {
      const key = metricKey(metric.label);
      const p5 = formatMetricValue(metric.p5, metric.unit);
      const p95 = formatMetricValue(metric.p95, metric.unit);

      row[key] = {
        value: metric.median,
        display: formatMetricValue(metric.median, metric.unit),
        unit: metric.unit,
        range: metric.sampleCount >= 3 ? `${p5}–${p95}` : null,
        best: false,
      };
    }

    rows.push(row);
  }

  // Sort by Scroll FPS median (descending — higher is better) as default
  rows.sort((a, b) => {
    const aVal = a.fps.value ?? -Infinity;
    const bVal = b.fps.value ?? -Infinity;
    return bVal - aVal;
  });

  // Mark "best" per metric column
  for (const key of ["render", "memory", "fps", "p95"] as const) {
    const better = key === "fps" ? "higher" : "lower";
    let bestVal: number | null = null;

    for (const row of rows) {
      const val = row[key].value;
      if (val === null) continue;
      if (bestVal === null) {
        bestVal = val;
      } else if (better === "lower" && val < bestVal) {
        bestVal = val;
      } else if (better === "higher" && val > bestVal) {
        bestVal = val;
      }
    }

    if (bestVal !== null) {
      for (const row of rows) {
        if (row[key].value === bestVal) {
          row[key].best = true;
        }
      }
    }
  }

  return rows;
}

function assembleResultsPage(
  locale: string,
  itemCount: number,
  stressMs: number,
): string {
  const t = makeT(locale, "benchmarks");
  const ecosystems = buildEcosystemData();
  const registryLibs = getRegistryLibraries();

  // Query aggregated stats from the database
  let stats: StatsResult[] = [];
  let totalRuns = 0;

  try {
    stats = getStats({ itemCount, stressMs, limit: 200 });
    const summary = getSummary();
    totalRuns =
      typeof summary.successful_runs === "number" ? summary.successful_runs : 0;
  } catch {
    // DB may not exist yet — render empty state
  }

  const rows = buildResultRows(stats, registryLibs);

  const resultsContent = renderTemplate("benchmarks-results", {
    t,
    rows,
    totalRuns,
    itemCounts: ITEM_COUNTS,
    initialItemCount: itemCount,
    stressLevels: STRESS_LEVELS,
    formatItemCount,
  });

  const sidebar = renderTemplate("benchmarks-sidebar", {
    t,
    ecosystems,
    activeSlug: "results",
  });

  return renderShell({
    locale,
    title: t("meta.results_title"),
    description: t("meta.results_description"),
    url: `${SITE}/benchmarks/results`,
    content: `
      <div class="bench-layout">
        ${sidebar}
        <div class="bench-layout__content">
          ${resultsContent}
        </div>
      </div>`,
    t,
    activeNav: "benchmarks",
    extraHead: `<style>${BENCH_CSS}${COMPARE_CSS}${RESULTS_CSS}</style>`,
    extraBody: `<script type="module" src="/dist/benchmarks/results.js"></script>`,
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

/**
 * Render the compare page (/benchmarks/compare).
 *
 * @param req - HTTP request (for locale detection).
 */
export function renderComparePage(req: Request): Response {
  const locale = detectLocale(req);
  const cacheKey = `${locale}/__compare__`;

  if (IS_PROD) {
    const cached = pageCache.get(cacheKey);
    if (cached !== undefined) {
      return new Response(cached, htmlHeaders());
    }
  }

  const html = assembleComparePage(locale);
  pageCache.set(cacheKey, html);

  return new Response(html, htmlHeaders());
}

/**
 * Render the results page (/benchmarks/results).
 *
 * Unlike other benchmark pages, this one is NOT cached in production because
 * the data changes as new benchmark runs come in. Instead we use a short
 * Cache-Control header so the browser doesn't re-fetch on every navigation
 * but the data stays reasonably fresh.
 *
 * Supports query params:
 *   ?items=10000   — item count filter (default: 10000)
 *   ?stress=0      — stress ms filter (default: 0)
 *
 * @param req - HTTP request (for locale detection + query params).
 */
export function renderResultsPage(req: Request): Response {
  const locale = detectLocale(req);
  const url = new URL(req.url);

  // Parse filter params with safe defaults
  const itemCount = parseIntParam(url, "items", INITIAL_ITEM_COUNT);
  const stressMs = parseIntParam(url, "stress", 0);

  const html = assembleResultsPage(locale, itemCount, stressMs);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": IS_PROD
        ? "public, max-age=300, must-revalidate"
        : "no-cache, no-store, must-revalidate",
    },
  });
}

/** Parse an integer query param, returning a default if missing or invalid. */
function parseIntParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// =============================================================================
// Page-specific CSS
// =============================================================================

const COMPARE_CSS = `
/* ── Compare: Library Selector ─────────────────────────────────────────── */
.cmp-selector {
  padding: 1rem 1.25rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  margin-bottom: 1rem;
}
.cmp-selector__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.cmp-slots {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.cmp-slot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.cmp-slot__label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  min-width: 64px;
}
.cmp-slot__controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}
.cmp-slot__select {
  flex: 1;
  padding: 0.4rem 0.65rem;
  border-radius: var(--radius);
  background: var(--bg);
  border: 1px solid var(--border-subtle);
  color: var(--text);
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  transition: border-color var(--transition);
  max-width: 340px;
}
.cmp-slot__select:hover {
  border-color: var(--border);
}
.cmp-slot__select:focus {
  border-color: var(--accent);
}
.cmp-slot__remove {
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.78rem;
  cursor: pointer;
  font-family: inherit;
  transition: color var(--transition), border-color var(--transition), background var(--transition);
  line-height: 1;
}
.cmp-slot__remove:hover {
  color: var(--red);
  border-color: var(--red);
  background: var(--red-dim);
}
.cmp-add-slot-btn {
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color var(--transition), border-color var(--transition), background var(--transition);
}
.cmp-add-slot-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border);
  background: var(--bg-hover);
}
.cmp-add-slot-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ── Compare: Status & Progress ─────────────────────────────────────────── */
.cmp-status {
  font-size: 0.82rem;
  color: var(--text-secondary);
  padding: 0.4rem 0;
  min-height: 1.4rem;
}
.cmp-status--running {
  color: var(--accent);
}
.cmp-progress {
  height: 3px;
  border-radius: 2px;
  background: var(--bg-surface);
  margin-bottom: 1.25rem;
  overflow: hidden;
  opacity: 0;
  transition: opacity var(--transition);
}
.cmp-progress--active {
  opacity: 1;
}
.cmp-progress__bar {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 250ms ease;
  width: 0%;
}

/* ── Compare: Results Table ─────────────────────────────────────────────── */
.cmp-results {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  overflow: hidden;
  margin-top: 1.5rem;
}
.cmp-results__header {
  display: flex;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}
.cmp-results__metric-label-col {
  width: 110px;
  flex-shrink: 0;
  padding: 0.75rem 1rem;
}
.cmp-results__col-header {
  flex: 1;
  padding: 0.75rem 1rem;
  border-left: 1px solid var(--border-subtle);
  min-width: 0;
}
.cmp-results__lib-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmp-results__lib-status {
  font-size: 0.7rem;
  margin-top: 0.2rem;
  color: var(--text-muted);
  min-height: 1rem;
}
.cmp-results__lib-status--wins {
  color: var(--green);
  font-weight: 600;
}
.cmp-results__lib-status--error {
  color: var(--red);
}
.cmp-results__lib-status--pending {
  color: var(--text-muted);
  font-style: italic;
}
.cmp-results__body {
  display: flex;
  flex-direction: column;
}
.cmp-results__row {
  display: flex;
  border-bottom: 1px solid var(--border-subtle);
}
.cmp-results__row:last-child {
  border-bottom: none;
}
.cmp-results__metric-label {
  width: 110px;
  flex-shrink: 0;
  padding: 0.75rem 1rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border-subtle);
}
.cmp-results__cell {
  flex: 1;
  padding: 0.75rem 1rem;
  border-left: 1px solid var(--border-subtle);
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  transition: background var(--transition);
}
.cmp-results__cell--winner {
  background: rgba(74, 222, 128, 0.04);
}
.cmp-results__cell--error,
.cmp-results__cell--empty,
.cmp-results__cell--pending {
  color: var(--text-muted);
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}
.cmp-results__cell--pending {
  font-style: italic;
}
.cmp-cell__value {
  font-size: 1.35rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--text);
  line-height: 1.2;
}
.cmp-cell__unit {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 0.15rem;
}
.cmp-cell__meta {
  font-size: 0.7rem;
  color: var(--text-muted);
}
.cmp-results__cell--good .cmp-cell__value { color: var(--green); }
.cmp-results__cell--ok   .cmp-cell__value { color: var(--yellow); }
.cmp-results__cell--bad  .cmp-cell__value { color: var(--red); }

/* ── Compare: Diff Badges ────────────────────────────────────────────────── */
.cmp-diff-badge {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  border-radius: 100px;
  letter-spacing: 0.01em;
  width: fit-content;
}
.cmp-diff-badge--winner {
  background: var(--green-dim);
  color: var(--green);
}
.cmp-diff-badge--tie {
  background: var(--bg-elevated);
  color: var(--text-muted);
  border: 1px solid var(--border-subtle);
}
.cmp-diff-badge--worse {
  background: var(--bg-elevated);
  color: var(--text-muted);
}

/* ── Compare: Footer note ────────────────────────────────────────────────── */
.cmp-results__footer {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}
.cmp-results__footer-note {
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* ── Compare: Responsive ─────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .cmp-slot {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
  }
  .cmp-slot__label {
    min-width: unset;
  }
  .cmp-slot__select {
    max-width: 100%;
  }
  .cmp-results__metric-label-col,
  .cmp-results__metric-label {
    width: 80px;
    font-size: 0.65rem;
    padding: 0.6rem 0.6rem;
  }
  .cmp-results__col-header,
  .cmp-results__cell {
    padding: 0.6rem 0.6rem;
  }
  .cmp-results__lib-name {
    font-size: 0.78rem;
  }
  .cmp-cell__value {
    font-size: 1.1rem;
  }
}
`.trim();

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

const RESULTS_CSS = `
/* ── Results: Table Wrapper ─────────────────────────────────────────────── */
.res-table-wrap {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  overflow-x: auto;
  margin-top: 1rem;
}
.res-table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

/* ── Results: Header ────────────────────────────────────────────────────── */
.res-table__th {
  padding: 0.65rem 1rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  white-space: nowrap;
  user-select: none;
}
.res-table__th--rank {
  width: 40px;
  text-align: center;
}
.res-table__th--library {
  min-width: 160px;
}
.res-table__th--metric {
  text-align: right;
  min-width: 100px;
}
.res-table__th--runs {
  text-align: center;
  width: 80px;
}
.res-table__th--sortable {
  cursor: pointer;
  transition: color var(--transition);
}
.res-table__th--sortable:hover {
  color: var(--text-secondary);
}
.res-table__th--sorted {
  color: var(--accent);
}

/* ── Results: Rows ──────────────────────────────────────────────────────── */
.res-table__row {
  border-bottom: 1px solid var(--border-subtle);
  transition: background var(--transition);
}
.res-table__row:last-child {
  border-bottom: none;
}
.res-table__row:hover {
  background: var(--bg-elevated);
}
.res-table__td {
  padding: 0.6rem 1rem;
  font-size: 0.85rem;
  color: var(--text);
  vertical-align: middle;
}
.res-table__td--rank {
  text-align: center;
  font-weight: 700;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.res-table__td--metric {
  text-align: right;
}
.res-table__td--best {
  background: rgba(74, 222, 128, 0.04);
}
.res-table__td--best .res-val {
  color: var(--green);
  font-weight: 700;
}
.res-table__td--runs {
  text-align: center;
}

/* ── Results: Library Cell ──────────────────────────────────────────────── */
.res-lib {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: inherit;
}
.res-lib__name {
  font-weight: 600;
  font-size: 0.88rem;
  color: var(--text);
  transition: color var(--transition);
}
.res-lib:hover .res-lib__name {
  color: var(--accent);
}
.res-lib__eco {
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--text-muted);
  padding: 0.1rem 0.45rem;
  border-radius: 100px;
  background: var(--bg);
  white-space: nowrap;
}

/* ── Results: Metric Values ─────────────────────────────────────────────── */
.res-val {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text);
}
.res-unit {
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 0.15rem;
}
.res-range {
  display: block;
  font-size: 0.65rem;
  color: var(--text-muted);
  margin-top: 0.1rem;
}
.res-nodata {
  color: var(--text-muted);
  font-size: 0.82rem;
}

/* ── Results: Runs & Confidence ─────────────────────────────────────────── */
.res-runs__count {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-right: 0.3rem;
}
.res-runs__badge {
  font-size: 0.7rem;
}

/* ── Results: Empty State ───────────────────────────────────────────────── */
.res-empty {
  padding: 3rem 1.5rem;
  text-align: center;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  margin-top: 1rem;
}
.res-empty__text {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

/* ── Results: Legend ─────────────────────────────────────────────────────── */
.res-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.75rem;
  padding: 0 0.25rem;
}
.res-legend__item {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ── Results: Footer ────────────────────────────────────────────────────── */
.res-footer {
  margin-top: 0.5rem;
  padding: 0 0.25rem;
}
.res-footer__note {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.5;
}

/* ── Results: Responsive ────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .res-table__th--metric,
  .res-table__td--metric {
    min-width: 80px;
    padding: 0.5rem 0.6rem;
  }
  .res-lib__eco {
    display: none;
  }
}
@media (max-width: 640px) {
  .res-table__th,
  .res-table__td {
    padding: 0.5rem 0.5rem;
    font-size: 0.78rem;
  }
  .res-val {
    font-size: 0.82rem;
  }
  .res-range {
    display: none;
  }
  .res-table__th--rank,
  .res-table__td--rank {
    display: none;
  }
}
`.trim();
