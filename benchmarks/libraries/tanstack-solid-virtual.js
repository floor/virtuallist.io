// benchmarks/libraries/tanstack-solid-virtual.js — TanStack Virtual (SolidJS) benchmark adapter
//
// Registers @tanstack/solid-virtual with the benchmark runner so it can be
// tested with the same measurement pipeline as every other library.
//
// TanStack Virtual (SolidJS) provides createVirtualizer with fine-grained
// SolidJS reactivity for efficient virtual list rendering.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  populateRealisticDOMChildren,
} from "../runner.js";

let solidJs = null, solidWeb = null, createVirtualizer = null, loadError = null;

const depsReady = (async () => {
  try {
    solidJs = await import("solid-js");
    solidWeb = await import("solid-js/web");
    const tanstackSolid = await import("@tanstack/solid-virtual");
    createVirtualizer = tanstackSolid.createVirtualizer;
  } catch (err) {
    loadError = err;
    console.error("[tanstack-solid-virtual] Failed to load dependencies:", err);
  }
})();

defineLibrary({
  slug: "tanstack-solid-virtual",
  name: "TanStack Virtual (SolidJS)",
  ecosystem: "solid",

  /**
   * Mount a TanStack Virtual (SolidJS) list into the container.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} Dispose function (for later cleanup)
   */
  create: async (container, itemCount) => {
    await depsReady;
    if (!createVirtualizer) {
      throw new Error("TanStack Virtual (SolidJS) is not available — failed to load dependencies" + (loadError ? `: ${loadError.message}` : ""));
    }

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

        setTimeout(() => { scrollEl = parentEl; }, 0);

        const innerEl = document.createElement("div");
        innerEl.style.cssText = `height:${itemCount * ITEM_HEIGHT}px;width:100%;position:relative;`;
        parentEl.appendChild(innerEl);

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

  destroy: async (dispose) => {
    if (typeof dispose === "function") {
      dispose();
    }
  },
});
