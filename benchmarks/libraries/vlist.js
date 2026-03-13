// benchmarks/libraries/vlist.js — VList (Vanilla) benchmark adapter
//
// Registers the zero-dependency vanilla JS @floor/vlist with the benchmark
// runner so it can be tested with the same measurement pipeline as every
// other library.
//
// VList is a pure JavaScript virtual list with no framework dependencies.
// It uses a template function to render items as HTML strings.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  benchmarkTemplate,
} from "../runner.js";

// =============================================================================
// Lazy-loaded dependencies
// =============================================================================

let vlist;

/**
 * Lazy load @floor/vlist.
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  try {
    if (!vlist) {
      const mod = await import("@floor/vlist");
      vlist = mod.vlist || mod.default || mod;
    }
    return true;
  } catch (err) {
    console.error("[vlist] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "vlist",
  name: "VList (Vanilla)",
  ecosystem: "vanilla",

  /**
   * Mount a VList instance into the container.
   *
   * Uses the shared benchmarkTemplate function to render items, ensuring
   * the same DOM structure as all other library benchmarks.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} VList instance (for later destruction)
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error(
        "VList (Vanilla) is not available — failed to load @floor/vlist",
      );
    }

    // Generate the items array
    const items = new Array(itemCount);
    for (let i = 0; i < itemCount; i++) {
      items[i] = { id: i };
    }

    const list = vlist(container, {
      items,
      overscan: DEFAULT_OVERSCAN,
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
