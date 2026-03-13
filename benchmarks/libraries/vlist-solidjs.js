// benchmarks/libraries/vlist-solidjs.js — VList (SolidJS) benchmark adapter
//
// Registers vlist-solidjs with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// vlist-solidjs is the SolidJS binding for the zero-dependency @floor/vlist core.
// It provides a <VList> component for SolidJS applications.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  benchmarkTemplate,
} from "../runner.js";

// =============================================================================
// Lazy-loaded dependencies
// =============================================================================

let solid;
let solidWeb;
let VList;

/**
 * Lazy load SolidJS and vlist-solidjs.
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  try {
    if (!solid) {
      solid = await import("solid-js");
      solidWeb = await import("solid-js/web");

      const vlistSolid = await import("vlist-solidjs");
      VList = vlistSolid.VList || vlistSolid.default;
    }
    return true;
  } catch (err) {
    console.error("[vlist-solidjs] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "vlist-solidjs",
  name: "VList (SolidJS)",
  ecosystem: "solid",

  /**
   * Mount a vlist-solidjs VList into the container.
   *
   * Creates a SolidJS component tree using the VList component and renders
   * it into the container via solid-js/web's render() function.
   *
   * Uses the shared benchmarkTemplate function to render items, ensuring
   * the same DOM structure as all other library benchmarks.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} Dispose function (for later cleanup via solid-js/web)
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error(
        "VList (SolidJS) is not available — failed to load vlist-solidjs",
      );
    }

    const { render } = solidWeb;
    const { createSignal } = solid;

    // Generate the items array
    const items = new Array(itemCount);
    for (let i = 0; i < itemCount; i++) {
      items[i] = { id: i };
    }

    // Render the VList component into the container via solid-js/web render()
    const dispose = render(
      () =>
        VList({
          items,
          overscan: DEFAULT_OVERSCAN,
          item: {
            height: ITEM_HEIGHT,
            template: benchmarkTemplate,
          },
          style: {
            height: `${container.clientHeight || 600}px`,
            width: "100%",
          },
        }),
      container,
    );

    return dispose;
  },

  /**
   * Unmount a vlist-solidjs instance by calling the SolidJS dispose function.
   *
   * @param {*} dispose - Dispose function returned by solid-js/web render()
   */
  destroy: async (dispose) => {
    if (typeof dispose === "function") {
      dispose();
    }
  },
});
