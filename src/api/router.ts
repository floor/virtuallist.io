// src/api/router.ts
// API router — handles all /api/* requests.
//
// Endpoints:
//   POST /api/benchmarks                — store a benchmark result
//   GET  /api/benchmarks/stats          — aggregated stats for a library
//   GET  /api/benchmarks/history        — time-series data for charts
//   GET  /api/benchmarks/libraries      — list all known library slugs
//   GET  /api/benchmarks/browsers       — browser breakdown
//   GET  /api/benchmarks/summary        — high-level overview
//
// All GET endpoints return JSON with CORS headers.
// The POST endpoint validates input, rate-limits by IP, and stores to SQLite.

import { routeBenchmarks } from "./benchmarks";
import { routeRun } from "./run";

// =============================================================================
// CORS Headers
// =============================================================================

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// =============================================================================
// Helpers
// =============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        status === 200
          ? "public, max-age=60, stale-while-revalidate=300"
          : "no-cache",
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// =============================================================================
// Router
// =============================================================================

/**
 * Route an API request to the appropriate handler.
 *
 * Returns a Response, or null if the path doesn't match any API route.
 * The main router uses null to fall through to the 404 handler.
 */
export async function routeApi(
  req: Request,
  url: URL,
): Promise<Response | null> {
  const pathname = url.pathname;

  // Only handle /api/* paths
  if (!pathname.startsWith("/api/")) return null;

  // Strip "/api" prefix → sub-path
  const subPath = pathname.slice(4); // "/api/benchmarks/stats" → "/benchmarks/stats"

  // ── Benchmark Run API (Puppeteer) ──
  if (subPath.startsWith("/run")) {
    try {
      const response = await routeRun(req, url, subPath);
      if (response) return response;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Internal server error";
      console.error("[api] Run route error:", message);
      return errorResponse(message, 500);
    }
  }

  // ── Benchmarks API ──
  if (subPath.startsWith("/benchmarks")) {
    try {
      return await routeBenchmarks(req, url, subPath);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Internal server error";
      console.error("[api] Benchmark route error:", message);
      return errorResponse(message, 500);
    }
  }

  // ── Health check ──
  if (subPath === "/health" || subPath === "/health/") {
    return jsonResponse({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }

  // ── Unknown API route ──
  return errorResponse("Unknown API endpoint", 404);
}
