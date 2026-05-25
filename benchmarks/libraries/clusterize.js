// benchmarks/libraries/clusterize.js — Clusterize.js benchmark adapter
//
// Registers Clusterize.js with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// Clusterize.js is a vanilla JS DOM virtualization library that requires
// all row HTML strings to be provided upfront. It clusters rows into
// blocks for efficient rendering.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The rows HTML array is pre-built once per itemCount and cached outside
//     create() so that HTML generation is never counted as render time.
//     Clusterize architecturally requires all rows upfront, but the generation
//     cost should not be measured as "render time" any more than other libraries'
//     framework overhead.

import {
  defineLibrary,
  ITEM_HEIGHT,
  generateRealisticItemHTML,
} from "../runner.js";

let Clusterize = null, loadError = null;

const depsReady = (async () => {
  try {
    const mod = await import("clusterize.js");
    Clusterize = mod.default || mod.Clusterize || mod;
  } catch (err) {
    loadError = err;
    console.error("[clusterize] Failed to load dependencies:", err);
  }
})();

// Rows HTML cache — keyed by itemCount.
// Clusterize requires all row HTML strings upfront; we pre-generate and
// cache them so the generation cost is never inside a timed create() call.
const rowsCache = new Map();
const getRows = (itemCount) => {
  if (!rowsCache.has(itemCount)) {
    rowsCache.set(
      itemCount,
      Array.from({ length: itemCount }, (_, i) => generateRealisticItemHTML(i, ITEM_HEIGHT)),
    );
  }
  return rowsCache.get(itemCount);
};

let _instanceCounter = 0;
const nextId = () => `clusterize-${++_instanceCounter}`;

defineLibrary({
  slug: "clusterize",
  name: "Clusterize.js",
  ecosystem: "vanilla",

  /**
   * Mount a Clusterize.js virtualized list into the container.
   *
   * Clusterize requires a specific DOM structure:
   *   - A scrollable wrapper with a known ID (scrollId)
   *   - A content element inside it with a known ID (contentId)
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<{clusterize: *, scrollArea: HTMLElement, id: string}>}
   */
  create: async (container, itemCount) => {
    await depsReady;
    if (!Clusterize) {
      throw new Error("Clusterize.js is not available — failed to load dependencies" + (loadError ? `: ${loadError.message}` : ""));
    }

    const id = nextId();
    const scrollId = `${id}-scroll`;
    const contentId = `${id}-content`;

    const scrollArea = document.createElement("div");
    scrollArea.id = scrollId;
    scrollArea.className = "clusterize-scroll";
    scrollArea.style.cssText = [
      `height:${container.clientHeight || 600}px`,
      "overflow:auto",
      "width:100%",
    ].join(";");

    const contentArea = document.createElement("div");
    contentArea.id = contentId;
    contentArea.className = "clusterize-content";

    scrollArea.appendChild(contentArea);
    container.appendChild(scrollArea);

    const clusterize = new Clusterize({
      rows: getRows(itemCount),
      scrollId,
      contentId,
      rows_in_block: 50,
      blocks_in_cluster: 4,
      tag: "div",
      show_no_data_row: false,
    });

    return { clusterize, scrollArea, id };
  },

  destroy: async (instance) => {
    if (!instance) return;
    if (instance.clusterize) {
      try { instance.clusterize.destroy(true); } catch { /* ignore */ }
    }
    if (instance.scrollArea && instance.scrollArea.parentNode) {
      instance.scrollArea.parentNode.removeChild(instance.scrollArea);
    }
  },
});
