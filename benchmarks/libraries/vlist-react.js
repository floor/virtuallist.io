// benchmarks/libraries/vlist-react.js — VList (React) benchmark adapter
//
// Registers vlist-react with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// vlist-react is the React binding for the zero-dependency @floor/vlist core.
// It provides a <VList> component for React applications.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  benchmarkTemplate,
} from "../runner.js";

// =============================================================================
// Lazy-loaded dependencies
// =============================================================================

let React;
let ReactDOM;
let VList;

/**
 * Lazy load React and vlist-react.
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  try {
    if (!React) {
      React = await import("react");

      const ReactDOMClient = await import("react-dom/client");
      // Bun's bundler double-wraps CJS modules via __toESM. On some browsers
      // (Firefox) the getter-based proxy loses `createRoot`. Fall back to
      // `.default` which holds the original CJS exports object.
      ReactDOM = ReactDOMClient.createRoot
        ? ReactDOMClient
        : (ReactDOMClient.default ?? ReactDOMClient);

      const vlistReact = await import("vlist-react");
      VList = vlistReact.VList || vlistReact.default;
    }
    return true;
  } catch (err) {
    console.error("[vlist-react] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "vlist-react",
  name: "VList (React)",
  ecosystem: "react",

  /**
   * Mount a vlist-react VList into the container.
   *
   * Uses the shared benchmarkTemplate function to render items, ensuring
   * the same DOM structure as all other library benchmarks.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} React root instance (for later unmounting)
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error(
        "VList (React) is not available — failed to load vlist-react",
      );
    }

    // Generate the items array
    const items = new Array(itemCount);
    for (let i = 0; i < itemCount; i++) {
      items[i] = { id: i };
    }

    const listComponent = React.createElement(VList, {
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
    });

    const root = ReactDOM.createRoot(container);
    root.render(listComponent);
    return root;
  },

  /**
   * Unmount a vlist-react instance.
   *
   * @param {*} root - React root returned by create()
   */
  destroy: async (root) => {
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
  },
});
