# Database

All crowdsourced benchmark results are stored in a SQLite database at `data/benchmarks.db`. The database is created by the seed script and managed by `src/api/benchmarks.ts` at runtime.

---

## Tables

The schema is intentionally simple: two tables, one for runs and one for metrics. Every library — regardless of ecosystem or type — writes to the same tables. The `library_slug` column identifies which library was benchmarked.

### `benchmark_runs`

One row per benchmark execution.

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `created_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | ISO 8601 UTC timestamp |
| `library_slug` | TEXT | NOT NULL | e.g. `"react-window"`, `"tanstack-virtual"` |
| `library_version` | TEXT | nullable | Version string if detected |
| `item_count` | INTEGER | NOT NULL | 1000 / 5000 / 10000 / 50000 / 100000 / 500000 / 1000000 |
| `stress_ms` | INTEGER | NOT NULL, DEFAULT 0 | CPU burn per frame in ms |
| `scroll_speed` | INTEGER | NOT NULL, DEFAULT 0 | Scroll speed override in px/s |
| `user_agent` | TEXT | nullable | Browser UA string |
| `hardware_concurrency` | INTEGER | nullable | CPU core count |
| `device_memory` | REAL | nullable | RAM in GB (Navigator API) |
| `screen_width` | INTEGER | nullable | |
| `screen_height` | INTEGER | nullable | |
| `duration_ms` | INTEGER | nullable | Total wall time for the run |
| `success` | INTEGER | NOT NULL, DEFAULT 1 | `1` = success, `0` = failure |
| `error` | TEXT | nullable | Error message if `success = 0` |

### `benchmark_metrics`

One row per metric per run. A typical successful run produces 10 rows: Render, Memory, Scroll FPS, P95 Frame, Jump, and one `FPS @ {speed}` row for each of the 5 scroll speeds. (Auto-persisted Puppeteer runs filter out the per-speed `FPS @` rows, storing only the 5 core metrics.)

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `run_id` | INTEGER | NOT NULL, FK → `benchmark_runs(id)` ON DELETE CASCADE | |
| `label` | TEXT | NOT NULL | e.g. `"Render"`, `"Memory"`, `"Scroll FPS"`, `"FPS @ 7,200 px/s"` |
| `value` | REAL | NOT NULL | Numeric measurement value |
| `unit` | TEXT | NOT NULL | `"ms"`, `"MB"`, `"fps"` |
| `better` | TEXT | NOT NULL | `"lower"` or `"higher"` |
| `rating` | TEXT | nullable | `"good"`, `"ok"`, or `"bad"` |

The `ON DELETE CASCADE` on `run_id` means deleting a run automatically removes all its metrics.

---

## Indexes

11 indexes are created by the seed script.

### On `benchmark_runs`

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_runs_library` | `library_slug` | Filter by library |
| `idx_runs_library_item` | `library_slug, item_count` | Most common filter combination |
| `idx_runs_library_ver` | `library_slug, library_version` | Version-specific queries |
| `idx_runs_created` | `created_at` | History queries (date range) |
| `idx_runs_success` | `success` | Skip failed runs in aggregations |
| `idx_runs_stress` | `stress_ms` | Filter by stress level |
| `idx_runs_scroll_speed` | `scroll_speed` | Filter by scroll speed override |
| `idx_runs_stats` | `library_slug, library_version, item_count, stress_ms, scroll_speed, success` | Composite — covers the full stats query pattern without a scan |

### On `benchmark_metrics`

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_metrics_run` | `run_id` | Join from runs to metrics |
| `idx_metrics_run_label` | `run_id, label` | Fetch a specific metric for a run |
| `idx_metrics_label` | `label` | Query all values for a given metric label |

The composite `idx_runs_stats` index is the most important for query performance. The `getStats()` function in the API filters by all six of those columns simultaneously — this index means the query never performs a full table scan.

---

## SQLite PRAGMAs

Three PRAGMAs are set when the connection is first opened:

| PRAGMA | Value | Effect |
|--------|-------|--------|
| `journal_mode` | `WAL` | Write-ahead logging — read queries are not blocked while a write is in progress |
| `cache_size` | `-4000` | 4 MB in-memory page cache (negative value = kilobytes) |
| `foreign_keys` | `ON` | Enforces the `run_id` FK in `benchmark_metrics` |

WAL mode is particularly useful here because the API serves many concurrent read requests (stats, history) while occasionally writing a new benchmark result. Without WAL, a write would block all readers.

---

## Connection Lifecycle

`src/api/benchmarks.ts` manages a singleton `Database` instance:

- **Lazy init** — the connection is not opened until the first request that touches the database.
- **No pooling** — a single connection is shared. SQLite with WAL handles concurrent read access without pooling.
- **Test isolation** — `setDbPath(path)` closes the existing connection and points to a different file. `resetDb()` does the same and restores the default path. These are exported for use in tests.

### Server-side consumers

The database is accessed in three ways:

1. **Puppeteer auto-persist** — When a server-side benchmark run completes, the `onProgress` callback in `src/api/run.ts` intercepts the `result` event and calls `storeResult()` directly. No client-side POST is needed for individual library benchmarks. The `userAgent` is set to `"Puppeteer headless (server-side)"`.
2. **API routes** (`/api/benchmarks/*`) — HTTP endpoints that accept or return JSON. The `POST /api/benchmarks` endpoint is still available for crowdsourced submissions from external clients.
3. **Page renderers** — the results page (`/benchmarks/results`) calls `getStats()` and `getSummary()` directly during server-side HTML assembly, with no HTTP round-trip. This is possible because `getStats()` and `getSummary()` are exported from `src/api/benchmarks.ts` and imported by `src/server/pages/benchmarks.ts`. Both code paths share the same singleton `Database` connection.

---

## Seed Script (`scripts/seed-db.ts`)

Creates `data/benchmarks.db` from scratch.

```bash
bun run seed:db          # create (no-op if file already exists)
bun run seed:db:force    # drop and recreate
```

The script:
1. Creates the `data/` directory if it does not exist
2. Exits early if `benchmarks.db` already exists (unless `--force`)
3. Sets `PRAGMA journal_mode = WAL` and `PRAGMA synchronous = NORMAL`
4. Creates both tables with `CREATE TABLE IF NOT EXISTS`
5. Creates all 11 indexes
6. Prints a verification summary: column definitions, row counts, and index list
7. Reports the final file size

`PRAGMA synchronous = NORMAL` is used during creation (faster than `FULL`). At runtime, WAL mode's default synchronous behaviour is sufficient for durability.

### Output example

```
  🗄️  Creating benchmarks database

  Target:  /path/to/data/benchmarks.db

  ✅ Tables created:

  📋 benchmark_runs (Benchmark runs) — 0 rows
     id                       INTEGER    nullable
     created_at               TEXT       NOT NULL
     library_slug             TEXT       NOT NULL
     ...

  📑 Indexes created (11):

     idx_metrics_label          → benchmark_metrics
     idx_metrics_run            → benchmark_metrics
     ...

  📦 Database size: 4.0 KB

  Done! 🎉
```

---

## Storage Transaction

Every result write (whether from Puppeteer auto-persist or `POST /api/benchmarks`) goes through `storeResult()`, which wraps both inserts in a single SQLite transaction:

```
BEGIN
  INSERT INTO benchmark_runs (library_slug, library_version, item_count, …)
  → runId = lastInsertRowid
  INSERT INTO benchmark_metrics (run_id, label, value, unit, better, rating) × N
COMMIT
```

If any metric insert fails, the entire transaction rolls back and no run row is left in the database. This prevents orphaned run rows with no associated metrics.

---

## Querying the Database Directly

The database file is standard SQLite and can be opened with any SQLite client:

```bash
sqlite3 data/benchmarks.db

# Count runs per library
SELECT library_slug, COUNT(*) as runs
FROM benchmark_runs
WHERE success = 1
GROUP BY library_slug
ORDER BY runs DESC;

# Average render time for react-window at 10K items
SELECT AVG(m.value) as avg_render_ms
FROM benchmark_metrics m
JOIN benchmark_runs r ON r.id = m.run_id
WHERE r.library_slug = 'react-window'
  AND r.item_count = 10000
  AND r.success = 1
  AND m.label = 'Render';

# All metrics for the most recent run
SELECT m.label, m.value, m.unit, m.rating
FROM benchmark_metrics m
JOIN benchmark_runs r ON r.id = m.run_id
WHERE r.id = (SELECT MAX(id) FROM benchmark_runs WHERE success = 1);
```
