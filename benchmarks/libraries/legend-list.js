// benchmarks/libraries/legend-list.js — Legend List benchmark adapter
//
// Registers @legendapp/list with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// Legend List provides a high-performance list with item recycling and
// bidirectional infinite scroll, with a dedicated React DOM entry point.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The data index array is pre-built once per itemCount and cached outside
//     create() so that array allocation is never measured as render time.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  createRealisticReactChildren,
} from "../runner.js";

let React = null, ReactDOM = null, LegendList = null, loadError = null;

const depsReady = (async () => {
  try {
    React = await import("react");
    const ReactDOMClient = await import("react-dom/client");
    ReactDOM = ReactDOMClient.createRoot
      ? ReactDOMClient
      : (ReactDOMClient.default ?? ReactDOMClient);
    const legendMod = await import("@legendapp/list");
    LegendList = legendMod.LegendList || legendMod.default;
  } catch (err) {
    loadError = err;
    console.error("[legend-list] Failed to load dependencies:", err);
  }
})();

// Data index array cache — keyed by itemCount.
const dataCache = new Map();
const getData = (itemCount) => {
  if (!dataCache.has(itemCount)) {
    dataCache.set(itemCount, Array.from({ length: itemCount }, (_, i) => i));
  }
  return dataCache.get(itemCount);
};

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
    await depsReady;
    if (!LegendList) {
      throw new Error("Legend List is not available — failed to load @legendapp/list" + (loadError ? `: ${loadError.message}` : ""));
    }

    const listComponent = React.createElement(LegendList, {
      estimatedItemSize: ITEM_HEIGHT,
      data: getData(itemCount),
      keyExtractor: (item) => String(item),
      renderItem: ({ item: index }) =>
        React.createElement(
          "div",
          { className: "bench-item", style: { height: `${ITEM_HEIGHT}px` } },
          ...createRealisticReactChildren(React, index),
        ),
      style: { height: `${container.clientHeight || 600}px`, width: "100%" },
      initialScrollIndex: 0,
      recycleItems: true,
    });

    const root = ReactDOM.createRoot(container);
    root.render(listComponent);
    return root;
  },

  destroy: async (root) => {
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
  },
});
