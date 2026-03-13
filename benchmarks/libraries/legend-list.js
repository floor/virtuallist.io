// benchmarks/libraries/legend-list.js — Legend List benchmark adapter
//
// Registers @legendapp/list with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// Legend List provides a high-performance list with item recycling and
// bidirectional infinite scroll, with a dedicated React DOM entry point.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  createRealisticReactChildren,
} from "../runner.js";

// =============================================================================
// Lazy-loaded dependencies
// =============================================================================

let React;
let ReactDOM;
let LegendList;

/**
 * Lazy load React and @legendapp/list.
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  try {
    if (!React) {
      React = await import("react");

      const ReactDOMClient = await import("react-dom/client");
      ReactDOM = ReactDOMClient.createRoot
        ? ReactDOMClient
        : (ReactDOMClient.default ?? ReactDOMClient);

      // Legend List has a dedicated React DOM entry point
      const legendMod = await import("@legendapp/list");
      LegendList = legendMod.LegendList || legendMod.default;
    }
    return true;
  } catch (err) {
    console.error("[legend-list] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "legend-list",
  name: "Legend List",
  ecosystem: "react",

  /**
   * Mount a Legend List into the container.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} React root instance
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error("Legend List is not available — failed to load dependencies");
    }

    // Generate data array
    const data = [];
    for (let i = 0; i < itemCount; i++) {
      data.push({ id: String(i), index: i });
    }

    const renderItem = ({ item }) => {
      return React.createElement(
        "div",
        {
          className: "bench-item",
          style: { height: `${ITEM_HEIGHT}px` },
        },
        ...createRealisticReactChildren(React, item.index),
      );
    };

    const listComponent = React.createElement(LegendList, {
      data,
      renderItem,
      estimatedItemSize: ITEM_HEIGHT,
      keyExtractor: (item) => item.id,
      style: {
        height: container.clientHeight || 600,
        width: "100%",
      },
      recycleItems: true,
      drawDistance: DEFAULT_OVERSCAN * ITEM_HEIGHT,
    });

    const root = ReactDOM.createRoot(container);
    root.render(listComponent);
    return root;
  },

  /**
   * Unmount a Legend List instance.
   *
   * @param {*} root - React root returned by create()
   */
  destroy: async (root) => {
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
  },
});
