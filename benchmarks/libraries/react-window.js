// benchmarks/libraries/react-window.js — react-window benchmark adapter
//
// Registers react-window with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// react-window provides FixedSizeList and VariableSizeList components
// for windowed rendering in React applications.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  createRealisticReactChildren,
} from "../runner.js";

let React = null, ReactDOM = null, flushSync = null, FixedSizeList = null, loadError = null;

const depsReady = (async () => {
  try {
    React = await import("react");
    const ReactDOMClient = await import("react-dom/client");
    ReactDOM = ReactDOMClient.createRoot
      ? ReactDOMClient
      : (ReactDOMClient.default ?? ReactDOMClient);
    const ReactDOMModule = await import("react-dom");
    flushSync = ReactDOMModule.flushSync;
    const reactWindow = await import("react-window");
    FixedSizeList = reactWindow.FixedSizeList;
  } catch (err) {
    loadError = err;
    console.error("[react-window] Failed to load dependencies:", err);
  }
})();

// Row component — built lazily once React is loaded, stable reference for re-renders.
let Row;
const getRow = () => {
  if (!Row) {
    Row = ({ index, style }) =>
      React.createElement(
        "div",
        { className: "bench-item", style },
        ...createRealisticReactChildren(React, index),
      );
  }
  return Row;
};

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
    await depsReady;
    if (!FixedSizeList) {
      throw new Error("react-window is not available — failed to load dependencies" + (loadError ? `: ${loadError.message}` : ""));
    }

    const listComponent = React.createElement(FixedSizeList, {
      height: container.clientHeight || 600,
      itemCount,
      itemSize: ITEM_HEIGHT,
      overscanCount: DEFAULT_OVERSCAN,
      width: "100%",
      children: getRow(),
    });

    const root = ReactDOM.createRoot(container);
    flushSync(() => root.render(listComponent));
    return root;
  },

  destroy: async (root) => {
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
  },
});
