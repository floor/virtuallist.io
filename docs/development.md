# Development

---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0

No other runtime is required. Bun handles TypeScript execution natively, runs the bundler, and provides the SQLite driver.

---

## Initial Setup

```bash
# 1. Install dependencies
bun install

# 2. Create the SQLite database
bun run seed:db

# 3. Build the benchmark bundle
bun run build

# 4. Start the development server
bun run dev
```

Server starts at **http://localhost:3456**.

---

## Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `build:bench && bun --watch server.ts` | Build once then start server with auto-reload on TypeScript changes |
| `dev:full` | `build:bench && build:bench:watch & bun --watch server.ts` | Same as `dev` plus benchmark bundle watch mode running in parallel |
| `start` | `bun run server.ts` | Start server without building (requires `dist/` to already exist) |
| `build` | `bun run build:bench` | Build benchmark bundle once |
| `build:bench` | `bun run benchmarks/build.ts` | Same as `build` |
| `build:bench:watch` | `bun run benchmarks/build.ts --watch` | Rebuild on any change under `benchmarks/` |
| `seed:db` | `bun run scripts/seed-db.ts` | Create `data/benchmarks.db` (no-op if file already exists) |
| `seed:db:force` | `bun run scripts/seed-db.ts --force` | Drop and recreate the database |
| `test` | `bun test test/` | Run the test suite |
| `test:watch` | `bun test --watch test/` | Run tests in watch mode |
| `typecheck` | `tsc --noEmit` | TypeScript type check without emitting files |

---

## Development Modes

### `bun run dev` — recommended for most work

Builds the benchmark bundle once, then starts the server in `--watch` mode. Bun restarts the server process automatically when any TypeScript file under `src/` or `server.ts` changes. Benchmark JS changes require a manual `bun run build` or a separate `build:bench:watch` process.

**Use this when:** editing page renderers, the API, the registry, or the server layer.

### `bun run dev:full` — recommended when editing benchmark JS

Runs three processes in parallel:
- `build:bench:watch` — rebuilds `dist/benchmarks/` on any change under `benchmarks/`
- `bun --watch server.ts` — restarts the server on TypeScript changes

Both run concurrently using the shell `&` operator. Output from all processes is interleaved in the terminal.

**Use this when:** editing library adapters, `runner.js`, `headless.js`, or `compare.js`.

---

## Page Cache Behaviour

In development (`NODE_ENV` is not `"production"`), page HTML is never cached. Every request re-renders the page from scratch. This means TypeScript changes to any page renderer are reflected immediately on the next browser refresh — no server restart needed (Bun's `--watch` mode handles that).

In production, each page is rendered once and the HTML string is stored in a module-level variable for the lifetime of the process.

---

## Benchmark Bundle Changes

Changes to files under `benchmarks/` (adapters, `runner.js`, `headless.js`, `compare.js`) require a rebuild. The server does not restart automatically when `dist/benchmarks/*.js` changes — just refresh the browser tab after the build completes.

```bash
# Rebuild after editing an adapter
bun run build

# Or run the watcher and rebuild automatically
bun run build:bench:watch
```

---

## Database

The database file `data/benchmarks.db` is gitignored. Run `seed:db` on each fresh clone.

```bash
# Create fresh (no-op if exists)
bun run seed:db

# Drop and recreate (destroys all stored results)
bun run seed:db:force
```

To inspect stored data directly:

```bash
sqlite3 data/benchmarks.db

# Example: count stored runs per library
SELECT library_slug, COUNT(*) FROM benchmark_runs GROUP BY library_slug;
```

See [database.md](./database.md) for the full schema.

---

## Running Benchmarks Locally

### Browser (UI)

Once the server is running:

1. Open `http://localhost:3456/benchmarks/{slug}` for any library slug
2. Click **▶ Run**
3. The server executes the benchmark in headless Chrome via Puppeteer
4. Progress streams live via SSE — results appear as each phase completes
5. Results are auto-persisted to the local database (no client-side POST needed)

### CLI

The `scripts/benchmark.ts` script runs benchmarks from the terminal:

```bash
# Run all libraries at 10K items (default)
bun run scripts/benchmark.ts

# Run specific libraries with options
bun run scripts/benchmark.ts --library vlist,react-window --items 10K,1M --intensity quick --runs 3
```

| Option | Default | Description |
|--------|---------|-------------|
| `--library` | all | Comma-separated library slugs |
| `--items` | 10K | Comma-separated: 10K, 100K, 1M, or a number |
| `--intensity` | default | quick, default, full |
| `--runs` | 1 | Runs per library/size combo |

The script starts runs via `POST /api/run`, consumes SSE progress with retry logic, and displays a terminal progress bar with sliding-window ETA. The server must be running.

All seven routes return 200 before any library-specific testing is done:

```bash
curl http://localhost:3456/             # homepage
curl http://localhost:3456/benchmarks   # overview
curl http://localhost:3456/benchmarks/react-window  # library page
curl http://localhost:3456/methodology  # methodology
curl http://localhost:3456/api/health   # API health
curl http://localhost:3456/sitemap.xml  # sitemap
curl http://localhost:3456/robots.txt   # robots
```

---

## TypeScript

The project uses strict TypeScript (`"strict": true` in `tsconfig.json`). The `benchmarks/` directory contains plain JavaScript (`.js`) files — they are not type-checked by `tsc` but are bundled by Bun's bundler.

Run a type check at any time:

```bash
bun run typecheck
```

`tsc --noEmit` checks `src/**/*.ts`, `server.ts`, `scripts/**/*.ts`, and `benchmarks/**/*.ts` (for the `.ts` build script only).

---

## Testing

The `test/` directory is scaffolded but empty. Tests use Bun's built-in test runner:

```bash
bun test test/
bun test --watch test/
```

Test files follow the `*.test.ts` naming convention. The API module exports `setDbPath()` and `resetDb()` for test isolation — tests can point the database singleton at an in-memory or temporary file without affecting the development database.

Example test setup:

```ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { setDbPath, resetDb } from "../src/api/benchmarks";

beforeAll(() => {
  setDbPath(":memory:");
  // or: setDbPath("/tmp/test-benchmarks.db")
});

afterAll(() => {
  resetDb();
});
```

---

## Port Configuration

The server listens on port `3456` by default. Override with the `PORT` environment variable:

```bash
PORT=8080 bun run dev
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3456` | HTTP listen port |
| `NODE_ENV` | (unset) | Set to `"production"` to enable page caching and immutable asset headers |

No `.env` file is needed for development. All defaults work out of the box.

---

## Common Tasks

### Add a new library

See [adding-a-library.md](./adding-a-library.md) for the complete guide.

### Change a library's metadata

Edit the entry in `src/server/registry.ts`. The server auto-reloads (in `--watch` mode) and the changes appear immediately on the next page load. No rebuild required.

### Reset stored benchmark data

```bash
bun run seed:db:force
```

This drops and recreates the database. All stored results are lost.

### Check what the API returns

```bash
# Health
curl http://localhost:3456/api/health

# Summary of all stored data
curl http://localhost:3456/api/benchmarks/summary

# Stats for a specific library
curl "http://localhost:3456/api/benchmarks/stats?librarySlug=react-window&itemCount=10000"
```

---

## Directory Quick Reference

| Directory | Purpose |
|-----------|---------|
| `src/server/` | Server layer: router, renderers, shell, registry, static, sitemap |
| `src/server/pages/` | One file per page: home, benchmarks, methodology |
| `src/api/` | REST API: router and benchmark storage/aggregation |
| `benchmarks/` | Benchmark engine (runs in headless Chrome via Puppeteer) |
| `benchmarks/libraries/` | One adapter file per library |
| `scripts/` | CLI tools: seed-db, benchmark runner with progress bar |
| `data/` | SQLite database (gitignored) |
| `dist/` | Build output (gitignored) |
| `public/` | Static assets served at `/public/*` |
| `test/` | Test files |
| `docs/` | This documentation |