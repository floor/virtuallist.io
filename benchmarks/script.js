// benchmarks/script.js — Client-side benchmark UI for virtuallist.io
//
// This script runs in the browser on individual library benchmark pages.
// It reads the library slug from the page, wires up controls, and
// triggers server-side Puppeteer benchmark execution via /api/run.
//
// Benchmarks run in headless Chrome on the server for reproducible results
// (no refresh rate variance, consistent memory measurements, controlled environment).
// Progress is streamed back via Server-Sent Events (SSE).

// =============================================================================
// Constants
// =============================================================================

const ITEM_COUNTS = [10_000, 1_000_000];
const INITIAL_ITEM_COUNT = ITEM_COUNTS[0];

const CHART_METRICS = [
  { id: "render", label: "Render", unit: "ms", better: "lower", good: 15, ok: 50, max: 100 },
  { id: "memory", label: "Memory", unit: "MB", better: "lower", good: 1, ok: 5, max: 10 },
  { id: "fps", label: "Scroll FPS", unit: "fps", better: "higher", good: 100, ok: 55, max: 500 },
  { id: "p95", label: "P95 Frame", unit: "ms", better: "lower", good: 12, ok: 20, max: 60 },
  { id: "jump", label: "Jump", unit: "ms", better: "lower", good: 10, ok: 25, max: 80 },
];

// =============================================================================
// State
// =============================================================================

let selectedItemCount = INITIAL_ITEM_COUNT;
let isRunning = false;

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
  chromeTag: document.getElementById("bench-chrome-tag"),
  cpuTag: document.getElementById("bench-cpu-tag"),
};

// =============================================================================
// Page Detection
// =============================================================================

function getLibrarySlug() {
  const page = document.querySelector("[data-library]");
  return page ? page.getAttribute("data-library") : null;
}

const librarySlug = getLibrarySlug();

// =============================================================================
// Environment Tags
// =============================================================================

function initEnvironmentTags() {
  if (dom.chromeTag) dom.chromeTag.textContent = "Server-side (headless Chrome)";
  if (dom.cpuTag) dom.cpuTag.textContent = "Controlled environment";
}

// =============================================================================
// Controls Wiring
// =============================================================================

function wireControls() {
  const sizeBtns = document.querySelectorAll("#bench-sizes .ui-segmented__btn");
  for (const btn of sizeBtns) {
    btn.addEventListener("click", () => {
      if (isRunning) return;
      const count = parseInt(btn.dataset.count, 10);
      if (!count) return;
      selectedItemCount = count;
      for (const b of sizeBtns) {
        b.classList.toggle("ui-segmented__btn--active", b === btn);
      }
    });
  }

  if (dom.runBtn) {
    dom.runBtn.addEventListener("click", handleRunClick);
  }
}

// =============================================================================
// Live Chart Builder
// =============================================================================

function buildChart() {
  if (!dom.suitesContainer) return;

  const rows = CHART_METRICS.map((m) => {
    const baselinePct = m.better === "lower"
      ? (m.good / m.max) * 100
      : (m.good / m.max) * 100;

    return `
      <div class="bench-chart__row" data-phase="${m.id}">
        <div class="bench-chart__label">${m.label}</div>
        <div class="bench-chart__track">
          <div class="bench-chart__baseline" style="left:${baselinePct}%"></div>
          <div class="bench-chart__bar" id="chart-bar-${m.id}"></div>
        </div>
        <div class="bench-chart__value" id="chart-val-${m.id}">
          <span class="bench-chart__number">—</span>
          <span class="bench-chart__unit">${m.unit}</span>
        </div>
      </div>
    `;
  }).join("");

  dom.suitesContainer.innerHTML = `
    <div class="bench-chart" id="bench-chart">
      <div class="bench-chart__status" id="bench-chart-status"></div>
      ${rows}
    </div>
  `;
}

function updateChartPhase(phase, value) {
  const metric = CHART_METRICS.find((m) => m.id === phase);
  if (!metric) return;

  const bar = document.getElementById(`chart-bar-${phase}`);
  const valEl = document.getElementById(`chart-val-${phase}`);
  if (!bar || !valEl) return;

  const displayVal = value !== null ? value : 0;
  const pct = Math.min((displayVal / metric.max) * 100, 100);

  let rating;
  if (metric.better === "lower") {
    rating = displayVal <= metric.good ? "good" : displayVal <= metric.ok ? "ok" : "bad";
  } else {
    rating = displayVal >= metric.good ? "good" : displayVal >= metric.ok ? "ok" : "bad";
  }

  bar.className = `bench-chart__bar bench-chart__bar--${rating}`;
  bar.style.width = `${pct}%`;

  const row = bar.closest(".bench-chart__row");
  if (row) {
    row.classList.add("bench-chart__row--done");
    row.classList.remove("bench-chart__row--active");
  }

  const numberEl = valEl.querySelector(".bench-chart__number");
  if (numberEl) {
    numberEl.textContent = value !== null ? value : "—";
  }
}

function setActivePhase(phase) {
  const rows = document.querySelectorAll(".bench-chart__row");
  for (const row of rows) {
    if (row.dataset.phase === phase && !row.classList.contains("bench-chart__row--done")) {
      row.classList.add("bench-chart__row--active");
    }
  }
}

function setChartStatus(message) {
  const el = document.getElementById("bench-chart-status");
  if (el) el.textContent = message;
}

function detectPhaseFromStatus(message) {
  if (message.includes("render")) return "render";
  if (message.includes("memory")) return "memory";
  if (message.includes("scroll")) return "fps";
  if (message.includes("jump")) return "jump";
  return null;
}

// =============================================================================
// Final Metrics Cards (shown after chart on completion)
// =============================================================================

function renderMetrics(slug, metrics) {
  const container = document.getElementById("bench-chart");
  if (!container) return;

  const coreMetrics = metrics.filter((m) => !m.label.startsWith("FPS @"));

  const cards = coreMetrics
    .map((metric) => {
      const ratingClass = metric.rating ? ` bench-metric--${metric.rating}` : "";
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

  let metricsWrap = document.getElementById("bench-final-metrics");
  if (!metricsWrap) {
    metricsWrap = document.createElement("div");
    metricsWrap.id = "bench-final-metrics";
    metricsWrap.className = "bench-metrics";
    container.after(metricsWrap);
  }
  metricsWrap.innerHTML = cards;
}

// =============================================================================
// Run Handler
// =============================================================================

/** @type {string|null} */
let currentRunId = null;
/** @type {EventSource|null} */
let eventSource = null;

async function handleRunClick() {
  if (!librarySlug) return;

  if (isRunning) {
    if (currentRunId) {
      fetch(`/api/run/${currentRunId}/abort`, { method: "POST" }).catch(() => {});
    }
    if (eventSource) { eventSource.close(); eventSource = null; }
    currentRunId = null;
    setRunningState(false);
    return;
  }

  setRunningState(true);
  buildChart();

  try {
    const res = await fetch("/api/run/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ librarySlug, itemCount: selectedItemCount }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const { runId, position } = await res.json();
    currentRunId = runId;

    if (position > 0) {
      setChartStatus(`Queued (position ${position})…`);
    }

    eventSource = new EventSource(`/api/run/${runId}/progress`);

    eventSource.onmessage = (e) => {
      let event;
      try { event = JSON.parse(e.data); } catch { return; }

      switch (event.type) {
        case "connected":
          setChartStatus("Connected to server…");
          break;

        case "status": {
          setChartStatus(event.message);
          const phase = detectPhaseFromStatus(event.message);
          if (phase) setActivePhase(phase);
          break;
        }

        case "phase-result":
          updateChartPhase(event.phase, event.data);
          break;

        case "result":
          if (event.data?.metrics) {
            results.set(`${librarySlug}::${selectedItemCount}`, event.data);
            renderMetrics(librarySlug, event.data.metrics);
          }
          break;

        case "error":
          showError(event.message || "Benchmark failed");
          cleanup();
          break;

        case "done":
          setRunningState(false);
          setChartStatus("");
          const chart = document.getElementById("bench-chart");
          if (chart) chart.classList.add("bench-chart--done");
          cleanup();
          break;
      }
    };

    eventSource.onerror = () => {
      showError("Connection to server lost");
      cleanup();
    };
  } catch (err) {
    setRunningState(false);
    showError(err.message || "Failed to start benchmark");
  }
}

function cleanup() {
  if (eventSource) { eventSource.close(); eventSource = null; }
  currentRunId = null;
}

// =============================================================================
// UI State Helpers
// =============================================================================

function setRunningState(running) {
  isRunning = running;

  if (dom.runBtn) {
    if (running) {
      dom.runBtn.textContent = "Stop";
      dom.runBtn.classList.add("bench-run-btn--stop");
    } else {
      dom.runBtn.textContent = "Run";
      dom.runBtn.classList.remove("bench-run-btn--stop");
    }
  }

  const controls = document.querySelectorAll("#bench-sizes .ui-segmented__btn");
  for (const btn of controls) {
    btn.style.pointerEvents = running ? "none" : "";
    btn.style.opacity = running ? "0.5" : "";
  }
}

function showError(message) {
  if (!dom.suitesContainer) return;
  dom.suitesContainer.innerHTML = `
    <div class="bench-suite__error">${escapeHtml(message)}</div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// =============================================================================
// Initialization
// =============================================================================

function init() {
  if (!librarySlug) return;
  initEnvironmentTags();
  wireControls();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
