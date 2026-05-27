// benchmarks/libraries/react-virtualized.js — react-virtualized benchmark adapter
//
// Registers react-virtualized with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// react-virtualized provides a feature-rich List component (backed by Grid)
// for windowed rendering in React applications. It was one of the earliest
// React virtualization libraries and remains widely used.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - react-virtualized's List component wraps Grid internally, providing
//     a rowRenderer callback with ({ index, key, style }) parameters.
//   - overscanRowCount maps to DEFAULT_OVERSCAN for fair comparison.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  createRealisticReactChildren,
} from "../runner.js";

let React = null, ReactDOM = null, flushSync = null, List = null, loadError = null;

const depsReady = (async () => {
  try {
    React = await import("react");
    const ReactDOMClient = await import("react-dom/client");
    ReactDOM = ReactDOMClient.createRoot
      ? ReactDOMClient
      : (ReactDOMClient.default ?? ReactDOMClient);
    const ReactDOMModule = await import("react-dom");
    flushSync = ReactDOMModule.flushSync;
    const reactVirtualized = await import("react-virtualized");
    List = reactVirtualized.List;
  } catch (err) {
    loadError = err;
    console.error("[react-virtualized] Failed to load dependencies:", err);
  }
})();

// Row renderer — built lazily once React is loaded, stable reference for re-renders.
let rowRenderer;
const getRowRenderer = () => {
  if (!rowRenderer) {
    rowRenderer = ({ index, key, style }) =>
      React.createElement(
        "div",
        { key, className: "bench-item", style },
        ...createRealisticReactChildren(React, index),
      );
  }
  return rowRenderer;
};

defineLibrary({
  slug: "react-virtualized",
  name: "react-virtualized",
  ecosystem: "react",

  /**
   * Mount a react-virtualized List into the container.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} React root instance (for later unmounting)
   */
  create: async (container, itemCount) => {
    await depsReady;
    if (!List) {
      throw new Error(
        "react-virtualized is not available — failed to load dependencies" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    const height = container.clientHeight || 600;
    const width = container.clientWidth || 800;

    const listComponent = React.createElement(List, {
      height,
      width,
      rowCount: itemCount,
      rowHeight: ITEM_HEIGHT,
      overscanRowCount: DEFAULT_OVERSCAN,
      rowRenderer: getRowRenderer(),
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
