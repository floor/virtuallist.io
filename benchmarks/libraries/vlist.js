// benchmarks/libraries/vlist.js — VList benchmark adapter
//
// Registers the zero-dependency vlist with the benchmark runner so it
// can be tested with the same measurement pipeline as every other library.
//
// VList is a pure JavaScript virtual list with no framework dependencies.
// It uses a template function to render items as HTML strings.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The items array is pre-built once per itemCount and cached; array
//     construction at 1M items is non-trivial and must not be measured.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  benchmarkTemplate,
} from "../runner.js";
import { setupVlistStyles } from "./_vlist-styles.js";

// =============================================================================
// Eager dependency load
// =============================================================================

let createVList = null;
let loadError = null;

// Load once at module evaluation time so the import() cost is never inside
// a timed create() call.
const depsReady = (async () => {
  try {
    const mod = await import("vlist");
    createVList = mod.createVList;
  } catch (err) {
    loadError = err;
    console.error("[vlist] Failed to load vlist:", err);
  }
})();

// =============================================================================
// Items cache
// =============================================================================

// Avoid rebuilding the array on every timed iteration.
// Keyed by itemCount so switching between 10K / 100K / 1M is still fast.
const itemsCache = new Map();

const getItems = (itemCount) => {
  if (!itemsCache.has(itemCount)) {
    const items = Array.from({ length: itemCount }, (_, i) => ({ id: i }));
    itemsCache.set(itemCount, items);
  }
  return itemsCache.get(itemCount);
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "vlist",
  name: "VList",
  ecosystem: "vanilla",

  setup: setupVlistStyles,

  /**
   * Mount a VList instance into the container.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} VList instance (for later destruction)
   */
  create: (container, itemCount) => {
    if (!createVList) {
      throw new Error(
        "VList is not available -- failed to load vlist" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    return createVList({
      container,
      overscan: DEFAULT_OVERSCAN,
      items: getItems(itemCount),
      item: {
        height: ITEM_HEIGHT,
        template: benchmarkTemplate,
      },
    });
  },

  /**
   * Destroy a VList instance and clean up its DOM.
   *
   * @param {*} instance - VList instance returned by create()
   */
  destroy: async (instance) => {
    if (instance && typeof instance.destroy === "function") {
      instance.destroy();
    }
  },
});
