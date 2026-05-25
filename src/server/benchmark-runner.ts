// src/server/benchmark-runner.ts
// Server-side Puppeteer benchmark runner with queue management.
//
// Runs benchmarks in headless Chrome with controlled flags for reproducible results:
//   - --disable-frame-rate-limit: uncapped rAF (no 60Hz/120Hz variance)
//   - --enable-precise-memory-info: accurate heap measurements
//   - --js-flags=--expose-gc: explicit GC control
//
// Queue ensures only one benchmark runs at a time (CPU contention skews results).

import puppeteer, { type Browser } from "puppeteer";
import { readFileSync } from "fs";
import { resolve } from "path";

// =============================================================================
// Types
// =============================================================================

export interface RunRequest {
  librarySlug: string;
  itemCount: number;
  stressMs: number;
  intensity?: "quick" | "default" | "full";
}

export interface RunProgress {
  type: "status" | "phase" | "phase-result" | "metric" | "result" | "error" | "done";
  runId: string;
  message?: string;
  phase?: string;
  progress?: number;
  data?: unknown;
}

type ProgressCallback = (event: RunProgress) => void;

interface QueueItem {
  runId: string;
  request: RunRequest;
  onProgress: ProgressCallback;
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

// =============================================================================
// State
// =============================================================================

let browser: Browser | null = null;
const queue: QueueItem[] = [];
let running = false;
const activeRuns = new Map<string, { abort: () => void }>();

// =============================================================================
// Browser Lifecycle
// =============================================================================

const CHROME_FLAGS = [
  "--disable-frame-rate-limit",
  "--disable-gpu-vsync",
  "--enable-precise-memory-info",
  "--js-flags=--expose-gc",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-extensions",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: CHROME_FLAGS,
    });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// =============================================================================
// Bundle Loading
// =============================================================================

const DIST_DIR = resolve(import.meta.dir, "../../dist/benchmarks");

function getHeadlessBundle(): string {
  return readFileSync(resolve(DIST_DIR, "headless.js"), "utf-8");
}

// =============================================================================
// Queue Management
// =============================================================================

let runCounter = 0;

export function createRunId(): string {
  return `run_${Date.now()}_${++runCounter}`;
}

export function enqueueRun(
  runId: string,
  request: RunRequest,
  onProgress: ProgressCallback,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    queue.push({ runId, request, onProgress, resolve, reject });
    activeRuns.set(runId, {
      abort: () => reject(new Error("Run aborted")),
    });
    processQueue();
  });
}

export function abortRun(runId: string): boolean {
  const active = activeRuns.get(runId);
  if (active) {
    active.abort();
    activeRuns.delete(runId);
    return true;
  }
  const idx = queue.findIndex((item) => item.runId === runId);
  if (idx !== -1) {
    queue.splice(idx, 1);
    return true;
  }
  return false;
}

export function getQueueStatus(): {
  running: boolean;
  queueLength: number;
  activeRunId: string | null;
} {
  return {
    running,
    queueLength: queue.length,
    activeRunId: running ? (queue[0]?.runId ?? null) : null,
  };
}

async function processQueue(): Promise<void> {
  if (running || queue.length === 0) return;

  running = true;
  const item = queue.shift()!;

  try {
    const result = await executeRun(item.runId, item.request, item.onProgress);
    item.resolve(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    item.onProgress({
      type: "error",
      runId: item.runId,
      message: msg,
    });
    item.reject(err instanceof Error ? err : new Error(String(err)));
  } finally {
    activeRuns.delete(item.runId);
    running = false;
    processQueue();
  }
}

// =============================================================================
// Benchmark Execution
// =============================================================================

async function executeRun(
  runId: string,
  request: RunRequest,
  onProgress: ProgressCallback,
): Promise<unknown> {
  const { librarySlug, itemCount, stressMs } = request;

  onProgress({
    type: "status",
    runId,
    message: "Launching browser...",
    progress: 0,
  });

  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width: 1280, height: 800 });

    onProgress({
      type: "status",
      runId,
      message: "Loading benchmark environment...",
      progress: 5,
    });

    // Expose progress callback to the page
    await page.exposeFunction("__benchProgress", (event: RunProgress) => {
      onProgress(event);
    });

    // Capture page errors for debugging
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        pageErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    // Set up the page with a container and bench-item styles
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { overflow: hidden; }
          #bench-container > * { height: 100%; width: 100%; }
          .bench-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0 1rem;
            height: 48px;
            font-size: 0.85rem;
            border-bottom: 1px solid #222;
          }
          .bench-item__avatar {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: #1a1a2e;
            font-weight: 700;
            font-size: 0.72rem;
            flex-shrink: 0;
          }
          .bench-item__content { flex: 1; min-width: 0; }
          .bench-item__title {
            font-size: 0.82rem;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .bench-item__sub {
            font-size: 0.72rem;
            color: #888;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .bench-item__meta {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-shrink: 0;
          }
          .bench-item__badge {
            font-size: 0.65rem;
            font-weight: 600;
            padding: 0.1rem 0.4rem;
            border-radius: 4px;
          }
          .bench-item__time { font-size: 0.7rem; color: #888; }
        </style>
      </head>
      <body>
        <div id="bench-container" style="width:1280px;height:800px;overflow:hidden;position:relative;"></div>
      </body>
      </html>
    `);

    // Inject the headless bundle as a regular script (already fully bundled)
    const bundle = getHeadlessBundle();
    await page.addScriptTag({ content: bundle });

    try {
      await page.waitForFunction(
        () => (window as any).__benchReady === true,
        { timeout: 15000 },
      );
    } catch {
      const ready = await page.evaluate(() => (window as any).__benchReady).catch(() => "eval-failed");
      const errorMsg = pageErrors.length > 0
        ? `Script failed to load: ${pageErrors.join("; ")}`
        : `Script failed to load (__benchReady=${ready})`;
      throw new Error(errorMsg);
    }

    onProgress({
      type: "status",
      runId,
      message: `Running ${librarySlug} benchmark...`,
      progress: 10,
    });

    // Execute the benchmark
    const intensityLevel = request.intensity ?? "default";
    const result = await page.evaluate(
      async (slug: string, count: number, stress: number, id: string, intensityArg: string) => {
        const w = window as any;

        const adapter = w.__getLibrary(slug);
        if (!adapter) {
          throw new Error(`Library "${slug}" not registered`);
        }

        const container = document.getElementById("bench-container")!;

        const benchResult = await w.__benchmarkLibrary({
          libraryName: adapter.name,
          container,
          itemCount: count,
          stressMs: stress,
          intensity: intensityArg,
          createComponent: adapter.create,
          destroyComponent: adapter.destroy,
          onStatus: (message: string) => {
            (window as any).__benchProgress({
              type: "status",
              runId: id,
              message,
            });
          },
          onPhaseResult: (phase: string, value: number) => {
            (window as any).__benchProgress({
              type: "phase-result",
              runId: id,
              phase,
              data: value,
            });
          },
        });

        const metrics = w.__buildMetrics(benchResult);

        return {
          librarySlug: slug,
          itemCount: count,
          metrics,
          duration: Math.round(benchResult.renderTime + benchResult.avgP95),
          success: true,
          raw: benchResult,
        };
      },
      librarySlug,
      itemCount,
      stressMs,
      runId,
      intensityLevel,
    );

    onProgress({
      type: "result",
      runId,
      data: result,
      progress: 100,
    });

    onProgress({
      type: "done",
      runId,
      message: "Benchmark complete",
    });

    return result;
  } finally {
    await page.close();
  }
}
