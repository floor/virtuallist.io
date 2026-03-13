// benchmarks/libraries/vlist-svelte.js — VList (Svelte) benchmark adapter
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The items array (with pre-computed display data) is cached outside create()
//     so that array construction + string computation is never measured as render time.
//   - Svelte templates require pre-computed display values since they cannot call
//     arbitrary JS functions directly; we store them in the item objects.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  ITEM_NAMES,
  ITEM_BADGES,
} from "../runner.js";

let VList = null, loadError = null;

const depsReady = (async () => {
  try {
    const vlistSvelte = await import("vlist-svelte");
    VList = vlistSvelte.VList || vlistSvelte.default;
    if (!VList) throw new Error("VList export not found in vlist-svelte");
  } catch (err) {
    loadError = err;
    console.error("[vlist-svelte] Failed to load dependencies:", err);
  }
})();

// Rich items cache — Svelte templates need pre-computed display values.
const itemsCache = new Map();
const getItems = (itemCount) => {
  if (!itemsCache.has(itemCount)) {
    const items = Array.from({ length: itemCount }, (_, i) => {
      const n = ITEM_NAMES[i % ITEM_NAMES.length];
      const n2 = ITEM_NAMES[(i + 3) % ITEM_NAMES.length];
      return {
        id: i,
        index: i,
        initials: `${n[0]}${n2[0]}`,
        title: `${n} — Item ${i}`,
        sub: "Lorem ipsum dolor sit amet",
        badge: ITEM_BADGES[i % ITEM_BADGES.length],
        time: `${(i % 59) + 1}m`,
      };
    });
    itemsCache.set(itemCount, items);
  }
  return itemsCache.get(itemCount);
};

defineLibrary({
  slug: "vlist-svelte",
  name: "VList (Svelte)",
  ecosystem: "svelte",

  create: async (container, itemCount) => {
    await depsReady;
    if (!VList) {
      throw new Error("VList (Svelte) is not available — failed to load vlist-svelte" + (loadError ? `: ${loadError.message}` : ""));
    }

    const items = getItems(itemCount);
    let instance;

    if (typeof VList === "function" && VList.prototype && VList.prototype.$destroy) {
      // Svelte 4 class-based component
      instance = new VList({
        target: container,
        props: {
          items,
          overscan: DEFAULT_OVERSCAN,
          item: { height: ITEM_HEIGHT },
          style: `height:${container.clientHeight || 600}px;width:100%;`,
        },
      });
    } else if (typeof VList === "function") {
      // Svelte 5 runes
      const { mount } = await import("svelte").catch(() => ({ mount: null }));
      if (mount) {
        instance = mount(VList, {
          target: container,
          props: {
            items,
            overscan: DEFAULT_OVERSCAN,
            item: { height: ITEM_HEIGHT },
            style: `height:${container.clientHeight || 600}px;width:100%;`,
          },
        });
      } else {
        instance = VList({
          target: container,
          props: { items, overscan: DEFAULT_OVERSCAN, item: { height: ITEM_HEIGHT } },
        });
      }
    } else {
      throw new Error("vlist-svelte: unexpected export format — could not instantiate VList");
    }

    return instance;
  },

  destroy: async (instance) => {
    if (!instance) return;
    if (typeof instance.$destroy === "function") {
      instance.$destroy();
      return;
    }
    try {
      const { unmount } = await import("svelte").catch(() => ({ unmount: null }));
      if (unmount) { unmount(instance); return; }
    } catch { /* ignore */ }
    if (typeof instance === "function") instance();
  },
});
