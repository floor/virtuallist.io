# Build System

The build system compiles the client-side benchmark JavaScript into browser-ready bundles in `dist/benchmarks/`. It is driven by a single TypeScript script — `benchmarks/build.ts` — which uses Bun's built-in bundler directly.

---

## What Gets Built

| Output file | Source | Description |
|-------------|--------|-------------|
| `dist/benchmarks/runner.js` | `benchmarks/runner.js` | Standalone measurement engine module |
| `dist/benchmarks/headless.js` | `benchmarks/headless.js` | Puppeteer bundle: all adapters + frameworks, no UI (~1.5 MB minified) |
| `dist/benchmarks/script.js` | `benchmarks/script.js` | Client-side UI for individual library pages (~small, no adapters) |
| `dist/benchmarks/compare.js` | `benchmarks/compare.js` | Compare page bundle: all adapters + compare UI (~1.5 MB minified) |
| `dist/benchmarks/results.js` | `benchmarks/results.js` | Results page bundle: filter navigation + column sorting (~2 KB minified) |
| `dist/benchmarks/styles.css` | `benchmarks/styles.css` | Minified benchmark CSS (placeholder if file absent) |

The server serves these files from `/dist/*` URLs.

---

## Running the Build

```bash
# Build once
bun run build:bench

# Build and watch for changes
bun run build:bench:watch

# Equivalent to build:bench
bun run build
```

Watch mode uses Node's `fs.watch()` on the `benchmarks/` directory. Any change to a `.js`, `.ts`, or `.css` file triggers a full rebuild. The server must be running separately — the watch mode does not start a server.

---

## Build Options

Two modes depending on whether `--watch` is in `process.argv`:

| Option | Production (no `--watch`) | Development (`--watch`) |
|--------|--------------------------|------------------------|
| `minify` | `true` | `false` |
| `sourcemap` | `"none"` | `"inline"` |
| `format` | `"esm"` | `"esm"` |
| `target` | `"browser"` | `"browser"` |

Inline sourcemaps in development make it easy to debug adapter code in the browser's DevTools without a separate sourcemap file.

---

## Framework Deduplification Plugin

The `frameworkDedupePlugin` is the most important part of the build configuration. Without it, the bundle would contain multiple copies of React, Vue, and SolidJS — one from each library adapter that imports them — causing runtime crashes (hooks called in the wrong React instance, Vue reactivity state split across instances, etc.).

The plugin intercepts `onResolve` calls for framework package names and forces them to resolve from the project root's `node_modules`, regardless of which adapter triggered the import.

### Intercepted packages

| Filter | Resolved to |
|--------|-------------|
| `react`, `react-dom`, `react-dom/*` | `node_modules/react`, `node_modules/react-dom` |
| `vue` | `node_modules/vue/dist/vue.esm-bundler.js` |
| `@vue/*` | `node_modules/@vue/*` |
| `solid-js` | `node_modules/solid-js/dist/solid.js` (browser build) |
| `solid-js/web` | `node_modules/solid-js/web/dist/web.js` (browser build) |
| `solid-js/store` | `node_modules/solid-js/store/dist/store.js` (browser build) |
| `vlist`, `vlist/*` | `node_modules/vlist` |
| `@floor/virtuallist`, `@floor/virtuallist/*` | `node_modules/@floor/virtuallist` |

### Why SolidJS uses explicit browser builds

SolidJS's `package.json` exports use conditional exports where the `node`, `main`, and `module` entries all point to `dist/server.js` — the SSR bundle. Since `require.resolve()` runs in Bun/Node context, it picks the server entry by default. The server bundle throws "Client-only API called on the server side" when browser APIs like `render()` are called.

The plugin explicitly maps each `solid-js` sub-path to its browser bundle (`dist/solid.js`, `web/dist/web.js`, `store/dist/store.js`). The `solid-js/store` mapping is required because `@tanstack/solid-virtual` imports it internally for its reactive virtualizer state.

### Why Vue uses `vue.esm-bundler.js`

The default `vue` export (`vue.esm-browser.js`) does not include the template compiler. The `vue-virtual-scroller.js` adapter uses Vue's string `template` option at runtime rather than compiling `.vue` SFC files. Without the compiler-included build, this adapter would fail with a "Runtime-only build, template compiler not available" error.

`vue.esm-bundler.js` includes both the runtime and the compiler, making string templates work without any additional tooling.

### Plugin implementation

```js
build.onResolve({ filter: /^vue$/ }, () => {
  const resolved = require.resolve("vue/dist/vue.esm-bundler.js", {
    paths: ["./"],
  })
  return { path: resolved }
})
```

Each handler calls `require.resolve()` with `paths: ["./"]` (the project root) so the resolution always starts from the project's own `node_modules`, never from a library adapter's nested dependencies.

---

## Build Sequence

The build script runs five `Bun.build()` calls sequentially:

1. **`runner.js`** — built first as a standalone module producing `dist/benchmarks/runner.js`. This can be imported directly by other scripts if needed.

2. **`headless.js`** — built second. Imports all 15 library adapters and exposes the benchmark API on `window` for Puppeteer's `page.evaluate()`. This is the primary bundle for server-side benchmark execution — the framework deduplification plugin does most of its work here.

3. **`script.js`** — built third. The client-side UI for individual library pages (`/benchmarks/{slug}`). Triggers server-side runs via `POST /api/run` and consumes progress via SSE.

4. **`compare.js`** — built fourth. Imports all 15 adapters plus the compare page UI. Runs benchmarks client-side for head-to-head comparisons. Shares the same framework deduplication so no framework code is doubled inside the bundle itself.

5. **`results.js`** — built fifth. A lightweight script (~2 KB) with no framework imports — it only handles filter control navigation (item count / stress level → query params) and client-side column sorting of the server-rendered table. Does not use the framework dedupe plugin since it imports no frameworks.

If any build step fails, the script prints the error messages from `result.logs` and exits with code 1.

### CSS handling

After the JS builds, the script checks whether `benchmarks/styles.css` exists:
- If it exists: reads, minifies, and writes to `dist/benchmarks/styles.css`
- If it does not exist: writes a one-line placeholder comment

The CSS minifier is a simple function (no dependencies) that:
- Strips `/* ... */` comments
- Collapses whitespace around `{}:;,>~+` symbols
- Removes trailing semicolons before `}`
- Collapses all remaining whitespace to single spaces

---

## Vue Feature Flags

Three `define` constants are set at build time to control Vue's bundle optimisation:

| Flag | Value | Effect |
|------|-------|--------|
| `__VUE_OPTIONS_API__` | `"true"` | Keeps Options API support — required by `vue-virtual-scroller` |
| `__VUE_PROD_DEVTOOLS__` | `"false"` | Disables Vue DevTools integration in production |
| `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` | `"false"` | Suppresses hydration mismatch warnings |

These are passed to `Bun.build()` via the `define` option. Without `__VUE_OPTIONS_API__: "true"`, the Vue Options API tree-shakes out and `vue-virtual-scroller` breaks at runtime.

---

## Bundle Size

Both `headless.js` and `compare.js` are approximately 1.5 MB minified. They share the same adapter imports and framework runtimes — React 19, ReactDOM 19, Vue 3 (runtime + compiler), SolidJS 1.9 — so the size is nearly identical. The difference is only the page-specific entry code (a few KB).

`script.js` is lightweight — it contains only the SSE progress UI and controls logic. It does not import any library adapters or frameworks since individual library benchmarks now run server-side via Puppeteer.

`results.js` is approximately 2 KB minified. It contains no framework code — only vanilla JS for DOM manipulation (filter buttons and table sorting). This is intentional: the results page is server-rendered from the database, so the client-side script only adds interactivity to the already-rendered HTML.

This was a deliberate tradeoff:

**Why bundle all frameworks together in headless.js?**
- Dynamic imports at benchmark time would add latency that contaminates render-time measurements
- Splitting per-library would require multiple script tags and coordination logic
- The headless bundle runs in Puppeteer, not the visitor's browser — so download size is irrelevant

**Implication for visitors:** The compare page is the only page that downloads ~1.5 MB (for client-side comparisons). Individual library benchmark pages download only the lightweight `script.js` and stream results from the server.

---

## Output Directory

The build creates `dist/benchmarks/` if it does not exist (via `mkdirSync({ recursive: true })`). The `dist/` directory is listed in `.gitignore` and is not committed.

---

## Build Script Summary

```bash
# Typical development workflow
bun run build:bench           # build once after making changes
bun run build:bench:watch     # rebuild automatically as you edit

# Check what was built
ls -lh dist/benchmarks/
# runner.js    ~11 KB
# headless.js  ~1.5 MB   (Puppeteer bundle — all adapters + frameworks)
# script.js    ~small     (client-side SSE UI)
# compare.js   ~1.5 MB   (compare page — all adapters + frameworks)
# results.js   ~2 KB
# styles.css   ~9 KB     (vlist.css + local overrides, minified)
```
