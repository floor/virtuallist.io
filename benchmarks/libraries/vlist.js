// benchmarks/libraries/vlist.js — VList benchmark adapter
//
// Registers the zero-dependency @floor/vlist with the benchmark
// runner so it can be tested with the same measurement pipeline as every
// other library.
//
// VList is a pure JavaScript virtual list with no framework dependencies.
// It uses a template function to render items as HTML strings.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The items array is pre-built once per itemCount and cached; array
//     construction at 1M items is non-trivial and must not be measured.
//   - vlist is initialised without items, then setItems() is called -- this
//     matches the vlist.dev comparison benchmark exactly and ensures the
//     timing reflects only the virtualisation + DOM render work.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  benchmarkTemplate,
} from "../runner.js";

// =============================================================================
// Eager dependency load
// =============================================================================

let vlist = null;
let loadError = null;

// Load once at module evaluation time so the import() cost is never inside
// a timed create() call.
const depsReady = (async () => {
  try {
    const mod = await import("vlist");
    vlist = mod.createVList;
  } catch (err) {
    loadError = err;
    console.error("[vlist] Failed to load @floor/vlist:", err);
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

  /**
   * Mount a VList instance into the container.
   *
   * Follows the same pattern as the vlist.dev comparison benchmark:
   *   1. Build the vlist instance (no items yet)
   *   2. Call setItems() -- this is what triggers virtualisation + DOM render
   *
   * The items array is pre-built outside this function so that array
   * allocation is never counted as part of render time.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} VList instance (for later destruction)
   */
  create: async (container, itemCount) => {
    // Ensure deps are loaded (instant after first call)
    await depsReady;

    if (!vlist) {
      throw new Error(
        "VList is not available -- failed to load @floor/vlist" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    const list = vlist({
      container,
      overscan: DEFAULT_OVERSCAN,
      items: getItems(itemCount),
      item: {
        height: ITEM_HEIGHT,
        template: benchmarkTemplate,
      },
    });

    return list;
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
