// benchmarks/libraries/react-virtuoso.js — react-virtuoso benchmark adapter
//
// Registers react-virtuoso with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// react-virtuoso provides a feature-rich React virtualization component
// with auto-height measurement, grouped lists, reverse mode, and table support.

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
let Virtuoso;

/**
 * Lazy load React and react-virtuoso.
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

      const virtuosoMod = await import("react-virtuoso");
      Virtuoso = virtuosoMod.Virtuoso;
    }
    return true;
  } catch (err) {
    console.error("[react-virtuoso] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "react-virtuoso",
  name: "react-virtuoso",
  ecosystem: "react",

  /**
   * Mount a react-virtuoso Virtuoso list into the container.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} React root instance
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error("react-virtuoso is not available — failed to load dependencies");
    }

    const listComponent = React.createElement(Virtuoso, {
      totalCount: itemCount,
      fixedItemHeight: ITEM_HEIGHT,
      overscan: DEFAULT_OVERSCAN * ITEM_HEIGHT,
      style: {
        height: `${container.clientHeight || 600}px`,
        width: "100%",
      },
      itemContent: (index) => {
        return React.createElement(
          "div",
          { className: "bench-item", style: { height: `${ITEM_HEIGHT}px` } },
          ...createRealisticReactChildren(React, index),
        );
      },
    });

    const root = ReactDOM.createRoot(container);
    root.render(listComponent);
    return root;
  },

  /**
   * Unmount a react-virtuoso instance.
   *
   * @param {*} root - React root returned by create()
   */
  destroy: async (root) => {
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
  },
});
