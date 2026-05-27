// benchmarks/runner.js — Benchmark engine for virtuallist.io
//
// Library-agnostic measurement infrastructure. Every library is a peer —
// no library gets special treatment in the measurement pipeline.
//
// Manages test lifecycle: warmup → iterations → collect → report.
// Each library registers via `defineLibrary()` and the runner orchestrates execution.
//
// Architecture:
//   - Suite Registry: libraries register their benchmark adapters
//   - Measurement Primitives: imported from @floor/virtuallist
//   - Runner: orchestrates execution with fairness guarantees
//   - Rating: threshold-based quality ratings for metrics

// =============================================================================
// Measurement Primitives (from @floor/virtuallist)
// =============================================================================

import {
  nextFrame,
  waitFrames,
  wait,
  measureDuration,
  measureScrollPerformance,
  measureScrollToIndex,
  measureMemoryDelta,
  getHeapUsed,
  settleHeap,
  tryGC,
  burnCpu,
  findViewport,
  median,
  percentile,
  round,
  bytesToMB,
} from "@floor/virtuallist";

export {
  nextFrame,
  waitFrames,
  wait,
  measureDuration,
  measureScrollPerformance,
  measureScrollToIndex,
  measureMemoryDelta,
  getHeapUsed,
  settleHeap,
  tryGC,
  burnCpu,
  findViewport,
  median,
  percentile,
  round,
  bytesToMB,
};

// =============================================================================
// Constants (from constants.js)
// =============================================================================

export {
  ITEM_HEIGHT,
  WARMUP_ITERATIONS,
  MEASURE_ITERATIONS,
  MEMORY_ATTEMPTS,
  SCROLL_DURATION_MS,
  BASE_SCROLL_SPEED,
  DEFAULT_OVERSCAN,
  SCROLL_SPEEDS,
  STRESS_LEVELS,
  JUMP_ITERATIONS,
  JUMP_TARGETS,
  ITEM_NAMES,
  ITEM_BADGES,
} from "./constants.js";

import {
  ITEM_HEIGHT,
  WARMUP_ITERATIONS,
  MEASURE_ITERATIONS,
  MEMORY_ATTEMPTS,
  SCROLL_DURATION_MS,
  BASE_SCROLL_SPEED,
  DEFAULT_OVERSCAN,
  SCROLL_SPEEDS,
  JUMP_ITERATIONS,
  JUMP_TARGETS,
  ITEM_NAMES,
  ITEM_BADGES,
} from "./constants.js";

// =============================================================================
// Style Injection
// =============================================================================

const injectedStyles = new Set();

/**
 * Inject a CSS string into the document, deduped by id.
 * Adapters that need library CSS call this from their setup() hook.
 */
export function injectStyles(id, css) {
  if (injectedStyles.has(id)) return;
  const el = document.createElement("style");
  el.setAttribute("data-bench-styles", id);
  el.textContent = css;
  document.head.appendChild(el);
  injectedStyles.add(id);
}

// =============================================================================
// Types (via JSDoc)
// =============================================================================

/**
 * @typedef {Object} BenchmarkConfig
 * @property {number} itemCount - Number of items to test with
 * @property {HTMLElement} container - Container for list instances
 * @property {(message: string) => void} onStatus - Status update callback
 * @property {number} [stressMs=0] - CPU burn per frame during scroll
 */

/**
 * @typedef {Object} BenchmarkMetric
 * @property {string} label - Human-readable metric name
 * @property {number} value - Measured value
 * @property {string} unit - Unit of measurement (ms, fps, MB, KB, etc.)
 * @property {'lower'|'higher'} better - Which direction is better
 * @property {'good'|'ok'|'bad'} [rating] - Optional quality rating
 * @property {string} [displayValue] - Formatted display value (optional)
 * @property {string} [meta] - Additional context (e.g. "2.3× faster")
 */

/**
 * @typedef {Object} BenchmarkResult
 * @property {string} librarySlug - Library identifier
 * @property {number} itemCount - Item count used
 * @property {BenchmarkMetric[]} metrics - Measured metrics
 * @property {number} duration - Total run time in ms
 * @property {boolean} success - Whether the run completed without error
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} LibraryAdapter
 * @property {string} slug - URL-safe library identifier (must match registry)
 * @property {string} name - Display name
 * @property {string} ecosystem - Framework ecosystem (react, vue, solid, svelte, vanilla)
 * @property {(container: HTMLElement, itemCount: number) => Promise<*>} create
 *   — Mount the library's virtual list. Returns an instance handle for later destruction.
 * @property {(instance: *) => Promise<void>} destroy
 *   — Unmount and clean up the library instance.
 * @property {(container: HTMLElement) => Promise<void>} [setup]
 *   — Optional one-time setup (e.g. inject CSS). Called once before Phase 0.
 * @property {string} [version] - Library version (auto-detected if possible)
 */

// =============================================================================
// Library Registry
// =============================================================================

/** @type {Map<string, LibraryAdapter>} */
const libraries = new Map();

/**
 * Register a library benchmark adapter.
 *
 * Every library calls this once to register itself. The runner treats all
 * adapters identically — same measurement pipeline, same DOM template,
 * same fairness guarantees.
 *
 * @param {LibraryAdapter} adapter
 */
export const defineLibrary = (adapter) => {
  if (libraries.has(adapter.slug)) {
    throw new Error(`Library "${adapter.slug}" is already registered`);
  }
  libraries.set(adapter.slug, adapter);
};

/**
 * Get all registered library adapters.
 * @returns {LibraryAdapter[]}
 */
export const getLibraries = () => [...libraries.values()];

/**
 * Get a single library adapter by slug.
 * @param {string} slug
 * @returns {LibraryAdapter|undefined}
 */
export const getLibrary = (slug) => libraries.get(slug);

// =============================================================================
// Realistic Item Template
// =============================================================================

/**
 * Realistic item template for benchmarks.
 *
 * Produces 7 child elements per item: avatar, content wrapper, title,
 * subtitle, meta wrapper, badge, and timestamp. This mirrors a typical
 * list row in a production application (contacts, messages, data tables).
 *
 * @param {*} _item - Item value (unused, kept for signature parity)
 * @param {number} index - Item index
 * @returns {string} HTML string
 */
export const benchmarkTemplate = (_item, index) => {
  const n = ITEM_NAMES[index % ITEM_NAMES.length];
  const n2 = ITEM_NAMES[(index + 3) % ITEM_NAMES.length];
  return (
    `<div class="bench-item__avatar">${n[0]}${n2[0]}</div>` +
    `<div class="bench-item__content">` +
    `<div class="bench-item__title">${n} — Item ${index}</div>` +
    `<div class="bench-item__sub">Lorem ipsum dolor sit amet</div>` +
    `</div>` +
    `<div class="bench-item__meta">` +
    `<span class="bench-item__badge">${ITEM_BADGES[index % ITEM_BADGES.length]}</span>` +
    `<span class="bench-item__time">${(index % 59) + 1}m</span>` +
    `</div>`
  );
};

/**
 * Create React children for a realistic list item.
 *
 * Shared across all React-based libraries so they all render the exact
 * same DOM structure as the HTML template above.
 *
 * @param {typeof import("react")} React - React module
 * @param {number} index - Item index
 * @returns {React.ReactElement[]} Array of React elements
 */
export const createRealisticReactChildren = (React, index) => {
  const n = ITEM_NAMES[index % ITEM_NAMES.length];
  const n2 = ITEM_NAMES[(index + 3) % ITEM_NAMES.length];
  return [
    React.createElement(
      "div",
      { key: "avatar", className: "bench-item__avatar" },
      `${n[0]}${n2[0]}`,
    ),
    React.createElement(
      "div",
      { key: "content", className: "bench-item__content" },
      React.createElement(
        "div",
        { className: "bench-item__title" },
        `${n} — Item ${index}`,
      ),
      React.createElement(
        "div",
        { className: "bench-item__sub" },
        "Lorem ipsum dolor sit amet",
      ),
    ),
    React.createElement(
      "div",
      { key: "meta", className: "bench-item__meta" },
      React.createElement(
        "span",
        { className: "bench-item__badge" },
        ITEM_BADGES[index % ITEM_BADGES.length],
      ),
      React.createElement(
        "span",
        { className: "bench-item__time" },
        `${(index % 59) + 1}m`,
      ),
    ),
  ];
};

/**
 * Populate a DOM element with the realistic item template (for non-React libs).
 * Used by SolidJS, Vue template-less mode, Clusterize.js, etc.
 *
 * @param {HTMLElement} el - Parent element to populate
 * @param {number} index - Item index
 */
export const populateRealisticDOMChildren = (el, index) => {
  const n = ITEM_NAMES[index % ITEM_NAMES.length];
  const n2 = ITEM_NAMES[(index + 3) % ITEM_NAMES.length];

  const avatar = document.createElement("div");
  avatar.className = "bench-item__avatar";
  avatar.textContent = `${n[0]}${n2[0]}`;

  const content = document.createElement("div");
  content.className = "bench-item__content";
  const title = document.createElement("div");
  title.className = "bench-item__title";
  title.textContent = `${n} — Item ${index}`;
  const sub = document.createElement("div");
  sub.className = "bench-item__sub";
  sub.textContent = "Lorem ipsum dolor sit amet";
  content.appendChild(title);
  content.appendChild(sub);

  const meta = document.createElement("div");
  meta.className = "bench-item__meta";
  const badge = document.createElement("span");
  badge.className = "bench-item__badge";
  badge.textContent = ITEM_BADGES[index % ITEM_BADGES.length];
  const time = document.createElement("span");
  time.className = "bench-item__time";
  time.textContent = `${(index % 59) + 1}m`;
  meta.appendChild(badge);
  meta.appendChild(time);

  el.appendChild(avatar);
  el.appendChild(content);
  el.appendChild(meta);
};

/**
 * Generate an HTML string for a realistic item (for Clusterize.js etc.).
 *
 * @param {number} index - Item index
 * @param {number} [height=ITEM_HEIGHT] - Item height in px
 * @returns {string} HTML string for a complete item row
 */
export const generateRealisticItemHTML = (index, height = ITEM_HEIGHT) => {
  const n = ITEM_NAMES[index % ITEM_NAMES.length];
  const n2 = ITEM_NAMES[(index + 3) % ITEM_NAMES.length];
  const badge = ITEM_BADGES[index % ITEM_BADGES.length];
  const time = `${(index % 59) + 1}m`;
  return (
    `<div class="bench-item" style="height:${height}px">` +
    `<div class="bench-item__avatar">${n[0]}${n2[0]}</div>` +
    `<div class="bench-item__content">` +
    `<div class="bench-item__title">${n} — Item ${index}</div>` +
    `<div class="bench-item__sub">Lorem ipsum dolor sit amet</div>` +
    `</div>` +
    `<div class="bench-item__meta">` +
    `<span class="bench-item__badge">${badge}</span>` +
    `<span class="bench-item__time">${time}</span>` +
    `</div></div>`
  );
};




// =============================================================================
// Memory Measurement with Retries
// =============================================================================

/**
 * Measure memory usage with multiple attempts for reliability.
 *
 * A single `measureMemoryDelta()` call can return null when GC reclaims
 * stale garbage during the snapshot window. Running multiple attempts
 * and taking the median of valid readings dramatically reduces noise.
 *
 * The last attempt's instance is kept alive (not destroyed) so the
 * scroll phase can reuse it directly.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.container - Benchmark container
 * @param {() => Promise<*>} opts.createFn - Creates and returns a component instance
 * @param {(instance: *) => Promise<void>} opts.destroyFn - Destroys a component instance
 * @param {Function} opts.onStatus - Status callback
 * @param {string} opts.label - Library name for status messages
 * @param {number} [opts.attempts=MEMORY_ATTEMPTS] - Max measurement attempts
 * @returns {Promise<{memoryUsed: number|null, instance: *}>}
 */
export const measureMemoryWithRetries = async ({
  container,
  createFn,
  destroyFn,
  onStatus,
  label,
  attempts = MEMORY_ATTEMPTS,
}) => {
  const validDeltas = [];
  let instance = null;

  const hasMemoryAPI = getHeapUsed() !== null;

  if (hasMemoryAPI) {
    for (let i = 0; i < attempts; i++) {
      // Destroy previous attempt before retrying
      if (instance) {
        await destroyFn(instance);
        instance = null;
      }
      container.innerHTML = "";

      onStatus(
        attempts > 1
          ? `Measuring ${label} memory (${i + 1}/${attempts})...`
          : `Measuring ${label} memory...`,
      );

      let inst;
      const delta = await measureMemoryDelta(async () => {
        inst = await createFn();
        await waitFrames(3);
      });

      instance = inst;

      if (delta !== null) {
        validDeltas.push(delta);
      }
    }
  } else {
    // No memory API — still create the component for the scroll phase
    onStatus(`Measuring ${label} memory (not available)...`);
    container.innerHTML = "";
    instance = await createFn();
    await waitFrames(3);
  }

  const memoryUsed =
    validDeltas.length > 0 ? bytesToMB(median(validDeltas)) : null;

  return { memoryUsed, instance };
};

// =============================================================================
// Three-Phase Benchmark Pipeline
// =============================================================================

/**
 * Run the full three-phase benchmark for a single library.
 *
 * Phase 1: Timing (MEASURE_ITERATIONS iterations, median render time)
 * Phase 2: Memory (up to MEMORY_ATTEMPTS attempts, median of valid readings)
 * Phase 3: Scroll (SCROLL_SPEEDS.length speeds × SCROLL_DURATION_MS ms each)
 *
 * This function is library-agnostic — it takes create/destroy callbacks
 * and produces identical measurement data for every library.
 *
 * @param {Object} opts
 * @param {string} opts.libraryName - Display name for status messages
 * @param {HTMLElement} opts.container - Container element
 * @param {number} opts.itemCount - Number of items
 * @param {(message: string) => void} opts.onStatus - Status callback
 * @param {number} [opts.stressMs=0] - CPU stress per frame
 * @param {(container: HTMLElement, itemCount: number) => Promise<*>} opts.createComponent
 * @param {(instance: *) => Promise<void>} opts.destroyComponent
 * @returns {Promise<{library: string, renderTime: number, memoryUsed: number|null, scrollResults: Object[]}>}
 */
/**
 * Intensity presets control how thorough each measurement phase is.
 *
 *   quick   — fast feedback (~20s per library), fewer iterations
 *   default — balanced accuracy/speed (~40s per library)
 *   full    — maximum accuracy (~60s+ per library), more iterations
 */
export const INTENSITY_PRESETS = {
  quick:   { warmupIterations: 1, renderIterations: 3, memoryAttempts: 3, scrollDurationMs: 1000, jumpIterations: 3 },
  default: { warmupIterations: 2, renderIterations: 7, memoryAttempts: 5, scrollDurationMs: 1500, jumpIterations: 5 },
  full:    { warmupIterations: 3, renderIterations: 9, memoryAttempts: 5, scrollDurationMs: 2000, jumpIterations: 7 },
};

export const benchmarkLibrary = async ({
  libraryName,
  container,
  itemCount,
  onStatus,
  onPhaseResult,
  stressMs = 0,
  intensity,
  setup,
  createComponent,
  destroyComponent,
}) => {
  if (setup) await setup(container);

  const preset = INTENSITY_PRESETS[intensity] || INTENSITY_PRESETS.default;
  const {
    warmupIterations,
    renderIterations,
    memoryAttempts,
    scrollDurationMs,
    jumpIterations,
  } = preset;

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 1: Render Timing
  // ═══════════════════════════════════════════════════════════════════════

  const renderTimes = [];

  // Temporarily hide the container to avoid visual flicker during iterations
  const originalVisibility = container.style.visibility;
  container.style.visibility = "hidden";

  // Warmup: let V8's JIT optimize before measuring
  for (let i = 0; i < warmupIterations; i++) {
    onStatus(`Warming up ${libraryName} (${i + 1}/${warmupIterations})...`);
    container.innerHTML = "";
    await tryGC();
    const inst = await createComponent(container, itemCount);
    await nextFrame();
    await destroyComponent(inst);
    container.innerHTML = "";
    await tryGC();
  }

  for (let i = 0; i < renderIterations; i++) {
    onStatus(
      `Measuring ${libraryName} render (${i + 1}/${renderIterations})...`,
    );

    container.innerHTML = "";
    await tryGC();
    await nextFrame();

    const { duration, result: instance } = await measureDuration(
      `${libraryName}-render`,
      () => createComponent(container, itemCount),
    );

    renderTimes.push(duration);

    // Sanity check: verify DOM was actually rendered
    if (i === 0) {
      const renderedItems = container.querySelectorAll("[data-index]").length;
      if (renderedItems === 0) {
        console.warn(`[bench] WARNING: 0 DOM items after render — virtualisation may not be working`);
      }
    }

    await nextFrame();
    await waitFrames(2);

    // Clean up this iteration
    await destroyComponent(instance);
    container.innerHTML = "";
    await tryGC();

    // Settle between iterations
    await waitFrames(5);
  }

  container.style.visibility = originalVisibility;

  const sorted = [...renderTimes].sort((a, b) => a - b);
  const renderTime = round(median(renderTimes), 2);
  const renderMin = round(sorted[0], 2);
  const renderP95 = round(percentile(sorted, 95), 2);
  onStatus(`Render times: [${renderTimes.map(t => round(t, 2)).join(", ")}] → median ${renderTime}ms, min ${renderMin}ms, p95 ${renderP95}ms`);
  if (onPhaseResult) onPhaseResult("render", renderTime);

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 2: Memory
  // ═══════════════════════════════════════════════════════════════════════

  onStatus(`Measuring ${libraryName} memory...`);

  const { memoryUsed, instance: memInstance } = await measureMemoryWithRetries({
    container,
    createFn: () => createComponent(container, itemCount),
    destroyFn: destroyComponent,
    onStatus,
    label: libraryName,
    attempts: memoryAttempts,
  });

  if (onPhaseResult) onPhaseResult("memory", memoryUsed);

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 3: Scroll Performance
  // ═══════════════════════════════════════════════════════════════════════

  // The memory phase left an instance mounted — reuse it for scrolling
  const viewport = findViewport(container);

  const scrollResults = [];

  for (let s = 0; s < SCROLL_SPEEDS.length; s++) {
    const speed = SCROLL_SPEEDS[s];
    onStatus(
      `Measuring ${libraryName} scroll (${s + 1}/${SCROLL_SPEEDS.length}: ${speed.label})...`,
    );

    const result = await measureScrollPerformance(
      viewport,
      scrollDurationMs,
      stressMs,
      speed.pxPerSec,
    );

    scrollResults.push({
      speedId: speed.id,
      speedLabel: speed.label,
      pxPerSec: speed.pxPerSec,
      ...result,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 4: Scroll-to-Index (Jump)
  // ═══════════════════════════════════════════════════════════════════════

  // Reuses the same mounted instance and viewport from the scroll phase.
  // Measures how fast the library virtualises a new set of items when
  // the scroll position teleports to a distant index.

  const totalJumps = JUMP_TARGETS.length * jumpIterations;
  onStatus(`Measuring ${libraryName} jump (0/${totalJumps})...`);

  const jumpTime = await measureScrollToIndex(
    viewport,
    itemCount,
    ITEM_HEIGHT,
    JUMP_TARGETS,
    jumpIterations,
  );

  onStatus(`Measuring ${libraryName} jump (${totalJumps}/${totalJumps})...`);

  // Clean up
  if (memInstance) {
    await destroyComponent(memInstance);
  }
  container.innerHTML = "";
  await tryGC();

  // Aggregate scroll metrics: use all speeds for overall FPS and P95
  const allFPS = scrollResults.map((r) => r.medianFPS).filter((v) => v > 0);
  const allP95 = scrollResults.map((r) => r.p95FrameTime).filter((v) => v > 0);

  const avgFn = (arr) => {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };

  const avgFPS = round(avgFn(allFPS), 1);
  const avgP95 = round(avgFn(allP95), 2);

  if (onPhaseResult) {
    onPhaseResult("fps", avgFPS);
    onPhaseResult("p95", avgP95);
    onPhaseResult("jump", jumpTime);
  }

  return {
    library: libraryName,
    renderTime,
    renderMin,
    renderP95,
    memoryUsed,
    scrollResults,
    avgFPS,
    avgP95,
    jumpTime,
  };
};

// =============================================================================
// Rating Helpers
// =============================================================================

/**
 * Rate a "lower is better" metric.
 * @param {number} value
 * @param {number} goodThreshold - At or below this is "good"
 * @param {number} okThreshold - At or below this is "ok", above is "bad"
 * @returns {'good'|'ok'|'bad'}
 */
export const rateLower = (value, goodThreshold, okThreshold) => {
  if (value <= goodThreshold) return "good";
  if (value <= okThreshold) return "ok";
  return "bad";
};

/**
 * Rate a "higher is better" metric.
 * @param {number} value
 * @param {number} goodThreshold - At or above this is "good"
 * @param {number} okThreshold - At or above this is "ok", below is "bad"
 * @returns {'good'|'ok'|'bad'}
 */
export const rateHigher = (value, goodThreshold, okThreshold) => {
  if (value >= goodThreshold) return "good";
  if (value >= okThreshold) return "ok";
  return "bad";
};

// =============================================================================
// Metrics Builder
// =============================================================================

/**
 * Build a standardized metrics array from benchmark results.
 *
 * Creates the same metric structure for every library — render time,
 * memory, scroll FPS, and P95 frame time with appropriate ratings.
 *
 * @param {Object} results - Results from benchmarkLibrary()
 * @returns {BenchmarkMetric[]}
 */
export const buildMetrics = (results) => {
  const metrics = [];

  // Render time (median)
  metrics.push({
    label: "Render",
    value: results.renderTime,
    unit: "ms",
    better: "lower",
    rating: rateLower(results.renderTime, 15, 50),
  });

  // Render min
  if (results.renderMin != null) {
    metrics.push({
      label: "Render Min",
      value: results.renderMin,
      unit: "ms",
      better: "lower",
      rating: rateLower(results.renderMin, 15, 50),
    });
  }

  // Render p95
  if (results.renderP95 != null) {
    metrics.push({
      label: "Render P95",
      value: results.renderP95,
      unit: "ms",
      better: "lower",
      rating: rateLower(results.renderP95, 15, 50),
    });
  }

  // Memory
  if (results.memoryUsed !== null) {
    metrics.push({
      label: "Memory",
      value: results.memoryUsed,
      unit: "MB",
      better: "lower",
      rating: rateLower(results.memoryUsed, 1, 5),
    });
  } else {
    metrics.push({
      label: "Memory",
      value: 0,
      unit: "MB",
      better: "lower",
      displayValue: "—",
      meta: "Chrome required",
    });
  }

  // Scroll FPS (average across all speeds)
  if (results.avgFPS > 0) {
    metrics.push({
      label: "Scroll FPS",
      value: results.avgFPS,
      unit: "fps",
      better: "higher",
      rating: rateHigher(results.avgFPS, 100, 55),
    });
  }

  // P95 Frame Time (average across all speeds)
  if (results.avgP95 > 0) {
    metrics.push({
      label: "P95 Frame",
      value: results.avgP95,
      unit: "ms",
      better: "lower",
      rating: rateLower(results.avgP95, 12, 20),
    });
  }

  // Jump time (scroll-to-index)
  if (results.jumpTime > 0) {
    metrics.push({
      label: "Jump",
      value: results.jumpTime,
      unit: "ms",
      better: "lower",
      rating: rateLower(results.jumpTime, 10, 25),
    });
  }

  // Per-speed breakdown (as additional info metrics)
  for (const sr of results.scrollResults || []) {
    if (sr.medianFPS > 0) {
      metrics.push({
        label: `FPS @ ${sr.speedLabel}`,
        value: sr.medianFPS,
        unit: "fps",
        better: "higher",
        rating: rateHigher(sr.medianFPS, 100, 55),
        meta: sr.speedId,
      });
    }
  }

  return metrics;
};

// =============================================================================
// Runner — Orchestrates Benchmark Execution
// =============================================================================

/**
 * @typedef {Object} RunOptions
 * @property {string} librarySlug - Which library to benchmark
 * @property {number[]} [itemCounts] - Item counts to test (default: [10_000])
 * @property {number} [stressMs=0] - CPU burn per frame during scroll
 * @property {HTMLElement} container - Container element
 * @property {(container: HTMLElement) => HTMLElement} [getContainer] - Custom container per run
 * @property {(result: BenchmarkResult) => void} [onResult] - Called after each run
 * @property {(slug: string, itemCount: number, message: string) => void} [onStatus] - Progress updates
 * @property {() => void} [onComplete] - Called when all benchmarks finish
 * @property {AbortSignal} [signal] - Abort signal to cancel the run
 */

/**
 * Run benchmarks for a single library.
 *
 * Executes the library's benchmark adapter at each item count, sequentially.
 * The container is cleaned between each run. Results are delivered via callbacks.
 *
 * @param {RunOptions} options
 * @returns {Promise<BenchmarkResult[]>}
 */
export const runBenchmarks = async (options) => {
  const {
    librarySlug,
    itemCounts = [10_000],
    stressMs = 0,
    container,
    getContainer,
    onResult,
    onStatus,
    onComplete,
    signal,
  } = options;

  const adapter = libraries.get(librarySlug);
  if (!adapter) {
    throw new Error(
      `Library "${librarySlug}" is not registered. Did you import its adapter?`,
    );
  }

  /** @type {BenchmarkResult[]} */
  const results = [];

  for (const itemCount of itemCounts) {
    // Check for abort
    if (signal?.aborted) {
      return results;
    }

    const status = (message) => {
      onStatus?.(librarySlug, itemCount, message);
    };

    status("Preparing...");

    // Get the container for this run
    const parentContainer = getContainer ? getContainer(container) : container;

    // Clean the container
    parentContainer.innerHTML = "";

    // Create a fresh sub-container
    const runContainer = document.createElement("div");
    runContainer.style.cssText =
      "width:100%;height:100%;position:relative;overflow:hidden;";
    parentContainer.appendChild(runContainer);

    // Let the DOM settle
    await tryGC();

    const runStart = performance.now();

    /** @type {BenchmarkResult} */
    let result;

    try {
      status("Running...");

      const benchResults = await benchmarkLibrary({
        libraryName: adapter.name,
        container: runContainer,
        itemCount,
        onStatus: status,
        stressMs,
        setup: adapter.setup,
        createComponent: adapter.create,
        destroyComponent: adapter.destroy,
      });

      const metrics = buildMetrics(benchResults);

      result = {
        librarySlug: adapter.slug,
        itemCount,
        metrics,
        duration: round(performance.now() - runStart, 0),
        success: true,
      };
    } catch (err) {
      result = {
        librarySlug: adapter.slug,
        itemCount,
        metrics: [],
        duration: round(performance.now() - runStart, 0),
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Clean up
    parentContainer.innerHTML = "";
    await tryGC();

    results.push(result);
    onResult?.(result);
  }

  onComplete?.();
  return results;
};

// =============================================================================
// Result Persistence (fire-and-forget POST to /api/benchmarks)
// =============================================================================

/**
 * Persist a benchmark result to the server for crowdsourced aggregation.
 *
 * Fire-and-forget — never blocks the UI or affects the benchmark.
 * Silently ignores errors (network failures, server errors, etc.).
 *
 * @param {BenchmarkResult} result - The benchmark result to persist
 * @param {Object} [extraData] - Additional data to include
 * @param {number} [extraData.stressMs] - Stress level used
 * @param {number} [extraData.scrollSpeed] - Scroll speed used
 */
export const persistResult = (result, extraData = {}) => {
  try {
    const payload = {
      librarySlug: result.librarySlug,
      itemCount: result.itemCount,
      metrics: result.metrics.map((m) => ({
        label: m.label,
        value: m.value,
        unit: m.unit,
        better: m.better,
        rating: m.rating || null,
      })),
      duration: result.duration,
      success: result.success,
      error: result.error || null,
      stressMs: extraData.stressMs ?? 0,
      scrollSpeed: extraData.scrollSpeed ?? 0,
      // Environment metadata
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: /** @type {any} */ (navigator).deviceMemory || null,
      screenWidth: screen.width,
      screenHeight: screen.height,
    };

    fetch("/api/benchmarks/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* silently ignore — never block the benchmark */
    });
  } catch {
    /* silently ignore */
  }
};

// =============================================================================
// Item Generation
// =============================================================================

/**
 * Generate a flat array of items for benchmarking.
 * @param {number} count
 * @returns {Array<{id: number}>}
 */
export const generateItems = (count) => {
  const items = new Array(count);
  for (let i = 0; i < count; i++) {
    items[i] = { id: i };
  }
  return items;
};

// =============================================================================
// Formatting Utilities
// =============================================================================

/**
 * Format an item count for display (e.g. 10000 → "10K").
 * @param {number} count
 * @returns {string}
 */
export const formatItemCount = (count) => {
  if (count >= 1_000_000) return `${count / 1_000_000}M`;
  if (count >= 1_000) return `${count / 1_000}K`;
  return String(count);
};

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
export const escapeHtml = (str) => {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
};

// =============================================================================
// Comparison: winner detection shared by compare.js
// =============================================================================

/**
 * Determine the winner slug among a set of {slug, value} pairs for one metric.
 *
 * Returns:
 *   - the winning slug  when one library is clearly better (> TIE_THRESHOLD apart)
 *   - "__tie__"         when all values are within TIE_THRESHOLD of each other
 *   - null              when there are fewer than 2 valid values
 *
 * @param {Array<{slug: string, value: number}>} entries
 * @param {'lower'|'higher'} better
 * @returns {string|null}
 */
export const pickWinner = (entries, better) => {
  // Filter out zero / null values
  const valid = entries.filter((e) => e.value !== null && e.value > 0);
  if (valid.length < 2) return null;

  const values = valid.map((e) => e.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const base = Math.max(Math.abs(max), Math.abs(min)) || 1;

  // All within 3 % → tie
  if ((max - min) / base < 0.03) return "__tie__";

  const best =
    better === "lower"
      ? valid.reduce((a, b) => (b.value < a.value ? b : a))
      : valid.reduce((a, b) => (b.value > a.value ? b : a));

  return best.slug;
};
