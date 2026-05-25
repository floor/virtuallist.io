// src/api/benchmarks.ts
// Benchmarks API — crowdsourced benchmark result storage and aggregation.
// Backed by SQLite (data/benchmarks.db), created by scripts/seed-db.ts.
//
// Single table pair for all libraries (no comparison vs suite distinction —
// every library is a peer on virtuallist.io):
//   - benchmark_runs    → one row per benchmark execution
//   - benchmark_metrics → one row per metric per run
//
// Endpoints:
//   POST /benchmarks                — store a result
//   GET  /benchmarks/stats          — aggregated stats (filterable)
//   GET  /benchmarks/history        — time-series data for charts
//   GET  /benchmarks/libraries      — list all known library slugs in DB
//   GET  /benchmarks/browsers       — browser breakdown
//   GET  /benchmarks/summary        — high-level overview

import { Database } from "bun:sqlite";
import { resolve } from "path";
import { existsSync } from "fs";

// =============================================================================
// Database Connection (singleton)
// =============================================================================

let dbPath = resolve(import.meta.dir, "../../data/benchmarks.db");
let db: Database | null = null;

/**
 * Override the database path (for test isolation).
 * Must be called before any API function that touches the DB.
 */
export function setDbPath(path: string): void {
  dbPath = path;
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Close the current DB connection and reset the singleton.
 * Useful for test cleanup (afterAll).
 */
export function resetDb(): void {
  if (db) {
    db.close();
    db = null;
  }
  dbPath = resolve(import.meta.dir, "../../data/benchmarks.db");
}

function getDb(): Database {
  if (!db) {
    if (!existsSync(dbPath)) {
      throw new Error("benchmarks.db not found. Run: bun run seed:db");
    }
    db = new Database(dbPath);
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA cache_size = -4000"); // 4 MB cache
    db.run("PRAGMA foreign_keys = ON");
  }
  return db;
}

// =============================================================================
// Types
// =============================================================================

interface MetricInput {
  label: string;
  value: number;
  unit: string;
  better: "lower" | "higher";
  rating?: "good" | "ok" | "bad" | null;
  displayValue?: string | null;
  meta?: string | null;
}

interface BenchmarkResultInput {
  librarySlug: string;
  libraryVersion?: string;
  itemCount: number;
  metrics: MetricInput[];
  duration: number;
  success: boolean;
  error?: string | null;
  stressMs?: number;
  scrollSpeed?: number;
  // Environment metadata
  userAgent?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  screenWidth?: number;
  screenHeight?: number;
}

export interface AggregatedMetric {
  label: string;
  unit: string;
  better: "lower" | "higher";
  median: number;
  mean: number;
  min: number;
  max: number;
  p5: number;
  p95: number;
  stddev: number;
  sampleCount: number;
}

export interface StatsResult {
  librarySlug: string;
  itemCount: number;
  totalRuns: number;
  libraryVersion?: string;
  metrics: AggregatedMetric[];
}

interface HistoryPoint {
  date: string;
  libraryVersion: string;
  median: number;
  mean: number;
  p5: number;
  p95: number;
  sampleCount: number;
}

interface LibraryVersionInfo {
  librarySlug: string;
  libraryVersion: string;
  totalRuns: number;
  lastSeen: string;
}

interface BrowserInfo {
  browser: string;
  totalRuns: number;
  lastSeen: string;
}

// =============================================================================
// Validation Constants
// =============================================================================

const MAX_SLUG_LENGTH = 64;
const MAX_VERSION_LENGTH = 32;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_LABEL_LENGTH = 128;
const MAX_UNIT_LENGTH = 32;
const MAX_ERROR_LENGTH = 1024;
const MAX_META_LENGTH = 256;
const MAX_METRICS_PER_RESULT = 100;
const VALID_ITEM_COUNTS = new Set([
  1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000,
]);
const VALID_BETTER = new Set(["lower", "higher"]);
const VALID_RATING = new Set(["good", "ok", "bad"]);

// =============================================================================
// Rate Limiting (in-memory, per IP)
// =============================================================================

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // max 30 submissions per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Periodic cleanup of expired rate limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 300_000);

// =============================================================================
// Validation
// =============================================================================

function validateResult(
  data: unknown,
):
  | { valid: true; result: BenchmarkResultInput }
  | { valid: false; error: string } {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const d = data as Record<string, unknown>;

  // librarySlug — required
  if (typeof d.librarySlug !== "string" || d.librarySlug.length === 0) {
    return {
      valid: false,
      error: "librarySlug is required and must be a non-empty string",
    };
  }
  if (d.librarySlug.length > MAX_SLUG_LENGTH) {
    return {
      valid: false,
      error: `librarySlug exceeds max length (${MAX_SLUG_LENGTH})`,
    };
  }
  if (!/^[a-z0-9-]+$/.test(d.librarySlug)) {
    return {
      valid: false,
      error:
        "librarySlug must contain only lowercase letters, digits, and hyphens",
    };
  }

  // libraryVersion — optional
  if (d.libraryVersion !== undefined && d.libraryVersion !== null) {
    if (typeof d.libraryVersion !== "string") {
      return { valid: false, error: "libraryVersion must be a string" };
    }
    if (d.libraryVersion.length > MAX_VERSION_LENGTH) {
      return {
        valid: false,
        error: `libraryVersion exceeds max length (${MAX_VERSION_LENGTH})`,
      };
    }
  }

  // itemCount — required
  if (typeof d.itemCount !== "number" || !Number.isFinite(d.itemCount)) {
    return { valid: false, error: "itemCount must be a finite number" };
  }
  if (!VALID_ITEM_COUNTS.has(d.itemCount)) {
    return {
      valid: false,
      error: `itemCount must be one of: ${[...VALID_ITEM_COUNTS].join(", ")}`,
    };
  }

  // metrics — required array
  if (!Array.isArray(d.metrics)) {
    return { valid: false, error: "metrics must be an array" };
  }
  if (d.metrics.length === 0) {
    return { valid: false, error: "metrics array must not be empty" };
  }
  if (d.metrics.length > MAX_METRICS_PER_RESULT) {
    return {
      valid: false,
      error: `metrics array exceeds max length (${MAX_METRICS_PER_RESULT})`,
    };
  }

  // Validate each metric
  for (let i = 0; i < d.metrics.length; i++) {
    const m = d.metrics[i];
    if (!m || typeof m !== "object") {
      return { valid: false, error: `metrics[${i}] must be an object` };
    }
    const metric = m as Record<string, unknown>;

    if (typeof metric.label !== "string" || metric.label.length === 0) {
      return { valid: false, error: `metrics[${i}].label is required` };
    }
    if (metric.label.length > MAX_LABEL_LENGTH) {
      return { valid: false, error: `metrics[${i}].label exceeds max length` };
    }

    if (typeof metric.value !== "number" || !Number.isFinite(metric.value)) {
      return {
        valid: false,
        error: `metrics[${i}].value must be a finite number`,
      };
    }

    if (typeof metric.unit !== "string" || metric.unit.length === 0) {
      return { valid: false, error: `metrics[${i}].unit is required` };
    }
    if (metric.unit.length > MAX_UNIT_LENGTH) {
      return { valid: false, error: `metrics[${i}].unit exceeds max length` };
    }

    if (!VALID_BETTER.has(metric.better as string)) {
      return {
        valid: false,
        error: `metrics[${i}].better must be "lower" or "higher"`,
      };
    }

    if (metric.rating !== undefined && metric.rating !== null) {
      if (!VALID_RATING.has(metric.rating as string)) {
        return {
          valid: false,
          error: `metrics[${i}].rating must be "good", "ok", or "bad"`,
        };
      }
    }

    if (metric.meta !== undefined && metric.meta !== null) {
      if (typeof metric.meta !== "string") {
        return { valid: false, error: `metrics[${i}].meta must be a string` };
      }
      if (metric.meta.length > MAX_META_LENGTH) {
        return { valid: false, error: `metrics[${i}].meta exceeds max length` };
      }
    }
  }

  // duration — required
  if (
    typeof d.duration !== "number" ||
    !Number.isFinite(d.duration) ||
    d.duration < 0
  ) {
    return {
      valid: false,
      error: "duration must be a non-negative finite number",
    };
  }

  // success — required
  if (typeof d.success !== "boolean") {
    return { valid: false, error: "success must be a boolean" };
  }

  // error — optional
  if (d.error !== undefined && d.error !== null) {
    if (typeof d.error !== "string") {
      return { valid: false, error: "error must be a string" };
    }
    if (d.error.length > MAX_ERROR_LENGTH) {
      return {
        valid: false,
        error: `error exceeds max length (${MAX_ERROR_LENGTH})`,
      };
    }
  }

  // stressMs — optional
  if (d.stressMs !== undefined && d.stressMs !== null) {
    if (
      typeof d.stressMs !== "number" ||
      !Number.isFinite(d.stressMs) ||
      d.stressMs < 0
    ) {
      return {
        valid: false,
        error: "stressMs must be a non-negative finite number",
      };
    }
  }

  // scrollSpeed — optional
  if (d.scrollSpeed !== undefined && d.scrollSpeed !== null) {
    if (
      typeof d.scrollSpeed !== "number" ||
      !Number.isFinite(d.scrollSpeed) ||
      d.scrollSpeed < 0
    ) {
      return {
        valid: false,
        error: "scrollSpeed must be a non-negative finite number",
      };
    }
  }

  // userAgent — optional
  if (d.userAgent !== undefined && d.userAgent !== null) {
    if (typeof d.userAgent !== "string") {
      return { valid: false, error: "userAgent must be a string" };
    }
    if (d.userAgent.length > MAX_USER_AGENT_LENGTH) {
      return {
        valid: false,
        error: `userAgent exceeds max length (${MAX_USER_AGENT_LENGTH})`,
      };
    }
  }

  // hardwareConcurrency — optional
  if (d.hardwareConcurrency !== undefined && d.hardwareConcurrency !== null) {
    if (
      typeof d.hardwareConcurrency !== "number" ||
      !Number.isFinite(d.hardwareConcurrency)
    ) {
      return {
        valid: false,
        error: "hardwareConcurrency must be a finite number",
      };
    }
  }

  // deviceMemory — optional
  if (d.deviceMemory !== undefined && d.deviceMemory !== null) {
    if (
      typeof d.deviceMemory !== "number" ||
      !Number.isFinite(d.deviceMemory)
    ) {
      return { valid: false, error: "deviceMemory must be a finite number" };
    }
  }

  // screenWidth — optional
  if (d.screenWidth !== undefined && d.screenWidth !== null) {
    if (typeof d.screenWidth !== "number" || !Number.isFinite(d.screenWidth)) {
      return { valid: false, error: "screenWidth must be a finite number" };
    }
  }

  // screenHeight — optional
  if (d.screenHeight !== undefined && d.screenHeight !== null) {
    if (
      typeof d.screenHeight !== "number" ||
      !Number.isFinite(d.screenHeight)
    ) {
      return { valid: false, error: "screenHeight must be a finite number" };
    }
  }

  return {
    valid: true,
    result: {
      librarySlug: d.librarySlug as string,
      libraryVersion: (d.libraryVersion as string) || undefined,
      itemCount: d.itemCount as number,
      metrics: (d.metrics as MetricInput[]).map((m) => ({
        label: m.label,
        value: m.value,
        unit: m.unit,
        better: m.better,
        rating: m.rating ?? null,
        displayValue: m.displayValue ?? null,
        meta: m.meta ?? null,
      })),
      duration: d.duration as number,
      success: d.success as boolean,
      error: (d.error as string) || null,
      stressMs: (d.stressMs as number) ?? 0,
      scrollSpeed: (d.scrollSpeed as number) ?? 0,
      userAgent: (d.userAgent as string) || undefined,
      hardwareConcurrency:
        typeof d.hardwareConcurrency === "number"
          ? Math.min(Math.round(d.hardwareConcurrency), 256)
          : undefined,
      deviceMemory:
        typeof d.deviceMemory === "number"
          ? Math.min(d.deviceMemory, 1024)
          : undefined,
      screenWidth:
        typeof d.screenWidth === "number"
          ? Math.min(Math.round(d.screenWidth), 16384)
          : undefined,
      screenHeight:
        typeof d.screenHeight === "number"
          ? Math.min(Math.round(d.screenHeight), 16384)
          : undefined,
    },
  };
}

// =============================================================================
// Storage
// =============================================================================

export function storeResult(result: BenchmarkResultInput): { runId: number } {
  const database = getDb();

  const insertRun = database.prepare(`
    INSERT INTO benchmark_runs
      (library_slug, library_version, item_count, user_agent,
       hardware_concurrency, device_memory, screen_width, screen_height,
       duration_ms, success, error, stress_ms, scroll_speed)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMetric = database.prepare(`
    INSERT INTO benchmark_metrics
      (run_id, label, value, unit, better, rating)
    VALUES
      (?, ?, ?, ?, ?, ?)
  `);

  // Use a transaction for atomicity
  const runInsert = database.transaction(() => {
    const info = insertRun.run(
      result.librarySlug,
      result.libraryVersion ?? null,
      result.itemCount,
      result.userAgent ?? null,
      result.hardwareConcurrency ?? null,
      result.deviceMemory ?? null,
      result.screenWidth ?? null,
      result.screenHeight ?? null,
      Math.round(result.duration),
      result.success ? 1 : 0,
      result.error ?? null,
      result.stressMs ?? 0,
      result.scrollSpeed ?? 0,
    );

    const runId = Number(info.lastInsertRowid);

    for (const metric of result.metrics) {
      insertMetric.run(
        runId,
        metric.label,
        metric.value,
        metric.unit,
        metric.better,
        metric.rating ?? null,
      );
    }

    return { runId };
  });

  return runInsert();
}

// =============================================================================
// Query: Stats (aggregated metrics for a library)
// =============================================================================

export function getStats(options: {
  librarySlug?: string;
  libraryVersion?: string;
  itemCount?: number;
  stressMs?: number;
  scrollSpeed?: number;
  limit?: number;
}): StatsResult[] {
  const database = getDb();

  const conditions: string[] = ["r.success = 1"];
  const params: (string | number)[] = [];

  if (options.librarySlug) {
    conditions.push("r.library_slug = ?");
    params.push(options.librarySlug);
  }

  if (options.libraryVersion) {
    conditions.push("r.library_version = ?");
    params.push(options.libraryVersion);
  }

  if (options.itemCount !== undefined) {
    conditions.push("r.item_count = ?");
    params.push(options.itemCount);
  }

  if (options.stressMs !== undefined) {
    conditions.push("r.stress_ms = ?");
    params.push(options.stressMs);
  }

  if (options.scrollSpeed !== undefined) {
    conditions.push("r.scroll_speed = ?");
    params.push(options.scrollSpeed);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const limit = options.limit ?? 100;

  // Get distinct groupings (library_slug + library_version + item_count)
  const groups = database
    .query(
      `SELECT
        r.library_slug,
        r.library_version,
        r.item_count,
        COUNT(*) as total_runs
      FROM benchmark_runs r
      ${where}
      GROUP BY r.library_slug, r.library_version, r.item_count
      ORDER BY total_runs DESC
      LIMIT ?`,
    )
    .all(...params, limit) as {
    library_slug: string;
    library_version: string | null;
    item_count: number;
    total_runs: number;
  }[];

  const results: StatsResult[] = [];

  for (const group of groups) {
    // Fetch all metric values for this group
    const metricConditions = [
      "r.success = 1",
      "r.library_slug = ?",
      "r.item_count = ?",
    ];
    const metricParams: (string | number | null)[] = [
      group.library_slug,
      group.item_count,
    ];

    if (group.library_version) {
      metricConditions.push("r.library_version = ?");
      metricParams.push(group.library_version);
    } else {
      metricConditions.push("r.library_version IS NULL");
    }

    if (options.stressMs !== undefined) {
      metricConditions.push("r.stress_ms = ?");
      metricParams.push(options.stressMs);
    }

    if (options.scrollSpeed !== undefined) {
      metricConditions.push("r.scroll_speed = ?");
      metricParams.push(options.scrollSpeed);
    }

    const metricWhere = `WHERE ${metricConditions.join(" AND ")}`;

    const rows = database
      .query(
        `SELECT m.label, m.value, m.unit, m.better
         FROM benchmark_metrics m
         JOIN benchmark_runs r ON r.id = m.run_id
         ${metricWhere}
         ORDER BY m.label`,
      )
      .all(...metricParams) as {
      label: string;
      value: number;
      unit: string;
      better: string;
    }[];

    // Group by label and compute aggregates
    const byLabel = new Map<
      string,
      { unit: string; better: string; values: number[] }
    >();

    for (const row of rows) {
      let entry = byLabel.get(row.label);
      if (!entry) {
        entry = { unit: row.unit, better: row.better, values: [] };
        byLabel.set(row.label, entry);
      }
      entry.values.push(row.value);
    }

    const metrics: AggregatedMetric[] = [];
    for (const [label, data] of byLabel) {
      const values = data.values.sort((a, b) => a - b);
      const n = values.length;
      if (n === 0) continue;

      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / n;
      const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;

      metrics.push({
        label,
        unit: data.unit,
        better: data.better as "lower" | "higher",
        median: percentile(values, 50),
        mean: round(mean, 2),
        min: values[0],
        max: values[n - 1],
        p5: percentile(values, 5),
        p95: percentile(values, 95),
        stddev: round(Math.sqrt(variance), 2),
        sampleCount: n,
      });
    }

    results.push({
      librarySlug: group.library_slug,
      itemCount: group.item_count,
      totalRuns: group.total_runs,
      libraryVersion: group.library_version ?? undefined,
      metrics,
    });
  }

  return results;
}

// =============================================================================
// Query: History (time-series for charts)
// =============================================================================

function getHistory(options: {
  librarySlug: string;
  metricLabel: string;
  itemCount?: number;
  libraryVersion?: string;
  days?: number;
  stressMs?: number;
  scrollSpeed?: number;
}): HistoryPoint[] {
  const database = getDb();
  const days = options.days ?? 90;

  const conditions: string[] = [
    "r.success = 1",
    "r.library_slug = ?",
    "m.label = ?",
    `r.created_at >= datetime('now', '-${Math.min(Math.max(days, 1), 365)} days')`,
  ];
  const params: (string | number)[] = [
    options.librarySlug,
    options.metricLabel,
  ];

  if (options.itemCount !== undefined) {
    conditions.push("r.item_count = ?");
    params.push(options.itemCount);
  }

  if (options.libraryVersion) {
    conditions.push("r.library_version = ?");
    params.push(options.libraryVersion);
  }

  if (options.stressMs !== undefined) {
    conditions.push("r.stress_ms = ?");
    params.push(options.stressMs);
  }

  if (options.scrollSpeed !== undefined) {
    conditions.push("r.scroll_speed = ?");
    params.push(options.scrollSpeed);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const rows = database
    .query(
      `SELECT
        date(r.created_at) as day,
        r.library_version,
        m.value
      FROM benchmark_metrics m
      JOIN benchmark_runs r ON r.id = m.run_id
      ${where}
      ORDER BY day`,
    )
    .all(...params) as {
    day: string;
    library_version: string | null;
    value: number;
  }[];

  // Group by day + version, compute daily aggregates
  const groups = new Map<string, { version: string; values: number[] }>();

  for (const row of rows) {
    const key = `${row.day}::${row.library_version ?? "unknown"}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = { version: row.library_version ?? "unknown", values: [] };
      groups.set(key, entry);
    }
    entry.values.push(row.value);
  }

  const points: HistoryPoint[] = [];
  for (const [key, data] of groups) {
    const date = key.split("::")[0];
    const sorted = data.values.sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    points.push({
      date,
      libraryVersion: data.version,
      median: percentile(sorted, 50),
      mean: round(sum / n, 2),
      p5: percentile(sorted, 5),
      p95: percentile(sorted, 95),
      sampleCount: n,
    });
  }

  return points;
}

// =============================================================================
// Query: Libraries (all known slugs in the database)
// =============================================================================

function getLibraries(): LibraryVersionInfo[] {
  const database = getDb();

  const rows = database
    .query(
      `SELECT
        library_slug,
        library_version,
        COUNT(*) as total_runs,
        MAX(created_at) as last_seen
      FROM benchmark_runs
      WHERE success = 1
      GROUP BY library_slug, library_version
      ORDER BY total_runs DESC`,
    )
    .all() as {
    library_slug: string;
    library_version: string | null;
    total_runs: number;
    last_seen: string;
  }[];

  return rows.map((row) => ({
    librarySlug: row.library_slug,
    libraryVersion: row.library_version ?? "unknown",
    totalRuns: row.total_runs,
    lastSeen: row.last_seen,
  }));
}

// =============================================================================
// Query: Browsers
// =============================================================================

function getBrowsers(): BrowserInfo[] {
  const database = getDb();

  const rows = database
    .query(
      `SELECT
        user_agent,
        COUNT(*) as total_runs,
        MAX(created_at) as last_seen
      FROM benchmark_runs
      WHERE success = 1 AND user_agent IS NOT NULL
      GROUP BY user_agent
      ORDER BY total_runs DESC
      LIMIT 100`,
    )
    .all() as {
    user_agent: string;
    total_runs: number;
    last_seen: string;
  }[];

  // Deduplicate by parsed browser name
  const browsers = new Map<string, BrowserInfo>();
  for (const row of rows) {
    const browser = parseBrowserName(row.user_agent);
    const existing = browsers.get(browser);
    if (existing) {
      existing.totalRuns += row.total_runs;
      if (row.last_seen > existing.lastSeen) {
        existing.lastSeen = row.last_seen;
      }
    } else {
      browsers.set(browser, {
        browser,
        totalRuns: row.total_runs,
        lastSeen: row.last_seen,
      });
    }
  }

  return [...browsers.values()].sort((a, b) => b.totalRuns - a.totalRuns);
}

// =============================================================================
// Query: Summary (high-level overview)
// =============================================================================

export function getSummary(): Record<string, unknown> {
  const database = getDb();

  const counts = database
    .query(
      `SELECT
        (SELECT COUNT(*) FROM benchmark_runs) as total_runs,
        (SELECT COUNT(*) FROM benchmark_runs WHERE success = 1) as successful_runs,
        (SELECT COUNT(*) FROM benchmark_runs WHERE success = 0) as failed_runs,
        (SELECT COUNT(DISTINCT library_slug) FROM benchmark_runs WHERE success = 1) as unique_libraries,
        (SELECT COUNT(DISTINCT library_version) FROM benchmark_runs WHERE success = 1 AND library_version IS NOT NULL) as unique_versions,
        (SELECT COUNT(DISTINCT item_count) FROM benchmark_runs WHERE success = 1) as unique_item_counts,
        (SELECT MIN(created_at) FROM benchmark_runs) as first_run,
        (SELECT MAX(created_at) FROM benchmark_runs) as last_run`,
    )
    .get() as Record<string, unknown>;

  const metricCount = database
    .query("SELECT COUNT(*) as count FROM benchmark_metrics")
    .get() as { count: number };

  const topLibraries = database
    .query(
      `SELECT library_slug, COUNT(*) as runs
       FROM benchmark_runs WHERE success = 1
       GROUP BY library_slug
       ORDER BY runs DESC
       LIMIT 10`,
    )
    .all() as { library_slug: string; runs: number }[];

  return {
    ...counts,
    totalMetrics: metricCount.count,
    topLibraries: topLibraries.map((row) => ({
      slug: row.library_slug,
      runs: row.runs,
    })),
  };
}

// =============================================================================
// Math Helpers
// =============================================================================

/**
 * Compute percentile from a sorted-ascending array using linear interpolation.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return round(sorted[lower], 2);
  return round(
    sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower),
    2,
  );
}

/**
 * Round a number to N decimal places.
 */
function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Parse a browser name from a user agent string.
 */
function parseBrowserName(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
  if (/MSIE|Trident/.test(ua)) return "IE";
  return "Other";
}

// =============================================================================
// HTTP Helpers
// =============================================================================

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        status === 200
          ? "public, max-age=60, stale-while-revalidate=300"
          : "no-cache",
      ...CORS_HEADERS,
    },
  });
}

function intParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null) return undefined;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function stringParam(url: URL, name: string): string | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  return raw;
}

// =============================================================================
// Route Handler
// =============================================================================

/**
 * Handle all /api/benchmarks/* requests.
 *
 * @param req  — original Request object
 * @param url  — parsed URL
 * @param path — sub-path after "/api", e.g. "/benchmarks/stats"
 * @returns Response or null if route not matched
 */
export async function routeBenchmarks(
  req: Request,
  url: URL,
  path: string,
): Promise<Response | null> {
  // Normalize: strip trailing slash, extract sub-route
  const normalized = path.replace(/\/+$/, "");
  const sub = normalized.replace(/^\/benchmarks\/?/, "");

  // ── POST /benchmarks — Store a result ────────────────────────────────
  if (req.method === "POST" && (sub === "" || sub === "/")) {
    // Rate limit by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    if (isRateLimited(ip)) {
      return jsonResponse(
        { error: "Rate limit exceeded. Try again in a minute." },
        429,
      );
    }

    // Parse body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    // Validate
    const validation = validateResult(body);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error }, 400);
    }

    // Store
    try {
      const { runId } = storeResult(validation.result);
      return jsonResponse({ success: true, runId }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Storage failed";
      console.error("[api/benchmarks] Store error:", message);
      return jsonResponse({ error: "Failed to store result" }, 500);
    }
  }

  // ── GET /benchmarks/stats — Aggregated statistics ────────────────────
  if (req.method === "GET" && sub === "stats") {
    try {
      const stats = getStats({
        librarySlug: stringParam(url, "librarySlug"),
        libraryVersion: stringParam(url, "libraryVersion"),
        itemCount: intParam(url, "itemCount"),
        stressMs: intParam(url, "stressMs"),
        scrollSpeed: intParam(url, "scrollSpeed"),
        limit: intParam(url, "limit"),
      });
      return jsonResponse({ items: stats, total: stats.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      console.error("[api/benchmarks] Stats error:", message);
      return jsonResponse({ error: message }, 500);
    }
  }

  // ── GET /benchmarks/history — Time-series data ───────────────────────
  if (req.method === "GET" && sub === "history") {
    const librarySlug = stringParam(url, "librarySlug");
    const metricLabel = stringParam(url, "metric");

    if (!librarySlug || !metricLabel) {
      return jsonResponse(
        { error: "librarySlug and metric query params are required" },
        400,
      );
    }

    try {
      const history = getHistory({
        librarySlug,
        metricLabel,
        itemCount: intParam(url, "itemCount"),
        libraryVersion: stringParam(url, "libraryVersion"),
        days: intParam(url, "days"),
        stressMs: intParam(url, "stressMs"),
        scrollSpeed: intParam(url, "scrollSpeed"),
      });
      return jsonResponse({ items: history, total: history.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      console.error("[api/benchmarks] History error:", message);
      return jsonResponse({ error: message }, 500);
    }
  }

  // ── GET /benchmarks/libraries — Known library slugs ──────────────────
  if (req.method === "GET" && sub === "libraries") {
    try {
      const libraries = getLibraries();
      return jsonResponse({ items: libraries, total: libraries.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      console.error("[api/benchmarks] Libraries error:", message);
      return jsonResponse({ error: message }, 500);
    }
  }

  // ── GET /benchmarks/browsers — Browser breakdown ─────────────────────
  if (req.method === "GET" && sub === "browsers") {
    try {
      const browsers = getBrowsers();
      return jsonResponse({ items: browsers, total: browsers.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      console.error("[api/benchmarks] Browsers error:", message);
      return jsonResponse({ error: message }, 500);
    }
  }

  // ── GET /benchmarks/summary — High-level overview ────────────────────
  if (req.method === "GET" && sub === "summary") {
    try {
      const summary = getSummary();
      return jsonResponse(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      console.error("[api/benchmarks] Summary error:", message);
      return jsonResponse({ error: message }, 500);
    }
  }

  // ── Unknown sub-route ────────────────────────────────────────────────
  return null;
}
