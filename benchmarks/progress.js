// benchmarks/progress.js — Client-side progress view for Puppeteer benchmarks.
//
// Connects to the SSE stream from /api/run/:id/progress and renders
// live benchmark progress with phase indicators and metrics.

import { formatItemCount, STRESS_LEVELS } from "./runner.js";

// =============================================================================
// State
// =============================================================================

let currentRunId = null;
let eventSource = null;
let onComplete = null;

// =============================================================================
// API Client
// =============================================================================

/**
 * Start a benchmark run on the server.
 *
 * @param {Object} opts
 * @param {string} opts.librarySlug - Library to benchmark
 * @param {number} [opts.itemCount=10000] - Number of items
 * @param {number} [opts.stressMs=0] - CPU stress per frame
 * @returns {Promise<string>} runId
 */
export async function startRun({ librarySlug, itemCount = 10_000, stressMs = 0 }) {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ librarySlug, itemCount, stressMs }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const { runId } = await res.json();
  return runId;
}

/**
 * Abort a running benchmark.
 * @param {string} runId
 */
export async function abortCurrentRun(runId) {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  await fetch(`/api/run/${runId}/abort`, { method: "POST" }).catch(() => {});
  currentRunId = null;
}

/**
 * Get current queue status.
 * @returns {Promise<{running: boolean, queueLength: number, activeRunId: string|null}>}
 */
export async function getStatus() {
  const res = await fetch("/api/run/status");
  return res.json();
}

// =============================================================================
// SSE Connection
// =============================================================================

/**
 * Connect to the progress stream for a run.
 *
 * @param {string} runId
 * @param {Object} callbacks
 * @param {(message: string, progress?: number) => void} callbacks.onStatus
 * @param {(phase: string) => void} [callbacks.onPhase]
 * @param {(data: Object) => void} callbacks.onResult
 * @param {(error: string) => void} [callbacks.onError]
 * @param {() => void} [callbacks.onDone]
 */
export function connectProgress(runId, callbacks) {
  if (eventSource) {
    eventSource.close();
  }

  currentRunId = runId;
  eventSource = new EventSource(`/api/run/${runId}/progress`);

  eventSource.onmessage = (e) => {
    let event;
    try {
      event = JSON.parse(e.data);
    } catch {
      return;
    }

    switch (event.type) {
      case "connected":
        callbacks.onStatus?.("Connected to benchmark server...", 0);
        break;

      case "status":
        callbacks.onStatus?.(event.message, event.progress);
        break;

      case "phase":
        callbacks.onPhase?.(event.phase);
        break;

      case "result":
        callbacks.onResult?.(event.data);
        break;

      case "error":
        callbacks.onError?.(event.message || "Unknown error");
        cleanup();
        break;

      case "done":
        callbacks.onDone?.();
        cleanup();
        break;
    }
  };

  eventSource.onerror = () => {
    callbacks.onError?.("Connection to server lost");
    cleanup();
  };
}

function cleanup() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  currentRunId = null;
}

// =============================================================================
// Progress UI Renderer
// =============================================================================

const PHASES = [
  { id: "render", label: "Render", icon: "⚡" },
  { id: "memory", label: "Memory", icon: "🧠" },
  { id: "scroll", label: "Scroll", icon: "📜" },
  { id: "jump", label: "Jump", icon: "🎯" },
];

/**
 * Create the progress UI inside a container element.
 *
 * @param {HTMLElement} container
 * @returns {Object} API to update the progress UI
 */
export function createProgressUI(container) {
  container.innerHTML = `
    <div class="bench-progress">
      <div class="bench-progress__header">
        <div class="bench-progress__title">Running benchmark...</div>
        <button class="bench-progress__abort" title="Cancel">✕</button>
      </div>
      <div class="bench-progress__bar-wrap">
        <div class="bench-progress__bar" style="width:0%"></div>
      </div>
      <div class="bench-progress__status"></div>
      <div class="bench-progress__phases">
        ${PHASES.map(
          (p) => `
          <div class="bench-progress__phase" data-phase="${p.id}">
            <span class="bench-progress__phase-icon">${p.icon}</span>
            <span class="bench-progress__phase-label">${p.label}</span>
            <span class="bench-progress__phase-check"></span>
          </div>
        `,
        ).join("")}
      </div>
      <div class="bench-progress__metrics"></div>
    </div>
  `;

  const bar = container.querySelector(".bench-progress__bar");
  const status = container.querySelector(".bench-progress__status");
  const abortBtn = container.querySelector(".bench-progress__abort");
  const metricsEl = container.querySelector(".bench-progress__metrics");
  const titleEl = container.querySelector(".bench-progress__title");

  return {
    setStatus(message, progress) {
      status.textContent = message;
      if (typeof progress === "number") {
        bar.style.width = `${Math.min(100, progress)}%`;
      }

      // Detect phase from status message
      if (message.includes("render")) activatePhase("render");
      else if (message.includes("memory")) activatePhase("memory");
      else if (message.includes("scroll")) activatePhase("scroll");
      else if (message.includes("jump")) activatePhase("jump");
    },

    setResult(data) {
      titleEl.textContent = "Benchmark complete";
      bar.style.width = "100%";
      bar.classList.add("bench-progress__bar--done");

      // Mark all phases as complete
      for (const p of PHASES) {
        const el = container.querySelector(`[data-phase="${p.id}"]`);
        if (el) el.classList.add("bench-progress__phase--done");
      }

      // Render metrics
      if (data?.metrics) {
        metricsEl.innerHTML = data.metrics
          .filter((m) => !m.meta || !m.meta.includes("@"))
          .map(
            (m) => `
            <div class="bench-progress__metric bench-progress__metric--${m.rating || "neutral"}">
              <span class="bench-progress__metric-label">${m.label}</span>
              <span class="bench-progress__metric-value">${m.displayValue || m.value} ${m.unit}</span>
            </div>
          `,
          )
          .join("");
      }
    },

    setError(message) {
      titleEl.textContent = "Benchmark failed";
      status.textContent = message;
      bar.classList.add("bench-progress__bar--error");
    },

    onAbort(fn) {
      abortBtn.addEventListener("click", fn);
    },

    destroy() {
      container.innerHTML = "";
    },
  };
}

function activatePhase(phaseId) {
  const phases = document.querySelectorAll(".bench-progress__phase");
  for (const el of phases) {
    if (el.dataset.phase === phaseId) {
      el.classList.add("bench-progress__phase--active");
    } else {
      el.classList.remove("bench-progress__phase--active");
      // Mark previous phases as done
      const idx = PHASES.findIndex((p) => p.id === el.dataset.phase);
      const activeIdx = PHASES.findIndex((p) => p.id === phaseId);
      if (idx < activeIdx) {
        el.classList.add("bench-progress__phase--done");
      }
    }
  }
}

// =============================================================================
// High-level orchestrator
// =============================================================================

/**
 * Run a benchmark with full UI progress display.
 *
 * @param {Object} opts
 * @param {string} opts.librarySlug
 * @param {number} opts.itemCount
 * @param {number} opts.stressMs
 * @param {HTMLElement} opts.container - Element to render progress UI into
 * @returns {Promise<Object>} Benchmark result
 */
export async function runWithProgress({
  librarySlug,
  itemCount,
  stressMs,
  container,
}) {
  const ui = createProgressUI(container);

  try {
    const runId = await startRun({ librarySlug, itemCount, stressMs });

    return await new Promise((resolve, reject) => {
      ui.onAbort(async () => {
        await abortCurrentRun(runId);
        ui.setError("Cancelled by user");
        reject(new Error("Aborted"));
      });

      connectProgress(runId, {
        onStatus(message, progress) {
          ui.setStatus(message, progress);
        },
        onResult(data) {
          ui.setResult(data);
          resolve(data);
        },
        onError(message) {
          ui.setError(message);
          reject(new Error(message));
        },
        onDone() {
          // Result already delivered via onResult
        },
      });
    });
  } catch (err) {
    ui.setError(err.message || "Failed to start benchmark");
    throw err;
  }
}
