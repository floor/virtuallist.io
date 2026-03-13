// scripts/seed-db.ts
// Creates the SQLite database for storing crowdsourced benchmark results.
//
// Single table pair for all libraries (no comparison vs suite distinction —
// every library is a peer on virtuallist.io):
//   - benchmark_runs    → one row per benchmark execution
//   - benchmark_metrics → one row per metric per run
//
// Usage:
//   bun run seed:db
//   bun run seed:db:force   # drop and recreate
//
// Output:
//   data/benchmarks.db

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";

// =============================================================================
// Config
// =============================================================================

const DB_PATH = resolve(import.meta.dir, "../data/benchmarks.db");
const FORCE = process.argv.includes("--force");

// =============================================================================
// Setup
// =============================================================================

const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

if (existsSync(DB_PATH)) {
  if (!FORCE) {
    console.log(`\n  ℹ️  benchmarks.db already exists at ${DB_PATH}`);
    console.log(`  Use --force to drop and recreate.\n`);
    process.exit(0);
  }
  console.log(`  🗑️  Removing existing database...`);
  unlinkSync(DB_PATH);
}

console.log(`\n  🗄️  Creating benchmarks database\n`);
console.log(`  Target:  ${DB_PATH}\n`);

const db = new Database(DB_PATH);

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA synchronous = NORMAL");

// =============================================================================
// Schema
// =============================================================================
//
// Every library is a peer on virtuallist.io — there is no "comparison vs suite"
// distinction. All benchmark results go into the same table pair.
//
// benchmark_runs    — one row per benchmark execution
// benchmark_metrics — one row per metric per run (run_id FK)
//
// The library_slug field identifies which library was benchmarked.
// This replaces the suite_id field used in vlist.dev's comparison tables.

// =============================================================================
// benchmark_runs
// =============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS benchmark_runs (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at           TEXT    NOT NULL DEFAULT (datetime('now')),

    -- Library identity
    library_slug         TEXT    NOT NULL,
    library_version      TEXT,

    -- Test configuration
    item_count           INTEGER NOT NULL,
    stress_ms            INTEGER NOT NULL DEFAULT 0,
    scroll_speed         INTEGER NOT NULL DEFAULT 0,

    -- Environment
    user_agent           TEXT,
    hardware_concurrency INTEGER,
    device_memory        REAL,
    screen_width         INTEGER,
    screen_height        INTEGER,

    -- Run metadata
    duration_ms          INTEGER,
    success              INTEGER NOT NULL DEFAULT 1,
    error                TEXT
  )
`);

// =============================================================================
// benchmark_metrics
// =============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS benchmark_metrics (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id    INTEGER NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    label     TEXT    NOT NULL,
    value     REAL    NOT NULL,
    unit      TEXT    NOT NULL,
    better    TEXT    NOT NULL,
    rating    TEXT
  )
`);

// =============================================================================
// Indexes
// =============================================================================

// benchmark_runs indexes
db.run(`CREATE INDEX idx_runs_library        ON benchmark_runs(library_slug)`);
db.run(`CREATE INDEX idx_runs_library_item   ON benchmark_runs(library_slug, item_count)`);
db.run(`CREATE INDEX idx_runs_library_ver    ON benchmark_runs(library_slug, library_version)`);
db.run(`CREATE INDEX idx_runs_created        ON benchmark_runs(created_at)`);
db.run(`CREATE INDEX idx_runs_success        ON benchmark_runs(success)`);
db.run(`CREATE INDEX idx_runs_stress         ON benchmark_runs(stress_ms)`);
db.run(`CREATE INDEX idx_runs_scroll_speed   ON benchmark_runs(scroll_speed)`);

// Composite index for the most common stats query pattern
db.run(`
  CREATE INDEX idx_runs_stats ON benchmark_runs(
    library_slug, library_version, item_count, stress_ms, scroll_speed, success
  )
`);

// benchmark_metrics indexes
db.run(`CREATE INDEX idx_metrics_run         ON benchmark_metrics(run_id)`);
db.run(`CREATE INDEX idx_metrics_run_label   ON benchmark_metrics(run_id, label)`);
db.run(`CREATE INDEX idx_metrics_label       ON benchmark_metrics(label)`);

// =============================================================================
// Verify
// =============================================================================

type TableRow = { name: string; type: string; notnull: number };
type CountRow = { count: number };

const tables = [
  { name: "benchmark_runs", label: "Benchmark runs" },
  { name: "benchmark_metrics", label: "Benchmark metrics" },
];

console.log(`  ✅ Tables created:\n`);

for (const table of tables) {
  const count = db
    .query<CountRow, []>(`SELECT COUNT(*) as count FROM ${table.name}`)
    .get();
  const columns = db
    .query<TableRow, []>(`PRAGMA table_info(${table.name})`)
    .all();

  console.log(
    `  📋 ${table.name} (${table.label}) — ${count?.count ?? 0} rows`,
  );
  for (const col of columns) {
    const nullable = col.notnull ? "NOT NULL" : "nullable";
    console.log(
      `     ${col.name.padEnd(24)} ${col.type.padEnd(10)} ${nullable}`,
    );
  }
  console.log();
}

// =============================================================================
// Index summary
// =============================================================================

type IndexRow = { name: string; tbl_name: string };

const indexes = db
  .query<IndexRow, []>(
    `SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name`,
  )
  .all();

console.log(`  📑 Indexes created (${indexes.length}):\n`);
for (const idx of indexes) {
  console.log(`     ${idx.name.padEnd(36)} → ${idx.tbl_name}`);
}
console.log();

// =============================================================================
// File size
// =============================================================================

const fileSize = Bun.file(DB_PATH).size;
const sizeKB = (fileSize / 1024).toFixed(1);
console.log(`  📦 Database size: ${sizeKB} KB`);

db.close();

console.log(`\n  Done! 🎉\n`);
console.log(`  Next steps:`);
console.log(`    bun run dev          # start development server`);
console.log(`    bun run build        # build benchmark bundle`);
console.log(`    open http://localhost:3456\n`);
