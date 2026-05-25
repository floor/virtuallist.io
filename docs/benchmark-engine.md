# Benchmark Engine

The benchmark engine runs server-side in headless Chrome via Puppeteer. The measurement code lives in `benchmarks/runner.js`, which imports measurement primitives from `@floor/virtuallist`. The Puppeteer orchestration lives in `src/server/benchmark-runner.ts`.

The engine is completely library-agnostic. It does not know or care which library it is measuring. Every library goes through the exact same function call chain, producing the same metric structure.

Benchmarks run in a controlled environment with uncapped `requestAnimationFrame` (no 60Hz/120Hz variance), precise memory info, and explicit GC control — producing reproducible results independent of the visitor's hardware.

---

## Overview

```
src/server/benchmark-runner.ts     ← Puppeteer orchestration, queue management
benchmarks/headless.js             ← Entry point injected into Puppeteer page
benchmarks/runner.js               ← Core measurement engine
  ├── Library registry             defineLibrary(), getLibrary()
  ├── Constants                    ITEM_HEIGHT, SCROLL_SPEEDS, WARMUP_ITERATIONS, …
  ├── Shared item templates        benchmarkTemplate(), createRealisticReactChildren(), …
  ├── Measurement primitives       imported from @floor/virtuallist:
  │     measureDuration(), nextFrame(), waitFrames(), tryGC(), settleHeap(),
  │     measureMemoryDelta(), measureScrollPerformance(), measureScrollToIndex(),
  │     getHeapUsed(), findViewport(), burnCpu(), median(), percentile(), round(), bytesToMB()
  ├── Memory with retries          measureMemoryWithRetries()
  ├── Intensity presets            INTENSITY_PRESETS (quick/default/full)
  ├── Five-phase pipeline          benchmarkLibrary()
  ├── Metrics builder              buildMetrics()
  ├── Runner                       runBenchmarks()
  └── Persistence                  persistResult()
```

---

## Library Registry

The engine maintains its own in-browser registry, separate from the server-side registry. Library adapters register themselves by calling `defineLibrary(adapter)` when their module is imported.

```js
defineLibrary({
  slug: "react-window",     // must match the server registry slug exactly
  name: "react-window",
  ecosystem: "react",
  create(container, itemCount) { … },   // → Promise<instance>
  destroy(instance) { … },              // → Promise<void>
})
```

`defineLibrary()` throws immediately if the same slug is registered twice, which would indicate a duplicate import.

**Functions:**

| Function | Purpose |
|----------|---------|
| `defineLibrary(adapter)` | Register a library adapter |
| `getLibrary(slug)` | Look up an adapter by slug |
| `getLibraries()` | Get all registered adapters |

---

## Constants

### Measurement constants (`benchmarks/constants.js`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `ITEM_HEIGHT` | `48` px | Fixed row height used by every library. Must be identical across all adapters. |
| `WARMUP_ITERATIONS` | `2` | JIT warmup iterations before measurement (not timed). |
| `MEASURE_ITERATIONS` | `5` | Number of render timing iterations. Median is reported. |
| `MEMORY_ATTEMPTS` | `5` | Maximum memory measurement attempts. |
| `SCROLL_DURATION_MS` | `1500` | Duration of each scroll speed test in milliseconds. |
| `BASE_SCROLL_SPEED` | `7200` | Base scroll speed in px/s (1× multiplier). |
| `DEFAULT_OVERSCAN` | `5` | Off-screen items to render, used where the library supports it. |

These constants are the defaults. The `benchmarkLibrary()` function uses **intensity presets** that override several of these values.

### Intensity Presets

Intensity presets control how thorough each measurement phase is. They are selected per-run via the `intensity` parameter.

| Preset | Warmup | Render Iters | Memory Attempts | Scroll Duration | Jump Iters | ~Time/Library |
|--------|--------|-------------|-----------------|-----------------|------------|---------------|
| `quick` | 1 | 3 | 3 | 1000ms | 3 | ~20s |
| `default` | 2 | 5 | 5 | 1500ms | 5 | ~40s |
| `full` | 3 | 7 | 5 | 2000ms | 7 | ~60s+ |

### `SCROLL_SPEEDS`

Five progressive speed presets built from `BASE_SCROLL_SPEED` multipliers.

| ID | Multiplier | px/s | Characteristic |
|----|-----------|------|---------------|
| `gentle` | 0.25× | 1,800 | Gentle browsing |
| `slow` | 0.5× | 3,600 | Casual scrolling |
| `normal` | 1× | 7,200 | Normal speed |
| `fast` | 2× | 14,400 | Aggressive flick |
| `aggressive` | 3× | 21,600 | Heavy DOM churn |

Total scroll time per benchmark run (default intensity): 5 speeds × 1.5 seconds = **7.5 seconds of scrolling**.

---

## Shared Item Template

Every library must render the same DOM structure per item. This is enforced by providing three helper functions that each produce an identical 7-element tree, adapted for different rendering approaches:

```
.bench-item
  ├── .bench-item__avatar      "AB" (initials)
  ├── .bench-item__content
  │   ├── .bench-item__title   "Alice — Item 0"
  │   └── .bench-item__sub     "Lorem ipsum dolor sit amet"
  └── .bench-item__meta
      ├── .bench-item__badge   "Active"
      └── .bench-item__time    "1m"
```

Text content is deterministic — generated from `ITEM_NAMES` (10 names) and `ITEM_BADGES` (4 badges) arrays using `index % length` so every library renders identical text at the same position.

| Helper | Output | Used by |
|--------|--------|---------|
| `benchmarkTemplate(_item, index)` | HTML string (inner content only) | Libraries with an HTML template API |
| `createRealisticReactChildren(React, index)` | `React.ReactElement[]` | All React-based libraries |
| `populateRealisticDOMChildren(el, index)` | Mutates a DOM element in place | SolidJS, template-less Vue |
| `generateRealisticItemHTML(index, height)` | Complete `<div class="bench-item">` HTML string | Libraries that require pre-built row HTML (Clusterize.js) |

---

## Measurement Primitives (from `@floor/virtuallist`)

All timing, memory, scroll, and math utilities are imported from the `@floor/virtuallist` package — a standalone npm package that lives at [`github.com/floor/virtuallist`](https://github.com/floor/virtuallist). It provides low-level benchmark measurement primitives designed specifically for virtual list performance testing.

**Why a separate package?** Extracting measurement primitives into a standalone package makes them reusable across any project that needs virtual list benchmarking. Any improvement to measurement accuracy automatically applies everywhere the package is used.

**Package structure:**

| Module | Exports |
|--------|---------|
| `timing.ts` | `nextFrame`, `waitFrames`, `wait`, `measureDuration` |
| `memory.ts` | `getHeapUsed`, `settleHeap`, `measureMemoryDelta`, `measureMemoryWithRetries` |
| `scroll.ts` | `measureScrollPerformance`, `measureScrollToIndex` |
| `stats.ts` | `median`, `percentile`, `round`, `mean`, `coefficientOfVariation`, `bytesToMB` |
| `helpers.ts` | `tryGC`, `burnCpu`, `findViewport` |

The following are imported and re-exported by `runner.js`:

| Function | Purpose |
|----------|---------|
| `nextFrame()` | Wraps `requestAnimationFrame` as a Promise |
| `waitFrames(n)` | Wait for N animation frames |
| `wait(ms)` | Wraps `setTimeout` as a Promise |
| `tryGC()` | Trigger GC + settle (100ms + 3 frames) |
| `settleHeap(cycles)` | Aggressive heap settling (multiple GC cycles) |
| `measureDuration(label, fn)` | Time an async function via Performance Timeline API |
| `measureMemoryDelta(create, settleFrames)` | Measure heap increase from creating a component |
| `measureScrollPerformance(viewport, durationMs, stressMs, speed)` | Dual-loop scroll + frame timing |
| `measureScrollToIndex(viewport, itemCount, itemHeight, targets, iterations)` | Jump-to-index timing |
| `getHeapUsed()` | Read `performance.memory.usedJSHeapSize` (Chrome-only) |
| `findViewport(container)` | Locate the scrollable element (4-strategy search) |
| `burnCpu(targetMs)` | Tight busy-wait loop for stress testing |
| `median(values)`, `percentile(sorted, p)`, `round(value, decimals)`, `bytesToMB(bytes)` | Math utilities |

### `measureMemoryWithRetries`

This wrapper remains in `runner.js`. It runs `measureMemoryDelta` up to N attempts (from the intensity preset), collecting valid (non-null, non-negative) readings. Returns `{ memoryUsed, instance }` where:

- `memoryUsed` — `bytesToMB(median(validDeltas))` or `null` if no valid readings
- `instance` — the component instance from the final attempt, left mounted for Phase 3

The last instance is deliberately kept alive so Phase 3 (scroll) can reuse it without an additional create/settle cost.

---

## Five-Phase Pipeline

`benchmarkLibrary({ libraryName, container, itemCount, onStatus, onPhaseResult, stressMs, intensity, createComponent, destroyComponent })` is the central function. It accepts an `intensity` parameter (quick/default/full) that controls iteration counts for each phase.

### Phase 0 — Warmup (not measured)

Goal: let V8's JIT compiler optimise the library's hot paths before measurement begins.

```
for i in [0 .. warmupIterations - 1]:
    container.innerHTML = ""
    tryGC()
    instance = await createComponent(container, itemCount)
    await nextFrame()
    await destroyComponent(instance)
    container.innerHTML = ""
    tryGC()
```

### Phase 1 — Render Timing

Goal: measure how long the library's JS creation code takes to execute.

```
container.style.visibility = "hidden"

for i in [0 .. renderIterations - 1]:
    container.innerHTML = ""
    tryGC()
    await nextFrame()                    ← settle frame BEFORE timer

    duration = measureDuration("render", () => {
        return createComponent(container, itemCount)
    })

    renderTimes.push(duration)
    await nextFrame()                    ← wait for paint AFTER timer
    await waitFrames(2)                  ← ensure layout is complete
    await destroyComponent(instance)
    container.innerHTML = ""
    tryGC()

container.style.visibility = originalValue
renderTime = median(renderTimes)
```

**Key methodology detail:** `nextFrame()` is called **before** the timer (to settle) and **after** (to verify paint). It is NOT inside the `measureDuration` callback. The timer measures only JS execution time, not paint time. A DOM validation check on the first iteration verifies that `[data-index]` elements were actually rendered.

### Phase 2 — Memory

Delegates to `measureMemoryWithRetries()` with `memoryAttempts` from the intensity preset. The last instance remains mounted for Phase 3.

### Phase 3 — Scroll

Measures frame delivery at 5 scroll speeds. Uses `scrollDurationMs` from the intensity preset.

```
viewport = findViewport(container)

for each speed in SCROLL_SPEEDS:
    result = measureScrollPerformance(viewport, scrollDurationMs, stressMs, speed.pxPerSec)
    scrollResults.push({ speedId, speedLabel, pxPerSec, ...result })
```

### Phase 4 — Jump (scroll-to-index)

Measures how fast the library renders after a large scroll position teleport. Uses `jumpIterations` from the intensity preset.

```
jumpTime = measureScrollToIndex(viewport, itemCount, ITEM_HEIGHT, JUMP_TARGETS, jumpIterations)
```

For each target fraction (0.1, 0.3, 0.5, 0.7, 0.9), the viewport is reset to a non-overlapping position, then teleported. Time from `scrollTop` assignment to the next rAF callback is recorded. The overall median is reported.

### Return value

```js
{
  library: string,
  renderTime: number,        // median render time (ms)
  memoryUsed: number | null, // MB, or null if memory API unavailable
  scrollResults: Array<{
    speedId, speedLabel, pxPerSec,
    medianFPS, medianFrameTime, p95FrameTime, totalFrames
  }>,
  avgFPS: number,            // mean FPS across all 5 speeds
  avgP95: number,            // mean P95 frame time across all 5 speeds
  jumpTime: number           // median jump-to-paint time (ms)
}
```

---

## Metrics Builder

`buildMetrics(results)` converts the raw phase results into the standardised `BenchmarkMetric[]` format that the UI renders and the API stores.

| Metric label | Source | Unit | Direction | Rating thresholds |
|-------------|--------|------|-----------|------------------|
| `Render` | `results.renderTime` | ms | lower | ≤15ms good, ≤50ms ok |
| `Memory` | `results.memoryUsed` | MB | lower | ≤1MB good, ≤5MB ok |
| `Scroll FPS` | `results.avgFPS` | fps | higher | ≥100fps good, ≥55fps ok |
| `P95 Frame` | `results.avgP95` | ms | lower | ≤12ms good, ≤20ms ok |
| `Jump` | `results.jumpTime` | ms | lower | ≤10ms good, ≤25ms ok |
| `FPS @ {speed}` (×5) | `scrollResults[i].medianFPS` | fps | higher | same as Scroll FPS |

When `memoryUsed` is null (non-Chrome browser), the Memory metric is emitted with `value: 0`, `displayValue: "—"`, and `meta: "Chrome required"`. The UI renders this as a greyed-out card rather than a zero.

---

## Winner Detection (`pickWinner`)

`pickWinner(entries, better)` is the single source of truth for determining which library wins a given metric in a multi-library comparison. It is used by `compare.js` — nothing else in the codebase duplicates this logic.

```js
pickWinner(
  [{ slug: "react-window", value: 12 }, { slug: "virtua", value: 9 }],
  "lower"
)
// → "virtua"
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `entries` | `Array<{ slug: string, value: number }>` | One entry per library for this metric |
| `better` | `'lower' \| 'higher'` | The direction for this metric |

**Return value:**

| Result | Meaning |
|--------|---------|
| `string` (a slug) | That library won clearly (difference > 3%) |
| `"__tie__"` | All valid values are within 3% of each other |
| `null` | Fewer than 2 valid (non-zero, non-null) values |

**Algorithm:**
1. Filter out entries where `value` is null, undefined, or 0
2. If fewer than 2 valid entries remain, return `null`
3. Compute `max` and `min` of all valid values
4. If `(max − min) / max < 0.03`, return `"__tie__"` (all within 3%)
5. Otherwise find the best entry (`min` for `"lower"`, `max` for `"higher"`) and return its `slug`

The 3% tie threshold prevents noisy micro-differences from being reported as meaningful wins. It matches the threshold used in vlist.dev's comparison benchmarks.

---

## Puppeteer Orchestration (`src/server/benchmark-runner.ts`)

The benchmark runner manages headless Chrome via Puppeteer with controlled flags for reproducible results:

- `--disable-frame-rate-limit` / `--disable-gpu-vsync` — uncapped rAF (no 60Hz/120Hz variance)
- `--enable-precise-memory-info` — accurate heap measurements
- `--js-flags=--expose-gc` — explicit GC control
- `--disable-background-timer-throttling` — no background throttling

### Queue

Only one benchmark runs at a time (CPU contention skews results). Runs are enqueued and processed sequentially. The browser instance is reused across runs for efficiency.

### Execution flow

1. Get or launch headless Chrome
2. Create a new page with 1280×800 viewport
3. Set up minimal HTML with a `#bench-container` and benchmark item styles
4. Inject `dist/benchmarks/headless.js` via `page.addScriptTag()`
5. Wait for `window.__benchReady === true`
6. Call `window.__benchmarkLibrary()` via `page.evaluate()`
7. Stream progress events back via the exposed `__benchProgress` function
8. Close the page when done

### SSE Progress

Progress is streamed to clients via Server-Sent Events. The `src/api/run.ts` module manages SSE connections and broadcasts events from the Puppeteer runner.

Event types: `connected`, `status`, `phase-result`, `result`, `error`, `done`.

---

## Result Persistence

Results are auto-persisted to the database by the server when the Puppeteer run completes. The `onProgress` callback in `run.ts` intercepts `result` events and calls `storeResult()` directly — no client-side POST is needed.

The legacy `persistResult()` function still exists in `runner.js` for the client-side compare page flow, but individual library benchmarks always go through the Puppeteer runner.

---

## CLI Benchmark Script (`scripts/benchmark.ts`)

A command-line tool for running benchmarks outside the browser:

```bash
bun run scripts/benchmark.ts --library vlist --items 1M --intensity full --runs 3
bun run scripts/benchmark.ts --items 10K,1M --runs 3 --intensity quick
```

| Option | Default | Description |
|--------|---------|-------------|
| `--library` | all | Comma-separated library slugs |
| `--items` | 10K | Comma-separated: 10K, 1M, or number |
| `--intensity` | default | quick, default, full |
| `--runs` | 1 | Runs per library/size combo |

The script starts runs via `POST /api/run`, consumes SSE progress with retry logic, and displays a terminal progress bar with sliding-window ETA.