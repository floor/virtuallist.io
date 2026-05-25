// benchmarks/libraries/vlist-react.js — VList (React) benchmark adapter
//
// Registers vlist-react with the benchmark runner so it can be tested with
// the same measurement pipeline as every other library.
//
// vlist-react wraps vlist with a useVList hook for React. The hook
// manages the vlist instance lifecycle and exposes a containerRef that the
// caller attaches to a div.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The items array is pre-built once per itemCount and cached outside
//     create() so that array allocation is never counted as render time.
//   - We mount with empty items first, then call setItems() on the vlist
//     instance after mount — matching the vanilla vlist.js pattern so that
//     array-passing overhead is never inside the timed region.
//   - We capture the vlist instance from instanceRef.current once the hook's
//     useEffect has fired, using a promise + timeout fallback.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  benchmarkTemplate,
} from "../runner.js";

// =============================================================================
// Eager dependency load
// =============================================================================

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
    useVList = vlistReact.useVList ?? vlistReact.default;
  } catch (err) {
    loadError = err;
    console.error("[vlist-react] Failed to load dependencies:", err);
  }
})();

// =============================================================================
// Items cache
// =============================================================================

// Avoid rebuilding the array on every timed iteration.
// Keyed by itemCount so switching between 10K / 100K / 1M is still fast.
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

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "vlist-react",
  name: "VList (React)",
  ecosystem: "react",

  /**
   * Mount a vlist-react list into the container.
   *
   * Mounts with an empty items array so that the timed region only covers
   * framework + vlist initialisation. Once the instance is available via
   * instanceRef.current (after the hook's useEffect fires), we call
   * setItems() to load the full dataset — identical to how the vanilla
   * vlist.js adapter measures this library.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<{root: *, instance: *}>} Handle for later destruction
   */
  create: async (container, itemCount) => {
    await depsReady;
    if (!useVList) {
      throw new Error(
        "VList (React) is not available — failed to load vlist-react" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    const height = container.clientHeight || 600;
    const _useVList = useVList;
    const _React = React;

    return new Promise((resolve) => {
      let resolved = false;

      function VListBenchmark({ height }) {
        // Mount with empty items — setItems() is called after mount so that
        // array allocation is never inside the timed create() region.
        const { containerRef, instanceRef } = _useVList({
          items: [],
          overscan: DEFAULT_OVERSCAN,
          item: {
            height: ITEM_HEIGHT,
            template: benchmarkTemplate,
          },
        });

        _React.useEffect(() => {
          const instance = instanceRef.current;
          if (!resolved && instance) {
            resolved = true;
            // setItems() triggers the actual virtualisation render —
            // array was pre-built in getItems() outside the timed region.
            if (typeof instance.setItems === "function") {
              instance.setItems(getItems(itemCount));
            }
            resolve({ root, instance });
          }
        });

        return _React.createElement("div", {
          ref: containerRef,
          style: { height: `${height}px`, width: "100%", overflow: "auto" },
        });
      }

      const root = ReactDOM.createRoot(container);
      root.render(_React.createElement(VListBenchmark, { height }));

      // Fallback: if the useEffect never fires within 2s, resolve anyway
      // so destroy() can still unmount the React root cleanly.
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ root, instance: null });
        }
      }, 2000);
    });
  },

  /**
   * Unmount the React root and destroy the vlist instance.
   *
   * useVList's cleanup effect calls instance.destroy() when the component
   * unmounts, but we call it defensively before unmount() in case the
   * cleanup doesn't fire synchronously before the next test starts.
   *
   * @param {{root: *, instance: *}} handle
   */
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
