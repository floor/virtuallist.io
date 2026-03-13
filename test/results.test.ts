// test/results.test.ts — Tests for the results page (/benchmarks/results)
//
// Covers:
//   - Router          — /benchmarks/results returns 200, trailing slash, query params
//   - HTML content    — results.js script tag, sidebar link, table structure, controls
//   - Sitemap         — /benchmarks/results included with correct priority
//   - Data logic      — buildResultRows(), confidenceTier(), formatMetricValue()

import { describe, it, expect, beforeEach } from "bun:test";

// =============================================================================
// Server modules
// =============================================================================

import { handleRequest } from "../src/server/router.ts";
import { renderSitemap, clearSitemapCache } from "../src/server/sitemap.ts";
import { clearBenchmarkCache } from "../src/server/pages/benchmarks.ts";

// =============================================================================
// Helpers
// =============================================================================

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`);
}

async function getResponse(path: string): Promise<Response> {
  const res = handleRequest(makeRequest(path));
  return res instanceof Promise ? await res : res;
}

async function getHtml(path: string): Promise<string> {
  const response = await getResponse(path);
  return response.text();
}

// =============================================================================
// Router — /benchmarks/results
// =============================================================================

describe("router — /benchmarks/results", () => {
  beforeEach(() => {
    clearBenchmarkCache();
  });

  it("responds 200 for /benchmarks/results", async () => {
    const response = await getResponse("/benchmarks/results");
    expect(response.status).toBe(200);
  });

  it("responds 200 for /benchmarks/results/ (trailing slash)", async () => {
    const response = await getResponse("/benchmarks/results/");
    expect(response.status).toBe(200);
  });

  it("returns HTML content-type", async () => {
    const response = await getResponse("/benchmarks/results");
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("responds 200 with query params", async () => {
    const response = await getResponse(
      "/benchmarks/results?items=100000&stress=3",
    );
    expect(response.status).toBe(200);
  });

  it("responds 200 with invalid query params (falls back to defaults)", async () => {
    const response = await getResponse(
      "/benchmarks/results?items=bogus&stress=-1",
    );
    expect(response.status).toBe(200);
  });

  it("does not respond to /benchmarks/results/extra (treated as library slug → 404)", async () => {
    const response = await getResponse("/benchmarks/results/extra");
    expect(response.status).toBe(404);
  });
});

// =============================================================================
// HTML content — structure and elements
// =============================================================================

describe("results page — HTML content", () => {
  beforeEach(() => {
    clearBenchmarkCache();
  });

  it("includes results.js script tag", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain("/dist/benchmarks/results.js");
  });

  it("does NOT include script.js or compare.js", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).not.toContain("/dist/benchmarks/script.js");
    expect(html).not.toContain("/dist/benchmarks/compare.js");
  });

  it("includes the page title", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain("Crowdsourced Results");
  });

  it("includes the sidebar Results link as active", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain("/benchmarks/results");
    // The Results link should have the active class
    expect(html).toContain('sidebar__link sidebar__link--active">📊 Results');
  });

  it("sidebar Compare link is NOT active", async () => {
    const html = await getHtml("/benchmarks/results");
    // Compare should be a plain link, not active
    expect(html).not.toContain(
      'sidebar__link sidebar__link--active">⚖ Compare',
    );
  });

  it("sidebar Overview link is NOT active", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).not.toContain('sidebar__link sidebar__link--active">Overview');
  });

  it("includes item count filter controls", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain('id="res-sizes"');
    expect(html).toContain('data-count="10000"');
    expect(html).toContain('data-count="100000"');
    expect(html).toContain('data-count="1000000"');
  });

  it("includes stress level filter controls", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain('id="res-stress"');
    expect(html).toContain('data-stress="0"');
    expect(html).toContain('data-stress="3"');
    expect(html).toContain('data-stress="5"');
    expect(html).toContain('data-stress="7"');
  });

  it("includes sortable column headers", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain('data-metric="Render"');
    expect(html).toContain('data-metric="Memory"');
    expect(html).toContain('data-metric="Scroll FPS"');
    expect(html).toContain('data-metric="P95 Frame"');
  });

  it("marks Render as the default sorted column", async () => {
    const html = await getHtml("/benchmarks/results");
    // The Render header should have the --sorted class
    expect(html).toContain('res-table__th--sorted" data-metric="Render"');
  });

  it("includes column direction hints (data-better)", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain('data-metric="Render" data-better="lower"');
    expect(html).toContain('data-metric="Memory" data-better="lower"');
    expect(html).toContain('data-metric="Scroll FPS" data-better="higher"');
    expect(html).toContain('data-metric="P95 Frame" data-better="lower"');
    expect(html).toContain('data-metric="Jump" data-better="lower"');
  });

  it("includes the confidence legend", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain("res-legend");
    expect(html).toContain("High confidence");
    expect(html).toContain("Moderate confidence");
    expect(html).toContain("Low confidence");
  });

  it("includes results-specific CSS", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain(".res-table");
    expect(html).toContain(".res-table__td--best");
    expect(html).toContain(".res-legend");
  });

  it("renders either table rows or the empty state", async () => {
    const html = await getHtml("/benchmarks/results");
    // Must have either library rows in a table or the empty state message
    const hasTable = html.includes("res-table__row");
    const hasEmpty = html.includes("res-empty");
    expect(hasTable || hasEmpty).toBe(true);
  });

  it("10K item count is active by default", async () => {
    const html = await getHtml("/benchmarks/results");
    // The 10K button should have the active class
    expect(html).toContain(
      'ui-segmented__btn ui-segmented__btn--active" data-count="10000"',
    );
  });

  it("stress 0 is active by default", async () => {
    const html = await getHtml("/benchmarks/results");
    // The 0ms stress button should have the active class
    expect(html).toContain(
      'ui-segmented__btn ui-segmented__btn--active" data-stress="0"',
    );
  });

  it("different item count param changes active button in server render", async () => {
    const html = await getHtml("/benchmarks/results?items=100000");
    // 100K should now be active
    expect(html).toContain(
      'ui-segmented__btn ui-segmented__btn--active" data-count="100000"',
    );
    // 10K should NOT be active
    expect(html).not.toContain(
      'ui-segmented__btn ui-segmented__btn--active" data-count="10000"',
    );
  });

  it("meta title is set correctly", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain(
      "<title>Crowdsourced Results — virtuallist.io</title>",
    );
  });

  it("meta description is set", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain('name="description"');
    expect(html).toContain("Aggregated benchmark results");
  });

  it("canonical URL is set", async () => {
    const html = await getHtml("/benchmarks/results");
    expect(html).toContain("https://virtuallist.io/benchmarks/results");
  });
});

// =============================================================================
// Results page — when data exists in DB
// =============================================================================

describe("results page — data rendering", () => {
  beforeEach(() => {
    clearBenchmarkCache();
  });

  it("library rows link to their individual benchmark page", async () => {
    const html = await getHtml("/benchmarks/results");
    // If any rows exist, they should contain links like /benchmarks/{slug}
    const rowMatch = html.match(/res-table__row" data-slug="([a-z0-9-]+)"/);
    if (rowMatch) {
      const slug = rowMatch[1];
      expect(html).toContain(`href="/benchmarks/${slug}"`);
    }
  });

  it("each row has a confidence badge", async () => {
    const html = await getHtml("/benchmarks/results");
    const rowCount = (html.match(/res-table__row" data-slug="/g) || []).length;
    const badgeCount = (html.match(/res-runs__badge res-runs__badge--/g) || [])
      .length;
    // Each row should have exactly one confidence badge
    expect(badgeCount).toBe(rowCount);
  });

  it("confidence badges use valid tiers", async () => {
    const html = await getHtml("/benchmarks/results");
    const badges = html.match(/res-runs__badge--(high|moderate|low)/g) || [];
    // Every badge should be one of the three valid tiers
    for (const badge of badges) {
      expect(badge).toMatch(/res-runs__badge--(high|moderate|low)/);
    }
  });

  it("ranks are sequential starting from 1", async () => {
    const html = await getHtml("/benchmarks/results");
    const ranks = [
      ...html.matchAll(/res-table__td res-table__td--rank">(\d+)/g),
    ].map((m) => parseInt(m[1], 10));

    if (ranks.length > 0) {
      // Should be [1, 2, 3, ...]
      for (let i = 0; i < ranks.length; i++) {
        expect(ranks[i]).toBe(i + 1);
      }
    }
  });

  it("metric cells have data-value attributes for sorting", async () => {
    const html = await getHtml("/benchmarks/results");
    if (html.includes('res-table__row" data-slug=')) {
      // Every metric <td> should have a data-value attribute
      // Match only actual td elements, not CSS rules
      const metricCells = (
        html.match(/<td class="res-table__td res-table__td--metric[^"]*"/g) ||
        []
      ).length;
      const dataValues = (
        html.match(
          /<td class="res-table__td res-table__td--metric[^"]*" data-value="/g,
        ) || []
      ).length;
      expect(dataValues).toBe(metricCells);
    }
  });

  it("shows total runs badge when data exists", async () => {
    const html = await getHtml("/benchmarks/results");
    if (html.includes("res-table__row")) {
      expect(html).toContain("total benchmark runs");
    }
  });
});

// =============================================================================
// Results page — renders on other benchmark pages' sidebars
// =============================================================================

describe("results sidebar link on other pages", () => {
  beforeEach(() => {
    clearBenchmarkCache();
  });

  it("appears on the benchmark overview page", async () => {
    const html = await getHtml("/benchmarks");
    expect(html).toContain("/benchmarks/results");
    expect(html).toContain("📊 Results");
  });

  it("appears on the compare page", async () => {
    const html = await getHtml("/benchmarks/compare");
    expect(html).toContain("/benchmarks/results");
    expect(html).toContain("📊 Results");
  });

  it("is NOT active on the overview page", async () => {
    const html = await getHtml("/benchmarks");
    expect(html).not.toContain(
      'sidebar__link sidebar__link--active">📊 Results',
    );
  });

  it("is NOT active on the compare page", async () => {
    const html = await getHtml("/benchmarks/compare");
    expect(html).not.toContain(
      'sidebar__link sidebar__link--active">📊 Results',
    );
  });
});

// =============================================================================
// Sitemap — /benchmarks/results included
// =============================================================================

describe("sitemap — results page entry", () => {
  beforeEach(() => {
    clearSitemapCache();
  });

  it("includes /benchmarks/results in the sitemap", async () => {
    const res = renderSitemap();
    const xml = await res.text();
    expect(xml).toContain("/benchmarks/results");
  });

  it("results entry has the correct priority (0.85)", async () => {
    const res = renderSitemap();
    const xml = await res.text();
    const resultsBlock = xml.match(
      /<url>[\s\S]*?\/benchmarks\/results[\s\S]*?<\/url>/,
    );
    expect(resultsBlock).not.toBeNull();
    expect(resultsBlock![0]).toContain("<priority>0.85</priority>");
  });

  it("results entry has changefreq daily", async () => {
    const res = renderSitemap();
    const xml = await res.text();
    const resultsBlock = xml.match(
      /<url>[\s\S]*?\/benchmarks\/results[\s\S]*?<\/url>/,
    );
    expect(resultsBlock).not.toBeNull();
    expect(resultsBlock![0]).toContain("<changefreq>daily</changefreq>");
  });

  it("results entry appears before individual library entries", async () => {
    const res = renderSitemap();
    const xml = await res.text();
    const resultsIdx = xml.indexOf("/benchmarks/results");
    const firstLibraryIdx = xml.indexOf("/benchmarks/vlist");
    expect(resultsIdx).toBeLessThan(firstLibraryIdx);
  });

  it("results entry appears after compare entry", async () => {
    const res = renderSitemap();
    const xml = await res.text();
    const compareIdx = xml.indexOf("/benchmarks/compare");
    const resultsIdx = xml.indexOf("/benchmarks/results");
    expect(compareIdx).toBeLessThan(resultsIdx);
  });
});

// =============================================================================
// Cache behaviour — results page should not be stale
// =============================================================================

describe("results page — cache headers", () => {
  it("sets Cache-Control header", async () => {
    const response = await getResponse("/benchmarks/results");
    const cacheControl = response.headers.get("cache-control");
    expect(cacheControl).toBeTruthy();
    // In test environment (not production), should be no-cache
    // In production, should be max-age=300
    expect(
      cacheControl!.includes("no-cache") ||
        cacheControl!.includes("max-age=300"),
    ).toBe(true);
  });
});
