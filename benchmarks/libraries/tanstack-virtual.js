// benchmarks/libraries/tanstack-virtual.js — TanStack Virtual benchmark adapter
//
// Registers @tanstack/react-virtual with the benchmark runner so it can be
// tested with the same measurement pipeline as every other library.
//
// TanStack Virtual provides a headless useVirtualizer hook for React.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  createRealisticReactChildren,
} from "../runner.js";

// =============================================================================
// Lazy-loaded dependencies
// =============================================================================

let React;
let ReactDOM;
let useVirtualizer;

/**
 * Lazy load React and @tanstack/react-virtual.
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  try {
    if (!React) {
      React = await import("react");

      const ReactDOMClient = await import("react-dom/client");
      ReactDOM = ReactDOMClient.createRoot
        ? ReactDOMClient
        : (ReactDOMClient.default ?? ReactDOMClient);

      const tanstackVirtual = await import("@tanstack/react-virtual");
      useVirtualizer = tanstackVirtual.useVirtualizer;
    }
    return true;
  } catch (err) {
    console.error("[tanstack-virtual] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

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
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error("TanStack Virtual is not available — failed to load dependencies");
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
          style: {
            height: `${height}px`,
            overflow: "auto",
            width: "100%",
          },
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
    root.render(listComponent);
    return root;
  },

  /**
   * Unmount a TanStack Virtual instance.
   *
   * @param {*} root - React root returned by create()
   */
  destroy: async (root) => {
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
  },
});
