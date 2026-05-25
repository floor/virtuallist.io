// src/api/run.ts
// API endpoints for server-side Puppeteer benchmark execution.
//
// Endpoints:
//   POST /api/run              — Start a benchmark run (returns runId)
//   GET  /api/run/:id/progress — SSE stream for live progress
//   GET  /api/run/status       — Queue status
//   POST /api/run/:id/abort    — Abort a queued/running benchmark

import {
  createRunId,
  enqueueRun,
  abortRun,
  getQueueStatus,
  type RunRequest,
  type RunProgress,
} from "../server/benchmark-runner";
import { storeResult } from "./benchmarks";
// =============================================================================
// SSE connections — store progress callbacks keyed by runId
// =============================================================================

type SSEController = ReadableStreamDefaultController<Uint8Array>;

const sseConnections = new Map<string, Set<SSEController>>();
const runResults = new Map<string, unknown>();

function broadcastProgress(runId: string, event: RunProgress): void {
  const controllers = sseConnections.get(runId);
  if (!controllers) return;

  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = new TextEncoder().encode(data);

  for (const controller of controllers) {
    try {
      controller.enqueue(encoded);
    } catch {
      controllers.delete(controller);
    }
  }
}

// =============================================================================
// Route Handler
// =============================================================================

export async function routeRun(
  req: Request,
  _url: URL,
  subPath: string,
): Promise<Response | null> {
  // POST /api/run — start a benchmark
  if (req.method === "POST" && subPath === "/run") {
    return handleStartRun(req);
  }

  // GET /api/run/status — queue status
  if (req.method === "GET" && subPath === "/run/status") {
    return handleStatus();
  }

  // GET /api/run/:id/progress — SSE stream
  const progressMatch = subPath.match(/^\/run\/([^/]+)\/progress$/);
  if (req.method === "GET" && progressMatch) {
    return handleProgress(progressMatch[1]);
  }

  // POST /api/run/:id/abort — abort a run
  const abortMatch = subPath.match(/^\/run\/([^/]+)\/abort$/);
  if (req.method === "POST" && abortMatch) {
    return handleAbort(abortMatch[1]);
  }

  return null;
}

// =============================================================================
// Handlers
// =============================================================================

async function handleStartRun(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { librarySlug, itemCount, stressMs, intensity } = body as Record<string, unknown>;

  if (!librarySlug || typeof librarySlug !== "string") {
    return jsonError("librarySlug is required", 400);
  }

  const count = typeof itemCount === "number" ? itemCount : 10_000;
  const stress = typeof stressMs === "number" ? stressMs : 0;
  const validIntensities = ["quick", "default", "full"];
  const intensityLevel = typeof intensity === "string" && validIntensities.includes(intensity)
    ? (intensity as "quick" | "default" | "full")
    : undefined;

  const runId = createRunId();
  const request: RunRequest = { librarySlug, itemCount: count, stressMs: stress, intensity: intensityLevel };

  enqueueRun(runId, request, (event) => {
    broadcastProgress(runId, event);
    if (event.type === "result") {
      runResults.set(runId, event.data);
      setTimeout(() => runResults.delete(runId), 5 * 60 * 1000);

      // Auto-persist to database
      try {
        const data = event.data as Record<string, unknown>;
        const metrics = (data.metrics as Array<Record<string, unknown>>) ?? [];
        storeResult({
          librarySlug: String(data.librarySlug ?? request.librarySlug),
          itemCount: Number(data.itemCount ?? request.itemCount),
          metrics: metrics
            .filter((m) => !String(m.label ?? "").startsWith("FPS @"))
            .map((m) => ({
              label: String(m.label),
              value: Number(m.value),
              unit: String(m.unit),
              better: String(m.better) as "lower" | "higher",
              rating: m.rating ? String(m.rating) as "good" | "ok" | "bad" : null,
            })),
          duration: Number(data.duration ?? 0),
          success: Boolean(data.success),
          userAgent: "Puppeteer headless (server-side)",
          screenWidth: 1280,
          screenHeight: 800,
        });
      } catch {
        // DB write failed — non-critical, result still streamed to client
      }
    }
  }).catch(() => {});

  const status = getQueueStatus();

  return new Response(
    JSON.stringify({
      runId,
      status: "queued",
      position: status.queueLength,
    }),
    {
      status: 202,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

function handleStatus(): Response {
  const status = getQueueStatus();
  return new Response(JSON.stringify(status), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function handleProgress(runId: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (!sseConnections.has(runId)) {
        sseConnections.set(runId, new Set());
      }
      sseConnections.get(runId)!.add(controller);

      const encoder = new TextEncoder();

      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", runId })}\n\n`),
      );

      // If result already exists (client connected late), send it immediately
      const existing = runResults.get(runId);
      if (existing) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "result", runId, data: existing, progress: 100 })}\n\n`),
        );
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done", runId })}\n\n`),
        );
      }
    },
    cancel() {
      const controllers = sseConnections.get(runId);
      if (controllers) {
        controllers.clear();
        sseConnections.delete(runId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    },
  });
}

function handleAbort(runId: string): Response {
  const aborted = abortRun(runId);
  return new Response(
    JSON.stringify({ runId, aborted }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

// =============================================================================
// Helpers
// =============================================================================

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
