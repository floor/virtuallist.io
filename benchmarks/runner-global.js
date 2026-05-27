// benchmarks/runner-global.js — Shim for per-adapter builds.
//
// When adapters are built as separate bundles, their `../runner.js` imports
// are redirected here. This reads from the window globals set by headless-base.js.

const w = /** @type {any} */ (window);

export const defineLibrary = w.__defineLibrary;
export const injectStyles = w.__injectStyles;
export const ITEM_HEIGHT = w.__ITEM_HEIGHT;
export const DEFAULT_OVERSCAN = w.__DEFAULT_OVERSCAN;
export const ITEM_NAMES = w.__ITEM_NAMES;
export const ITEM_BADGES = w.__ITEM_BADGES;
export const benchmarkTemplate = w.__benchmarkTemplate;
export const createRealisticReactChildren = w.__createRealisticReactChildren;
export const populateRealisticDOMChildren = w.__populateRealisticDOMChildren;
export const generateRealisticItemHTML = w.__generateRealisticItemHTML;
