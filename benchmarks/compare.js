// benchmarks/compare.js — Compare page entry point for virtuallist.io
//
// Lets the user pick 2–4 libraries and runs them head-to-head under identical
// conditions. Results are rendered as a metric × library table with winner
// badges and per-metric diff percentages.
//
// Key design decisions:
//   - Execution order is randomised to reduce GC bleed-through / JIT warmth bias
//   - Winner detection uses pickWinner() from runner.js (single source of truth)
//   - Progress tracking forwards sub-phase status messages (same as script.js)
//   - No "comparisons" Map — winners are derived directly from allMetrics

// =============================================================================
// Library Adapter Imports
// (each calls defineLibrary() on import, registering itself with the runner)
// =============================================================================

import "./libraries/react-window.js";
import "./libraries/tanstack-virtual.js";
import "./libraries/react-virtuoso.js";
import "./libraries/virtua.js";
import "./libraries/legend-list.js";
import "./libraries/vue-virtual-scroller.js";
import "./libraries/tanstack-solid-virtual.js";
import "./libraries/clusterize.js";
import "./libraries/vlist.js";

// =============================================================================
// Runner Imports
// =============================================================================

import {
  getLibraries,
  benchmarkLibrary,
  buildMetrics,
  pickWinner,
  tryGC,
  waitFrames,
} from "./runner.js";

// =============================================================================
// Constants
// =============================================================================

const ITEM_COUNTS = [10_000, 100_000, 1_000_000];
const INITIAL_ITEM_COUNT = ITEM_COUNTS[0];
const MIN_SLOTS = 2;
const MAX_SLOTS = 4;

// Approximate share of total benchmark time each sub-phase takes.
// Used to map status messages → progress % within one library's run.
// Render: 15 %, Memory: 20 %, Scroll: 65 %
const PHASE_RENDER_END = 15;
const PHASE_MEMORY_END = 35;

// =============================================================================
// State
// =============================================================================

let selectedItemCount = INITIAL_ITEM_COUNT;
let selectedStressMs = 0;
let isRunning = false;
let abortController = null;

// Each slot is { id: number, slug: string|null }. Start with 2 empty slots.
let slots = [
  { id: 1, slug: null },
  { id: 2, slug: null },
];
let nextSlotId = 3;

// =============================================================================
// DOM References
// =============================================================================

const dom = {
  runBtn: /** @type {HTMLButtonElement} */ (document.getElementById("cmp-run")),
  addSlotBtn: /** @type {HTMLButtonElement} */ (
    document.getElementById("cmp-add-slot")
  ),
  slotsContainer: document.getElementById("cmp-slots"),
  resultsContainer: document.getElementById("cmp-results"),
  viewport: document.getElementById("cmp-viewport"),
  viewportInner: document.getElementById("cmp-viewport-inner"),
  chromeTag: document.getElementById("cmp-chrome-tag"),
  cpuTag: document.getElementById("cmp-cpu-tag"),
  statusBar: document.getElementById("cmp-status"),
  progressBar: document.getElementById("cmp-progress-bar"),
  progressContainer: document.getElementById("cmp-progress"),
};

// =============================================================================
// Environment Tags
// =============================================================================

function initEnvironmentTags() {
  if (dom.chromeTag) {
    const isChrome =
      /Chrome\//.test(navigator.userAgent) &&
      !/Edg\//.test(navigator.userAgent);
    dom.chromeTag.textContent = isChrome
      ? "Chrome — full metrics"
      : "⚠️ Use Chrome for memory metrics";
  }
  if (dom.cpuTag) {
    const cores = navigator.hardwareConcurrency;
    dom.cpuTag.textContent = cores ? `${cores}-core CPU` : "";
  }
}

// =============================================================================
// Slot Management
// =============================================================================

function buildOptions(selectedSlug) {
  const libs = getLibraries();
  let html = `<option value="">— Select library —</option>`;
  for (const lib of libs) {
    const sel = lib.slug === selectedSlug ? " selected" : "";
    html += `<option value="${escapeHtml(lib.slug)}"${sel}>${escapeHtml(lib.name)}</option>`;
  }
  return html;
}

function renderSlots() {
  if (!dom.slotsContainer) return;

  dom.slotsContainer.innerHTML = slots
    .map(
      (slot, index) => `
      <div class="cmp-slot" data-slot-id="${slot.id}">
        <div class="cmp-slot__label">Library ${index + 1}</div>
        <div class="cmp-slot__controls">
          <select class="cmp-slot__select" data-slot-id="${slot.id}"${isRunning ? " disabled" : ""}>
            ${buildOptions(slot.slug)}
          </select>
          ${
            slots.length > MIN_SLOTS
              ? `<button class="cmp-slot__remove" data-slot-id="${slot.id}" title="Remove"${isRunning ? " disabled" : ""}>✕</button>`
              : ""
          }
        </div>
      </div>
    `,
    )
    .join("");

  // Wire up selectors
  for (const select of dom.slotsContainer.querySelectorAll(
    ".cmp-slot__select",
  )) {
    select.addEventListener("change", (e) => {
      const slotId = parseInt(e.target.dataset.slotId, 10);
      const slug = e.target.value || null;
      const slot = slots.find((s) => s.id === slotId);
      if (slot) slot.slug = slug;
      updateRunButton();
    });
  }

  // Wire up remove buttons
  for (const btn of dom.slotsContainer.querySelectorAll(".cmp-slot__remove")) {
    btn.addEventListener("click", (e) => {
      if (isRunning) return;
      const slotId = parseInt(e.target.dataset.slotId, 10);
      slots = slots.filter((s) => s.id !== slotId);
      renderSlots();
      updateAddSlotButton();
      updateRunButton();
    });
  }
}

function addSlot() {
  if (slots.length >= MAX_SLOTS) return;
  slots.push({ id: nextSlotId++, slug: null });
  renderSlots();
  updateAddSlotButton();
  updateRunButton();
}

function updateAddSlotButton() {
  if (!dom.addSlotBtn) return;
  const disabled = slots.length >= MAX_SLOTS || isRunning;
  dom.addSlotBtn.disabled = disabled;
  dom.addSlotBtn.style.opacity = disabled ? "0.4" : "";
}

function updateRunButton() {
  if (!dom.runBtn) return;
  const readySlugs = slots.filter((s) => s.slug).map((s) => s.slug);
  const unique = new Set(readySlugs);
  const hasDupes = unique.size !== readySlugs.length;
  const canRun = readySlugs.length >= MIN_SLOTS && !isRunning && !hasDupes;

  dom.runBtn.disabled = !canRun;

  if (hasDupes) {
    setStatus("⚠️ Please select a different library for each slot.");
  } else if (readySlugs.length < MIN_SLOTS && !isRunning) {
    setStatus("Select at least 2 libraries to compare.");
  } else if (!isRunning) {
    setStatus("");
  }
}

// =============================================================================
// Controls Wiring
// =============================================================================

function wireControls() {
  // ── Item count buttons ─────────────────────────────────────────────────
  const sizeBtns = document.querySelectorAll("#cmp-sizes .ui-segmented__btn");
  for (const btn of sizeBtns) {
    btn.addEventListener("click", () => {
      if (isRunning) return;
      const count = parseInt(btn.dataset.count, 10);
      if (!count) return;
      selectedItemCount = count;
      for (const b of sizeBtns)
        b.classList.toggle("ui-segmented__btn--active", b === btn);
    });
  }

  // ── Stress level buttons ───────────────────────────────────────────────
  const stressBtns = document.querySelectorAll(
    "#cmp-stress .ui-segmented__btn",
  );
  for (const btn of stressBtns) {
    btn.addEventListener("click", () => {
      if (isRunning) return;
      const ms = parseInt(btn.dataset.stress, 10);
      if (isNaN(ms)) return;
      selectedStressMs = ms;
      for (const b of stressBtns)
        b.classList.toggle("ui-segmented__btn--active", b === btn);
    });
  }

  // ── Run / Stop button ──────────────────────────────────────────────────
  if (dom.runBtn) {
    dom.runBtn.addEventListener("click", handleRunClick);
  }

  // ── Add slot button ────────────────────────────────────────────────────
  if (dom.addSlotBtn) {
    dom.addSlotBtn.addEventListener("click", () => {
      if (!isRunning) addSlot();
    });
  }
}

// =============================================================================
// Progress Tracking
// =============================================================================

/**
 * Parse a sub-phase status message into a 0–100 progress value within one
 * library's share of the total run. Uses the same heuristic as script.js.
 *
 * @param {string} message
 * @returns {number|null} local progress (0–100), or null if not parseable
 */
function parseLocalProgress(message) {
  // "Measuring X render (N/5)..."
  const renderMatch = message.match(/render \((\d+)\/(\d+)\)/);
  if (renderMatch) {
    const frac = parseInt(renderMatch[1], 10) / parseInt(renderMatch[2], 10);
    return frac * PHASE_RENDER_END;
  }

  // "Measuring X memory (N/10)..."
  const memMatch = message.match(/memory \((\d+)\/(\d+)\)/);
  if (memMatch) {
    const frac = parseInt(memMatch[1], 10) / parseInt(memMatch[2], 10);
    return PHASE_RENDER_END + frac * (PHASE_MEMORY_END - PHASE_RENDER_END);
  }

  if (message.includes("memory (not available)")) {
    return PHASE_MEMORY_END;
  }

  // "Measuring X scroll (N/7: speed)..."
  const scrollMatch = message.match(/scroll \((\d+)\/(\d+)/);
  if (scrollMatch) {
    const frac = parseInt(scrollMatch[1], 10) / parseInt(scrollMatch[2], 10);
    return PHASE_MEMORY_END + frac * (100 - PHASE_MEMORY_END);
  }

  if (message.includes("Preparing")) return 0;

  return null;
}

// =============================================================================
// Run Handler
// =============================================================================

async function handleRunClick() {
  if (isRunning) {
    abortController?.abort();
    abortController = null;
    setRunningState(false);
    return;
  }

  const activeSlugs = slots.filter((s) => s.slug).map((s) => s.slug);
  if (activeSlugs.length < MIN_SLOTS) return;

  setRunningState(true);
  clearResults();
  showViewport();

  abortController = new AbortController();
  const { signal } = abortController;

  // ── Randomise execution order ──────────────────────────────────────────
  // Shuffle a copy of the slug list so JIT warmth and GC state don't
  // systematically favour the first or last library in the UI.
  const shuffled = [...activeSlugs].sort(() => Math.random() - 0.5);

  const libs = getLibraries();

  // slug → raw benchmarkLibrary() result (or null on failure / abort)
  /** @type {Map<string, object|null>} */
  const rawResults = new Map();

  // slug → BenchmarkMetric[] (or null on failure)
  /** @type {Map<string, Array|null>} */
  const allMetrics = new Map();

  try {
    const total = shuffled.length;

    for (let i = 0; i < total; i++) {
      if (signal.aborted) break;

      const slug = shuffled[i];
      const adapter = libs.find((l) => l.slug === slug);
      if (!adapter) {
        rawResults.set(slug, null);
        allMetrics.set(slug, null);
        continue;
      }

      const name = adapter.name;

      // Base progress offset for this library's slice of the total bar.
      // Each library occupies an equal share of 0–90 %; the last 10 % is
      // reserved for result rendering.
      const sliceSize = 90 / total;
      const sliceStart = i * sliceSize;

      setStatus(`Running ${name} (${i + 1}/${total})…`);
      setProgress(sliceStart);

      // Fresh sub-container for each library run
      if (dom.viewportInner) dom.viewportInner.innerHTML = "";
      const runContainer = document.createElement("div");
      runContainer.style.cssText =
        "width:100%;height:100%;position:relative;overflow:hidden;";
      dom.viewportInner?.appendChild(runContainer);

      await tryGC();

      try {
        const raw = await benchmarkLibrary({
          libraryName: name,
          container: runContainer,
          itemCount: selectedItemCount,
          onStatus: (msg) => {
            setStatus(`${name}: ${msg.replace(/\.\.\.$/, "…")}`);
            // Map sub-phase message → fine-grained progress within this slice
            const local = parseLocalProgress(msg);
            if (local !== null) {
              setProgress(sliceStart + (local / 100) * sliceSize);
            }
          },
          stressMs: selectedStressMs,
          createComponent: adapter.create,
          destroyComponent: adapter.destroy,
        });

        rawResults.set(slug, raw);
        allMetrics.set(slug, buildMetrics(raw));
      } catch (err) {
        if (err.name === "AbortError") {
          // Mark remaining slugs as absent (undefined) — they simply won't appear
          break;
        }
        // Non-abort failure: record null so the column shows an error state
        rawResults.set(slug, null);
        allMetrics.set(slug, null);
        console.warn(`[compare] ${name} failed:`, err);
      }

      await tryGC();
      await waitFrames(5);
    }

    if (!signal.aborted) {
      setProgress(92);
      // Render results in original slot order (not shuffled), so the columns
      // always match what the user selected top-to-bottom.
      renderResults(activeSlugs, libs, allMetrics);
      setProgress(100);
      setStatus("✅ Complete");
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      setStatus(`❌ ${err.message || "Benchmark failed"}`);
      console.error("[compare] Fatal error:", err);
    }
  } finally {
    setRunningState(false);
    hideViewport();
  }
}

// =============================================================================
// Results Renderer
// =============================================================================

/**
 * Build and inject the results table.
 *
 * Layout:
 *   - sticky header row: library names + win counts
 *   - one row per metric: label col + one value cell per library
 *   - each cell: value, unit, diff badge (✓ best / ≈ tie / +N% worse)
 *   - footer: execution order transparency note
 *
 * @param {string[]}     slugs      - slugs in original slot order
 * @param {object[]}     libs       - full library registry (for name lookup)
 * @param {Map<string, Array|null>} allMetrics
 */
function renderResults(slugs, libs, allMetrics) {
  if (!dom.resultsContainer) return;

  // ── Collect metric labels from the first successful run ────────────────
  const metricLabels = [];
  for (const slug of slugs) {
    const metrics = allMetrics.get(slug);
    if (!metrics) continue;
    for (const m of metrics) {
      // Skip per-speed FPS breakdowns — they clutter the table
      if (!m.label.startsWith("FPS @") && !metricLabels.includes(m.label)) {
        metricLabels.push(m.label);
      }
    }
    break;
  }

  // ── Per-metric winner detection ────────────────────────────────────────
  // For each metric, build the { slug, value } entries and call pickWinner()
  // from runner.js — single source of truth, no duplicated logic.
  /** @type {Map<string, string|null>} label → winning slug | "__tie__" | null */
  const metricWinners = new Map();

  for (const label of metricLabels) {
    let better = "lower";
    const entries = [];

    for (const slug of slugs) {
      const metrics = allMetrics.get(slug);
      if (!metrics) continue;
      const m = metrics.find((x) => x.label === label);
      if (!m) continue;
      better = m.better;
      entries.push({ slug, value: m.value });
    }

    metricWinners.set(label, pickWinner(entries, better));
  }

  // ── Win counts (for header badges) ────────────────────────────────────
  /** @type {Record<string, number>} */
  const winCounts = Object.fromEntries(slugs.map((s) => [s, 0]));
  for (const winnerSlug of metricWinners.values()) {
    if (
      winnerSlug &&
      winnerSlug !== "__tie__" &&
      winCounts[winnerSlug] !== undefined
    ) {
      winCounts[winnerSlug]++;
    }
  }

  // ── Build HTML ─────────────────────────────────────────────────────────
  let html = `<div class="cmp-results">`;

  // Header row
  html += `<div class="cmp-results__header">`;
  html += `<div class="cmp-results__metric-label-col"></div>`;
  for (const slug of slugs) {
    const name = libs.find((l) => l.slug === slug)?.name ?? slug;
    const wins = winCounts[slug] ?? 0;
    // A slug may be absent from allMetrics if it was never reached (abort)
    const state = allMetrics.has(slug)
      ? allMetrics.get(slug) === null
        ? "error"
        : "ok"
      : "pending";

    html += `
      <div class="cmp-results__col-header">
        <div class="cmp-results__lib-name">${escapeHtml(name)}</div>
        <div class="cmp-results__lib-status${state === "error" ? " cmp-results__lib-status--error" : state === "pending" ? " cmp-results__lib-status--pending" : wins > 0 ? " cmp-results__lib-status--wins" : ""}">
          ${state === "error" ? "Failed" : state === "pending" ? "Not run" : wins > 0 ? `${wins} win${wins !== 1 ? "s" : ""}` : ""}
        </div>
      </div>
    `;
  }
  html += `</div>`; // .cmp-results__header

  // Metric rows
  html += `<div class="cmp-results__body">`;
  for (const label of metricLabels) {
    const winnerSlug = metricWinners.get(label); // slug | "__tie__" | null

    html += `<div class="cmp-results__row">`;
    html += `<div class="cmp-results__metric-label">${escapeHtml(label)}</div>`;

    for (const slug of slugs) {
      // Three states: never ran (absent), ran + failed (null), ran + succeeded
      if (!allMetrics.has(slug)) {
        html += `<div class="cmp-results__cell cmp-results__cell--pending">—</div>`;
        continue;
      }

      const metrics = allMetrics.get(slug);
      if (metrics === null) {
        html += `<div class="cmp-results__cell cmp-results__cell--error">—</div>`;
        continue;
      }

      const metric = metrics.find((m) => m.label === label);
      if (!metric) {
        html += `<div class="cmp-results__cell cmp-results__cell--empty">—</div>`;
        continue;
      }

      const isWinner = winnerSlug === slug;
      const isTie = winnerSlug === "__tie__";
      const ratingClass = metric.rating
        ? ` cmp-results__cell--${metric.rating}`
        : "";
      const winnerClass = isWinner ? " cmp-results__cell--winner" : "";

      // ── Diff badge ─────────────────────────────────────────────────────
      let diffBadge = "";
      if (isTie) {
        diffBadge = `<span class="cmp-diff-badge cmp-diff-badge--tie">≈ tie</span>`;
      } else if (isWinner) {
        diffBadge = `<span class="cmp-diff-badge cmp-diff-badge--winner">✓ best</span>`;
      } else if (winnerSlug) {
        // Show how much worse this cell is relative to the winner
        const winnerMetric = allMetrics
          .get(winnerSlug)
          ?.find((m) => m.label === label);
        if (winnerMetric && metric.value > 0 && winnerMetric.value > 0) {
          // Always express as "N% worse" (positive number, no sign ambiguity)
          const diffPct = Math.abs(
            ((metric.value - winnerMetric.value) / winnerMetric.value) * 100,
          );
          if (diffPct >= 3) {
            diffBadge = `<span class="cmp-diff-badge cmp-diff-badge--worse">${diffPct.toFixed(0)}% worse</span>`;
          }
        }
      }

      const displayValue = metric.displayValue ?? metric.value;
      const metaHtml = metric.meta
        ? `<div class="cmp-cell__meta">${escapeHtml(metric.meta)}</div>`
        : "";

      html += `
        <div class="cmp-results__cell${ratingClass}${winnerClass}">
          <div class="cmp-cell__value">
            ${displayValue}<span class="cmp-cell__unit">${escapeHtml(metric.unit)}</span>
          </div>
          ${diffBadge}
          ${metaHtml}
        </div>
      `;
    }

    html += `</div>`; // .cmp-results__row
  }
  html += `</div>`; // .cmp-results__body

  // Footer note
  html += `
    <div class="cmp-results__footer">
      <span class="cmp-results__footer-note">
        Libraries ran in randomized order to reduce GC bleed-through and JIT warmth bias.
      </span>
    </div>
  `;

  html += `</div>`; // .cmp-results

  dom.resultsContainer.innerHTML = html;
}

function clearResults() {
  if (dom.resultsContainer) dom.resultsContainer.innerHTML = "";
}

// =============================================================================
// Progress & Status
// =============================================================================

function setStatus(message) {
  if (!dom.statusBar) return;
  dom.statusBar.textContent = message;
  dom.statusBar.className = isRunning
    ? "cmp-status cmp-status--running"
    : "cmp-status";
}

function setProgress(percent) {
  const pct = Math.max(0, Math.min(100, percent));
  if (dom.progressContainer) {
    dom.progressContainer.classList.toggle(
      "cmp-progress--active",
      pct > 0 && pct < 100,
    );
  }
  if (dom.progressBar) {
    dom.progressBar.style.width = `${pct}%`;
  }
}

// =============================================================================
// UI State
// =============================================================================

function setRunningState(running) {
  isRunning = running;

  if (dom.runBtn) {
    if (running) {
      dom.runBtn.textContent = "■ Stop";
      dom.runBtn.classList.add("bench-run-btn--stop");
    } else {
      dom.runBtn.textContent = "▶ Run Comparison";
      dom.runBtn.classList.remove("bench-run-btn--stop");
    }
  }

  // Re-render slots to apply disabled state on selects / remove buttons
  renderSlots();
  updateAddSlotButton();

  const controls = document.querySelectorAll(
    "#cmp-sizes .ui-segmented__btn, #cmp-stress .ui-segmented__btn",
  );
  for (const btn of controls) {
    btn.style.pointerEvents = running ? "none" : "";
    btn.style.opacity = running ? "0.5" : "";
  }
}

function showViewport() {
  if (dom.viewport) dom.viewport.classList.add("bench-viewport--active");
}

function hideViewport() {
  if (dom.viewport) dom.viewport.classList.remove("bench-viewport--active");
  if (dom.viewportInner) dom.viewportInner.innerHTML = "";
}

// =============================================================================
// Helpers
// =============================================================================

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str ?? "");
  return div.innerHTML;
}

// =============================================================================
// Initialization
// =============================================================================

function init() {
  initEnvironmentTags();
  renderSlots();
  wireControls();
  updateAddSlotButton();
  updateRunButton();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
