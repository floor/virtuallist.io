// scripts/lib/runner.ts — Shared benchmark runner with SSE + retry

const BASE_URL = "http://localhost:3456";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;

export interface BenchmarkResult {
  librarySlug: string;
  itemCount: number;
  metrics: Array<{ label: string; value: number; unit: string; better: string; rating?: string }>;
  duration: number;
  success: boolean;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw new Error("unreachable");
}

export async function checkServer(): Promise<void> {
  try {
    const res = await fetchWithRetry(`${BASE_URL}/api/run/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    console.error(`\n  ✗ Server not reachable at ${BASE_URL}\n`);
    process.exit(1);
  }
}

export async function runBenchmark(opts: {
  librarySlug: string;
  itemCount: number;
  intensity?: string;
  onStatus?: (msg: string) => void;
}): Promise<BenchmarkResult | null> {
  const { librarySlug, itemCount, intensity, onStatus } = opts;

  let res: Response;
  try {
    res = await fetchWithRetry(`${BASE_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ librarySlug, itemCount, stressMs: 0, intensity }),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const { runId } = (await res.json()) as { runId: string };

  return new Promise<BenchmarkResult | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), TIMEOUT_MS);

    const consumeSSE = async (attempt: number): Promise<void> => {
      let sseRes: Response;
      try {
        sseRes = await fetch(`${BASE_URL}/api/run/${runId}/progress`);
      } catch {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          return consumeSSE(attempt + 1);
        }
        clearTimeout(timeout);
        resolve(null);
        return;
      }

      const reader = sseRes.body?.getReader();
      if (!reader) { clearTimeout(timeout); resolve(null); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let result: BenchmarkResult | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let event: Record<string, unknown>;
            try { event = JSON.parse(line.slice(6)); } catch { continue; }

            if (event.type === "status") {
              onStatus?.(event.message as string);
            }

            if (event.type === "result" && event.data) {
              result = event.data as BenchmarkResult;
            }

            if (event.type === "error") {
              console.error(`\n  [error] ${event.message || "unknown error"}`);
              clearTimeout(timeout);
              resolve(null);
              return;
            }

            if (event.type === "done") {
              clearTimeout(timeout);
              resolve(result);
              return;
            }
          }
        }
      } catch {
        // SSE stream broke — retry if the run might still be going
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          return consumeSSE(attempt + 1);
        }
      }

      clearTimeout(timeout);
      resolve(result);
    };

    consumeSSE(1);
  });
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}K`;
  return String(n);
}

export function formatResult(result: BenchmarkResult): string {
  return result.metrics
    .filter((m) => !m.label.startsWith("FPS @"))
    .map((m) => `${m.label}: ${m.value}${m.unit}`)
    .join("  ");
}
