// benchmarks/libraries/clusterize.js — Clusterize.js benchmark adapter
//
// Registers Clusterize.js with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// Clusterize.js is a vanilla JS DOM virtualization library that requires
// all row HTML strings to be provided upfront. It clusters rows into
// blocks for efficient rendering.

import {
  defineLibrary,
  ITEM_HEIGHT,
  generateRealisticItemHTML,
} from "../runner.js";

// =============================================================================
// Lazy-loaded dependencies
// =============================================================================

let Clusterize;

/**
 * Lazy load Clusterize.js.
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  try {
    if (!Clusterize) {
      const mod = await import("clusterize.js");
      Clusterize = mod.default || mod.Clusterize || mod;
    }
    return true;
  } catch (err) {
    console.error("[clusterize] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// ID helpers — Clusterize.js requires element IDs for its scroll/content areas
// =============================================================================

let _instanceCounter = 0;

function nextId() {
  return `clusterize-${++_instanceCounter}`;
}

// =============================================================================
// Adapter Registration
// =============================================================================

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
   * It also requires all row HTML strings upfront, making initial render
   * slower for large datasets but yielding excellent scroll performance.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<{clusterize: *, scrollArea: HTMLElement, id: string}>}
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error(
        "Clusterize.js is not available — failed to load dependencies",
      );
    }

    const id = nextId();
    const scrollId = `${id}-scroll`;
    const contentId = `${id}-content`;

    // Build the required DOM structure
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

    // Generate all row HTML strings upfront (Clusterize.js requirement)
    // Each row uses the shared realistic template so the DOM structure is
    // identical to every other library's benchmark.
    const rows = [];
    for (let i = 0; i < itemCount; i++) {
      rows.push(generateRealisticItemHTML(i, ITEM_HEIGHT));
    }

    // Initialize Clusterize
    const clusterize = new Clusterize({
      rows,
      scrollId,
      contentId,
      rows_in_block: 50,
      blocks_in_cluster: 4,
      tag: "div",
      show_no_data_row: false,
    });

    return { clusterize, scrollArea, id };
  },

  /**
   * Destroy a Clusterize.js instance and clean up its DOM.
   *
   * @param {{clusterize: *, scrollArea: HTMLElement}} instance - Handle from create()
   */
  destroy: async (instance) => {
    if (!instance) return;

    if (instance.clusterize) {
      try {
        // destroy(true) removes all rows from the DOM before destroying
        instance.clusterize.destroy(true);
      } catch {
        /* ignore cleanup errors */
      }
    }

    if (instance.scrollArea && instance.scrollArea.parentNode) {
      instance.scrollArea.parentNode.removeChild(instance.scrollArea);
    }
  },
});
