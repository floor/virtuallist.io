// src/server/config.ts
// Server-wide constants and path resolution.

import { resolve } from "path";

/** True when NODE_ENV is explicitly set to "production". */
export const IS_PROD = process.env.NODE_ENV === "production";

export const PORT = parseInt(process.env.PORT || "3456", 10);
export const ROOT = resolve(".");
export const SITE = "https://virtuallist.io";

// =============================================================================
// Directory Paths
// =============================================================================

export const BENCHMARKS_DIR = resolve(ROOT, "benchmarks");
export const DIST_DIR = resolve(ROOT, "dist");
export const PUBLIC_DIR = resolve(ROOT, "public");
export const DATA_DIR = resolve(ROOT, "data");
export const DB_PATH = resolve(DATA_DIR, "benchmarks.db");
