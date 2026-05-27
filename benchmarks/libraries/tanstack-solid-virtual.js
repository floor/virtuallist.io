// benchmarks/libraries/tanstack-solid-virtual.js — TanStack Virtual (SolidJS) benchmark adapter
//
// Registers @tanstack/solid-virtual with the benchmark runner so it can be
// tested with the same measurement pipeline as every other library.
//
// TanStack Virtual (SolidJS) provides createVirtualizer with fine-grained
// SolidJS reactivity for efficient virtual list rendering.
//
// Implementation notes:
//   - Dependencies are loaded eagerly at module init time (not inside create())
//     to avoid measuring import() overhead during the timed render phase.
//   - Uses Solid's imperative reactive APIs (createSignal, createEffect) with
//     direct DOM manipulation — no JSX, no Babel transform needed.
//   - The virtualizer's getVirtualItems() returns a reactive Solid store and
//     getTotalSize() returns a reactive signal. When the scroll position
//     changes, the virtualizer updates these reactively, which triggers our
//     createEffect to reconcile the DOM — exercising the real Solid update path.

import { createSignal, createEffect, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  populateRealisticDOMChildren,
} from "../runner.js";

let createVirtualizer = null,
  loadError = null;

const depsReady = (async () => {
  try {
    const tanstackSolid = await import("@tanstack/solid-virtual");
    createVirtualizer = tanstackSolid.createVirtualizer;
  } catch (err) {
    loadError = err;
    console.error("[tanstack-solid-virtual] Failed to load dependencies:", err);
  }
})();

defineLibrary({
  slug: "tanstack-solid-virtual",
  name: "TanStack Virtual (SolidJS)",
  ecosystem: "solid",

  /**
   * Mount a TanStack Virtual (SolidJS) list into the container.
   *
   * Uses Solid's reactive primitives imperatively:
   *   1. createSignal for the scroll element ref
   *   2. createVirtualizer for the headless virtualizer (reactive internals)
   *   3. createEffect to reactively reconcile DOM nodes when virtual items change
   *
   * This exercises the real Solid reactive pipeline: scroll events → virtualizer
   * updates its reactive store → createEffect fires → DOM nodes are
   * added/removed/repositioned.
   *
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} itemCount - Number of items in the list
   * @returns {Promise<Function>} Dispose function (for later cleanup)
   */
  create: async (container, itemCount) => {
    await depsReady;
    if (!createVirtualizer) {
      throw new Error(
        "TanStack Virtual (SolidJS) is not available — failed to load dependencies" +
          (loadError ? `: ${loadError.message}` : ""),
      );
    }

    const height = container.clientHeight || 600;

    const dispose = render(() => {
      // ── Reactive scroll element ref ──────────────────────────────────
      // createVirtualizer calls getScrollElement() reactively. We start
      // with null and set it after mount so the virtualizer picks up the
      // real element and begins observing scroll/resize.
      const [scrollEl, setScrollEl] = createSignal(null);

      // ── Virtualizer instance ─────────────────────────────────────────
      const virtualizer = createVirtualizer({
        count: itemCount,
        getScrollElement: () => scrollEl(),
        estimateSize: () => ITEM_HEIGHT,
        overscan: DEFAULT_OVERSCAN,
      });

      // ── Static DOM shell ─────────────────────────────────────────────
      const parentEl = document.createElement("div");
      parentEl.style.cssText = `height:${height}px;overflow:auto;width:100%;`;

      const innerEl = document.createElement("div");
      innerEl.style.cssText = "width:100%;position:relative;";
      parentEl.appendChild(innerEl);

      // ── Reactive DOM reconciliation ──────────────────────────────────
      // This is the core of the adapter. When the virtualizer's reactive
      // store updates (on scroll, resize, or count change), this effect
      // re-runs and reconciles the DOM to match the new virtual items.
      //
      // We maintain a Map<index, HTMLElement> of currently-rendered rows
      // and diff against the new virtual items list each time.

      /** @type {Map<number, HTMLElement>} */
      const renderedRows = new Map();

      createEffect(() => {
        // Reading these reactive values subscribes this effect to changes
        const items = virtualizer.getVirtualItems();
        const totalSize = virtualizer.getTotalSize();

        // Update inner container height
        innerEl.style.height = `${totalSize}px`;

        // Build set of indices that should be visible
        const activeIndices = new Set();

        for (let i = 0; i < items.length; i++) {
          const vItem = items[i];
          activeIndices.add(vItem.index);

          let row = renderedRows.get(vItem.index);

          if (!row) {
            // Create new row
            row = document.createElement("div");
            row.className = "bench-item";
            row.style.cssText =
              "position:absolute;top:0;left:0;width:100%;height:" +
              vItem.size +
              "px;will-change:transform;";
            populateRealisticDOMChildren(row, vItem.index);
            renderedRows.set(vItem.index, row);
            innerEl.appendChild(row);
          }

          // Update position (always — the virtualizer may have recalculated)
          row.style.transform = `translateY(${vItem.start}px)`;
          row.style.height = `${vItem.size}px`;
        }

        // Remove rows that are no longer in the virtual window
        for (const [index, row] of renderedRows) {
          if (!activeIndices.has(index)) {
            row.remove();
            renderedRows.delete(index);
          }
        }
      });

      // ── Cleanup ──────────────────────────────────────────────────────
      onCleanup(() => {
        renderedRows.clear();
      });

      // ── Connect scroll element (triggers virtualizer observation) ────
      // Use queueMicrotask so the DOM is in the document before the
      // virtualizer tries to measure it.
      queueMicrotask(() => {
        setScrollEl(parentEl);
      });

      return parentEl;
    }, container);

    // Wait for the microtask that sets scrollEl — this triggers
    // createEffect synchronously, rendering the virtual items into the DOM.
    await new Promise((resolve) => queueMicrotask(resolve));

    return dispose;
  },

  destroy: async (dispose) => {
    if (typeof dispose === "function") {
      dispose();
    }
  },
});
