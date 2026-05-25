# Library Registry

The registry (`src/server/registry.ts`) is the single source of truth for every library benchmarked on virtuallist.io. All other parts of the system — page renderers, sitemap, navigation sidebar, URL routing — derive their library data from this one file.

---

## What the Registry Controls

Adding an entry to the registry is sufficient to make a library appear in:

- The homepage library grid
- The benchmark overview page
- The benchmark sidebar navigation
- The individual library route (`/benchmarks/{slug}`)
- The sitemap
- The `robots.txt` disallow list (indirectly, via sitemap)

The only additional step required is creating a matching adapter file in `benchmarks/libraries/`. See [adding-a-library.md](./adding-a-library.md).

---

## `LibraryInfo` Interface

Every library entry is an object with these fields:

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `slug` | `string` | ✓ | URL-safe identifier. Used in routes (`/benchmarks/{slug}`), filenames (`benchmarks/libraries/{slug}.js`), and database records (`library_slug`). Lowercase letters, digits, and hyphens only. |
| `name` | `string` | ✓ | Display name with exact casing as the library uses it. |
| `tagline` | `string` | ✓ | One sentence describing the library's approach. Shown in cards and page headers. |
| `ecosystem` | `Ecosystem` | ✓ | Framework group. Controls which section the library appears in. |
| `npm` | `string` | ✓ | npm package name. Shown as a code label in cards. |
| `github` | `string` | ✓ | GitHub repository URL. Linked from individual library pages. |
| `npmUrl` | `string` | ✓ | Full `npmjs.com` URL. Linked from individual library pages. |
| `homepage` | `string` | — | Documentation or project homepage. Linked if present. |
| `bundleSizeKb` | `number` | — | Approximate gzipped bundle size in KB. Informational only — not used in measurements. |
| `enabled` | `boolean` | ✓ | `true` = visible everywhere. `false` = hidden from all UI without removing the entry. |
| `order` | `number` | ✓ | Sort position within the ecosystem group. Lower numbers appear first. |

### `Ecosystem` type

```ts
type Ecosystem = "react" | "vue" | "solid" | "svelte" | "vanilla" | "multi"
```

Ecosystems are displayed in this order: React → Vue → SolidJS → Svelte → Vanilla JS → Multi-Framework.

---

## Current Libraries (15)

### React

| Slug | Name | npm | Order |
|------|------|-----|-------|
| `legend-list` | Legend List | `@legendapp/list` | 10 |
| `react-virtuoso` | react-virtuoso | `react-virtuoso` | 20 |
| `react-window` | react-window | `react-window` | 30 |
| `react-virtualized` | react-virtualized | `react-virtualized` | 35 |
| `tanstack-virtual` | TanStack Virtual | `@tanstack/react-virtual` | 40 |
| `vlist-react` | VList (React) | `vlist-react` | 50 |
| `virtua` | Virtua | `virtua` | 60 |

### Vue

| Slug | Name | npm | Order |
|------|------|-----|-------|
| `tanstack-vue-virtual` | TanStack Virtual (Vue) | `@tanstack/vue-virtual` | 95 |
| `vlist-vue` | VList (Vue) | `vlist-vue` | 96 |
| `vue-virtual-scroller` | vue-virtual-scroller | `vue-virtual-scroller` | 100 |

### SolidJS

| Slug | Name | npm | Order |
|------|------|-----|-------|
| `tanstack-solid-virtual` | TanStack Virtual (SolidJS) | `@tanstack/solid-virtual` | 200 |
| `vlist-solidjs` | VList (SolidJS) | `vlist-solidjs` | 201 |

### Svelte

| Slug | Name | npm | Order |
|------|------|-----|-------|
| `vlist-svelte` | VList (Svelte) | `vlist-svelte` | 250 |

### Vanilla JS

| Slug | Name | npm | Order |
|------|------|-----|-------|
| `clusterize` | Clusterize.js | `clusterize.js` | 300 |
| `vlist` | vlist | `vlist` | 310 |

---

## Internal Indexes

The registry builds three indexes at module load time. They are never recomputed.

| Variable | Type | Purpose |
|----------|------|---------|
| `enabledLibraries` | `ReadonlyArray<LibraryInfo>` | All enabled libraries, sorted by `order` |
| `bySlug` | `Map<string, LibraryInfo>` | O(1) lookup by slug |
| `byEcosystem` | `Map<Ecosystem, LibraryInfo[]>` | Libraries grouped by ecosystem, for rendering grouped lists |

---

## Exported Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `getLibraries()` | `() → ReadonlyArray<LibraryInfo>` | All enabled libraries, sorted |
| `getAllLibraries()` | `() → ReadonlyArray<LibraryInfo>` | All libraries including disabled |
| `getLibrary(slug)` | `(string) → LibraryInfo \| undefined` | Single lookup by slug — used by the router to validate URLs |
| `getLibrarySlugs()` | `() → string[]` | Slugs only — used by the sitemap generator |
| `getLibrariesByEcosystem()` | `() → Map<Ecosystem, LibraryInfo[]>` | Grouped — used by page renderers for ecosystem sections |
| `getEcosystemLabel(ecosystem)` | `(Ecosystem) → string` | Human-readable label: `"react"` → `"React"`, `"solid"` → `"SolidJS"`, etc. |
| `getLibraryCount()` | `() → number` | Total enabled count — used in homepage subtitle |

---

## Disabling a Library Without Removing It

Set `enabled: false` on the entry. The library will disappear from all navigation, cards, and the sitemap. Its data remains in the database. The route `/benchmarks/{slug}` returns 404.

This is useful when a library's adapter is broken or the package is abandoned, without losing the historical benchmark data.

---

## Ordering Within an Ecosystem

The `order` field controls sort position within each ecosystem group. Gaps between values are intentional — they leave room to insert new libraries between existing ones without renumbering.

Current gap pattern:
- React libraries: 10, 20, 30, 35, 40, 50, 60 → next available: 70
- Vue: 95, 96, 100 → next: 110
- SolidJS: 200, 201 → next: 210
- Svelte: 250 → next: 260
- Vanilla: 300, 310 → next: 320

To add a library between two existing ones, choose a value between their `order` numbers.
