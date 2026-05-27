// benchmarks/headless-base.js — Base bundle for server-side Puppeteer benchmarks.
//
// Exposes the benchmark runner API and adapter utilities on `window`.
// Loaded BEFORE any library adapter — sets __benchReady immediately so
// adapter failures never block the runner from starting.

import {
  getLibrary,
  getLibraries,
  benchmarkLibrary,
  buildMetrics,
  runBenchmarks,
  findViewport,
  tryGC,
  defineLibrary,
  injectStyles,
  benchmarkTemplate,
  createRealisticReactChildren,
  populateRealisticDOMChildren,
  generateRealisticItemHTML,
} from "./runner.js";

import {
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  ITEM_NAMES,
  ITEM_BADGES,
} from "./constants.js";

const w = /** @type {any} */ (window);

// Runner API (used by Puppeteer evaluate calls)
w.__getLibrary = getLibrary;
w.__getLibraries = getLibraries;
w.__benchmarkLibrary = benchmarkLibrary;
w.__buildMetrics = buildMetrics;
w.__runBenchmarks = runBenchmarks;
w.__findViewport = findViewport;
w.__tryGC = tryGC;

// Adapter registration (called by per-adapter bundles)
w.__defineLibrary = defineLibrary;
w.__injectStyles = injectStyles;

// Constants (read by per-adapter bundles via runner-global.js)
w.__ITEM_HEIGHT = ITEM_HEIGHT;
w.__DEFAULT_OVERSCAN = DEFAULT_OVERSCAN;
w.__ITEM_NAMES = ITEM_NAMES;
w.__ITEM_BADGES = ITEM_BADGES;

// Template helpers (read by per-adapter bundles via runner-global.js)
w.__benchmarkTemplate = benchmarkTemplate;
w.__createRealisticReactChildren = createRealisticReactChildren;
w.__populateRealisticDOMChildren = populateRealisticDOMChildren;
w.__generateRealisticItemHTML = generateRealisticItemHTML;

// Signal ready — adapters load after this, so failures are isolated
w.__benchReady = true;
