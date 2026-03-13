// benchmarks/libraries/vlist-vue.js — VList (Vue) benchmark adapter
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

let Vue = null, VList = null, loadError = null;

const depsReady = (async () => {
  try {
    Vue = await import("vue");
    const vlistVue = await import("vlist-vue");
    VList = vlistVue.VList || vlistVue.default;
  } catch (err) {
    loadError = err;
    console.error("[vlist-vue] Failed to load dependencies:", err);
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
  slug: "vlist-vue",
  name: "VList (Vue)",
  ecosystem: "vue",

  create: async (container, itemCount) => {
    await depsReady;
    if (!VList) {
      throw new Error("VList (Vue) is not available — failed to load vlist-vue" + (loadError ? `: ${loadError.message}` : ""));
    }

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `height:${container.clientHeight || 600}px;width:100%;overflow:hidden;`;
    container.appendChild(wrapper);

    const app = Vue.createApp({
      components: { VList },
      data() {
        return {
          items: getItems(itemCount),
          itemHeight: ITEM_HEIGHT,
          overscan: DEFAULT_OVERSCAN,
          containerHeight: container.clientHeight || 600,
        };
      },
      template: `
        <VList
          :items="items"
          :overscan="overscan"
          :item="{ height: itemHeight }"
          :style="{ height: containerHeight + 'px', width: '100%' }"
          v-slot="{ item, index }"
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
        </VList>
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
