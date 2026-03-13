// benchmarks/libraries/vlist-solidjs.js — VList (SolidJS) benchmark adapter
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

let solid = null, solidWeb = null, VList = null, loadError = null;

const depsReady = (async () => {
  try {
    solid = await import("solid-js");
    solidWeb = await import("solid-js/web");
    const vlistSolid = await import("vlist-solidjs");
    VList = vlistSolid.VList || vlistSolid.default;
  } catch (err) {
    loadError = err;
    console.error("[vlist-solidjs] Failed to load dependencies:", err);
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
  slug: "vlist-solidjs",
  name: "VList (SolidJS)",
  ecosystem: "solid",

  create: async (container, itemCount) => {
    await depsReady;
    if (!VList) {
      throw new Error("VList (SolidJS) is not available — failed to load vlist-solidjs" + (loadError ? `: ${loadError.message}` : ""));
    }
    const { render } = solidWeb;
    const dispose = render(
      () => VList({
        items: getItems(itemCount),
        overscan: DEFAULT_OVERSCAN,
        item: { height: ITEM_HEIGHT, template: benchmarkTemplate },
        style: { height: `${container.clientHeight || 600}px`, width: "100%" },
      }),
      container,
    );
    return dispose;
  },

  destroy: async (dispose) => {
    if (typeof dispose === "function") {
      dispose();
    }
  },
});
