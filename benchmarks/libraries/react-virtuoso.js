// benchmarks/libraries/react-virtuoso.js — react-virtuoso benchmark adapter
//
// Registers react-virtuoso with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// react-virtuoso provides a feature-rich React virtualization component
// with auto-height measurement, grouped lists, reverse mode, and table support.
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

let React = null, ReactDOM = null, flushSync = null, Virtuoso = null, loadError = null;

const depsReady = (async () => {
  try {
    React = await import("react");
    const ReactDOMClient = await import("react-dom/client");
    ReactDOM = ReactDOMClient.createRoot
      ? ReactDOMClient
      : (ReactDOMClient.default ?? ReactDOMClient);
    const ReactDOMModule = await import("react-dom");
    flushSync = ReactDOMModule.flushSync;
    const virtuosoMod = await import("react-virtuoso");
    Virtuoso = virtuosoMod.Virtuoso;
  } catch (err) {
    loadError = err;
    console.error("[react-virtuoso] Failed to load dependencies:", err);
  }
})();

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
    await depsReady;
    if (!Virtuoso) {
      throw new Error("react-virtuoso is not available — failed to load dependencies" + (loadError ? `: ${loadError.message}` : ""));
    }

    const listComponent = React.createElement(Virtuoso, {
      totalCount: itemCount,
      fixedItemHeight: ITEM_HEIGHT,
      overscan: DEFAULT_OVERSCAN * ITEM_HEIGHT,
      style: { height: `${container.clientHeight || 600}px`, width: "100%" },
      itemContent: (index) =>
        React.createElement(
          "div",
          { className: "bench-item", style: { height: `${ITEM_HEIGHT}px` } },
          ...createRealisticReactChildren(React, index),
        ),
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
