// benchmarks/libraries/tanstack-vue-virtual.js — TanStack Virtual (Vue) benchmark adapter
//
// Registers @tanstack/vue-virtual with the benchmark runner so it can be
// tested with the same measurement pipeline as every other library.
//
// TanStack Virtual (Vue) provides a useVirtualizer composable for Vue 3
// applications — the same headless virtualizer core as the React version,
// but with Vue reactivity bindings.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - Vue templates need pre-computed display values (initials, title, etc.)
//     because the template slot cannot call imported JS helper functions directly.
//   - Uses the compiler-included Vue build (vue.esm-bundler.js) so that
//     string `template` options work at runtime without .vue SFC compilation.
//   - The items array is wrapped with markRaw() to prevent Vue from deeply
//     proxying up to 1M item objects. Without this, Vue's reactivity system
//     would recursively walk every property of every item on mount, causing
//     catastrophic O(N × fields) overhead that dwarfs the actual render cost.
//   - The estimateSize closure is hoisted outside the computed to avoid
//     creating a new function reference on every reactivity tick, which would
//     cause TanStack's setOptions() to detect a "change" and re-measure.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  ITEM_NAMES,
  ITEM_BADGES,
} from "../runner.js";

let Vue = null,
  useVirtualizer = null,
  loadError = null;

const depsReady = (async () => {
  try {
    Vue = await import("vue");
    const tanstackVue = await import("@tanstack/vue-virtual");
    useVirtualizer = tanstackVue.useVirtualizer;
  } catch (err) {
    loadError = err;
    console.error("[tanstack-vue-virtual] Failed to load dependencies:", err);
  }
})();

// Hoisted stable closure — never reallocated, so TanStack's setOptions()
// won't detect a spurious change on every reactivity tick.
const estimateSize = () => ITEM_HEIGHT;

// Rich items cache — Vue templates need pre-computed display values.
// Items are plain objects; markRaw() is applied at mount time to prevent
// Vue from wrapping them in reactive proxies.
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
  slug: "tanstack-vue-virtual",
  name: "TanStack Virtual (Vue)",
  ecosystem: "vue",

  /**
   * Mount a TanStack Virtual (Vue) list into the container.
   *
   * Uses Vue's Composition API with useVirtualizer — the headless
   * virtualizer provides reactive virtual items and total size, while
   * we handle the DOM layout via Vue's template system.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<{app: *, wrapper: HTMLElement}>} Instance handle
   */
  create: async (container, itemCount) => {
    await depsReady;
    if (!useVirtualizer) {
      throw new Error(
        "TanStack Virtual (Vue) is not available — failed to load dependencies" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    const height = container.clientHeight || 600;
    // markRaw prevents Vue from recursively proxying every item object.
    // Without this, mounting with 1M items triggers millions of Proxy
    // creations that dominate the render measurement.
    const items = Vue.markRaw(getItems(itemCount));

    const wrapper = document.createElement("div");
    wrapper.className = "tanstack-vue-wrapper";
    wrapper.style.cssText = `height:${height}px;width:100%;overflow:hidden;`;
    container.appendChild(wrapper);

    const capturedUseVirtualizer = useVirtualizer;

    const app = Vue.createApp({
      setup() {
        const parentRef = Vue.ref(null);

        const virtualizer = capturedUseVirtualizer(
          Vue.computed(() => ({
            count: itemCount,
            getScrollElement: () => parentRef.value,
            estimateSize,
            overscan: DEFAULT_OVERSCAN,
          })),
        );

        const virtualItems = Vue.computed(() =>
          virtualizer.value.getVirtualItems(),
        );
        const totalSize = Vue.computed(() => virtualizer.value.getTotalSize());

        return {
          parentRef,
          virtualItems,
          totalSize,
          items,
        };
      },
      template: `
        <div
          ref="parentRef"
          style="height:100%;width:100%;overflow:auto;"
        >
          <div
            :style="{
              height: totalSize + 'px',
              width: '100%',
              position: 'relative',
            }"
          >
            <div
              v-for="virtualRow in virtualItems"
              :key="virtualRow.index"
              class="bench-item"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size + 'px',
                transform: 'translateY(' + virtualRow.start + 'px)',
              }"
            >
              <div class="bench-item__avatar">{{ items[virtualRow.index].initials }}</div>
              <div class="bench-item__content">
                <div class="bench-item__title">{{ items[virtualRow.index].title }}</div>
                <div class="bench-item__sub">{{ items[virtualRow.index].sub }}</div>
              </div>
              <div class="bench-item__meta">
                <span class="bench-item__badge">{{ items[virtualRow.index].badge }}</span>
                <span class="bench-item__time">{{ items[virtualRow.index].time }}</span>
              </div>
            </div>
          </div>
        </div>
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
