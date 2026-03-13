# API

The REST API lives in `src/api/`. It handles all `/api/*` requests, which are the only async path through the router. Every response includes CORS headers so the API can be queried from other origins.

---

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/benchmarks` | Store a benchmark result |
| `GET` | `/api/benchmarks/stats` | Aggregated statistics for a library |
| `GET` | `/api/benchmarks/history` | Time-series data for a metric |
| `GET` | `/api/benchmarks/libraries` | All library slugs that have data in the DB |
| `GET` | `/api/benchmarks/browsers` | Browser breakdown of stored runs |
| `GET` | `/api/benchmarks/summary` | High-level counts overview |
| `GET` | `/api/health` | Server health check |

---

## API Router (`src/api/router.ts`)

`routeApi(req, url)` receives every request that reaches `handleAsync()` in the main router. It strips the `/api` prefix, leaving a sub-path such as `/benchmarks/stats`, and delegates to `routeBenchmarks()`.

The health check at `/api/health` returns:

```json
{ "status": "ok", "timestamp": "2025-01-15T12:00:00.000Z" }
```

Unknown sub-paths return `{ "error": "Unknown API endpoint" }` with status 404.

---

## CORS Headers

All responses from the API include:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

`OPTIONS /api/*` preflight requests are handled synchronously in the main router before the async path is entered. They return 204 with these headers and no body.

---

## POST /api/benchmarks

Stores a single benchmark result. Called automatically by `persistResult()` in the browser — no manual action is needed.

### Request body

```json
{
  "librarySlug": "react-window",
  "libraryVersion": "1.8.10",
  "itemCount": 10000,
  "metrics": [
    { "label": "Render",     "value": 8.5,   "unit": "ms",  "better": "lower",  "rating": "good" },
    { "label": "Memory",     "value": 2.26,  "unit": "MB",  "better": "lower",  "rating": "ok"   },
    { "label": "Scroll FPS", "value": 120.5, "unit": "fps", "better": "higher", "rating": "good" },
    { "label": "P95 Frame",  "value": 9.1,   "unit": "ms",  "better": "lower",  "rating": "good" }
  ],
  "duration": 45200,
  "success": true,
  "stressMs": 0,
  "scrollSpeed": 0,
  "userAgent": "Mozilla/5.0 ...",
  "hardwareConcurrency": 10,
  "deviceMemory": 16,
  "screenWidth": 1440,
  "screenHeight": 900
}
```

### Required fields

| Field | Type | Constraints |
|-------|------|------------|
| `librarySlug` | string | Non-empty, `[a-z0-9-]+`, max 64 chars |
| `itemCount` | number | Must be one of: 1000, 5000, 10000, 50000, 100000, 500000, 1000000 |
| `metrics` | array | 1–100 items; each item requires `label`, `value`, `unit`, `better` |
| `metrics[].label` | string | Non-empty, max 128 chars |
| `metrics[].value` | number | Finite number |
| `metrics[].unit` | string | Non-empty, max 32 chars |
| `metrics[].better` | string | Must be `"lower"` or `"higher"` |
| `duration` | number | Finite, non-negative |
| `success` | boolean | |

### Optional fields

| Field | Type | Notes |
|-------|------|-------|
| `libraryVersion` | string | Max 32 chars |
| `metrics[].rating` | string | Must be `"good"`, `"ok"`, or `"bad"` if present |
| `metrics[].meta` | string | Max 256 chars |
| `stressMs` | number | Finite, non-negative |
| `scrollSpeed` | number | Finite, non-negative |
| `error` | string | Max 1024 chars |
| `userAgent` | string | Max 512 chars; truncated server-side if longer |
| `hardwareConcurrency` | number | Clamped to 256 |
| `deviceMemory` | number | Clamped to 1024 |
| `screenWidth` | number | Clamped to 16384 |
| `screenHeight` | number | Clamped to 16384 |

### Response

Success: `201 Created`
```json
{ "success": true, "runId": 42 }
```

Validation failure: `400 Bad Request`
```json
{ "error": "metrics[2].better must be \"lower\" or \"higher\"" }
```

Rate limited: `429 Too Many Requests`
```json
{ "error": "Rate limit exceeded. Try again in a minute." }
```

---

## Rate Limiting

In-memory per-IP limiting. Limits are:

- Window: 60 seconds
- Maximum: 30 POST requests per IP per window

IP is resolved from `X-Forwarded-For` (first value), then `X-Real-IP`, then falls back to `"unknown"`.

Expired entries are cleaned up automatically every 5 minutes via `setInterval`.

---

## GET /api/benchmarks/stats

Returns aggregated metric statistics for a library. Results are grouped by `(librarySlug, libraryVersion, itemCount)`.

### Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `librarySlug` | — | Filter by library slug |
| `libraryVersion` | — | Filter by version string |
| `itemCount` | — | Filter by item count (e.g. `10000`) |
| `stressMs` | — | Filter by stress level |
| `scrollSpeed` | — | Filter by scroll speed override |
| `limit` | — | Max result groups (default: 100) |

### Response

```json
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
          "min": 6.2,
          "max": 18.4,
          "p5": 6.9,
          "p95": 14.2,
          "stddev": 2.1,
          "sampleCount": 47
        }
      ]
    }
  ],
  "total": 1
}
```

### Aggregation method

All metric values for the group are collected, sorted ascending, and the following statistics are computed:

- **median** — 50th percentile via linear interpolation
- **mean** — arithmetic mean
- **min / max** — first and last values of the sorted array
- **p5 / p95** — 5th and 95th percentiles via linear interpolation
- **stddev** — population standard deviation
- **sampleCount** — number of valid readings for this metric

---

## GET /api/benchmarks/history

Returns daily aggregate data for a single metric and library, suitable for time-series charts.

### Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `librarySlug` | ✓ | Library to query |
| `metric` | ✓ | Metric label (e.g. `"Render"`) |
| `itemCount` | — | Filter by item count |
| `libraryVersion` | — | Filter by version |
| `days` | — | Lookback window (default: 90, max: 365) |
| `stressMs` | — | Filter by stress level |
| `scrollSpeed` | — | Filter by scroll speed |

### Response

```json
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
}
```

Results are grouped by calendar day (UTC) and library version. Multiple runs on the same day are aggregated into a single `HistoryPoint`.

---

## GET /api/benchmarks/libraries

Returns all library slugs that have at least one successful run in the database, with version and run count information. This reflects what is actually in the database, which may differ from what is registered in the server registry.

### Response

```json
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
}
```

---

## GET /api/benchmarks/browsers

Returns browser usage breakdown based on parsed `user_agent` values from stored runs.

User agents are parsed into browser names using a regex cascade: Edge → Opera → Firefox → Chrome → Safari → IE → Other.

Multiple distinct UA strings that parse to the same browser name are merged into a single entry with summed run counts.

### Response

```json
{
  "items": [
    { "browser": "Chrome",  "totalRuns": 312, "lastSeen": "2025-01-15 11:42:00" },
    { "browser": "Firefox", "totalRuns": 41,  "lastSeen": "2025-01-14 09:12:00" }
  ],
  "total": 2
}
```

---

## GET /api/benchmarks/summary

High-level counts for the entire database. Useful for a stats dashboard.

### Response

```json
{
  "total_runs": 487,
  "successful_runs": 481,
  "failed_runs": 6,
  "unique_libraries": 8,
  "unique_versions": 11,
  "unique_item_counts": 3,
  "first_run": "2025-01-01 08:00:00",
  "last_run": "2025-01-15 11:42:00",
  "totalMetrics": 7234,
  "topLibraries": [
    { "slug": "react-window", "runs": 47 },
    { "slug": "tanstack-virtual", "runs": 43 }
  ]
}
```

---

## Database Connection

The `benchmarks.ts` module manages a single SQLite connection as a module-level singleton. It is opened lazily on the first request that needs the database.

Three PRAGMAs are set on connection:

| PRAGMA | Value | Effect |
|--------|-------|--------|
| `journal_mode` | `WAL` | Write-ahead logging — allows concurrent reads while a write is in progress |
| `cache_size` | `-4000` | 4 MB page cache |
| `foreign_keys` | `ON` | Enforces the `run_id` foreign key in `benchmark_metrics` |

If `data/benchmarks.db` does not exist when the first query runs, the server returns a 500 with the message: `"benchmarks.db not found. Run: bun run seed:db"`.

`setDbPath(path)` and `resetDb()` are exported for test isolation — they replace the singleton path and close the existing connection.

---

## Cache Headers

GET responses return `Cache-Control: public, max-age=60, stale-while-revalidate=300` so repeated identical queries within a minute are served by CDN or browser caches without hitting the server. Error responses return `Cache-Control: no-cache`.