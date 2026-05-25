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
//   - getFixedItemSize is provided so Legend List skips DOM layout measurement
//     (ResizeObserver / onLayout) for every item. Without this, each item's
//     size is measured after mount via the layout observer, adding significant
//     overhead that other fixed-height libraries don't incur. With it, Legend
//     List sets sizesKnown immediately and short-circuits the onLayout handler.
//   - drawDistance is set to DEFAULT_OVERSCAN * ITEM_HEIGHT (240px) to match
//     the pixel-equivalent overscan of every other adapter. Legend List's
//     default is 250px — close but not identical.
//   - keyExtractor, renderItem, and getFixedItemSize are hoisted as stable
//     references outside create(). Legend List wraps keyExtractor and
//     getFixedItemSize through useWrapIfItem (a useMemo that depends on the
//     function reference), so a stable reference avoids unnecessary useMemo
//     recomputation. renderItem is assigned directly to internal state, but
//     a stable reference is still good practice.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  createRealisticReactChildren,
} from "../runner.js";

let React = null,
  ReactDOM = null,
  LegendList = null,
  loadError = null;

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
    dataCache.set(
      itemCount,
      Array.from({ length: itemCount }, (_, i) => i),
    );
  }
  return dataCache.get(itemCount);
};

// ── Stable callback references ─────────────────────────────────────────────
// Hoisted outside create() so Legend List's internal useMemo hooks see the
// same function reference across renders and avoid recomputation.

// keyExtractor: data items are integers, so String(item) produces a unique key.
// Built lazily because it needs the React reference for nothing, but kept
// outside create() for referential stability.
const keyExtractor = (item) => String(item);

// getFixedItemSize: tells Legend List every item is exactly ITEM_HEIGHT pixels.
// This lets it skip the ResizeObserver / onLayout measurement path entirely —
// sizesKnown is populated immediately and the onLayout handler short-circuits.
const getFixedItemSize = () => ITEM_HEIGHT;

// renderItem: built lazily (needs React) and cached as a stable reference.
// Legend List assigns renderItem directly to internal state (not wrapped in
// useMemo), but a stable reference avoids any edge-case re-render triggers.
let renderItem;
const getRenderItem = () => {
  if (!renderItem) {
    renderItem = ({ item: index }) =>
      React.createElement(
        "div",
        { className: "bench-item", style: { height: `${ITEM_HEIGHT}px` } },
        ...createRealisticReactChildren(React, index),
      );
  }
  return renderItem;
};

// drawDistance in pixels — matches other adapters' overscan:
// DEFAULT_OVERSCAN (5 items) × ITEM_HEIGHT (48px) = 240px.
const DRAW_DISTANCE = DEFAULT_OVERSCAN * ITEM_HEIGHT;

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
      throw new Error(
        "Legend List is not available — failed to load @legendapp/list" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    const listComponent = React.createElement(LegendList, {
      data: getData(itemCount),
      keyExtractor,
      renderItem: getRenderItem(),
      estimatedItemSize: ITEM_HEIGHT,
      getFixedItemSize,
      drawDistance: DRAW_DISTANCE,
      recycleItems: true,
      style: { height: `${container.clientHeight || 600}px`, width: "100%" },
      initialScrollIndex: 0,
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
