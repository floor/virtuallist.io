// src/server/static.ts
// Static file resolver — serves built assets from dist/ and public/.
//
// Resolves:
//   /dist/*       → Built JS/CSS bundles
//   /public/*     → Static assets (images, fonts, etc.)
//   /favicon.ico  → Favicon from public/

import { existsSync } from "fs";
import { join, extname } from "path";
import { DIST_DIR, PUBLIC_DIR } from "./config";

// =============================================================================
// MIME Types
// =============================================================================

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function getMimeType(path: string): string {
  const ext = extname(path).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// =============================================================================
// Cache Headers
// =============================================================================

/** Immutable assets (hashed filenames) — cache for 1 year. */
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/** Mutable assets (favicon, manifest) — cache for 1 hour, revalidate. */
const SHORT_CACHE = "public, max-age=3600, must-revalidate";

/** Development — no caching. */
const NO_CACHE = "no-cache, no-store, must-revalidate";

const IS_PROD = process.env.NODE_ENV === "production";

function cacheControl(pathname: string): string {
  if (!IS_PROD) return NO_CACHE;

  // Hashed bundle files are immutable
  if (pathname.startsWith("/dist/")) return IMMUTABLE_CACHE;

  // Everything else gets short cache
  return SHORT_CACHE;
}

// =============================================================================
// Path Validation
// =============================================================================

/**
 * Prevent path traversal attacks.
 * Rejects paths containing "..", "~", or null bytes.
 */
function isSafePath(pathname: string): boolean {
  if (pathname.includes("..")) return false;
  if (pathname.includes("~")) return false;
  if (pathname.includes("\0")) return false;
  return true;
}

// =============================================================================
// File Serving
// =============================================================================

function serveFile(filePath: string, pathname: string): Response | null {
  if (!existsSync(filePath)) return null;

  const file = Bun.file(filePath);
  const contentType = getMimeType(filePath);

  return new Response(file, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl(pathname),
    },
  });
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve a static file request.
 *
 * Maps URL paths to filesystem locations:
 *   /dist/benchmarks/script.js → dist/benchmarks/script.js
 *   /public/og-image.png       → public/og-image.png
 *   /favicon.ico               → public/favicon.ico
 *
 * Returns null if no matching file is found.
 */
export function resolveStatic(pathname: string): Response | null {
  if (!isSafePath(pathname)) return null;

  // /favicon.ico → public/favicon.ico
  if (pathname === "/favicon.ico") {
    return serveFile(join(PUBLIC_DIR, "favicon.ico"), pathname);
  }

  // /dist/* → dist/*
  if (pathname.startsWith("/dist/")) {
    const relative = pathname.slice(6); // strip "/dist/"
    const filePath = join(DIST_DIR, relative);
    return serveFile(filePath, pathname);
  }

  // /public/* → public/*
  if (pathname.startsWith("/public/")) {
    const relative = pathname.slice(8); // strip "/public/"
    const filePath = join(PUBLIC_DIR, relative);
    return serveFile(filePath, pathname);
  }

  return null;
}
