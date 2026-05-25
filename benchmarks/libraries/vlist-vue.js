// benchmarks/libraries/vlist-vue.js — VList (Vue) benchmark adapter
//
// Registers vlist-vue with the benchmark runner so it can be tested with
// the same measurement pipeline as every other library.
//
// vlist-vue wraps vlist with a useVList composable for Vue 3. The
// composable manages the vlist instance lifecycle and exposes a containerRef
// that the caller attaches to a div via Vue's template ref system.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - The items array is pre-built once per itemCount and cached outside
//     create() so that array allocation is never counted as render time.
//   - useVList builds and mounts the vlist instance via onMounted internally —
//     we access the instance through the shallowRef it returns.
//   - We use a wrapper div (not container directly) so Vue's app.unmount()
//     doesn't destroy the benchmark container element itself.
//   - We mount with an empty items array first, then call setItems() after
//     app.mount() — matching the vanilla vlist.js pattern so that array
//     allocation is never inside the timed region.
//   - markRaw() is NOT needed here since we pass an empty array at mount time;
//     setItems() passes the pre-built array directly to the vlist engine which
//     never routes it through Vue's reactivity system.

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  benchmarkTemplate,
} from "../runner.js";

// =============================================================================
// Eager dependency load
// =============================================================================

let Vue = null,
  useVList = null,
  loadError = null;

const depsReady = (async () => {
  try {
    Vue = await import("vue");
    const vlistVue = await import("vlist-vue");
    useVList = vlistVue.useVList ?? vlistVue.default;
  } catch (err) {
    loadError = err;
    console.error("[vlist-vue] Failed to load dependencies:", err);
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
  slug: "vlist-vue",
  name: "VList (Vue)",
  ecosystem: "vue",

  /**
   * Mount a vlist-vue list into the container.
   *
   * Creates a Vue app with a single component that calls useVList and
   * attaches containerRef to a div. The composable builds the vlist instance
   * via onMounted and exposes the instance via a shallowRef.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<{app: *, wrapper: HTMLElement, instance: *}>} Handle for later destruction
   */
  create: async (container, itemCount) => {
    await depsReady;
    if (!useVList) {
      throw new Error(
        "VList (Vue) is not available — failed to load vlist-vue" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    const height = container.clientHeight || 600;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `height:${height}px;width:100%;overflow:hidden;`;
    container.appendChild(wrapper);

    const capturedUseVList = useVList;
    const capturedHeight = height;

    // Shared holder so we can reach the vlist instance after mount.
    const holder = { instance: null };

    const app = Vue.createApp({
      setup() {
        // Mount with empty items — setItems() is called after app.mount()
        // so that array allocation is never inside the timed create() region.
        const { containerRef, instance } = capturedUseVList({
          items: [],
          overscan: DEFAULT_OVERSCAN,
          item: {
            height: ITEM_HEIGHT,
            template: benchmarkTemplate,
          },
        });

        // Expose instance ref so we can retrieve it after mount.
        holder.instanceRef = instance;

        return { containerRef };
      },
      template: `
        <div
          ref="containerRef"
          :style="{ height: '${capturedHeight}px', width: '100%', overflow: 'auto' }"
        ></div>
      `,
    });

    app.mount(wrapper);

    // Retrieve the vlist instance (populated by useVList's onMounted hook).
    const instance = holder.instanceRef ? holder.instanceRef.value : null;

    // setItems() triggers the actual virtualisation render — identical to how
    // the vanilla vlist.js adapter measures this, so the items array
    // allocation (pre-built in getItems()) is never inside the timed region.
    if (instance && typeof instance.setItems === "function") {
      instance.setItems(getItems(itemCount));
    }

    return { app, wrapper, instance };
  },

  /**
   * Unmount the Vue app and destroy the vlist instance.
   *
   * @param {{app: *, wrapper: HTMLElement, instance: *}} handle
   */
  destroy: async (handle) => {
    if (!handle) return;
    const { app, wrapper, instance } = handle;
    // vlist instance is destroyed by useVList's onBeforeUnmount handler when
    // the app unmounts, but we call destroy() defensively in case unmount()
    // doesn't fire synchronously before the next test starts.
    if (instance && typeof instance.destroy === "function") {
      instance.destroy();
    }
    if (app && typeof app.unmount === "function") {
      app.unmount();
    }
    if (wrapper && wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  },
});
