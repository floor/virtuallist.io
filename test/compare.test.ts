// test/compare.test.ts — Tests for the compare feature (commit 306ac3a)
//
// Covers:
//   - pickWinner()     — winner/tie/null detection from runner.js
//   - buildMetrics()   — standardised metric array construction
//   - rateLower()      — "lower is better" rating helper
//   - rateHigher()     — "higher is better" rating helper
//   - renderComparePage() — HTTP response for /benchmarks/compare
//   - router           — /benchmarks/compare and trailing-slash variant
//   - sitemap          — /benchmarks/compare included in sitemap.xml

import { describe, it, expect, beforeEach } from "bun:test";

// =============================================================================
// Runner helpers (pure JS — no DOM needed)
// =============================================================================

// We import the runner as a module. Because runner.js uses browser globals
// (document, performance.mark, etc.) only in function bodies that we never
// call here, the top-level import is safe in a Bun test environment.
import {
  pickWinner,
  buildMetrics,
  rateLower,
  rateHigher,
} from "../benchmarks/runner.js";

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

// =============================================================================
// rateLower
// =============================================================================

describe("rateLower", () => {
  it("returns 'good' when value is below the good threshold", () => {
    expect(rateLower(10, 15, 50)).toBe("good");
  });

  it("returns 'good' when value equals the good threshold", () => {
    expect(rateLower(15, 15, 50)).toBe("good");
  });

  it("returns 'ok' when value is between good and ok thresholds", () => {
    expect(rateLower(30, 15, 50)).toBe("ok");
  });

  it("returns 'ok' when value equals the ok threshold", () => {
    expect(rateLower(50, 15, 50)).toBe("ok");
  });

  it("returns 'bad' when value exceeds the ok threshold", () => {
    expect(rateLower(51, 15, 50)).toBe("bad");
  });

  it("returns 'bad' for very large values", () => {
    expect(rateLower(9999, 15, 50)).toBe("bad");
  });
});

// =============================================================================
// rateHigher
// =============================================================================

describe("rateHigher", () => {
  it("returns 'good' when value is above the good threshold", () => {
    expect(rateHigher(120, 100, 55)).toBe("good");
  });

  it("returns 'good' when value equals the good threshold", () => {
    expect(rateHigher(100, 100, 55)).toBe("good");
  });

  it("returns 'ok' when value is between ok and good thresholds", () => {
    expect(rateHigher(70, 100, 55)).toBe("ok");
  });

  it("returns 'ok' when value equals the ok threshold", () => {
    expect(rateHigher(55, 100, 55)).toBe("ok");
  });

  it("returns 'bad' when value is below the ok threshold", () => {
    expect(rateHigher(54, 100, 55)).toBe("bad");
  });

  it("returns 'bad' for zero", () => {
    expect(rateHigher(0, 100, 55)).toBe("bad");
  });
});

// =============================================================================
// pickWinner
// =============================================================================

describe("pickWinner", () => {
  // ── null cases ─────────────────────────────────────────────────────────

  it("returns null when there are no entries", () => {
    expect(pickWinner([], "lower")).toBeNull();
  });

  it("returns null when there is only one entry", () => {
    expect(pickWinner([{ slug: "a", value: 10 }], "lower")).toBeNull();
  });

  it("returns null when all values are zero", () => {
    expect(
      pickWinner(
        [
          { slug: "a", value: 0 },
          { slug: "b", value: 0 },
        ],
        "lower",
      ),
    ).toBeNull();
  });

  it("returns null when all values are null", () => {
    expect(
      pickWinner(
        [
          { slug: "a", value: null },
          { slug: "b", value: null },
        ],
        "lower",
      ),
    ).toBeNull();
  });

  it("returns null when only one entry has a valid value", () => {
    expect(
      pickWinner(
        [
          { slug: "a", value: 10 },
          { slug: "b", value: 0 },
        ],
        "lower",
      ),
    ).toBeNull();
  });

  // ── tie cases ──────────────────────────────────────────────────────────

  it("returns __tie__ when values are identical", () => {
    expect(
      pickWinner(
        [
          { slug: "a", value: 100 },
          { slug: "b", value: 100 },
        ],
        "lower",
      ),
    ).toBe("__tie__");
  });

  it("returns __tie__ when values are within 3% of each other (lower)", () => {
    // 100 vs 102 → diff = 2, base = 102 → 1.96% < 3%
    expect(
      pickWinner(
        [
          { slug: "a", value: 100 },
          { slug: "b", value: 102 },
        ],
        "lower",
      ),
    ).toBe("__tie__");
  });

  it("returns __tie__ when values are within 3% of each other (higher)", () => {
    expect(
      pickWinner(
        [
          { slug: "a", value: 98 },
          { slug: "b", value: 100 },
        ],
        "higher",
      ),
    ).toBe("__tie__");
  });

  it("returns __tie__ for three near-equal values", () => {
    expect(
      pickWinner(
        [
          { slug: "a", value: 100 },
          { slug: "b", value: 101 },
          { slug: "c", value: 100.5 },
        ],
        "higher",
      ),
    ).toBe("__tie__");
  });

  // ── clear winner (lower is better) ────────────────────────────────────

  it("returns the slug with the lowest value when better=lower", () => {
    expect(
      pickWinner(
        [
          { slug: "fast", value: 10 },
          { slug: "slow", value: 100 },
        ],
        "lower",
      ),
    ).toBe("fast");
  });

  it("returns the slug with the lowest value among three entries (lower)", () => {
    expect(
      pickWinner(
        [
          { slug: "a", value: 50 },
          { slug: "b", value: 10 },
          { slug: "c", value: 80 },
        ],
        "lower",
      ),
    ).toBe("b");
  });

  // ── clear winner (higher is better) ───────────────────────────────────

  it("returns the slug with the highest value when better=higher", () => {
    expect(
      pickWinner(
        [
          { slug: "fast", value: 120 },
          { slug: "slow", value: 40 },
        ],
        "higher",
      ),
    ).toBe("fast");
  });

  it("returns the slug with the highest value among three entries (higher)", () => {
    expect(
      pickWinner(
        [
          { slug: "a", value: 60 },
          { slug: "b", value: 120 },
          { slug: "c", value: 90 },
        ],
        "higher",
      ),
    ).toBe("b");
  });

  // ── boundary: exactly at the 3% tie threshold ──────────────────────────

  it("picks a winner when spread is just above 3%", () => {
    // 100 vs 104 → diff = 4, base = 104 → 3.85% > 3%
    const winner = pickWinner(
      [
        { slug: "a", value: 100 },
        { slug: "b", value: 104 },
      ],
      "lower",
    );
    expect(winner).toBe("a");
  });

  // ── null values mixed with valid values ────────────────────────────────

  it("ignores null values and compares only valid entries", () => {
    expect(
      pickWinner(
        [
          { slug: "a", value: null },
          { slug: "b", value: 10 },
          { slug: "c", value: 80 },
        ],
        "lower",
      ),
    ).toBe("b");
  });

  it("ignores zero values and compares only valid entries", () => {
    expect(
      pickWinner(
        [
          { slug: "a", value: 0 },
          { slug: "b", value: 50 },
          { slug: "c", value: 200 },
        ],
        "higher",
      ),
    ).toBe("c");
  });
});

// =============================================================================
// buildMetrics
// =============================================================================

describe("buildMetrics", () => {
  const baseResults = {
    renderTime: 20,
    memoryUsed: 3,
    avgFPS: 90,
    avgP95: 15,
    scrollResults: [],
  };

  it("always includes a Render metric as the first entry", () => {
    const metrics = buildMetrics(baseResults);
    expect(metrics[0].label).toBe("Render");
    expect(metrics[0].unit).toBe("ms");
    expect(metrics[0].better).toBe("lower");
    expect(metrics[0].value).toBe(20);
  });

  it("always includes a Memory metric as the second entry", () => {
    const metrics = buildMetrics(baseResults);
    expect(metrics[1].label).toBe("Memory");
    expect(metrics[1].unit).toBe("MB");
    expect(metrics[1].better).toBe("lower");
    expect(metrics[1].value).toBe(3);
  });

  it("includes Scroll FPS when avgFPS > 0", () => {
    const metrics = buildMetrics(baseResults);
    const fps = metrics.find((m) => m.label === "Scroll FPS");
    expect(fps).toBeDefined();
    expect(fps?.unit).toBe("fps");
    expect(fps?.better).toBe("higher");
    expect(fps?.value).toBe(90);
  });

  it("includes P95 Frame when avgP95 > 0", () => {
    const metrics = buildMetrics(baseResults);
    const p95 = metrics.find((m) => m.label === "P95 Frame");
    expect(p95).toBeDefined();
    expect(p95?.unit).toBe("ms");
    expect(p95?.better).toBe("lower");
    expect(p95?.value).toBe(15);
  });

  it("omits Scroll FPS when avgFPS is 0", () => {
    const metrics = buildMetrics({ ...baseResults, avgFPS: 0 });
    expect(metrics.find((m) => m.label === "Scroll FPS")).toBeUndefined();
  });

  it("omits P95 Frame when avgP95 is 0", () => {
    const metrics = buildMetrics({ ...baseResults, avgP95: 0 });
    expect(metrics.find((m) => m.label === "P95 Frame")).toBeUndefined();
  });

  // ── Render time ratings ────────────────────────────────────────────────

  it("rates render time as 'good' when <= 15ms", () => {
    const metrics = buildMetrics({ ...baseResults, renderTime: 15 });
    expect(metrics[0].rating).toBe("good");
  });

  it("rates render time as 'ok' when between 15ms and 50ms", () => {
    const metrics = buildMetrics({ ...baseResults, renderTime: 30 });
    expect(metrics[0].rating).toBe("ok");
  });

  it("rates render time as 'bad' when > 50ms", () => {
    const metrics = buildMetrics({ ...baseResults, renderTime: 100 });
    expect(metrics[0].rating).toBe("bad");
  });

  // ── Memory ratings ─────────────────────────────────────────────────────

  it("rates memory as 'good' when <= 1MB", () => {
    const metrics = buildMetrics({ ...baseResults, memoryUsed: 1 });
    expect(metrics[1].rating).toBe("good");
  });

  it("rates memory as 'ok' when between 1MB and 5MB", () => {
    const metrics = buildMetrics({ ...baseResults, memoryUsed: 3 });
    expect(metrics[1].rating).toBe("ok");
  });

  it("rates memory as 'bad' when > 5MB", () => {
    const metrics = buildMetrics({ ...baseResults, memoryUsed: 10 });
    expect(metrics[1].rating).toBe("bad");
  });

  // ── Memory unavailable ─────────────────────────────────────────────────

  it("uses displayValue '—' and meta 'Chrome required' when memoryUsed is null", () => {
    const metrics = buildMetrics({ ...baseResults, memoryUsed: null });
    const mem = metrics.find((m) => m.label === "Memory");
    expect(mem?.displayValue).toBe("—");
    expect(mem?.meta).toBe("Chrome required");
    expect(mem?.value).toBe(0);
  });

  // ── Scroll FPS ratings ─────────────────────────────────────────────────

  it("rates scroll FPS as 'good' when >= 100fps", () => {
    const metrics = buildMetrics({ ...baseResults, avgFPS: 120 });
    const fps = metrics.find((m) => m.label === "Scroll FPS");
    expect(fps?.rating).toBe("good");
  });

  it("rates scroll FPS as 'ok' when between 55fps and 100fps", () => {
    const metrics = buildMetrics({ ...baseResults, avgFPS: 70 });
    const fps = metrics.find((m) => m.label === "Scroll FPS");
    expect(fps?.rating).toBe("ok");
  });

  it("rates scroll FPS as 'bad' when < 55fps", () => {
    const metrics = buildMetrics({ ...baseResults, avgFPS: 30 });
    const fps = metrics.find((m) => m.label === "Scroll FPS");
    expect(fps?.rating).toBe("bad");
  });

  // ── Per-speed breakdown ────────────────────────────────────────────────

  it("appends per-speed FPS metrics from scrollResults", () => {
    const results = {
      ...baseResults,
      scrollResults: [
        { speedId: "slow", speedLabel: "Slow", medianFPS: 60, p95FrameTime: 20 },
        { speedId: "fast", speedLabel: "Fast", medianFPS: 120, p95FrameTime: 10 },
      ],
    };
    const metrics = buildMetrics(results);
    const perSpeed = metrics.filter((m) => m.label.startsWith("FPS @"));
    expect(perSpeed).toHaveLength(2);
    expect(perSpeed[0].label).toBe("FPS @ Slow");
    expect(perSpeed[1].label).toBe("FPS @ Fast");
  });

  it("skips per-speed entries where medianFPS is 0", () => {
    const results = {
      ...baseResults,
      scrollResults: [
        { speedId: "slow", speedLabel: "Slow", medianFPS: 0, p95FrameTime: 0 },
      ],
    };
    const metrics = buildMetrics(results);
    expect(metrics.filter((m) => m.label.startsWith("FPS @"))).toHaveLength(0);
  });

  it("sets better=higher and correct meta on per-speed FPS metrics", () => {
    const results = {
      ...baseResults,
      scrollResults: [
        { speedId: "turbo", speedLabel: "Turbo", medianFPS: 90, p95FrameTime: 12 },
      ],
    };
    const metrics = buildMetrics(results);
    const m = metrics.find((m) => m.label === "FPS @ Turbo");
    expect(m?.better).toBe("higher");
    expect(m?.meta).toBe("turbo");
  });
});

// =============================================================================
// Router — /benchmarks/compare
// =============================================================================

describe("router — /benchmarks/compare", () => {
  beforeEach(() => {
    clearBenchmarkCache();
  });

  it("responds 200 for /benchmarks/compare", async () => {
    const res = handleRequest(makeRequest("/benchmarks/compare"));
    const response = res instanceof Promise ? await res : res;
    expect(response.status).toBe(200);
  });

  it("responds 200 for /benchmarks/compare/ (trailing slash)", async () => {
    const res = handleRequest(makeRequest("/benchmarks/compare/"));
    const response = res instanceof Promise ? await res : res;
    expect(response.status).toBe(200);
  });

  it("returns HTML content-type", async () => {
    const res = handleRequest(makeRequest("/benchmarks/compare"));
    const response = res instanceof Promise ? await res : res;
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("HTML includes compare.js script tag", async () => {
    const res = handleRequest(makeRequest("/benchmarks/compare"));
    const response = res instanceof Promise ? await res : res;
    const html = await response.text();
    expect(html).toContain("/dist/benchmarks/compare.js");
  });

  it("HTML includes the sidebar Compare link", async () => {
    const res = handleRequest(makeRequest("/benchmarks/compare"));
    const response = res instanceof Promise ? await res : res;
    const html = await response.text();
    expect(html).toContain("/benchmarks/compare");
  });

  it("HTML includes the cmp-slots container", async () => {
    const res = handleRequest(makeRequest("/benchmarks/compare"));
    const response = res instanceof Promise ? await res : res;
    const html = await response.text();
    expect(html).toContain("cmp-slots");
  });

  it("HTML includes the run comparison button", async () => {
    const res = handleRequest(makeRequest("/benchmarks/compare"));
    const response = res instanceof Promise ? await res : res;
    const html = await response.text();
    expect(html).toContain("cmp-run");
  });

  it("does not respond to /benchmarks/compare/extra (treated as library slug)", async () => {
    // /benchmarks/compare/extra is not a valid route — router would try it
    // as a library slug "compare" (which doesn't exist), returning null → 404
    const res = handleRequest(makeRequest("/benchmarks/compare/extra"));
    const response = res instanceof Promise ? await res : res;
    expect(response.status).toBe(404);
  });
});

// =============================================================================
// Sitemap — /benchmarks/compare included
// =============================================================================

describe("sitemap — compare page entry", () => {
  beforeEach(() => {
    clearSitemapCache();
  });

  it("includes /benchmarks/compare in the sitemap", async () => {
    const res = renderSitemap();
    const xml = await res.text();
    expect(xml).toContain("/benchmarks/compare");
  });

  it("sitemap is valid XML with a urlset root", async () => {
    const res = renderSitemap();
    const xml = await res.text();
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");
  });

  it("compare entry has the correct priority (0.85)", async () => {
    const res = renderSitemap();
    const xml = await res.text();
    // Find the compare URL block and check it has priority 0.85
    const compareBlock = xml.match(
      /<url>[\s\S]*?\/benchmarks\/compare[\s\S]*?<\/url>/,
    );
    expect(compareBlock).not.toBeNull();
    expect(compareBlock![0]).toContain("<priority>0.85</priority>");
  });

  it("compare entry appears before individual library entries", async () => {
    const res = renderSitemap();
    const xml = await res.text();
    const compareIdx = xml.indexOf("/benchmarks/compare");
    const firstLibraryIdx = xml.indexOf("/benchmarks/vlist");
    expect(compareIdx).toBeLessThan(firstLibraryIdx);
  });
});
