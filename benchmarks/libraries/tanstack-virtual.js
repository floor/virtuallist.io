// benchmarks/libraries/tanstack-virtual.js — TanStack Virtual benchmark adapter
//
// Registers @tanstack/react-virtual with the benchmark runner so it can be
// tested with the same measurement pipeline as every other library.
//
// TanStack Virtual provides a headless useVirtualizer hook for React.
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

let React = null, ReactDOM = null, flushSync = null, useVirtualizer = null, loadError = null;

const depsReady = (async () => {
  try {
    React = await import("react");
    const ReactDOMClient = await import("react-dom/client");
    ReactDOM = ReactDOMClient.createRoot
      ? ReactDOMClient
      : (ReactDOMClient.default ?? ReactDOMClient);
    const ReactDOMModule = await import("react-dom");
    flushSync = ReactDOMModule.flushSync;
    const tanstackVirtual = await import("@tanstack/react-virtual");
    useVirtualizer = tanstackVirtual.useVirtualizer;
  } catch (err) {
    loadError = err;
    console.error("[tanstack-virtual] Failed to load dependencies:", err);
  }
})();

defineLibrary({
  slug: "tanstack-virtual",
  name: "TanStack Virtual",
  ecosystem: "react",

  /**
   * Mount a TanStack Virtual list into the container.
   *
   * Uses a callback ref + useState to handle Firefox's delayed ref
   * assignment — getScrollElement() returns null on the first render
   * cycle, so we force a re-render once the ref is assigned.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} React root instance
   */
  create: async (container, itemCount) => {
    await depsReady;
    if (!useVirtualizer) {
      throw new Error("TanStack Virtual is not available — failed to load dependencies" + (loadError ? `: ${loadError.message}` : ""));
    }

    const VirtualList = ({ itemCount, height }) => {
      const parentRef = React.useRef(null);
      const [scrollEl, setScrollEl] = React.useState(null);

      const refCallback = React.useCallback((node) => {
        parentRef.current = node;
        setScrollEl(node);
      }, []);

      const virtualizer = useVirtualizer({
        count: itemCount,
        getScrollElement: () => scrollEl,
        estimateSize: () => ITEM_HEIGHT,
        overscan: DEFAULT_OVERSCAN,
      });

      return React.createElement(
        "div",
        {
          ref: refCallback,
          style: { height: `${height}px`, overflow: "auto", width: "100%" },
        },
        scrollEl
          ? React.createElement(
              "div",
              {
                style: {
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                },
              },
              virtualizer.getVirtualItems().map((virtualRow) =>
                React.createElement(
                  "div",
                  {
                    key: virtualRow.index,
                    className: "bench-item",
                    style: {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    },
                  },
                  ...createRealisticReactChildren(React, virtualRow.index),
                ),
              ),
            )
          : null,
      );
    };

    const listComponent = React.createElement(VirtualList, {
      itemCount,
      height: container.clientHeight || 600,
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
