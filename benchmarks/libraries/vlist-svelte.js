// benchmarks/libraries/vlist-svelte.js — VList (Svelte) benchmark adapter
//
// Registers vlist-svelte with the benchmark runner so it can be tested with
// the same measurement pipeline as every other library.
//
// vlist-svelte exports a `vlist` Svelte action — a use:vlist directive that
// wires up a vlist instance to a DOM element imperatively. Because
// it's a plain action (not a component), we can use it directly without
// spinning up a Svelte component tree or needing a Svelte compiler.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The items array is pre-built once per itemCount and cached outside
//     create() so that array allocation is never counted as render time.
//   - We call the vlist action directly on a plain div element — this is
//     exactly what Svelte's use:vlist directive would do under the hood.
//   - We pass empty items to the action initially, then call setItems() after
//     mount — matching the vanilla vlist.js pattern so that array-passing
//     overhead is never inside the timed create() region.
//   - The action returns an object with a destroy() method (Svelte action
//     lifecycle) plus any instance methods spread from the vlist instance.
//   - onInstance callback captures the vlist instance for benchmark destroy().

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  benchmarkTemplate,
} from "../runner.js";
import { setupVlistStyles } from "./_vlist-styles.js";

// =============================================================================
// Eager dependency load
// =============================================================================

let vlistAction = null,
  loadError = null;

const depsReady = (async () => {
  try {
    const vlistSvelte = await import("vlist-svelte");
    // vlist-svelte exports: { vlist, onVListEvent }
    vlistAction = vlistSvelte.vlist ?? vlistSvelte.default;
  } catch (err) {
    loadError = err;
    console.error("[vlist-svelte] Failed to load dependencies:", err);
  }
})();

// =============================================================================
// Items cache
// =============================================================================

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
  slug: "vlist-svelte",
  name: "VList (Svelte)",
  ecosystem: "svelte",

  setup: setupVlistStyles,

  /**
   * Mount a vlist-svelte list into the container.
   *
   * Calls the vlist Svelte action directly on a plain div element. The action
   * builds and mounts the vlist instance, calling onInstance once it
   * is ready. We capture the vlist instance via the onInstance callback and
   * hold the action handle for cleanup.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<{actionHandle: *, el: HTMLElement, instance: *}>} Handle for later destruction
   */
  create: async (container, itemCount) => {
    await depsReady;
    if (!vlistAction) {
      throw new Error(
        "VList (Svelte) is not available — failed to load vlist-svelte" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    const height = container.clientHeight || 600;
    const items = getItems(itemCount);

    // Create the scroll container element — this is what the action mounts onto.
    const el = document.createElement("div");
    el.style.cssText = `height:${height}px;width:100%;overflow:auto;`;
    container.appendChild(el);

    let capturedInstance = null;

    // Call the Svelte action directly — equivalent to use:vlist={...} in a
    // Svelte template. The action builds the vlist instance synchronously and
    // fires onInstance before returning.
    // We pass empty items initially so that array allocation is never inside
    // the timed create() region — setItems() is called below.
    const actionHandle = vlistAction(el, {
      config: {
        items: [],
        overscan: DEFAULT_OVERSCAN,
        item: {
          height: ITEM_HEIGHT,
          template: benchmarkTemplate,
        },
      },
      onInstance: (instance) => {
        capturedInstance = instance;
      },
    });

    // setItems() triggers the actual virtualisation render — identical to how
    // the vanilla vlist.js adapter measures this, so the items array
    // allocation (pre-built in getItems()) is never inside the timed region.
    if (capturedInstance && typeof capturedInstance.setItems === "function") {
      capturedInstance.setItems(items);
    }

    return { actionHandle, el, instance: capturedInstance };
  },

  /**
   * Destroy the vlist action and clean up the DOM element.
   *
   * The action's destroy() method calls instance.destroy() internally.
   * We also call it defensively in case the action handle is absent.
   *
   * @param {{actionHandle: *, el: HTMLElement, instance: *}} handle
   */
  destroy: async (handle) => {
    if (!handle) return;
    const { actionHandle, el, instance } = handle;
    // Call the Svelte action's destroy() lifecycle method first — this
    // internally calls instance.destroy() via the vlist-svelte action.
    if (actionHandle && typeof actionHandle.destroy === "function") {
      actionHandle.destroy();
    } else if (instance && typeof instance.destroy === "function") {
      // Fallback: destroy the vlist instance directly if no action handle.
      instance.destroy();
    }
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  },
});
