// benchmarks/libraries/vue-virtual-scroller.js — vue-virtual-scroller benchmark adapter
//
// Registers vue-virtual-scroller with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// vue-virtual-scroller provides a <RecycleScroller> component with DOM
// recycling for Vue 3 applications.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  ITEM_NAMES,
  ITEM_BADGES,
} from "../runner.js";

// =============================================================================
// Lazy-loaded dependencies
// =============================================================================

let Vue;
let RecycleScroller;

/**
 * Lazy load Vue and vue-virtual-scroller.
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  try {
    if (!Vue) {
      // Vue must be resolved to the compiler-included build (vue.esm-bundler.js)
      // so that string `template` options work at runtime without .vue SFC compilation.
      Vue = await import("vue");

      const scrollerMod = await import("vue-virtual-scroller");
      RecycleScroller = scrollerMod.RecycleScroller;
    }
    return true;
  } catch (err) {
    console.error("[vue-virtual-scroller] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "vue-virtual-scroller",
  name: "vue-virtual-scroller",
  ecosystem: "vue",

  /**
   * Mount a vue-virtual-scroller RecycleScroller into the container.
   *
   * Creates a Vue 3 app with the RecycleScroller component, configured
   * to render the same realistic item template as all other libraries.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} Vue app instance (for later unmounting)
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error(
        "vue-virtual-scroller is not available — failed to load dependencies",
      );
    }

    // Build the items array
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      const n = ITEM_NAMES[i % ITEM_NAMES.length];
      const n2 = ITEM_NAMES[(i + 3) % ITEM_NAMES.length];
      items.push({
        id: i,
        initials: `${n[0]}${n2[0]}`,
        title: `${n} — Item ${i}`,
        sub: "Lorem ipsum dolor sit amet",
        badge: ITEM_BADGES[i % ITEM_BADGES.length],
        time: `${(i % 59) + 1}m`,
      });
    }

    // Create a wrapper div for the Vue app to mount into
    const wrapper = document.createElement("div");
    wrapper.className = "vue-scroller-wrapper";
    wrapper.style.cssText = `height:${container.clientHeight || 600}px;width:100%;overflow:hidden;`;
    container.appendChild(wrapper);

    const app = Vue.createApp({
      components: {
        RecycleScroller,
      },
      data() {
        return {
          items,
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

  /**
   * Unmount a vue-virtual-scroller instance.
   *
   * @param {*} instance - Object with { app, wrapper } returned by create()
   */
  destroy: async (instance) => {
    if (instance) {
      if (instance.app && typeof instance.app.unmount === "function") {
        instance.app.unmount();
      }
      if (instance.wrapper && instance.wrapper.parentNode) {
        instance.wrapper.parentNode.removeChild(instance.wrapper);
      }
    }
  },
});
