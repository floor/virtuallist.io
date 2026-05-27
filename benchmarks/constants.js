// benchmarks/constants.js — Tunable benchmark parameters
//
// All measurement constants in one place for easy adjustment.
// Changing values here affects every benchmark run site-wide.

// =============================================================================
// Item Rendering
// =============================================================================

/** Fixed row height for all benchmarks (px). */
export const ITEM_HEIGHT = 48;

/**
 * Default overscan for all libraries (items rendered off-screen).
 * Used where the library supports configurable overscan.
 */
export const DEFAULT_OVERSCAN = 5;

// =============================================================================
// Measurement Parameters
// =============================================================================

/** Number of warmup iterations before measurement (JIT optimization). */
export const WARMUP_ITERATIONS = 2;

/** Number of render iterations for median calculation. */
export const MEASURE_ITERATIONS = 7;

/** Maximum memory measurement attempts. */
export const MEMORY_ATTEMPTS = 5;

/** Scroll test duration per speed level (ms). */
export const SCROLL_DURATION_MS = 1500;

/** Number of iterations per jump target for median calculation. */
export const JUMP_ITERATIONS = 5;

/**
 * Scroll-to-index jump targets as fractions of total item count.
 *
 * Each target produces a large scroll displacement that forces the library
 * to virtualise a completely new set of items — measuring how fast it
 * recycles/creates DOM nodes when the viewport teleports.
 *
 *   - 0.50 — jump to the middle (cold region, no items pre-rendered)
 *   - 0.95 — jump near the end (tests large scrollTop + boundary handling)
 *   - 0.00 — jump back to the start (return trip, re-render top items)
 */
export const JUMP_TARGETS = [0.5, 0.95, 0.0];

// =============================================================================
// Scroll Speed Presets
// =============================================================================

/**
 * Base scroll speed in pixels per second.
 * 1× = 7200 px/s ≈ 2.5 items/frame at 60fps (48px items).
 */
export const BASE_SCROLL_SPEED = 7200;

/**
 * Build a scroll speed preset from a multiplier of BASE_SCROLL_SPEED.
 * @param {string} id - Identifier
 * @param {number} multiplier - Speed multiplier
 * @returns {{id: string, label: string, pxPerSec: number}}
 */
const scrollSpeed = (id, multiplier) => {
  const pxPerSec = BASE_SCROLL_SPEED * multiplier;
  return {
    id,
    label: `${pxPerSec.toLocaleString()} px/s`,
    pxPerSec,
  };
};

/**
 * 5 progressive scroll speeds for comprehensive performance profiling.
 *
 *   - 0.25× (1,800 px/s):  Gentle browsing — minimal recycling
 *   - 0.5× (3,600 px/s):   Casual scrolling
 *   - 1× (7,200 px/s):     Normal scroll speed
 *   - 2× (14,400 px/s):    Fast flick — aggressive touch/wheel
 *   - 3× (21,600 px/s):    Stress test — heavy DOM churn
 *
 * Dropped from previous 7-speed suite:
 *   - 0.1× (720 px/s) "crawl" — too slow to reveal meaningful differences
 *   - 5× (36,000 px/s) "extreme" — unrealistic, mostly measures GC noise
 */
export const SCROLL_SPEEDS = [
  scrollSpeed("gentle", 0.25),
  scrollSpeed("slow", 0.5),
  scrollSpeed("normal", 1),
  scrollSpeed("fast", 2),
  scrollSpeed("aggressive", 3),
];

// =============================================================================
// CPU Stress Levels
// =============================================================================

/**
 * Available stress levels for benchmarks.
 * Each level burns a fixed amount of CPU time per frame during scroll
 * measurement, simulating an application with other work alongside
 * the virtual list.
 */
export const STRESS_LEVELS = [
  { id: "none", label: "0", ms: 0 },
  { id: "light", label: "3", ms: 3 },
  { id: "medium", label: "5", ms: 5 },
  { id: "heavy", label: "7", ms: 7 },
];

// =============================================================================
// Shared Template Data
// =============================================================================

/** Names used in the benchmark item template for realistic rendering. */
export const ITEM_NAMES = [
  "Alice",
  "Bob",
  "Carol",
  "Dave",
  "Eve",
  "Frank",
  "Grace",
  "Hank",
  "Iris",
  "Jack",
];

/** Badges used in the benchmark item template. */
export const ITEM_BADGES = ["Active", "New", "VIP", "Pro"];
