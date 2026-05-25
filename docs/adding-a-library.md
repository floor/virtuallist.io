# Adding a Library

This guide walks through every step required to add a new virtual list library to virtuallist.io. When complete, the library will appear in every part of the site — homepage grid, benchmark overview, sidebar navigation, individual benchmark page, and sitemap — and its results will be stored in the database alongside all others.

---

## Overview

Four things need to happen:

1. Register the library in `src/server/registry.ts`
2. Install the npm package
3. Create a benchmark adapter in `benchmarks/libraries/{slug}.js`
4. Import the adapter in **both** `benchmarks/headless.js` and `benchmarks/compare.js`

Then rebuild: `bun run build`.

---

## Step 1 — Register in the Registry

Open `src/server/registry.ts` and add an entry to the `LIBRARIES` array.

```js
{
  slug: "my-library",
  name: "My Library",
  tagline: "One sentence describing the library's approach.",
  ecosystem: "react",
  npm: "my-library",
  github: "https://github.com/author/my-library",
  npmUrl: "https://www.npmjs.com/package/my-library",
  homepage: "https://my-library.dev",   // optional
  enabled: true,
  order: 70,
}
```

### Choosing a slug

The slug is used in the URL (`/benchmarks/my-library`), the adapter filename (`benchmarks/libraries/my-library.js`), and the database (`library_slug` column). Rules:

- Lowercase letters, digits, and hyphens only: `[a-z0-9-]+`
- Must be unique across all entries
- Should match or closely resemble the npm package name

### Choosing an ecosystem

| Value | Use for |
|-------|---------|
| `"react"` | React hooks/components |
| `"vue"` | Vue 3 components |
| `"solid"` | SolidJS primitives/components |
| `"svelte"` | Svelte components |
| `"vanilla"` | No framework — plain JavaScript |
| `"multi"` | Framework-agnostic with multiple entry points |

### Choosing an order

The `order` field controls sort position within the ecosystem group. Use the existing values as a guide and leave gaps for future insertions:

| Ecosystem | Existing range | Next available |
|-----------|---------------|---------------|
| React | 10–60 | 70 |
| Vue | 100–110 | 120 |
| SolidJS | 200–210 | 220 |
| Svelte | 300 | 310 |
| Vanilla JS | 400–410 | 420 |

To insert between two existing libraries, choose any integer between their `order` values.

---

## Step 2 — Install the Package

```bash
bun add my-library
```

If the library has peer dependencies (React, Vue, SolidJS), they are already present in `package.json` — do not add them again.

After installing, commit both `package.json` and `bun.lock`.

---

## Step 3 — Create the Adapter

Copy the template to get started:

```bash
cp benchmarks/libraries/_TEMPLATE.js benchmarks/libraries/my-library.js
```

Open the new file and implement three things: `loadDependencies()`, `create()`, and `destroy()`.

### Minimum viable adapter

```js
import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
} from "../runner.js";

let MyVirtualList;

const loadDependencies = async () => {
  try {
    if (!MyVirtualList) {
      const mod = await import("my-library");
      MyVirtualList = mod.VirtualList;
    }
    return true;
  } catch (err) {
    console.error("[my-library] Failed to load:", err);
    return false;
  }
};

defineLibrary({
  slug: "my-library",
  name: "My Library",
  ecosystem: "react",

  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) throw new Error("my-library is not available");

    // Mount the library here.
    // Return an instance handle — whatever destroy() needs.
    return instance;
  },

  destroy: async (instance) => {
    // Fully unmount and clean up.
  },
});
```

### `create(container, itemCount)`

- `container` is the DOM element to render into. It has `width: 100%`, `height: 100%`, `position: relative`, `overflow: hidden`.
- `itemCount` is the number of items to display (10,000, 100,000, or 1,000,000).
- Return value is passed back to `destroy()`. Return anything useful for cleanup — a React root, a Vue app instance, a dispose function, or the library's own instance object.

### `destroy(instance)`

- Must fully unmount the component and remove all DOM nodes that were added outside `container`.
- Must not throw if `instance` is null or undefined (this is called defensively in some error paths).
- After `destroy()` returns, the benchmark engine sets `container.innerHTML = ""` and calls `tryGC()`.

---

## Fairness Requirements

These constraints are **non-negotiable**. They ensure all libraries are measured under identical conditions.

### Item height

Always use `ITEM_HEIGHT` (48 px) for row height. Hard-coding a different value makes the benchmark unfair.

```js
// ✅ correct
itemSize: ITEM_HEIGHT

// ❌ wrong
itemSize: 50
```

### Overscan

Use `DEFAULT_OVERSCAN` (5 items) wherever the library accepts an overscan configuration. If the library uses pixels instead of item counts, convert: `DEFAULT_OVERSCAN * ITEM_HEIGHT`.

```js
// item-count overscan
overscanCount: DEFAULT_OVERSCAN

// pixel-based overscan
overscan: DEFAULT_OVERSCAN * ITEM_HEIGHT
```

If the library does not expose overscan configuration, document this in the adapter file with a comment.

### DOM template

Use one of the four shared helpers from `runner.js`. **Do not write a custom item template.** All libraries must render the same 7-element DOM structure.

| Helper | Use when |
|--------|---------|
| `benchmarkTemplate(_item, index)` | Library accepts an HTML string template function |
| `createRealisticReactChildren(React, index)` | React-based library |
| `populateRealisticDOMChildren(el, index)` | Library provides a DOM element to populate |
| `generateRealisticItemHTML(index, height)` | Library requires pre-built HTML strings (rare) |

### Container height

Use `container.clientHeight || 600` for the viewport height. This matches the visible benchmark area that the engine uses for scroll measurement.

```js
height: container.clientHeight || 600
```

---

## Common Patterns by Ecosystem

### React

```js
import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  createRealisticReactChildren,
} from "../runner.js";

let React, ReactDOM, VirtualList;

const loadDependencies = async () => {
  try {
    if (!React) {
      React = await import("react");

      const ReactDOMClient = await import("react-dom/client");
      // Bun's bundler wraps CJS via __toESM — Firefox loses createRoot on the proxy.
      // Fall back to .default to get the original exports object.
      ReactDOM = ReactDOMClient.createRoot
        ? ReactDOMClient
        : (ReactDOMClient.default ?? ReactDOMClient);

      const mod = await import("my-library");
      VirtualList = mod.VirtualList;
    }
    return true;
  } catch (err) {
    console.error("[my-library] Failed to load:", err);
    return false;
  }
};

defineLibrary({
  slug: "my-library",
  name: "My Library",
  ecosystem: "react",

  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) throw new Error("my-library is not available");

    const listComponent = React.createElement(VirtualList, {
      height: container.clientHeight || 600,
      itemCount,
      itemSize: ITEM_HEIGHT,
      overscanCount: DEFAULT_OVERSCAN,
      width: "100%",
      children: ({ index, style }) =>
        React.createElement(
          "div",
          { className: "bench-item", style },
          ...createRealisticReactChildren(React, index),
        ),
    });

    const root = ReactDOM.createRoot(container);
    root.render(listComponent);
    return root;
  },

  destroy: async (root) => {
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
  },
});
```

### Vue 3

```js
import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  ITEM_NAMES,
  ITEM_BADGES,
} from "../runner.js";

let Vue, VirtualList;

const loadDependencies = async () => {
  try {
    if (!Vue) {
      // Vue must resolve to the compiler-included build so string templates work.
      // This is handled by the build system's framework dedupe plugin.
      Vue = await import("vue");
      const mod = await import("my-library");
      VirtualList = mod.VirtualList;
    }
    return true;
  } catch (err) {
    console.error("[my-library] Failed to load:", err);
    return false;
  }
};

defineLibrary({
  slug: "my-library",
  name: "My Library",
  ecosystem: "vue",

  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) throw new Error("my-library is not available");

    // Pre-compute display data — Vue string templates can't call imported functions.
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

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `height:${container.clientHeight || 600}px;width:100%;overflow:hidden;`;
    container.appendChild(wrapper);

    const app = Vue.createApp({
      components: { VirtualList },
      data() { return { items, itemHeight: ITEM_HEIGHT }; },
      template: `
        <VirtualList :items="items" :item-size="itemHeight" style="height:100%;width:100%;" v-slot="{ item }">
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
        </VirtualList>
      `,
    });

    app.mount(wrapper);
    return { app, wrapper };
  },

  destroy: async (instance) => {
    if (!instance) return;
    if (instance.app) instance.app.unmount();
    if (instance.wrapper?.parentNode) {
      instance.wrapper.parentNode.removeChild(instance.wrapper);
    }
  },
});
```

### Vanilla JS

```js
import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
  populateRealisticDOMChildren,
} from "../runner.js";

let VirtualList;

const loadDependencies = async () => {
  try {
    if (!VirtualList) {
      const mod = await import("my-library");
      VirtualList = mod.VirtualList;
    }
    return true;
  } catch (err) {
    console.error("[my-library] Failed to load:", err);
    return false;
  }
};

defineLibrary({
  slug: "my-library",
  name: "My Library",
  ecosystem: "vanilla",

  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) throw new Error("my-library is not available");

    const instance = new VirtualList(container, {
      height: container.clientHeight || 600,
      itemCount,
      itemHeight: ITEM_HEIGHT,
      overscan: DEFAULT_OVERSCAN,
      renderItem(el, index) {
        el.className = "bench-item";
        populateRealisticDOMChildren(el, index);
      },
    });

    return instance;
  },

  destroy: async (instance) => {
    if (instance && typeof instance.destroy === "function") {
      instance.destroy();
    }
  },
});
```

---

## Step 4 — Import in headless.js and compare.js

Open **both** `benchmarks/headless.js` and `benchmarks/compare.js` and add an import in the adapter import block of each file:

```js
// existing imports
import "./libraries/react-window.js";
import "./libraries/tanstack-virtual.js";
// …

// add your library
import "./libraries/my-library.js";
```

The import causes `defineLibrary()` to run at module evaluation time, registering the adapter with the engine before any benchmark starts. Both entry points must import every adapter — `headless.js` is injected into Puppeteer for server-side benchmark execution, and `compare.js` runs client-side comparisons on the `/benchmarks/compare` page.

Note: `script.js` (individual library pages) does **not** import adapters. It triggers server-side runs via `POST /api/run` and streams progress via SSE.

---

## Step 5 — Rebuild

```bash
bun run build
```

Then start the dev server:

```bash
bun run dev
```

Open `http://localhost:3456/benchmarks/my-library` and click Run to verify the benchmark works.

---

## Verification Checklist

Before submitting a PR:

- [ ] Library appears on the homepage grid at `http://localhost:3456`
- [ ] Library appears in the sidebar on `http://localhost:3456/benchmarks`
- [ ] `/benchmarks/my-library` returns 200, not 404
- [ ] Clicking Run starts the benchmark without a console error
- [ ] All five core metrics complete: Render, Memory, Scroll FPS, P95 Frame, Jump
- [ ] The benchmark completes cleanly without hanging
- [ ] `/sitemap.xml` includes the new library's URL
- [ ] `ITEM_HEIGHT = 48` is used (grep the adapter for hard-coded heights)
- [ ] `DEFAULT_OVERSCAN = 5` is used (or `DEFAULT_OVERSCAN * ITEM_HEIGHT` for pixel-based overscan)
- [ ] One of the four shared template helpers is used — no custom item template
- [ ] `destroy()` leaves no orphan DOM nodes (inspect the benchmark container in DevTools after a run)
- [ ] Library appears in the selector dropdowns on `http://localhost:3456/benchmarks/compare`
- [ ] Selecting the library in a compare slot and clicking Run Comparison benchmarks it correctly

---

## Disabling a Library Temporarily

If a library's adapter is broken, set `enabled: false` in the registry entry. The library disappears from all navigation and its route returns 404, but its historical data remains in the database.

```js
{
  slug: "my-library",
  // …
  enabled: false,   // hidden from UI, data preserved
}
```

Set it back to `true` when the adapter is fixed.

---

## Further Reading

- [library-adapters.md](./library-adapters.md) — How adapters work; notes on each existing adapter
- [benchmark-engine.md](./benchmark-engine.md) — The full measurement pipeline that adapters plug into
- [registry.md](./registry.md) — Registry interface and field reference
- [build.md](./build.md) — Framework deduplification and build options