// benchmarks/libraries/react-window.js — react-window benchmark adapter
//
// Registers react-window with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// react-window provides FixedSizeList and VariableSizeList components
// for windowed rendering in React applications.

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
let FixedSizeList;

/**
 * Lazy load React and react-window.
 * Returns false if loading fails (libraries not available).
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

      const reactWindow = await import("react-window");
      FixedSizeList = reactWindow.FixedSizeList;
    }
    return true;
  } catch (err) {
    console.error("[react-window] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Row Component
// =============================================================================

/**
 * Build a Row component that renders the shared realistic template.
 * Created lazily after React is loaded.
 */
let Row;
const getRow = () => {
  if (!Row) {
    Row = ({ index, style }) => {
      return React.createElement(
        "div",
        { className: "bench-item", style },
        ...createRealisticReactChildren(React, index),
      );
    };
  }
  return Row;
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "react-window",
  name: "react-window",
  ecosystem: "react",

  /**
   * Mount a react-window FixedSizeList into the container.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} React root instance (for later unmounting)
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error("react-window is not available — failed to load dependencies");
    }

    const RowComponent = getRow();

    const listComponent = React.createElement(FixedSizeList, {
      height: container.clientHeight || 600,
      itemCount,
      itemSize: ITEM_HEIGHT,
      overscanCount: DEFAULT_OVERSCAN,
      width: "100%",
      children: RowComponent,
    });

    const root = ReactDOM.createRoot(container);
    root.render(listComponent);
    return root;
  },

  /**
   * Unmount a react-window instance.
   *
   * @param {*} root - React root returned by create()
   */
  destroy: async (root) => {
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
  },
});
