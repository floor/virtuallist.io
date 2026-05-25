# Library Adapters

Each library benchmark adapter is a single JavaScript file in `benchmarks/libraries/`. Adapters are the only place where library-specific code lives. The measurement engine (`runner.js`) knows nothing about any particular library — it only calls `create()` and `destroy()` from the adapter.

Adapters are imported by **two** entry points:

| Entry point | Purpose |
|-------------|---------|
| `benchmarks/headless.js` | Puppeteer entry point — server-side benchmark execution |
| `benchmarks/compare.js` | Client-side compare page (`/benchmarks/compare`) |

Both files import every adapter. Adding a new adapter requires an import line in both files. The `script.js` entry point (individual library pages) does **not** import adapters — it triggers server-side runs via `POST /api/run`.

---

## Adapter Contract

Every adapter must call `defineLibrary(adapter)` exactly once when the module is imported. The adapter object must implement:

```js
defineLibrary({
  slug: string,       // must match the slug in src/server/registry.ts exactly
  name: string,       // display name
  ecosystem: string,  // "react" | "vue" | "solid" | "svelte" | "vanilla"

  async create(container, itemCount) {
    // Mount the library's virtual list into container.
    // Return an instance handle — anything that destroy() can use to clean up.
  },

  async destroy(instance) {
    // Unmount the library completely.
    // Remove all DOM elements, cancel all timers, release all references.
    // Must not throw if instance is null or undefined.
  },
})
```

### Fairness requirements

All adapters must follow these rules to ensure the benchmarks are comparable:

| Requirement | Value | Reason |
|-------------|-------|--------|
| Item height | `ITEM_HEIGHT` (48 px) | All libraries must render rows of the same height |
| Overscan | `DEFAULT_OVERSCAN` (5) | Equal off-screen rendering for all libraries that support it |
| DOM template | Shared helper (see below) | All libraries must render the same 7-element structure per item |
| Container height | `container.clientHeight \|\| 600` | All libraries get the same viewport size |
| `destroy()` cleanup | Complete | Leftover DOM or event listeners contaminate the next measurement |

### Shared DOM template helpers

The runner exports four helpers. Use the one that matches the library's rendering model:

| Helper | Output | Use for |
|--------|--------|---------|
| `benchmarkTemplate(_item, index)` | HTML string (inner content, no outer div) | Libraries with an HTML template callback |
| `createRealisticReactChildren(React, index)` | `React.ReactElement[]` | All React-based libraries |
| `populateRealisticDOMChildren(el, index)` | Mutates an existing DOM element | SolidJS, vanilla DOM manipulation |
| `generateRealisticItemHTML(index, height)` | Complete `<div class="bench-item">` HTML string | Libraries that need pre-built HTML strings (e.g. Clusterize.js) |

---

## Lazy Loading

All adapters use dynamic `import()` inside a `loadDependencies()` function. Module-level variables cache the loaded exports so `loadDependencies()` is a no-op on subsequent calls.

```js
let MyComponent

const loadDependencies = async () => {
  try {
    if (!MyComponent) {
      const mod = await import("my-library")
      MyComponent = mod.VirtualList
    }
    return true
  } catch (err) {
    console.error("[my-library] Failed to load:", err)
    return false
  }
}
```

`create()` always calls `loadDependencies()` first and throws if it returns `false`:

```js
create: async (container, itemCount) => {
  const loaded = await loadDependencies()
  if (!loaded) throw new Error("my-library is not available")
  // … mount the list
}
```

### React `createRoot` CJS fallback

Bun's bundler wraps CommonJS modules via `__toESM`. On Firefox, the resulting getter-based proxy can lose `createRoot` from `react-dom/client`. All React adapters apply this fallback:

```js
const ReactDOMClient = await import("react-dom/client")
ReactDOM = ReactDOMClient.createRoot
  ? ReactDOMClient
  : (ReactDOMClient.default ?? ReactDOMClient)
```

---

## Current Adapters

### `react-window.js`

**Library:** react-window  
**Component:** `FixedSizeList`

Mounts a `FixedSizeList` with `height`, `itemCount`, `itemSize: ITEM_HEIGHT`, and `overscanCount: DEFAULT_OVERSCAN`. Each row is a `Row` component that renders the shared React children template. Returns the React root from `ReactDOM.createRoot()`.

`destroy()` calls `root.unmount()`.

---

### `tanstack-virtual.js`

**Library:** @tanstack/react-virtual  
**Hook:** `useVirtualizer`

TanStack Virtual requires a ref to the scroll container element. On Firefox, `useRef` is not populated before the first render cycle, causing `getScrollElement()` to return `null` and the virtualizer to crash. The adapter works around this using a **callback ref + `useState`** pattern:

```js
const [scrollEl, setScrollEl] = React.useState(null)
const refCallback = React.useCallback((node) => {
  parentRef.current = node
  setScrollEl(node)  // triggers re-render with the real element
}, [])
```

The virtualizer uses `getScrollElement: () => scrollEl` and renders an empty shell on the first pass (while `scrollEl` is null), then re-renders once the ref fires.

`destroy()` calls `root.unmount()`.

---

### `react-virtuoso.js`

**Library:** react-virtuoso  
**Component:** `Virtuoso`

Mounts a `Virtuoso` component with `totalCount`, `fixedItemHeight: ITEM_HEIGHT`, and `overscan: DEFAULT_OVERSCAN * ITEM_HEIGHT` (Virtuoso's `overscan` prop is in pixels, not item count). Each item is rendered by the `itemContent` prop using the shared React children template.

`destroy()` calls `root.unmount()`.

---

### `virtua.js`

**Library:** virtua  
**Component:** `VList`

Virtua's `<VList>` accepts React children directly rather than a render prop. The adapter pre-builds an array of `itemCount` React elements before mounting:

```js
const children = []
for (let i = 0; i < itemCount; i++) {
  children.push(React.createElement("div", { key: i, className: "bench-item", style: { height: ITEM_HEIGHT } },
    ...createRealisticReactChildren(React, i)
  ))
}
```

For large item counts (100K, 1M) this pre-build step is itself measurable time. This is by design — the initial render time includes all work required to display the list, including any data preparation the library requires.

`destroy()` calls `root.unmount()`.

---

### `legend-list.js`

**Library:** @legendapp/list  
**Component:** `LegendList`

Uses a `data` array with `renderItem` and `keyExtractor` props. `drawDistance` (the overscan equivalent) is set to `DEFAULT_OVERSCAN * ITEM_HEIGHT` pixels. `recycleItems: true` enables Legend List's item recycling mode.

`destroy()` calls `root.unmount()`.

---

### `vue-virtual-scroller.js`

**Library:** vue-virtual-scroller  
**Component:** `RecycleScroller`

Creates a wrapper `<div>` with fixed height and mounts a Vue 3 app into it. The app uses a string `template` option with the `<RecycleScroller>` component, which requires Vue's runtime compiler. The build system resolves `vue` to `vue/dist/vue.esm-bundler.js` (the compiler-included build) so template strings work without `.vue` SFC compilation.

Item data is pre-built as a plain array with display values pre-computed (initials, title, badge, time) since Vue string templates cannot call imported functions.

Returns `{ app, wrapper }`. `destroy()` calls `app.unmount()` and removes the wrapper element from its parent.

---

### `tanstack-solid-virtual.js`

**Library:** @tanstack/solid-virtual  
**Hook:** `createVirtualizer`

Uses Solid's imperative reactive APIs (`createSignal`, `createEffect`) with direct DOM manipulation — no JSX or Babel transform needed. The adapter:

1. Creates a reactive signal for the scroll element ref (starts `null`, set via `queueMicrotask` after mount)
2. Instantiates `createVirtualizer` with the reactive `scrollEl()` getter
3. Uses `createEffect` to reactively reconcile DOM nodes when `getVirtualItems()` or `getTotalSize()` change
4. Maintains a `Map<index, HTMLElement>` of rendered rows, diffing against the new virtual items each cycle

This exercises the real Solid reactive pipeline: scroll events → virtualizer updates its reactive store (`createStore` + `reconcile` internally) → `createEffect` fires → DOM nodes are added/removed/repositioned.

Uses `solid-js/web` `render()` to mount the reactive tree. Returns the dispose function. `destroy()` calls the dispose function.

---

### `clusterize.js`

**Library:** Clusterize.js  
**API:** Constructor

Clusterize.js requires all row HTML strings to be provided upfront and needs specific DOM structure with known element IDs. The adapter:

1. Creates a `scrollArea` div with a unique ID and appends a `contentArea` div inside it
2. Pre-generates all `itemCount` row HTML strings using `generateRealisticItemHTML()`
3. Constructs `new Clusterize({ rows, scrollId, contentId, rows_in_block: 50, blocks_in_cluster: 4 })`

IDs are generated using a module-level counter (`clusterize-1`, `clusterize-2`, …) to avoid conflicts between benchmark iterations.

**Note on initial render time:** Pre-generating HTML strings for large item counts (100K, 1M) is slow. This is reflected in Clusterize.js's render time metric — the benchmark correctly measures all work required to display the list.

Returns `{ clusterize, scrollArea, id }`. `destroy()` calls `clusterize.destroy(true)` (removes rows from DOM) and removes `scrollArea` from its parent.

---

### `react-virtualized.js`

**Library:** react-virtualized  
**Component:** `List`

Mounts the classic `List` component with `height`, `rowCount`, `rowHeight: ITEM_HEIGHT`, `overscanRowCount: DEFAULT_OVERSCAN`, and `width`. Each row is rendered by a `rowRenderer` function returning the shared React children template.

`destroy()` calls `root.unmount()`.

---

### `tanstack-vue-virtual.js`

**Library:** @tanstack/vue-virtual  
**Composable:** `useVirtualizer`

Creates a Vue 3 app using the Composition API. The `useVirtualizer` composable provides the reactive virtual items list. Uses a string template with the compiler-included Vue build. Item data is pre-computed in a plain array.

Returns `{ app, wrapper }`. `destroy()` calls `app.unmount()` and removes the wrapper.

---

### `vlist.js`

**Library:** @floor/vlist

Mounts the zero-dependency virtual list directly into the container using `createVList({ container, count, overscan, itemHeight, template })`. Uses `benchmarkTemplate` as the template function.

Returns the vlist instance. `destroy()` calls `instance.destroy()`.

---

### `vlist-react.js`

**Library:** vlist-react  
**Hook:** `useVList`

React hook wrapping the `@floor/vlist` engine. Renders items via the shared React children template. The hook manages the viewport ref internally.

`destroy()` calls `root.unmount()`.

---

### `vlist-vue.js`

**Library:** vlist-vue  
**Composable:** `useVList`

Vue 3 composable wrapping the `@floor/vlist` engine. Uses a string template with pre-computed item data.

Returns `{ app, wrapper }`. `destroy()` calls `app.unmount()` and removes the wrapper.

---

### `vlist-svelte.js`

**Library:** vlist-svelte  
**Action:** `use:vlist`

Svelte action wrapping the `@floor/vlist` engine. Since the benchmark runs outside Svelte's compiler, the adapter uses the action's imperative API directly.

Returns the action's destroy handle. `destroy()` calls the cleanup function.

---

### `vlist-solidjs.js`

**Library:** vlist-solidjs  
**Primitive:** `createVList`

SolidJS primitive wrapping the `@floor/vlist` engine. Uses `solid-js/web` `render()` with the reactive VList API.

Returns the dispose function. `destroy()` calls dispose.

---

## Adding a New Adapter

The complete step-by-step guide is in [adding-a-library.md](./adding-a-library.md). The short version:

1. Copy `benchmarks/libraries/_TEMPLATE.js` to `benchmarks/libraries/{slug}.js`
2. Implement `loadDependencies()`, `create()`, and `destroy()`
3. Use `ITEM_HEIGHT`, `DEFAULT_OVERSCAN`, and the shared template helpers
4. Import the new file in **both** `benchmarks/headless.js` and `benchmarks/compare.js`
5. Run `bun run build`

The `_TEMPLATE.js` file is fully documented with inline comments and examples for both React and vanilla patterns.

---

## Adapter Status

| Adapter | Status | Notes |
|---------|--------|-------|
| `react-window` | ✅ Implemented | |
| `react-virtualized` | ✅ Implemented | Classic List component |
| `react-virtuoso` | ✅ Implemented | |
| `tanstack-virtual` | ✅ Implemented | Firefox compat workaround included |
| `virtua` | ✅ Implemented | Pre-builds children array |
| `legend-list` | ✅ Implemented | Needs validation against actual package API |
| `vlist-react` | ✅ Implemented | useVList hook |
| `tanstack-vue-virtual` | ✅ Implemented | Vue 3 Composition API |
| `vue-virtual-scroller` | ✅ Implemented | |
| `vlist-vue` | ✅ Implemented | useVList composable |
| `tanstack-solid-virtual` | ✅ Implemented | Imperative reactive APIs (no JSX/Babel needed) |
| `vlist-solidjs` | ✅ Implemented | createVList primitive |
| `vlist-svelte` | ✅ Implemented | use:vlist action |
| `clusterize` | ✅ Implemented | Pre-generates all HTML upfront |
| `vlist` | ✅ Implemented | |