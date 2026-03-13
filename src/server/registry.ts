// src/server/registry.ts
// Library Registry — central definition of all virtual list libraries.
//
// Every library is a peer — no library gets special treatment.
// This registry is the single source of truth for:
//   - Library metadata (name, slug, ecosystem, links)
//   - Benchmark page generation (sitemap, navigation, slugs)
//   - Library-specific configuration (item height, overscan, etc.)
//
// To add a new library:
//   1. Add an entry to LIBRARIES below
//   2. Create benchmarks/libraries/{slug}.js with the benchmark implementation
//   3. Rebuild: bun run build:bench

// =============================================================================
// Types
// =============================================================================

export type Ecosystem =
  | "react"
  | "vue"
  | "solid"
  | "svelte"
  | "vanilla"
  | "multi";

export interface LibraryInfo {
  /** URL-safe slug — used in routes, filenames, and DB records. */
  slug: string;

  /** Display name (exact casing as the library uses). */
  name: string;

  /** Short tagline describing the library's approach. */
  tagline: string;

  /** Primary framework ecosystem. */
  ecosystem: Ecosystem;

  /** npm package name (for install commands and version resolution). */
  npm: string;

  /** GitHub repository URL. */
  github: string;

  /** npm URL. */
  npmUrl: string;

  /** Homepage or documentation URL (optional). */
  homepage?: string;

  /**
   * Approximate gzipped bundle size in KB.
   * Updated periodically — not authoritative, just indicative.
   */
  bundleSizeKb?: number;

  /**
   * Whether this library is currently enabled for benchmarking.
   * Set to false to hide from the UI without removing the entry.
   */
  enabled: boolean;

  /**
   * Sort order for display. Lower numbers appear first.
   * Libraries within the same ecosystem are grouped together.
   */
  order: number;
}

// =============================================================================
// Library Definitions
// =============================================================================

const LIBRARIES: LibraryInfo[] = [
  // ── React Ecosystem ─────────────────────────────────────────────────────
  {
    slug: "legend-list",
    name: "Legend List",
    tagline:
      "High-performance list with item recycling and bidirectional infinite scroll",
    ecosystem: "react",
    npm: "@legendapp/list",
    github: "https://github.com/LegendApp/legend-list",
    npmUrl: "https://www.npmjs.com/package/@legendapp/list",
    enabled: true,
    order: 10,
  },
  {
    slug: "react-virtuoso",
    name: "react-virtuoso",
    tagline:
      "Feature-rich React virtualization with auto-height, groups, and table support",
    ecosystem: "react",
    npm: "react-virtuoso",
    github: "https://github.com/petyosi/react-virtuoso",
    npmUrl: "https://www.npmjs.com/package/react-virtuoso",
    homepage: "https://virtuoso.dev",
    enabled: true,
    order: 20,
  },
  {
    slug: "react-window",
    name: "react-window",
    tagline:
      "Minimalist windowed list components (FixedSizeList, VariableSizeList)",
    ecosystem: "react",
    npm: "react-window",
    github: "https://github.com/bvaughn/react-window",
    npmUrl: "https://www.npmjs.com/package/react-window",
    homepage: "https://react-window.vercel.app",
    enabled: true,
    order: 30,
  },
  {
    slug: "tanstack-virtual",
    name: "TanStack Virtual",
    tagline: "Headless virtualizer hook (useVirtualizer) for React",
    ecosystem: "react",
    npm: "@tanstack/react-virtual",
    github: "https://github.com/TanStack/virtual",
    npmUrl: "https://www.npmjs.com/package/@tanstack/react-virtual",
    homepage: "https://tanstack.com/virtual",
    enabled: true,
    order: 40,
  },
  {
    slug: "virtua",
    name: "Virtua",
    tagline: "Zero-config <VList> component (~3 kB per entry point)",
    ecosystem: "react",
    npm: "virtua",
    github: "https://github.com/inokawa/virtua",
    npmUrl: "https://www.npmjs.com/package/virtua",
    enabled: true,
    order: 60,
  },

  // ── Vue Ecosystem ───────────────────────────────────────────────────────
  {
    slug: "vue-virtual-scroller",
    name: "vue-virtual-scroller",
    tagline: "RecycleScroller component with DOM recycling for Vue 3",
    ecosystem: "vue",
    npm: "vue-virtual-scroller",
    github: "https://github.com/Akryum/vue-virtual-scroller",
    npmUrl: "https://www.npmjs.com/package/vue-virtual-scroller",
    enabled: true,
    order: 100,
  },

  // ── SolidJS Ecosystem ──────────────────────────────────────────────────
  {
    slug: "tanstack-solid-virtual",
    name: "TanStack Virtual (SolidJS)",
    tagline: "createVirtualizer with fine-grained SolidJS reactivity",
    ecosystem: "solid",
    npm: "@tanstack/solid-virtual",
    github: "https://github.com/TanStack/virtual",
    npmUrl: "https://www.npmjs.com/package/@tanstack/solid-virtual",
    homepage: "https://tanstack.com/virtual",
    enabled: true,
    order: 200,
  },

  // ── Vanilla / Framework-agnostic ──────────────────────────────────────
  {
    slug: "clusterize",
    name: "Clusterize.js",
    tagline: "Lightweight DOM virtualization requiring all row HTML upfront",
    ecosystem: "vanilla",
    npm: "clusterize.js",
    github: "https://github.com/NeXTs/Clusterize.js",
    npmUrl: "https://www.npmjs.com/package/clusterize.js",
    homepage: "https://clusterize.js.org",
    enabled: true,
    order: 300,
  },
  {
    slug: "vlist",
    name: "VList",
    tagline:
      "Zero-dependency virtual list — pure JavaScript, no framework required",
    ecosystem: "vanilla",
    npm: "@floor/vlist",
    github: "https://github.com/floor/vlist",
    npmUrl: "https://www.npmjs.com/package/@floor/vlist",
    homepage: "https://vlist.dev",
    enabled: true,
    order: 310,
  },
];

// =============================================================================
// Indexes (built once at startup)
// =============================================================================

/** All libraries (including disabled). */
const allLibraries: ReadonlyArray<LibraryInfo> = LIBRARIES;

/** Enabled libraries, sorted by order. */
const enabledLibraries: ReadonlyArray<LibraryInfo> = LIBRARIES.filter(
  (lib) => lib.enabled,
).sort((a, b) => a.order - b.order);

/** Slug → LibraryInfo lookup. */
const bySlug = new Map<string, LibraryInfo>(
  LIBRARIES.map((lib) => [lib.slug, lib]),
);

/** Ecosystem → LibraryInfo[] lookup (enabled only). */
const byEcosystem = new Map<Ecosystem, LibraryInfo[]>();
for (const lib of enabledLibraries) {
  const list = byEcosystem.get(lib.ecosystem) ?? [];
  list.push(lib);
  byEcosystem.set(lib.ecosystem, list);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get all enabled libraries, sorted by display order.
 */
export function getLibraries(): ReadonlyArray<LibraryInfo> {
  return enabledLibraries;
}

/**
 * Get all libraries including disabled ones.
 */
export function getAllLibraries(): ReadonlyArray<LibraryInfo> {
  return allLibraries;
}

/**
 * Look up a library by its URL slug.
 * Returns undefined if the slug doesn't match any library.
 */
export function getLibrary(slug: string): LibraryInfo | undefined {
  return bySlug.get(slug);
}

/**
 * Get all enabled library slugs (for sitemap, routing, etc.).
 */
export function getLibrarySlugs(): string[] {
  return enabledLibraries.map((lib) => lib.slug);
}

/**
 * Get enabled libraries grouped by ecosystem, in display order.
 */
export function getLibrariesByEcosystem(): Map<Ecosystem, LibraryInfo[]> {
  return byEcosystem;
}

/**
 * Get the display label for an ecosystem.
 */
export function getEcosystemLabel(ecosystem: Ecosystem): string {
  switch (ecosystem) {
    case "react":
      return "React";
    case "vue":
      return "Vue";
    case "solid":
      return "SolidJS";
    case "svelte":
      return "Svelte";
    case "vanilla":
      return "Vanilla JS";
    case "multi":
      return "Multi-Framework";
  }
}

/**
 * Get the total count of enabled libraries.
 */
export function getLibraryCount(): number {
  return enabledLibraries.length;
}
