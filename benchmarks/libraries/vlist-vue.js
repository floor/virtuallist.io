// benchmarks/libraries/vlist-vue.js — VList (Vue) benchmark adapter
//
// Registers vlist-vue with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// vlist-vue is the Vue 3 binding for the zero-dependency @floor/vlist core.
// It provides a <VList> component for Vue 3 applications.

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
let VList;

/**
 * Lazy load Vue and vlist-vue.
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  try {
    if (!Vue) {
      Vue = await import("vue");

      const vlistVue = await import("vlist-vue");
      VList = vlistVue.VList || vlistVue.default;
    }
    return true;
  } catch (err) {
    console.error("[vlist-vue] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "vlist-vue",
  name: "VList (Vue)",
  ecosystem: "vue",

  /**
   * Mount a vlist-vue VList into the container.
   *
   * Creates a Vue 3 app with the VList component, configured to render
   * the same realistic item template as all other libraries.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} Object with { app, wrapper } for later cleanup
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error(
        "VList (Vue) is not available — failed to load vlist-vue",
      );
    }

    // Build items array with pre-computed display data
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

    // Create a wrapper div for the Vue app
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `height:${container.clientHeight || 600}px;width:100%;overflow:hidden;`;
    container.appendChild(wrapper);

    const app = Vue.createApp({
      components: { VList },
      data() {
        return {
          items,
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

  /**
   * Unmount a vlist-vue instance and clean up its DOM.
   *
   * @param {{app: *, wrapper: HTMLElement}} instance - Handle from create()
   */
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
