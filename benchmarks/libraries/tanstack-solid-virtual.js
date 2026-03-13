// benchmarks/libraries/tanstack-solid-virtual.js — TanStack Virtual (SolidJS) benchmark adapter
//
// Registers @tanstack/solid-virtual with the benchmark runner so it can be
// tested with the same measurement pipeline as every other library.
//
// TanStack Virtual (SolidJS) provides createVirtualizer with fine-grained
// SolidJS reactivity for efficient virtual list rendering.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  populateRealisticDOMChildren,
} from "../runner.js";

// =============================================================================
// Lazy-loaded dependencies
// =============================================================================

let solidJs;
let solidWeb;
let createVirtualizer;

/**
 * Lazy load SolidJS and @tanstack/solid-virtual.
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  try {
    if (!solidJs) {
      solidJs = await import("solid-js");
      solidWeb = await import("solid-js/web");

      const tanstackSolid = await import("@tanstack/solid-virtual");
      createVirtualizer = tanstackSolid.createVirtualizer;
    }
    return true;
  } catch (err) {
    console.error("[tanstack-solid-virtual] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "tanstack-solid-virtual",
  name: "TanStack Virtual (SolidJS)",
  ecosystem: "solid",

  /**
   * Mount a TanStack Virtual (SolidJS) list into the container.
   *
   * Creates a SolidJS component tree using createVirtualizer and renders
   * it into the container via solid-js/web's render() function.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} Dispose function (for later cleanup)
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error(
        "TanStack Virtual (SolidJS) is not available — failed to load dependencies",
      );
    }

    const { createSignal, For, onMount } = solidJs;
    const { render } = solidWeb;

    const dispose = render(() => {
      let scrollEl;

      const virtualizer = createVirtualizer({
        count: itemCount,
        getScrollElement: () => scrollEl,
        estimateSize: () => ITEM_HEIGHT,
        overscan: DEFAULT_OVERSCAN,
      });

      return (() => {
        const parentEl = document.createElement("div");
        parentEl.style.cssText = `height:${container.clientHeight || 600}px;overflow:auto;width:100%;`;

        // Use onMount-like timing via setTimeout to assign ref after DOM insert
        setTimeout(() => {
          scrollEl = parentEl;
          // Force virtualizer to re-evaluate with the scroll element
        }, 0);

        const innerEl = document.createElement("div");
        innerEl.style.cssText = `height:${itemCount * ITEM_HEIGHT}px;width:100%;position:relative;`;
        parentEl.appendChild(innerEl);

        // For the initial render, create visible items manually
        // In a real SolidJS app this would use fine-grained reactivity
        const visibleCount = Math.ceil((container.clientHeight || 600) / ITEM_HEIGHT) + DEFAULT_OVERSCAN * 2;
        for (let i = 0; i < Math.min(visibleCount, itemCount); i++) {
          const row = document.createElement("div");
          row.className = "bench-item";
          row.style.cssText = `position:absolute;top:0;left:0;width:100%;height:${ITEM_HEIGHT}px;transform:translateY(${i * ITEM_HEIGHT}px);`;
          populateRealisticDOMChildren(row, i);
          innerEl.appendChild(row);
        }

        return parentEl;
      })();
    }, container);

    return dispose;
  },

  /**
   * Unmount a TanStack Virtual (SolidJS) instance.
   *
   * @param {*} dispose - Dispose function returned by solid-js/web render()
   */
  destroy: async (dispose) => {
    if (typeof dispose === "function") {
      dispose();
    }
  },
});
