// benchmarks/libraries/_TEMPLATE.js — Template for new library adapters
//
// Copy this file to create a benchmark adapter for a new library.
// Rename it to match the library's slug from the registry.
//
// Steps:
//   1. Copy this file:  cp _TEMPLATE.js my-library.js
//   2. Update the slug, name, and ecosystem
//   3. Implement loadDependencies() to dynamically import the library
//   4. Implement create() to mount the library's virtual list
//   5. Implement destroy() to unmount and clean up
//   6. Import the adapter in benchmarks/script.js
//   7. Rebuild:  bun run build:bench
//
// Guidelines:
//   - Use the SAME item height (ITEM_HEIGHT = 48px) as all other libraries
//   - Use the SAME overscan (DEFAULT_OVERSCAN = 5) where configurable
//   - Use the SAME DOM template (createRealisticReactChildren for React,
//     populateRealisticDOMChildren for vanilla/SolidJS, benchmarkTemplate
//     for HTML-string-based libraries)
//   - Dynamic-import all library dependencies (lazy loading)
//   - Return an instance handle from create() that destroy() can use
//   - Clean up ALL DOM elements, event listeners, and state in destroy()

import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  // Pick the template helper that matches your library's ecosystem:
  // createRealisticReactChildren,  // React-based libraries
  // populateRealisticDOMChildren,  // Vanilla/SolidJS DOM manipulation
  // generateRealisticItemHTML,     // HTML-string-based (Clusterize.js etc.)
  // benchmarkTemplate,             // VList HTML template function
} from "../runner.js";

// =============================================================================
// Lazy-loaded dependencies
// =============================================================================

// let LibraryComponent;

/**
 * Lazy load the library and its framework dependencies.
 * Returns false if loading fails.
 */
const loadDependencies = async () => {
  // try {
  //   if (!LibraryComponent) {
  //     const mod = await import("my-library");
  //     LibraryComponent = mod.VirtualList;
  //   }
  //   return true;
  // } catch (err) {
  //   console.error("[my-library] Failed to load:", err);
  //   return false;
  // }
  return false;
};

// =============================================================================
// Adapter Registration
// =============================================================================

// Uncomment and customize to register your library:
//
// defineLibrary({
//   slug: "my-library",
//   name: "My Library",
//   ecosystem: "react", // or "vue", "solid", "svelte", "vanilla"
//
//   /**
//    * Mount the library's virtual list into the container.
//    *
//    * @param {HTMLElement} container - DOM element to render into
//    * @param {number} itemCount - Number of items in the list
//    * @returns {Promise<*>} Instance handle (passed to destroy() later)
//    */
//   create: async (container, itemCount) => {
//     const loaded = await loadDependencies();
//     if (!loaded) {
//       throw new Error("My Library is not available");
//     }
//
//     // --- React example ---
//     // const root = ReactDOM.createRoot(container);
//     // root.render(
//     //   React.createElement(LibraryComponent, {
//     //     height: container.clientHeight || 600,
//     //     itemCount,
//     //     itemSize: ITEM_HEIGHT,
//     //     overscanCount: DEFAULT_OVERSCAN,
//     //     children: ({ index, style }) =>
//     //       React.createElement(
//     //         "div",
//     //         { className: "bench-item", style },
//     //         ...createRealisticReactChildren(React, index),
//     //       ),
//     //   }),
//     // );
//     // return root;
//
//     // --- Vanilla example ---
//     // const instance = new LibraryComponent(container, {
//     //   itemCount,
//     //   itemHeight: ITEM_HEIGHT,
//     //   renderItem: (el, index) => {
//     //     el.className = "bench-item";
//     //     populateRealisticDOMChildren(el, index);
//     //   },
//     // });
//     // return instance;
//   },
//
//   /**
//    * Unmount and clean up the library instance.
//    *
//    * @param {*} instance - Handle returned by create()
//    */
//   destroy: async (instance) => {
//     // --- React example ---
//     // if (instance && typeof instance.unmount === "function") {
//     //   instance.unmount();
//     // }
//
//     // --- Vanilla example ---
//     // if (instance && typeof instance.destroy === "function") {
//     //   instance.destroy();
//     // }
//   },
// });
