// src/server/sitemap.ts
// Dynamic sitemap and robots.txt generators for virtuallist.io.
//
// The sitemap includes all public pages:
//   - Homepage
//   - Methodology
//   - Benchmark overview
//   - Individual library benchmark pages
//
// Library slugs are derived from the registry so new libraries are
// automatically included without manual sitemap updates.

import { SITE } from "./config";
import { getLibrarySlugs } from "./registry";

// =============================================================================
// Types
// =============================================================================

interface SitemapEntry {
  loc: string;
  changefreq: "daily" | "weekly" | "monthly";
  priority: string;
}

// =============================================================================
// Sitemap Generation
// =============================================================================

function buildEntries(): SitemapEntry[] {
  const entries: SitemapEntry[] = [
    // Homepage
    {
      loc: `${SITE}/`,
      changefreq: "weekly",
      priority: "1.0",
    },
    // Benchmark overview
    {
      loc: `${SITE}/benchmarks`,
      changefreq: "weekly",
      priority: "0.9",
    },
    // Compare page
    {
      loc: `${SITE}/benchmarks/compare`,
      changefreq: "weekly",
      priority: "0.85",
    },
    // Results page (crowdsourced aggregated data)
    {
      loc: `${SITE}/benchmarks/results`,
      changefreq: "daily",
      priority: "0.85",
    },
    // Methodology
    {
      loc: `${SITE}/methodology`,
      changefreq: "monthly",
      priority: "0.7",
    },
    // About section
    {
      loc: `${SITE}/about`,
      changefreq: "monthly",
      priority: "0.6",
    },
    {
      loc: `${SITE}/about/contribute`,
      changefreq: "monthly",
      priority: "0.6",
    },
    {
      loc: `${SITE}/about/api`,
      changefreq: "monthly",
      priority: "0.5",
    },
  ];

  // Individual library benchmark pages
  for (const slug of getLibrarySlugs()) {
    entries.push({
      loc: `${SITE}/benchmarks/${slug}`,
      changefreq: "weekly",
      priority: "0.8",
    });
  }

  return entries;
}

function buildSitemapXml(): string {
  const entries = buildEntries();

  const urls = entries
    .map(
      (entry) =>
        `  <url>\n` +
        `    <loc>${escapeXml(entry.loc)}</loc>\n` +
        `    <changefreq>${entry.changefreq}</changefreq>\n` +
        `    <priority>${entry.priority}</priority>\n` +
        `  </url>`,
    )
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls}\n` +
    `</urlset>\n`
  );
}

// =============================================================================
// robots.txt
// =============================================================================

function buildRobotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    "# Disallow API endpoints and built assets",
    "Disallow: /api/",
    "Disallow: /dist/",
    "",
    `Sitemap: ${SITE}/sitemap.xml`,
    "",
  ].join("\n");
}

// =============================================================================
// XML Helpers
// =============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// =============================================================================
// Cached Responses
// =============================================================================

let sitemapCache: string | null = null;
let robotsCache: string | null = null;

/**
 * Clear cached sitemap and robots.txt.
 * Call this if the library registry changes at runtime.
 */
export function clearSitemapCache(): void {
  sitemapCache = null;
  robotsCache = null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Render the sitemap.xml response.
 */
export function renderSitemap(): Response {
  if (!sitemapCache) {
    sitemapCache = buildSitemapXml();
  }

  return new Response(sitemapCache, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}

/**
 * Render the robots.txt response.
 */
export function renderRobots(): Response {
  if (!robotsCache) {
    robotsCache = buildRobotsTxt();
  }

  return new Response(robotsCache, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, must-revalidate",
    },
  });
}
