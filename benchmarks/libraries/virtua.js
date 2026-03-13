// benchmarks/libraries/virtua.js — Virtua benchmark adapter
//
// Registers Virtua with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// Virtua provides a zero-config <VList> component (~3 kB per entry point)
// for React applications.

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
let VList;

/**
 * Lazy load React and Virtua.
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

      const virtuaMod = await import("virtua");
      VList = virtuaMod.VList;
    }
    return true;
  } catch (err) {
    console.error("[virtua] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "virtua",
  name: "Virtua",
  ecosystem: "react",

  /**
   * Mount a Virtua VList into the container.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} React root instance
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error("Virtua is not available — failed to load dependencies");
    }

    // Build children array
    const children = [];
    for (let i = 0; i < itemCount; i++) {
      children.push(
        React.createElement(
          "div",
          {
            key: i,
            className: "bench-item",
            style: { height: `${ITEM_HEIGHT}px` },
          },
          ...createRealisticReactChildren(React, i),
        ),
      );
    }

    const listComponent = React.createElement(
      VList,
      {
        style: {
          height: `${container.clientHeight || 600}px`,
          width: "100%",
        },
        overscan: DEFAULT_OVERSCAN,
      },
      ...children,
    );

    const root = ReactDOM.createRoot(container);
    root.render(listComponent);
    return root;
  },

  /**
   * Unmount a Virtua instance.
   *
   * @param {*} root - React root returned by create()
   */
  destroy: async (root) => {
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
  },
});
