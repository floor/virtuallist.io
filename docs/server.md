# Server

The server layer lives entirely in `src/server/`. It handles every incoming HTTP request, renders HTML pages, serves static files, and generates system responses like the sitemap. There is no HTTP framework — everything is built on `Bun.serve()` and plain TypeScript.

---

## Entry Point (`server.ts`)

`server.ts` is the only file Bun executes directly. It:

1. Reads `PORT` from `src/server/config.ts`
2. Imports `handleRequest` from `src/server/router.ts`
3. Calls `Bun.serve({ port: PORT, fetch: handleRequest, reusePort: true, idleTimeout: 255 })`
4. Sends `process.send("ready")` so PM2 knows the instance is accepting connections

`reusePort: true` allows multiple Bun processes to bind the same port for load balancing without a separate proxy step, if needed in the future.

`idleTimeout: 255` (seconds) prevents Bun from closing long-lived SSE connections used by the benchmark progress stream. Without this, SSE connections would be dropped during benchmark runs that take longer than the default timeout.

---

## Config (`src/server/config.ts`)

Exports constants used throughout the server layer. No logic — pure declarations.

| Export | Default | Purpose |
|--------|---------|---------|
| `IS_PROD` | `NODE_ENV === "production"` | Controls caching, sourcemaps, page cache |
| `PORT` | `process.env.PORT \|\| 3456` | HTTP listen port |
| `ROOT` | `resolve(".")` | Absolute path to the project root |
| `SITE` | `"https://virtuallist.io"` | Used in canonical URLs, OG tags, sitemap |
| `BENCHMARKS_DIR` | `ROOT/benchmarks` | Benchmark source files |
| `DIST_DIR` | `ROOT/dist` | Built asset output |
| `PUBLIC_DIR` | `ROOT/public` | Static asset source |
| `DATA_DIR` | `ROOT/data` | SQLite database directory |
| `DB_PATH` | `DATA_DIR/benchmarks.db` | SQLite file path |

---

## Router (`src/server/router.ts`)

`handleRequest(req: Request): Response | Promise<Response>` is the single `fetch` handler passed to `Bun.serve()`.

### Sync-first design

Non-API routes are resolved synchronously in a null-coalescing chain. No `Promise` is allocated until a request reaches `/api/*`. This matters for throughput: the vast majority of requests — page loads, static files, sitemap — complete without entering the microtask queue.

```
resolveSystem()      →  /sitemap.xml, /robots.txt
resolveHomepage()    →  /
resolveBenchmarks()  →  /benchmarks, /benchmarks/{slug}
resolveMethodology() →  /methodology
resolveAbout()       →  /about, /about/api, /about/contribute
resolveStatic()      →  /dist/*, /public/*, /favicon.ico
handleAsync()        →  /api/*   ← only path that creates a Promise
```

Each resolver receives the decoded `pathname` string and returns either a `Response` or `null`. The first non-null return wins. If nothing matches, `handleAsync` falls through to a 404.

The full resolved route table:

| URL pattern | Resolver | Notes |
|-------------|----------|-------|
| `/sitemap.xml`, `/robots.txt` | `routeSystem()` | Cached strings |
| `/` | `resolveHomepage()` | |
| `/benchmarks`, `/benchmarks/{slug}` | `resolveBenchmarks()` | 404 if slug not in registry |
| `/methodology` | `resolveMethodology()` | |
| `/about`, `/about/api`, `/about/contribute` | `resolveAbout()` | 404 for unknown sub-pages |
| `/dist/*`, `/public/*`, `/favicon.ico` | `resolveStatic()` | 404 if file missing |
| `/api/run/*` | `handleAsync()` → `routeApi()` → `routeRun()` | Benchmark run management (SSE) |
| `/api/*` | `handleAsync()` → `routeApi()` → `routeBenchmarks()` | Data storage/aggregation |

### About sub-page routing

`/about` and its two sub-pages match the pattern `/^\/about\/([a-z0-9-]+)\/?$/`. The captured group is passed to `renderAboutPage(slug)`. Unknown sub-slugs return `null` and fall through to 404.

### Benchmark slug routing

Individual library pages match the pattern `/^\/benchmarks\/([a-z0-9-]+)\/?$/`. The captured group is the library slug, which is passed to `renderBenchmarkPage(slug)`. If the slug is not in the registry, `renderBenchmarkPage` returns `null` and the router returns 404.

### CORS preflight

`OPTIONS /api/*` requests are handled before the sync chain and return a `204` with `Access-Control-Allow-Origin: *`, `Allow-Methods: GET, POST, OPTIONS`, and a 24-hour `Max-Age`.

---

## Shell Template (`src/server/shell.ts`)

`renderShell(options: ShellOptions): string` is the single function that every page renderer calls. It returns a complete `<!DOCTYPE html>` document as a string.

### ShellOptions fields

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `title` | string | ✓ | `<title>` and `og:title` |
| `description` | string | ✓ | `<meta name="description">` and `og:description` |
| `url` | string | ✓ | Canonical URL and `og:url` |
| `content` | string | ✓ | Injected into `<main>` |
| `extraHead` | string | — | Additional `<head>` content (style blocks, preloads) |
| `extraBody` | string | — | Content before `</body>` (script tags) |
| `mainClass` | string | — | CSS class on the `<main>` element |
| `activeNav` | string | — | Slug of the active nav link (`"benchmarks"` or `"methodology"`) |
| `ogType` | string | — | `og:type` value, defaults to `"website"` |

### What the shell renders

**`<head>`**
- UTF-8 charset, viewport meta
- `<title>` and `<meta name="description">`
- Canonical `<link>`
- Open Graph tags: `og:type`, `og:title`, `og:description`, `og:url`, `og:site_name`
- Twitter Card tags: `twitter:card`, `twitter:title`, `twitter:description`
- Inline `<style>` block with critical CSS (see below)
- `<link rel="stylesheet" href="/dist/benchmarks/styles.css">`
- The `extraHead` slot

**`<body>`**
- Sticky navigation header (via `buildNav()`)
- `<main>` with the page content
- Site footer (via `buildFooter()`)
- The `extraBody` slot

### Navigation (`buildNav()`)

The header is `position: sticky; top: 0` with a frosted-glass blur effect (`backdrop-filter: blur(12px)`). It contains:
- Logo: ⚡ icon + "virtuallist.io" text, links to `/`
- Nav links: Benchmarks (`/benchmarks`), Methodology (`/methodology`), About (`/about`) — the active one receives `.nav__link--active`
- GitHub icon link pointing to the public repository

On screens narrower than 640px the logo text is hidden, leaving only the icon. The `activeNav` slug passed to `renderShell()` determines which link gets the active style — `"benchmarks"`, `"methodology"`, or `"about"`.

### Footer (`buildFooter()`)

Centered text. Two-line layout: site description above, secondary links below. Current footer links: Methodology · About · Contribute · API · GitHub.

### Critical CSS

The shell inlines approximately 140 lines of CSS directly in `<style>` to prevent FOUC (flash of unstyled content). It covers:

- Box-model reset (`* { box-sizing: border-box; margin: 0; padding: 0 }`)
- `body` as a flex column so the footer always sticks to the bottom
- **CSS custom property theme tokens** on `:root`:

  | Token | Value | Role |
  |-------|-------|------|
  | `--bg` | `#0a0a0f` | Page background |
  | `--bg-surface` | `#12121a` | Card / surface background |
  | `--bg-elevated` | `#1a1a26` | Elevated surface |
  | `--bg-hover` | `#22222e` | Hover state |
  | `--border` | `#2a2a3a` | Standard border |
  | `--border-subtle` | `#1e1e2e` | Subtle divider |
  | `--text` | `#e8e8f0` | Primary text |
  | `--text-secondary` | `#9090a8` | Secondary text |
  | `--text-muted` | `#606078` | Muted / disabled text |
  | `--accent` | `#6c8cff` | Blue accent |
  | `--accent-dim` | `#4a6ae0` | Darker accent (hover) |
  | `--accent-glow` | `rgba(108,140,255,0.12)` | Accent background tint |
  | `--green` | `#4ade80` | Good rating |
  | `--yellow` | `#fbbf24` | Ok rating |
  | `--red` | `#f87171` | Bad rating |
  | `--radius` | `8px` | Standard border radius |
  | `--radius-lg` | `12px` | Large border radius |
  | `--transition` | `150ms ease` | Standard transition |
  | `--max-width` | `1200px` | Content max width |

- Navigation and footer layout styles
- Mobile breakpoint at 640px

---

## Static File Resolver (`src/server/static.ts`)

`resolveStatic(pathname: string): Response | null` maps URL paths to filesystem locations:

| URL prefix | Filesystem location |
|-----------|-------------------|
| `/favicon.ico` | `public/favicon.ico` |
| `/dist/*` | `dist/*` |
| `/public/*` | `public/*` |

Returns `null` if no matching file exists, allowing the router to continue to 404.

### Path traversal protection

Any `pathname` containing `..`, `~`, or null bytes (`\0`) returns `null` immediately without touching the filesystem.

### MIME types

Determined by file extension from a static lookup table. 20+ types covered: HTML, CSS, JS, JSON, images (PNG, JPEG, GIF, SVG, WebP, AVIF), fonts (WOFF, WOFF2, TTF, OTF), and more. Unrecognised extensions default to `application/octet-stream`.

### Cache-Control strategy

| Context | Path | Header |
|---------|------|--------|
| Development | any | `no-cache, no-store, must-revalidate` |
| Production | `/dist/*` | `public, max-age=31536000, immutable` |
| Production | everything else | `public, max-age=3600, must-revalidate` |

`/dist/*` files get the 1-year immutable cache because they are built assets. Cache busting is handled by rebuilding (the content changes, not the filename — this is a tradeoff; content-hashed filenames would be more correct but the current setup is simpler).

Files are served as `Bun.file()` streams, which on Linux uses `sendfile` for zero-copy transfer.

---

## Sitemap & robots.txt (`src/server/sitemap.ts`)

Both documents are generated programmatically from the library registry. They are computed once and cached in module-level variables. `clearSitemapCache()` resets both caches if the registry changes at runtime.

### Sitemap

Entries are built by calling `getLibrarySlugs()` from the registry. Adding a new library to the registry automatically adds its page to the sitemap — no manual update required.

Priority assignments:

| Page | Priority | Changefreq |
|------|---------|-----------|
| `/` | 1.0 | weekly |
| `/benchmarks` | 0.9 | weekly |
| `/benchmarks/{slug}` (each library) | 0.8 | weekly |
| `/methodology` | 0.7 | monthly |
| `/about` | 0.6 | monthly |
| `/about/contribute` | 0.6 | monthly |
| `/about/api` | 0.5 | monthly |

Response headers: `Content-Type: application/xml; charset=utf-8`, `Cache-Control: public, max-age=3600, must-revalidate`.

### robots.txt

Allows all user agents, disallows `/api/` and `/dist/`, and declares the sitemap URL. Response headers: `Cache-Control: public, max-age=86400, must-revalidate`.