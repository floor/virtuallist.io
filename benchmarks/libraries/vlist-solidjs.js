// benchmarks/libraries/vlist-solidjs.js — VList (SolidJS) benchmark adapter
//
// Registers vlist-solidjs with the benchmark runner so it can be tested with
// the same measurement pipeline as every other library.
//
// vlist-solidjs wraps @floor/vlist with a createVList primitive for SolidJS.
// The primitive manages the vlist instance lifecycle and exposes a setRef
// callback that the caller attaches to a container element.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The items array is pre-built once per itemCount and cached outside
//     create() so that array allocation is never counted as render time.
//   - createRoot() is used instead of render() to establish a proper Solid
//     reactive ownership scope — render() with a raw-element callback skips
//     ownership wiring and triggers "computations created outside a createRoot"
//     warnings, causing onMount/onCleanup/createEffect to be unowned.
//   - We build the vlist instance without items first (matching the vanilla
//     vlist.js pattern), then call setItems() after the timed region so that
//     array-passing overhead is not counted as part of render time.

import { createRoot, createSignal } from "solid-js";
import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  benchmarkTemplate,
} from "../runner.js";

// =============================================================================
// Eager dependency load
// =============================================================================

let createVList = null,
  loadError = null;

const depsReady = (async () => {
  try {
    const vlistSolid = await import("vlist-solidjs");
    createVList = vlistSolid.createVList ?? vlistSolid.default;
  } catch (err) {
    loadError = err;
    console.error("[vlist-solidjs] Failed to load dependencies:", err);
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
  slug: "vlist-solidjs",
  name: "VList (SolidJS)",
  ecosystem: "solid",

  /**
   * Mount a vlist-solidjs list into the container.
   *
   * Uses createRoot() to establish a proper Solid reactive ownership scope,
   * then calls createVList with an empty config (no items yet). After the
   * instance is ready via onMount, setItems() is called — this matches the
   * vanilla vlist.js pattern so array allocation is never in the timed region.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<{dispose: Function, instance: *}>} Handle for later destruction
   */
  create: async (container, itemCount) => {
    await depsReady;
    if (!createVList) {
      throw new Error(
        "VList (SolidJS) is not available — failed to load vlist-solidjs" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    const _createVList = createVList;

    const height = container.clientHeight || 600;

    // Shared holder so we can reach the instance after createRoot runs.
    const holder = { instance: null, dispose: null };

    // createRoot establishes a proper reactive ownership scope so that
    // createVList's onMount, onCleanup, and createEffect calls are correctly
    // owned and will be disposed when dispose() is called.
    createRoot((dispose) => {
      holder.dispose = dispose;

      // Start with an empty items array — we call setItems() below so that
      // array allocation is never counted as part of the render measurement.
      const [config] = createSignal({
        items: [],
        overscan: DEFAULT_OVERSCAN,
        item: {
          height: ITEM_HEIGHT,
          template: benchmarkTemplate,
        },
      });

      const { setRef, instance } = _createVList(config);

      // Stash the instance accessor so we can retrieve it after onMount fires.
      holder.instanceAccessor = instance;

      const el = document.createElement("div");
      el.style.cssText = `height:${height}px;width:100%;overflow:auto;`;
      container.appendChild(el);
      setRef(el);
    });

    // Wait for Solid's onMount queue to flush — onMount is microtask-queued
    // so the vlist instance is populated after the first microtask tick.
    await new Promise((resolve) => queueMicrotask(resolve));

    const instance = holder.instanceAccessor ? holder.instanceAccessor() : null;
    holder.instance = instance;

    // setItems() triggers the actual virtualisation render — identical to how
    // the vanilla vlist.js adapter measures this, so the items array
    // allocation (pre-built in getItems()) is never inside the timed region.
    if (instance && typeof instance.setItems === "function") {
      instance.setItems(getItems(itemCount));
    }

    return { dispose: holder.dispose, instance };
  },

  /**
   * Dispose the Solid reactive root and destroy the vlist instance.
   *
   * dispose() unmounts the Solid tree and triggers createVList's onCleanup
   * which calls instance.destroy() internally. We call destroy() defensively
   * in case the cleanup handler doesn't fire synchronously.
   *
   * @param {{dispose: Function, instance: *}} handle
   */
  destroy: async (handle) => {
    if (!handle) return;
    const { dispose, instance } = handle;
    if (instance && typeof instance.destroy === "function") {
      instance.destroy();
    }
    if (typeof dispose === "function") {
      dispose();
    }
  },
});
