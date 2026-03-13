# Benchmark Engine

The benchmark engine is the client-side JavaScript that runs in the visitor's browser. It lives in `benchmarks/runner.js` and is the most important file in the project — it defines the measurement methodology in code.

The engine is completely library-agnostic. It does not know or care which library it is measuring. Every library goes through the exact same function call chain, producing the same metric structure.

---

## Overview

```
runner.js
  ├── Library registry        defineLibrary(), getLibrary()
  ├── Constants               ITEM_HEIGHT, SCROLL_SPEEDS, STRESS_LEVELS, …
  ├── Shared item templates   benchmarkTemplate(), createRealisticReactChildren(), …
  ├── Timing utilities        measureDuration(), nextFrame(), waitFrames(), tryGC()
  ├── Memory utilities        getHeapUsed(), settleHeap(), measureMemoryDelta(), measureMemoryWithRetries()
  ├── Scroll utilities        findViewport(), measureScrollPerformance()
  ├── Three-phase pipeline    benchmarkLibrary()
  ├── Metrics builder         buildMetrics()
  ├── Runner                  runBenchmarks()
  ├── Persistence             persistResult()
  └── Math utilities          median(), percentile(), round(), bytesToMB()
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

### Measurement constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `ITEM_HEIGHT` | `48` px | Fixed row height used by every library. Must be identical across all adapters. |
| `MEASURE_ITERATIONS` | `5` | Number of render timing iterations. Median is reported. |
| `MEMORY_ATTEMPTS` | `10` | Maximum memory measurement attempts. |
| `SCROLL_DURATION_MS` | `2000` | Duration of each scroll speed test in milliseconds. |
| `BASE_SCROLL_SPEED` | `7200` | Base scroll speed in px/s (1× multiplier). |
| `DEFAULT_OVERSCAN` | `5` | Off-screen items to render, used where the library supports it. |

### `SCROLL_SPEEDS`

Seven progressive speed presets built from `BASE_SCROLL_SPEED` multipliers. Testing at a single speed can miss performance cliffs — a library may hold up at casual speeds but degrade under aggressive scrolling. The full range exposes these cliffs.

| ID | Multiplier | px/s | Characteristic |
|----|-----------|------|---------------|
| `crawl` | 0.1× | 720 | Pure baseline overhead |
| `gentle` | 0.25× | 1,800 | Gentle browsing |
| `slow` | 0.5× | 3,600 | Casual scrolling |
| `normal` | 1× | 7,200 | Normal speed |
| `fast` | 2× | 14,400 | Aggressive flick |
| `aggressive` | 3× | 21,600 | Heavy DOM churn |
| `extreme` | 5× | 36,000 | Maximum stress |

Total scroll time per benchmark run: 7 speeds × 2 seconds = **14 seconds of scrolling**.

### `STRESS_LEVELS`

Four CPU burn presets for the optional stress test mode. Burning CPU inside the `requestAnimationFrame` callback simulates a real application doing other work alongside the virtual list.

| ID | ms/frame | Remaining budget at 120Hz |
|----|---------|--------------------------|
| `none` | 0 | 8.33 ms |
| `light` | 3 | 5.33 ms |
| `medium` | 5 | 3.33 ms |
| `heavy` | 7 | 1.33 ms |

At "heavy" (7 ms burned per frame), only 1.33 ms remains for the library's own rendering at 120 Hz. This reliably separates fast libraries from slow ones under realistic pressure.

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

## Timing Utilities

### `nextFrame()`

Wraps `requestAnimationFrame` as a Promise. Awaiting it yields control to the browser for one paint cycle, ensuring the DOM has settled before proceeding.

### `waitFrames(n)`

Calls `nextFrame()` in a loop `n` times. Used to wait for rendering to stabilise after mounting a component.

### `wait(ms)`

Wraps `setTimeout` as a Promise. Used in GC settling cycles to give the engine time to reclaim memory.

### `tryGC()`

Attempts to trigger garbage collection:
1. Calls `globalThis.gc()` if available (requires `--expose-gc` Chrome flag, which happens when users run Chrome with the `--enable-precise-memory-info` flag)
2. Waits 100ms unconditionally
3. Waits 3 animation frames

Used between benchmark phases and iterations to flush residual garbage and reduce cross-contamination.

### `measureDuration(label, fn)`

Times an async function using the Performance Timeline API:

```js
performance.mark("bench-start-N")
result = await fn()
performance.mark("bench-end-N")
entry = performance.measure("bench-label-N", "bench-start-N", "bench-end-N")
// → entry.duration is the measured time
```

Marks and measures are cleaned up immediately after reading to avoid leaking entries into the DevTools Performance panel. A monotonically incrementing counter ensures mark names never collide across concurrent or sequential calls.

---

## Memory Utilities

### `getHeapUsed()`

Returns `performance.memory.usedJSHeapSize` as a number, or `null` if the API is unavailable. The `performance.memory` API is Chrome-only.

### `settleHeap(cycles = 3)`

Aggressive heap settling for use before baseline memory snapshots. Each cycle:
1. Calls `gc()` if available
2. Waits 150ms
3. Waits 5 animation frames

Three cycles of this (the default) give the engine approximately 1.4 seconds to reclaim garbage from all prior operations before taking a baseline heap snapshot.

### `measureMemoryDelta(create, settleFrames = 5)`

Measures the heap increase caused by creating a component:

```
settleHeap()           ← flush prior garbage
before = getHeapUsed()
await create()         ← mount the component
waitFrames(5)          ← let rendering settle
tryGC()                ← reclaim createElement temporaries, not the component
after = getHeapUsed()
delta = after - before
if delta < 0: return null   ← GC artifact, not real data
return delta                ← bytes allocated by the component
```

Negative deltas are rejected. They occur when GC reclaims more old garbage than the component allocated — a measurement artifact, not meaningful data.

### `measureMemoryWithRetries({ container, createFn, destroyFn, onStatus, label, attempts })`

Runs `measureMemoryDelta` up to `MEMORY_ATTEMPTS` (10) times, collecting valid (non-null, non-negative) readings. Returns `{ memoryUsed, instance }` where:

- `memoryUsed` — `bytesToMB(median(validDeltas))` or `null` if no valid readings
- `instance` — the component instance from the final attempt, left mounted for Phase 3

The last instance is deliberately kept alive so Phase 3 (scroll) can reuse it without an additional create/settle cycle. This is more efficient and also more realistic — it measures scroll performance on a component that has already been live for several seconds.

If `getHeapUsed()` returns null (non-Chrome browser), the function skips all measurement attempts but still creates one instance for Phase 3.

---

## Viewport Detection

`findViewport(container)` locates the scrollable element inside a benchmark container. Different libraries create different DOM structures — some expose a known class name, others rely on CSS overflow. Four strategies are tried in order:

1. **Known selectors** — `.vlist-viewport`, `[data-testid='virtuoso-scroller']`
2. **CSS overflow scan** — depth-first search for an element whose `overflowY`, `overflowX`, or `overflow` computed style is `auto` or `scroll`
3. **scrollHeight heuristic** — find the deepest element where `scrollHeight > clientHeight + 1`
4. **First child fallback** — returns `container.firstElementChild`

If `container` is null or no scrollable element is found at all, returns null and `measureScrollPerformance` returns zero metrics instead of crashing.

---

## Scroll Measurement

`measureScrollPerformance(viewport, durationMs, stressMs, speedPxPerSec)` uses a **dual-loop architecture** that separates scrolling from frame timing:

### Loop 1 — Paint counter (`requestAnimationFrame`)

Records the timestamp of every delivered frame. Computes inter-frame intervals. Optionally burns CPU stress budget (`burnCpu(stressMs)`) so the library's rendering competes for the remaining frame budget.

```js
const paintTick = (timestamp) => {
  frameTimes.push(timestamp - lastPaintTime)
  lastPaintTime = timestamp
  if (stressMs > 0) burnCpu(stressMs)
  requestAnimationFrame(paintTick)
}
```

### Loop 2 — Scroll driver (`setTimeout(fn, 0)`)

Advances `viewport.scrollTop` at a constant pixels-per-second rate using wall-clock time. Fires approximately 250 times per second in Chrome, giving sub-pixel-smooth scrolling at all speed levels.

```js
const scrollTick = () => {
  const dt = now - lastScrollTime        // real elapsed ms
  const pxDelta = (speedPxPerSec * dt) / 1000
  scrollPos += pxDelta * direction
  viewport.scrollTop = scrollPos
  setTimeout(scrollTick, 0)
}
```

Direction bounces at `scrollTop = 0` and `scrollTop = maxScroll` (bidirectional scrolling).

### Why two loops?

Coupling scroll to rAF would produce visible stepping at slow speeds: at 60fps with 720 px/s, each frame would jump 12px — clearly not smooth. `setTimeout(0)` fires ~250 times per second regardless of refresh rate, providing smooth movement even at crawl speed and ensuring consistent behaviour across 60Hz, 120Hz, and variable-rate displays.

### Return value

```js
{
  medianFPS: number,        // 1000 / median(frameTimes)
  medianFrameTime: number,  // median of frameTimes array (ms)
  p95FrameTime: number,     // 95th percentile of frameTimes (ms) — measures jank
  totalFrames: number       // total frames recorded
}
```

---

## Three-Phase Pipeline

`benchmarkLibrary({ libraryName, container, itemCount, onStatus, stressMs, createComponent, destroyComponent })` is the central function. It calls `createComponent` and `destroyComponent` from the library adapter and runs three isolated measurement phases.

### Phase 1 — Render Timing

Goal: measure how long the library takes to mount and paint a list.

```
container.style.visibility = "hidden"    ← prevent visual flicker during iterations

for i in [0 .. MEASURE_ITERATIONS - 1]:
    container.innerHTML = ""
    tryGC()
    duration = measureDuration("render", async () => {
        instance = await createComponent(container, itemCount)
        await nextFrame()                ← wait for first paint
        return instance
    })
    renderTimes.push(duration)
    await destroyComponent(instance)
    container.innerHTML = ""
    tryGC()

container.style.visibility = originalValue
renderTime = median(renderTimes)         ← median of 5 readings
```

The container is hidden to avoid affecting the layout of the surrounding page during the 5 iterations. `nextFrame()` is awaited inside the measurement window so the timing includes the first browser paint, not just JS execution.

### Phase 2 — Memory

Goal: measure how much heap the library allocates for a mounted list.

Delegates entirely to `measureMemoryWithRetries()`. Up to 10 attempts are made. The last attempt's instance remains mounted for Phase 3.

### Phase 3 — Scroll

Goal: measure frame delivery performance at 7 scroll speeds.

```
viewport = findViewport(container)       ← instance already mounted from Phase 2

for each speed in SCROLL_SPEEDS:
    result = measureScrollPerformance(viewport, SCROLL_DURATION_MS, stressMs, speed.pxPerSec)
    scrollResults.push({ speedId, speedLabel, pxPerSec, ...result })

await destroyComponent(memInstance)      ← clean up after all speeds
container.innerHTML = ""
tryGC()
```

Phase 3 reuses the instance left alive by Phase 2, avoiding an extra create/settle cost and measuring a component that has already experienced Phase 2's repeated mounting/destruction — a slightly more real-world scenario.

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
  avgFPS: number,            // mean FPS across all 7 speeds
  avgP95: number             // mean P95 frame time across all 7 speeds
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
| `FPS @ {speed}` (×7) | `scrollResults[i].medianFPS` | fps | higher | same as Scroll FPS |

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

## Runner

`runBenchmarks(options)` is the top-level function called by `script.js`. It orchestrates a run across one or more item counts for a single library.

```js
runBenchmarks({
  librarySlug,         // which library to run
  itemCounts,          // array of counts, default [10_000]
  stressMs,            // CPU burn level
  container,           // the visible viewport element
  getContainer,        // optional: custom container per run
  onResult(result),    // called after each itemCount completes
  onStatus(slug, count, message),  // progress updates
  onComplete(),        // called when all itemCounts finish
  signal,              // AbortSignal — checked before each itemCount
})
```

For each item count:
1. Checks `signal.aborted` — returns early if the user stopped the run
2. Creates a fresh `<div>` sub-container inside the parent
3. Calls `tryGC()` to let the DOM settle
4. Calls `benchmarkLibrary()` with the adapter's `create` and `destroy`
5. Calls `buildMetrics()` on the results
6. Calls `onResult()` with the completed `BenchmarkResult`
7. Cleans up the container and calls `tryGC()`

---

## Result Persistence

`persistResult(result, extraData)` sends a fire-and-forget `POST /api/benchmarks` with the benchmark result and environment metadata:

```js
fetch("/api/benchmarks", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    librarySlug, itemCount, metrics, duration, success, error,
    stressMs, scrollSpeed,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    screenWidth: screen.width,
    screenHeight: screen.height,
  })
}).catch(() => {}) // silently ignore all errors
```

Errors are swallowed with `.catch(() => {})`. The persistence call never blocks the UI, never shows an error to the user, and never affects the benchmark result. If the server is unreachable or the request fails, the run result is still displayed normally.

---

## Math Utilities

| Function | Signature | Notes |
|----------|-----------|-------|
| `median(values)` | `number[] → number` | Sorts a copy, picks middle value or averages two middle values |
| `percentile(sorted, p)` | `(number[], number) → number` | Linear interpolation on a pre-sorted array |
| `round(value, decimals)` | `(number, number) → number` | `Math.round(v × 10^d) / 10^d` |
| `bytesToMB(bytes)` | `number → number` | Divides by 1024² and rounds to 2 decimal places |
| `generateItems(count)` | `number → {id: number}[]` | Creates a plain array of `{ id: i }` objects for libraries that need a data array |
| `formatItemCount(count)` | `number → string` | `10000 → "10K"`, `1000000 → "1M"` |
| `escapeHtml(str)` | `string → string` | DOM-based `textContent` round-trip |

`percentile` requires a pre-sorted array. All callers sort before passing. The implementation uses linear interpolation between the two surrounding values, which matches the p5/p95 calculation used in `src/api/benchmarks.ts` for consistency between live results and stored aggregates.

---

## `burnCpu(targetMs)`

Burns CPU for approximately `targetMs` milliseconds using a tight busy-wait loop:

```js
const end = performance.now() + targetMs
while (performance.now() < end) { /* busy wait */ }
```

The loop body reads from `performance.now()` on every iteration, which is an observable side effect — the JS engine cannot dead-code-eliminate it. This ensures the loop actually runs for the intended duration.