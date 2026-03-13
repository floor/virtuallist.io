// benchmarks/script.js — Main benchmark entry point for virtuallist.io
//
// This script runs in the browser on individual library benchmark pages.
// It reads the library slug from the page, wires up controls, and
// orchestrates benchmark execution via the runner engine.
//
// Responsibilities:
//   - Detect which library page we're on (data-library attribute)
//   - Wire up controls (item count, stress level, run button)
//   - Build the suite card UI (status, progress, metrics)
//   - Execute benchmarks via the runner
//   - Display results with color-coded ratings
//   - Persist results to /api/benchmarks (fire-and-forget)

// =============================================================================
// Library Adapter Imports
//
// Each library adapter calls defineLibrary() when imported, registering
// itself with the runner. Import order doesn't matter — all adapters
// are treated identically.
// =============================================================================

// React
import "./libraries/legend-list.js";
import "./libraries/react-virtualized.js";
import "./libraries/react-virtuoso.js";
import "./libraries/react-window.js";
import "./libraries/tanstack-virtual.js";
import "./libraries/virtua.js";
import "./libraries/vlist-react.js";
// Vue
import "./libraries/tanstack-vue-virtual.js";
import "./libraries/vue-virtual-scroller.js";
import "./libraries/vlist-vue.js";
// SolidJS
import "./libraries/tanstack-solid-virtual.js";
import "./libraries/vlist-solidjs.js";
// Svelte
import "./libraries/vlist-svelte.js";
// Vanilla
import "./libraries/clusterize.js";
import "./libraries/vlist.js";

// =============================================================================
// Runner Imports
// =============================================================================

import {
  getLibrary,
  runBenchmarks,
  persistResult,
  formatItemCount,
  STRESS_LEVELS,
} from "./runner.js";

// =============================================================================
// Constants
// =============================================================================

const ITEM_COUNTS = [10_000, 100_000, 1_000_000];
const INITIAL_ITEM_COUNT = ITEM_COUNTS[0];

// =============================================================================
// State
// =============================================================================

let selectedItemCount = INITIAL_ITEM_COUNT;
let selectedStressMs = 0;
let isRunning = false;
let abortController = null;

/** @type {Map<string, import("./runner.js").BenchmarkResult>} */
const results = new Map();

// =============================================================================
// DOM References
// =============================================================================

const dom = {
  runBtn: /** @type {HTMLButtonElement} */ (
    document.getElementById("bench-run")
  ),
  suitesContainer: document.getElementById("bench-suites"),
  viewport: document.getElementById("bench-viewport"),
  viewportInner: document.getElementById("bench-viewport-inner"),
  chromeTag: document.getElementById("bench-chrome-tag"),
  cpuTag: document.getElementById("bench-cpu-tag"),
};

// =============================================================================
// Page Detection
// =============================================================================

/** Read the library slug from the page's data attribute. */
function getLibrarySlug() {
  const page = document.querySelector("[data-library]");
  return page ? page.getAttribute("data-library") : null;
}

const librarySlug = getLibrarySlug();

// =============================================================================
// Environment Tags
// =============================================================================

function initEnvironmentTags() {
  // Chrome detection
  if (dom.chromeTag) {
    const isChrome =
      /Chrome\//.test(navigator.userAgent) &&
      !/Edg\//.test(navigator.userAgent);
    dom.chromeTag.textContent = isChrome
      ? "Chrome — full metrics"
      : "⚠️ Use Chrome for memory metrics";
  }

  // CPU cores
  if (dom.cpuTag) {
    const cores = navigator.hardwareConcurrency;
    dom.cpuTag.textContent = cores ? `${cores}-core CPU` : "";
  }
}

// =============================================================================
// Controls Wiring
// =============================================================================

function wireControls() {
  // ── Item count buttons ─────────────────────────────────────────────────
  const sizeBtns = document.querySelectorAll("#bench-sizes .ui-segmented__btn");
  for (const btn of sizeBtns) {
    btn.addEventListener("click", () => {
      if (isRunning) return;
      const count = parseInt(btn.dataset.count, 10);
      if (!count) return;

      selectedItemCount = count;

      // Update active state
      for (const b of sizeBtns) {
        b.classList.toggle("ui-segmented__btn--active", b === btn);
      }
    });
  }

  // ── Stress level buttons ───────────────────────────────────────────────
  const stressBtns = document.querySelectorAll(
    "#bench-stress .ui-segmented__btn",
  );
  for (const btn of stressBtns) {
    btn.addEventListener("click", () => {
      if (isRunning) return;
      const ms = parseInt(btn.dataset.stress, 10);
      if (isNaN(ms)) return;

      selectedStressMs = ms;

      // Update active state
      for (const b of stressBtns) {
        b.classList.toggle("ui-segmented__btn--active", b === btn);
      }
    });
  }

  // ── Run / Stop button ──────────────────────────────────────────────────
  if (dom.runBtn) {
    dom.runBtn.addEventListener("click", handleRunClick);
  }
}

// =============================================================================
// Suite Card Builder
// =============================================================================

/**
 * Build the suite card HTML for displaying benchmark results.
 * Called once before the first run, and reused for subsequent runs.
 */
function buildSuiteCard(adapter) {
  if (!dom.suitesContainer) return;

  dom.suitesContainer.innerHTML = `
    <div class="bench-suite-wrapper" id="bench-suite-${adapter.slug}">
      <div class="bench-suite" id="suite-card-${adapter.slug}">
        <div class="bench-suite__status" id="suite-status-${adapter.slug}"></div>
        <div class="bench-progress" id="suite-progress-${adapter.slug}">
          <div class="bench-progress__bar" id="suite-progress-bar-${adapter.slug}"></div>
        </div>
        <div class="bench-progress__text" id="suite-progress-text-${adapter.slug}"></div>
        <div class="bench-metrics" id="suite-metrics-${adapter.slug}"></div>
      </div>
    </div>
  `;
}

// =============================================================================
// Metrics Renderer
// =============================================================================

/**
 * Render benchmark metrics into the suite card.
 *
 * @param {string} slug - Library slug
 * @param {import("./runner.js").BenchmarkMetric[]} metrics - Measured metrics
 */
function renderMetrics(slug, metrics) {
  const container = document.getElementById(`suite-metrics-${slug}`);
  if (!container) return;

  // Only show the 4 core metrics (skip per-speed breakdowns)
  const coreMetrics = metrics.filter((m) => !m.label.startsWith("FPS @"));

  const cards = coreMetrics
    .map((metric) => {
      const ratingClass = metric.rating
        ? ` bench-metric--${metric.rating}`
        : "";
      const isEmpty = metric.displayValue === "—";
      const emptyClass = isEmpty ? " bench-metric--empty" : "";

      const valueText = metric.displayValue ?? metric.value;
      const metaHtml = metric.meta
        ? `<div class="bench-metric__meta">${escapeHtml(metric.meta)}</div>`
        : "";

      return `
      <div class="bench-metric${ratingClass}${emptyClass}">
        <div class="bench-metric__label">${escapeHtml(metric.label)}</div>
        <div class="bench-metric__value">
          ${valueText}<span class="bench-metric__unit">${escapeHtml(metric.unit)}</span>
        </div>
        ${metaHtml}
      </div>
    `;
    })
    .join("");

  container.innerHTML = cards;
}

// =============================================================================
// Run Handler
// =============================================================================

async function handleRunClick() {
  if (!librarySlug) return;

  // Toggle running state
  if (isRunning) {
    // Stop
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    setRunningState(false);
    return;
  }

  // Start
  const adapter = getLibrary(librarySlug);
  if (!adapter) {
    console.error(`[script] No adapter registered for "${librarySlug}"`);
    updateSuiteStatus(
      librarySlug,
      `❌ No benchmark adapter found for "${librarySlug}". Is the library adapter imported?`,
    );
    return;
  }

  setRunningState(true);
  buildSuiteCard(adapter);

  abortController = new AbortController();

  // Show viewport
  showViewport();

  try {
    await runBenchmarks({
      librarySlug: adapter.slug,
      itemCounts: [selectedItemCount],
      stressMs: selectedStressMs,
      container: dom.viewportInner,

      signal: abortController.signal,

      onStatus: (slug, itemCount, message) => {
        updateSuiteStatus(slug, message);
        updateProgressFromStatus(slug, message);
      },

      onResult: (result) => {
        results.set(`${result.librarySlug}::${result.itemCount}`, result);

        if (result.success) {
          renderMetrics(result.librarySlug, result.metrics);

          // Persist to server (fire-and-forget)
          persistResult(result, {
            stressMs: selectedStressMs,
            scrollSpeed: 0,
          });
        } else {
          showError(result.librarySlug, result.error || "Unknown error");
        }
      },

      onComplete: () => {
        setRunningState(false);
        hideViewport();
        updateSuiteStatus(librarySlug, "✅ Complete");
        setProgress(librarySlug, 100);
      },
    });
  } catch (err) {
    setRunningState(false);
    hideViewport();

    if (err.name !== "AbortError") {
      showError(librarySlug, err.message || "Benchmark failed");
    }
  }
}

// =============================================================================
// Progress Tracking
// =============================================================================

/**
 * Parse status messages to estimate progress percentage.
 * This is a heuristic — it maps known status message patterns to progress values.
 */
function updateProgressFromStatus(slug, message) {
  // Progress budget:
  //   Render  0–15%   (15%)
  //   Memory  15–30%  (15%)
  //   Scroll  30–85%  (55%)
  //   Jump    85–100% (15%)

  // Render phase: "Measuring X render (N/5)..."
  const renderMatch = message.match(/render \((\d+)\/(\d+)\)/);
  if (renderMatch) {
    const current = parseInt(renderMatch[1], 10);
    const total = parseInt(renderMatch[2], 10);
    const progress = (current / total) * 15;
    setProgress(slug, progress);
    return;
  }

  // Memory phase: "Measuring X memory (N/10)..."
  const memMatch = message.match(/memory \((\d+)\/(\d+)\)/);
  if (memMatch) {
    const current = parseInt(memMatch[1], 10);
    const total = parseInt(memMatch[2], 10);
    const progress = 15 + (current / total) * 15;
    setProgress(slug, progress);
    return;
  }

  // Memory not available
  if (message.includes("memory (not available)")) {
    setProgress(slug, 22);
    return;
  }

  // Scroll phase: "Measuring X scroll (N/7: speed)..."
  const scrollMatch = message.match(/scroll \((\d+)\/(\d+)/);
  if (scrollMatch) {
    const current = parseInt(scrollMatch[1], 10);
    const total = parseInt(scrollMatch[2], 10);
    const progress = 30 + (current / total) * 55;
    setProgress(slug, progress);
    return;
  }

  // Jump phase: "Measuring X jump (N/15)..."
  const jumpMatch = message.match(/jump \((\d+)\/(\d+)\)/);
  if (jumpMatch) {
    const current = parseInt(jumpMatch[1], 10);
    const total = parseInt(jumpMatch[2], 10);
    const progress = 85 + (current / total) * 15;
    setProgress(slug, progress);
    return;
  }

  // Preparing
  if (message.includes("Preparing")) {
    setProgress(slug, 0);
    return;
  }
}

// =============================================================================
// UI State Helpers
// =============================================================================

function setRunningState(running) {
  isRunning = running;

  if (dom.runBtn) {
    if (running) {
      dom.runBtn.textContent = "■ Stop";
      dom.runBtn.classList.add("bench-run-btn--stop");
    } else {
      dom.runBtn.textContent = "▶ Run";
      dom.runBtn.classList.remove("bench-run-btn--stop");
    }
  }

  // Disable controls while running
  const controls = document.querySelectorAll(
    "#bench-sizes .ui-segmented__btn, #bench-stress .ui-segmented__btn",
  );
  for (const btn of controls) {
    btn.style.pointerEvents = running ? "none" : "";
    btn.style.opacity = running ? "0.5" : "";
  }
}

function updateSuiteStatus(slug, message) {
  const el = document.getElementById(`suite-status-${slug}`);
  if (!el) return;

  // Clean up technical details from status messages
  const cleaned = message.replace(/\.\.\.$/, "…").replace(/^Testing /, "");

  el.textContent = cleaned;
  el.className = isRunning
    ? "bench-suite__status bench-suite__status--running"
    : "bench-suite__status";
}

function setProgress(slug, percent) {
  const bar = document.getElementById(`suite-progress-bar-${slug}`);
  const container = document.getElementById(`suite-progress-${slug}`);
  const text = document.getElementById(`suite-progress-text-${slug}`);

  const pct = Math.max(0, Math.min(100, percent));

  if (container) {
    container.classList.toggle("bench-progress--active", pct > 0 && pct < 100);
  }

  if (bar) {
    bar.style.width = `${pct}%`;
  }

  if (text) {
    if (pct > 0 && pct < 100) {
      text.textContent = `${Math.round(pct)}%`;
    } else {
      text.textContent = "";
    }
  }
}

function showError(slug, message) {
  const container = document.getElementById(`suite-metrics-${slug}`);
  if (!container) return;

  container.innerHTML = `
    <div class="bench-suite__error">
      ❌ ${escapeHtml(message)}
    </div>
  `;
}

function showViewport() {
  if (dom.viewport) {
    dom.viewport.classList.add("bench-viewport--active");
  }
}

function hideViewport() {
  if (dom.viewport) {
    dom.viewport.classList.remove("bench-viewport--active");
  }
  if (dom.viewportInner) {
    dom.viewportInner.innerHTML = "";
  }
}

// =============================================================================
// Helpers
// =============================================================================

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// =============================================================================
// Initialization
// =============================================================================

function init() {
  if (!librarySlug) {
    // We're on the overview page — no benchmark to run
    return;
  }

  initEnvironmentTags();
  wireControls();

  // Check if the adapter is registered
  const adapter = getLibrary(librarySlug);
  if (!adapter) {
    console.warn(
      `[virtuallist.io] No benchmark adapter for "${librarySlug}". ` +
        `The library may not have an adapter file yet.`,
    );
  }
}

// Run on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
