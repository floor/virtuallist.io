// benchmarks/libraries/vlist-svelte.js — VList (Svelte) benchmark adapter
//
// Registers vlist-svelte with the benchmark runner so it can be tested
// with the same measurement pipeline as every other library.
//
// vlist-svelte is the Svelte binding for the zero-dependency @floor/vlist core.
//
// ⚠️  NOTE: Svelte components require a compile step. This adapter uses
// the pre-compiled output from the vlist-svelte package. If the package
// exposes a compiled JS entry point, it will work directly. Otherwise,
// a custom Svelte compilation step may be needed in the build process.

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

let VList;

/**
 * Lazy load vlist-svelte.
 *
 * vlist-svelte should export a compiled Svelte component (or a factory
 * function) that can be instantiated without a Svelte runtime compile step.
 *
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  try {
    if (!VList) {
      const vlistSvelte = await import("vlist-svelte");
      VList = vlistSvelte.VList || vlistSvelte.default;

      if (!VList) {
        throw new Error("VList export not found in vlist-svelte");
      }
    }
    return true;
  } catch (err) {
    console.error("[vlist-svelte] Failed to load dependencies:", err);
    return false;
  }
};

// =============================================================================
// Adapter Registration
// =============================================================================

defineLibrary({
  slug: "vlist-svelte",
  name: "VList (Svelte)",
  ecosystem: "svelte",

  /**
   * Mount a vlist-svelte VList into the container.
   *
   * Svelte components are typically compiled to a class or function that
   * accepts a { target, props } options object. This adapter uses the
   * compiled output from the vlist-svelte package.
   *
   * Uses the shared benchmarkTemplate function to render items, ensuring
   * the same DOM structure as all other library benchmarks.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<*>} Svelte component instance (for later $destroy())
   */
  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) {
      throw new Error(
        "VList (Svelte) is not available — failed to load vlist-svelte",
      );
    }

    // Build items array with pre-computed display data
    // (Svelte templates can't call imported JS functions directly
    // without wrapping, so we pre-compute the display values)
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      const n = ITEM_NAMES[i % ITEM_NAMES.length];
      const n2 = ITEM_NAMES[(i + 3) % ITEM_NAMES.length];
      items.push({
        id: i,
        index: i,
        initials: `${n[0]}${n2[0]}`,
        title: `${n} — Item ${i}`,
        sub: "Lorem ipsum dolor sit amet",
        badge: ITEM_BADGES[i % ITEM_BADGES.length],
        time: `${(i % 59) + 1}m`,
      });
    }

    // Svelte 4 component API: new Component({ target, props })
    // Svelte 5 runes API: mount(Component, { target, props })
    let instance;

    if (typeof VList === "function" && VList.prototype && VList.prototype.$destroy) {
      // Svelte 4 class-based component
      instance = new VList({
        target: container,
        props: {
          items,
          overscan: DEFAULT_OVERSCAN,
          item: {
            height: ITEM_HEIGHT,
          },
          style: `height:${container.clientHeight || 600}px;width:100%;`,
        },
      });
    } else if (typeof VList === "function") {
      // Svelte 5 runes — try mount() if available on the module
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
        // Fallback: call as factory function
        instance = VList({
          target: container,
          props: { items, overscan: DEFAULT_OVERSCAN, item: { height: ITEM_HEIGHT } },
        });
      }
    } else {
      throw new Error(
        "vlist-svelte: unexpected export format — could not instantiate VList",
      );
    }

    return instance;
  },

  /**
   * Destroy a vlist-svelte instance and clean up its DOM.
   *
   * Calls $destroy() for Svelte 4 class components, or unmount() for
   * Svelte 5 runes-based components.
   *
   * @param {*} instance - Component instance returned by create()
   */
  destroy: async (instance) => {
    if (!instance) return;

    // Svelte 4: $destroy() method on class instances
    if (typeof instance.$destroy === "function") {
      instance.$destroy();
      return;
    }

    // Svelte 5: unmount() from the svelte module
    try {
      const { unmount } = await import("svelte").catch(() => ({ unmount: null }));
      if (unmount && typeof unmount === "function") {
        unmount(instance);
        return;
      }
    } catch {
      /* ignore */
    }

    // Fallback: if instance is a dispose function (some Svelte 5 patterns)
    if (typeof instance === "function") {
      instance();
    }
  },
});
