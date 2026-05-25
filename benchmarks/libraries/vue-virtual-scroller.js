// benchmarks/libraries/vue-virtual-scroller.js — vue-virtual-scroller benchmark adapter
//
// Registers vue-virtual-scroller with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// vue-virtual-scroller provides a <RecycleScroller> component with DOM
// recycling for Vue 3 applications.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The items array (with pre-computed display data) is cached outside create()
//     so that array construction + string computation is never measured as render time.
//   - Vue templates need pre-computed display values (initials, title, etc.) because
//     the template slot cannot call imported JS helper functions directly.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  ITEM_NAMES,
  ITEM_BADGES,
} from "../runner.js";

let Vue = null, RecycleScroller = null, loadError = null;

const depsReady = (async () => {
  try {
    Vue = await import("vue");
    const scrollerMod = await import("vue-virtual-scroller");
    RecycleScroller = scrollerMod.RecycleScroller;
  } catch (err) {
    loadError = err;
    console.error("[vue-virtual-scroller] Failed to load dependencies:", err);
  }
})();

// Rich items cache — Vue templates need pre-computed display values.
const itemsCache = new Map();
const getItems = (itemCount) => {
  if (!itemsCache.has(itemCount)) {
    const items = Array.from({ length: itemCount }, (_, i) => {
      const n = ITEM_NAMES[i % ITEM_NAMES.length];
      const n2 = ITEM_NAMES[(i + 3) % ITEM_NAMES.length];
      return {
        id: i,
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
  slug: "vue-virtual-scroller",
  name: "vue-virtual-scroller",
  ecosystem: "vue",

  create: async (container, itemCount) => {
    await depsReady;
    if (!RecycleScroller) {
      throw new Error("vue-virtual-scroller is not available — failed to load dependencies" + (loadError ? `: ${loadError.message}` : ""));
    }

    const wrapper = document.createElement("div");
    wrapper.className = "vue-scroller-wrapper";
    wrapper.style.cssText = `height:${container.clientHeight || 600}px;width:100%;overflow:hidden;`;
    container.appendChild(wrapper);

    const app = Vue.createApp({
      components: { RecycleScroller },
      data() {
        return {
          items: getItems(itemCount),
          itemHeight: ITEM_HEIGHT,
        };
      },
      template: `
        <RecycleScroller
          class="vue-recycle-scroller"
          :items="items"
          :item-size="itemHeight"
          :buffer="${DEFAULT_OVERSCAN * ITEM_HEIGHT}"
          key-field="id"
          v-slot="{ item }"
          style="height:100%;width:100%;"
        >
          <div class="bench-item" :style="{ height: itemHeight + 'px' }">
            <div class="bench-item__avatar">{{ item.initials }}</div>
            <div class="bench-item__content">
              <div class="bench-item__title">{{ item.title }}</div>
              <div class="bench-item__sub">{{ item.sub }}</div>
            </div>
            <div class="bench-item__meta">
              <span class="bench-item__badge">{{ item.badge }}</span>
              <span class="bench-item__time">{{ item.time }}</span>
            </div>
          </div>
        </RecycleScroller>
      `,
    });

    app.mount(wrapper);
    return { app, wrapper };
  },

  destroy: async (instance) => {
    if (!instance) return;
    if (instance.app && typeof instance.app.unmount === "function") {
      instance.app.unmount();
    }
    if (instance.wrapper && instance.wrapper.parentNode) {
      instance.wrapper.parentNode.removeChild(instance.wrapper);
    }
  },
});
