// benchmarks/headless.js — Entry point for server-side Puppeteer benchmark execution.
//
// Imports all library adapters (they self-register via defineLibrary), then
// exposes the benchmark API on `window` for Puppeteer's page.evaluate() to call.
//
// No DOM wiring, no UI — just the measurement pipeline.

// =============================================================================
// Library Adapter Imports (self-registering)
// =============================================================================

// React
import "./libraries/legend-list.js";
import "./libraries/react-virtualized.js";
import "./libraries/react-virtuoso.js";
import "./libraries/react-window.js";
import "./libraries/tanstack-virtual.js";
import "./libraries/virtua.js";
import "./libraries/vlist-react.js";
// Vue
import "./libraries/tanstack-vue-virtual.js";
import "./libraries/vue-virtual-scroller.js";
import "./libraries/vlist-vue.js";
// SolidJS
import "./libraries/tanstack-solid-virtual.js";
import "./libraries/vlist-solidjs.js";
// Svelte
import "./libraries/vlist-svelte.js";
// Vanilla
import "./libraries/clusterize.js";
import "./libraries/vlist.js";

// =============================================================================
// Runner API
// =============================================================================

import {
  getLibrary,
  getLibraries,
  benchmarkLibrary,
  buildMetrics,
  runBenchmarks,
  findViewport,
  tryGC,
} from "./runner.js";

// =============================================================================
// Expose on window for Puppeteer access
// =============================================================================

const w = /** @type {any} */ (window);

w.__getLibrary = getLibrary;
w.__getLibraries = getLibraries;
w.__benchmarkLibrary = benchmarkLibrary;
w.__buildMetrics = buildMetrics;
w.__runBenchmarks = runBenchmarks;
w.__findViewport = findViewport;
w.__tryGC = tryGC;

// Signal ready
w.__benchReady = true;
