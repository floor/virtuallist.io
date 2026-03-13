// src/server/router.ts
// Main request router — orchestrates all route handlers.
//
// Routes:
//   /                    → Landing page
//   /benchmarks/*        → Benchmark pages (server-rendered)
//   /methodology         → Methodology documentation
//   /api/*               → API routes (async)
//   /dist/*              → Built assets (JS, CSS)
//   /public/*            → Static assets (images, fonts)
//   /sitemap.xml         → Dynamic sitemap
//   /robots.txt          → robots.txt
//   /favicon.ico         → Favicon

import { routeApi } from "../api/router";
import { renderHomepage } from "./pages/home";
import { renderBenchmarkPage } from "./pages/benchmarks";
import { renderMethodologyPage } from "./pages/methodology";
import { renderAboutPage } from "./pages/about";
import { resolveStatic } from "./static";
import { renderSitemap, renderRobots } from "./sitemap";

// =============================================================================
// Section Resolvers
// =============================================================================

function routeSystem(pathname: string): Response | null {
  if (pathname === "/sitemap.xml") return renderSitemap();
  if (pathname === "/robots.txt") return renderRobots();
  return null;
}

function resolveHomepage(pathname: string): Response | null {
  if (pathname === "/" || pathname === "") {
    return renderHomepage();
  }
  return null;
}

function resolveMethodology(pathname: string): Response | null {
  if (pathname === "/methodology" || pathname === "/methodology/") {
    return renderMethodologyPage();
  }
  return null;
}

function resolveAbout(pathname: string): Response | null {
  // /about → overview
  if (pathname === "/about" || pathname === "/about/") {
    return renderAboutPage(null);
  }
  // /about/api, /about/contribute
  const match = pathname.match(/^\/about\/([a-z0-9-]+)\/?$/);
  if (match) return renderAboutPage(match[1]);
  return null;
}

function resolveBenchmarks(pathname: string): Response | null {
  // Overview page
  if (pathname === "/benchmarks" || pathname === "/benchmarks/") {
    return renderBenchmarkPage(null);
  }

  // Individual benchmark: /benchmarks/{library-slug}
  const match = pathname.match(/^\/benchmarks\/([a-z0-9-]+)\/?$/);
  if (match) return renderBenchmarkPage(match[1]);

  return null;
}

// =============================================================================
// Request Handler
// =============================================================================

/**
 * Main fetch handler for Bun.serve().
 *
 * Sync routes are tried first — no Promise is allocated for the majority of
 * requests (homepage, benchmarks, methodology, static files).
 * Only the /api/* path goes through the async branch.
 */
export function handleRequest(req: Request): Response | Promise<Response> {
  const url = new URL(req.url);
  const pathname = decodeURIComponent(url.pathname);

  // ── CORS preflight for API ──
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // ── Sync routes (no Promise allocation) ──
  const syncResponse =
    routeSystem(pathname) ??
    resolveHomepage(pathname) ??
    resolveBenchmarks(pathname) ??
    resolveMethodology(pathname) ??
    resolveAbout(pathname) ??
    resolveStatic(pathname);

  if (syncResponse) return syncResponse;

  // ── Async path (API routes only) ──
  return handleAsync(req, url, pathname);
}

async function handleAsync(
  req: Request,
  url: URL,
  pathname: string,
): Promise<Response> {
  const response =
    (await routeApi(req, url)) ?? new Response("Not Found", { status: 404 });
  return response;
}
