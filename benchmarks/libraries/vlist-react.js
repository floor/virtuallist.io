// benchmarks/libraries/vlist-react.js — VList (React) benchmark adapter
//
// Implementation notes:
//   - vlist-react exports a `useVList` hook, not a component — so we create a
//     thin wrapper component that calls the hook and exposes the vlist instance
//     via a callback ref pattern.
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

let React = null,
  ReactDOM = null,
  useVList = null,
  loadError = null;

const depsReady = (async () => {
  try {
    React = await import("react");
    const ReactDOMClient = await import("react-dom/client");
    ReactDOM = ReactDOMClient.createRoot
      ? ReactDOMClient
      : (ReactDOMClient.default ?? ReactDOMClient);
    const vlistReact = await import("vlist-react");
    useVList = vlistReact.useVList || vlistReact.default;
  } catch (err) {
    loadError = err;
    console.error("[vlist-react] Failed to load dependencies:", err);
  }
})();

const itemsCache = new Map();
const getItems = (itemCount) => {
  if (!itemsCache.has(itemCount)) {
    itemsCache.set(
      itemCount,
      Array.from({ length: itemCount }, (_, i) => ({ id: i })),
    );
  }
  return itemsCache.get(itemCount);
};

// Thin wrapper component — calls the hook and renders the container div.
// `onInstance` is called once the vlist instance is available so the
// benchmark runner can hold a reference for destruction.
function VListBenchmark({ items, onInstance, height }) {
  const { containerRef, instanceRef } = useVList({
    items,
    overscan: DEFAULT_OVERSCAN,
    item: {
      height: ITEM_HEIGHT,
      template: benchmarkTemplate,
    },
  });

  // Forward the instance to the caller as soon as it's ready.
  React.useEffect(() => {
    if (instanceRef.current) {
      onInstance(instanceRef.current);
    }
  }, [instanceRef.current]);

  return React.createElement("div", {
    ref: containerRef,
    style: { height: `${height}px`, width: "100%", overflow: "auto" },
  });
}

defineLibrary({
  slug: "vlist-react",
  name: "VList (React)",
  ecosystem: "react",

  create: async (container, itemCount) => {
    await depsReady;
    if (!useVList) {
      throw new Error(
        "VList (React) is not available — failed to load vlist-react" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    const height = container.clientHeight || 600;
    const items = getItems(itemCount);

    return new Promise((resolve, reject) => {
      let resolved = false;

      const onInstance = (instance) => {
        if (!resolved) {
          resolved = true;
          resolve({ root, instance });
        }
      };

      const element = React.createElement(VListBenchmark, {
        items,
        onInstance,
        height,
      });

      const root = ReactDOM.createRoot(container);
      root.render(element);

      // Fallback: if the instance callback never fires (e.g. hook didn't mount
      // in time), resolve with just the root so destroy() still works.
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ root, instance: null });
        }
      }, 2000);
    });
  },

  destroy: async (handle) => {
    if (!handle) return;
    const { root, instance } = handle;
    if (instance && typeof instance.destroy === "function") {
      instance.destroy();
    }
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
  },
});
