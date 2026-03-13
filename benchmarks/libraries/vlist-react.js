// benchmarks/libraries/vlist-react.js — VList (React) benchmark adapter
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The items array is pre-built once per itemCount and cached outside create()
//     so that array allocation is never counted as part of render time.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  benchmarkTemplate,
} from "../runner.js";

let React = null, ReactDOM = null, VList = null, loadError = null;

const depsReady = (async () => {
  try {
    React = await import("react");
    const ReactDOMClient = await import("react-dom/client");
    ReactDOM = ReactDOMClient.createRoot
      ? ReactDOMClient
      : (ReactDOMClient.default ?? ReactDOMClient);
    const vlistReact = await import("vlist-react");
    VList = vlistReact.VList || vlistReact.default;
  } catch (err) {
    loadError = err;
    console.error("[vlist-react] Failed to load dependencies:", err);
  }
})();

const itemsCache = new Map();
const getItems = (itemCount) => {
  if (!itemsCache.has(itemCount)) {
    itemsCache.set(itemCount, Array.from({ length: itemCount }, (_, i) => ({ id: i })));
  }
  return itemsCache.get(itemCount);
};

defineLibrary({
  slug: "vlist-react",
  name: "VList (React)",
  ecosystem: "react",

  create: async (container, itemCount) => {
    await depsReady;
    if (!VList) {
      throw new Error("VList (React) is not available — failed to load vlist-react" + (loadError ? `: ${loadError.message}` : ""));
    }
    const listComponent = React.createElement(VList, {
      items: getItems(itemCount),
      overscan: DEFAULT_OVERSCAN,
      item: { height: ITEM_HEIGHT, template: benchmarkTemplate },
      style: { height: `${container.clientHeight || 600}px`, width: "100%" },
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
