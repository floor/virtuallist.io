// benchmarks/libraries/virtua.js — Virtua benchmark adapter
//
// Registers Virtua with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// Virtua provides a zero-config <VList> component (~3 kB per entry point)
// for React applications.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - Virtua's <VList> accepts children as an array — we pre-build and cache
//     the React element array outside create() so its allocation (which is
//     O(itemCount)) is never measured as render time.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  createRealisticReactChildren,
} from "../runner.js";

let React = null, ReactDOM = null, VList = null, loadError = null;

const depsReady = (async () => {
  try {
    React = await import("react");
    const ReactDOMClient = await import("react-dom/client");
    ReactDOM = ReactDOMClient.createRoot
      ? ReactDOMClient
      : (ReactDOMClient.default ?? ReactDOMClient);
    const virtuaMod = await import("virtua");
    VList = virtuaMod.VList;
  } catch (err) {
    loadError = err;
    console.error("[virtua] Failed to load dependencies:", err);
  }
})();

// Children element cache — React elements are plain objects and are safe to
// cache across renders. Keyed by itemCount.
const childrenCache = new Map();
const getChildren = (itemCount) => {
  if (!childrenCache.has(itemCount)) {
    const children = Array.from({ length: itemCount }, (_, i) =>
      React.createElement(
        "div",
        { key: i, className: "bench-item", style: { height: `${ITEM_HEIGHT}px` } },
        ...createRealisticReactChildren(React, i),
      ),
    );
    childrenCache.set(itemCount, children);
  }
  return childrenCache.get(itemCount);
};

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
    await depsReady;
    if (!VList) {
      throw new Error("Virtua is not available — failed to load dependencies" + (loadError ? `: ${loadError.message}` : ""));
    }

    const listComponent = React.createElement(
      VList,
      {
        style: { height: `${container.clientHeight || 600}px`, width: "100%" },
        overscan: DEFAULT_OVERSCAN,
      },
      ...getChildren(itemCount),
    );

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
