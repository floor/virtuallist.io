# virtuallist.io

Open-source benchmark platform for virtual list libraries.

**Live site:** [virtuallist.io](https://virtuallist.io)

## What is this?

virtuallist.io is a neutral benchmark hub for virtual list / virtual scroll libraries across React, Vue, SolidJS, Svelte, and Vanilla JS. Every library is treated as an equal — same test conditions, same DOM template, same measurement pipeline.

Unlike benchmarks published by individual library authors, virtuallist.io has no stake in which library "wins". The methodology is fully open for review, and library authors are actively encouraged to contribute.

## Libraries Benchmarked

### React
- [vlist-react](https://vlist.dev) — zero-dependency core, React binding
- [TanStack Virtual](https://tanstack.com/virtual) — headless `useVirtualizer` hook
- [react-window](https://react-window.vercel.app) — minimalist FixedSizeList / VariableSizeList
- [react-virtuoso](https://virtuoso.dev) — feature-rich with auto-height, groups, tables
- [Virtua](https://github.com/inokawa/virtua) — zero-config `<VList>` (~3 kB)
- [Legend List](https://github.com/LegendApp/legend-list) — item recycling, bidirectional infinite scroll

### Vue
- [vlist-vue](https://vlist.dev) — zero-dependency core, Vue binding
- [vue-virtual-scroller](https://github.com/Akryum/vue-virtual-scroller) — `<RecycleScroller>` with DOM recycling

### SolidJS
- [vlist-solidjs](https://vlist.dev) — zero-dependency core, SolidJS binding
- [TanStack Virtual (SolidJS)](https://tanstack.com/virtual) — `createVirtualizer` with fine-grained reactivity

### Svelte
- [vlist-svelte](https://vlist.dev) — zero-dependency core, Svelte binding

### Vanilla JS
- [VList (Vanilla)](https://vlist.dev) — pure JavaScript, zero dependencies
- [Clusterize.js](https://clusterize.js.org) — lightweight DOM virtualization

## Metrics

Every benchmark run produces **4 core metrics**:

| Metric | Unit | Better |
|--------|------|--------|
| Initial Render | ms | Lower |
| Memory Usage | MB | Lower |
| Scroll FPS | fps | Higher |
| P95 Frame Time | ms | Lower |

Scroll performance is tested at **7 progressive speeds** (720 px/s → 36,000 px/s) to expose performance cliffs invisible at a single speed.

## Methodology Highlights

- **Three-phase measurement** — Timing, memory, and scroll are isolated phases
- **5 render iterations** — Median reported to reduce noise
- **Up to 10 memory attempts** — Negative deltas (GC artifacts) rejected
- **Randomized execution order** — Coin flip per run eliminates JIT warmth bias
- **GC barriers** — `tryGC()` + `waitFrames(5)` between library runs
- **Identical DOM templates** — 7-element realistic item structure for all libraries
- **CPU stress testing** — Simulate real app overhead (0, 3, 5, 7 ms/frame)
- **Dual-loop scroll driver** — `setTimeout` scroll + `rAF` paint counter (separated for accuracy)

[Read the full methodology →](https://virtuallist.io/methodology)

## Crowdsourced Data

Every benchmark run is automatically stored in a SQLite database (fire-and-forget POST — never blocks the UI). The **[Results page](https://virtuallist.io/benchmarks/results)** aggregates this data into a leaderboard table showing median performance across all libraries, with confidence indicators based on sample count:

- 🟢 **High confidence** — ≥ 20 runs
- 🟡 **Moderate confidence** — 5–19 runs
- ⚪ **Low confidence** — < 5 runs

Results are filterable by item count (10K / 100K / 1M) and CPU stress level (0 / 3 / 5 / 7 ms). Column headers are sortable. Best-in-column values are highlighted.

## Tech Stack

- **Runtime:** [Bun](https://bun.sh) (TypeScript native)
- **Server:** Bun HTTP server (`Bun.serve`) — no framework
- **Rendering:** Server-rendered HTML — no client-side framework
- **Database:** SQLite via `bun:sqlite`
- **Bundler:** Bun bundler (for client-side benchmark JS)
- **Libraries:** Dynamic imports in the browser — each library is lazy-loaded

## Project Structure

```
virtuallist.io/
├── server.ts                  # Entry point — Bun HTTP server
├── src/
│   ├── server/
│   │   ├── config.ts          # Port, paths, site URL
│   │   ├── router.ts          # Main request router
│   │   ├── shell.ts           # HTML shell template (nav, footer, critical CSS)
│   │   ├── static.ts          # Static file resolver (dist/, public/)
│   │   ├── sitemap.ts         # Dynamic sitemap.xml + robots.txt
│   │   ├── registry.ts        # Library registry — central source of truth
│   │   └── pages/
│   │       ├── home.ts        # Homepage renderer
│   │       ├── benchmarks.ts  # Benchmark overview, individual, compare & results pages
│   │       └── methodology.ts # Methodology documentation page
│   └── api/
│       ├── router.ts          # API route dispatcher
│       └── benchmarks.ts      # Benchmark result storage + aggregation
├── benchmarks/
│   ├── runner.js              # Core measurement engine (library-agnostic)
│   ├── script.js              # Browser entry point — wires UI and runner
│   ├── compare.js             # Compare page — multi-library head-to-head
│   ├── results.js             # Results page — filter controls and column sorting
│   ├── build.ts               # Bun bundler build script
│   └── libraries/
│       ├── _TEMPLATE.js       # Template for new library adapters
│       ├── react-window.js    # react-window adapter
│       ├── tanstack-virtual.js
│       ├── react-virtuoso.js
│       ├── virtua.js
│       ├── legend-list.js
│       ├── vue-virtual-scroller.js
│       ├── tanstack-solid-virtual.js
│       ├── clusterize.js
│       ├── vlist.js           # VList (Vanilla)
│       ├── vlist-react.js
│       ├── vlist-vue.js
│       ├── vlist-solidjs.js
│       └── vlist-svelte.js
├── scripts/
│   └── seed-db.ts             # SQLite database setup
├── data/
│   └── benchmarks.db          # SQLite database (gitignored)
├── public/                    # Static assets (favicon, OG images, etc.)
└── dist/                      # Built assets — generated, gitignored
```

## Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.0

### Setup

```bash
# Install dependencies
bun install

# Create the SQLite database
bun run seed:db

# Build the benchmark bundle
bun run build

# Start the development server
bun run dev
```

Server starts at **http://localhost:3456**

### Available Routes

| Route | Description |
|-------|-------------|
| `/` | Homepage |
| `/benchmarks` | Benchmark overview (all libraries) |
| `/benchmarks/compare` | Head-to-head live comparison |
| `/benchmarks/results` | Crowdsourced aggregated results |
| `/benchmarks/{slug}` | Individual library benchmark |
| `/methodology` | Methodology documentation |
| `/api/benchmarks` | POST — store a result |
| `/api/benchmarks/stats` | GET — aggregated stats |
| `/api/benchmarks/history` | GET — time-series data |
| `/api/benchmarks/summary` | GET — high-level overview |
| `/api/health` | GET — server health check |

### Development Commands

```bash
bun run dev           # Build + start server with watch mode
bun run dev:full      # Build with watch + server watch (parallel)
bun run build         # Build benchmark bundle once
bun run build:bench   # Same as build
bun run start         # Start server (no build)
bun run seed:db       # Create SQLite database
bun run seed:db:force # Drop and recreate database
bun run test          # Run tests
bun run typecheck     # TypeScript type check
```

## Adding a New Library

1. **Add to registry** (`src/server/registry.ts`):

```typescript
{
  slug: "my-library",
  name: "My Library",
  tagline: "Short description of the library",
  ecosystem: "react",
  npm: "my-library",
  github: "https://github.com/author/my-library",
  npmUrl: "https://www.npmjs.com/package/my-library",
  enabled: true,
  order: 70,
}
```

2. **Install the package**:

```bash
bun add my-library
```

3. **Create a benchmark adapter** (`benchmarks/libraries/my-library.js`):

```javascript
import {
  defineLibrary,
  ITEM_HEIGHT,
  DEFAULT_OVERSCAN,
} from "../runner.js";

let MyComponent;

const loadDependencies = async () => {
  try {
    if (!MyComponent) {
      const mod = await import("my-library");
      MyComponent = mod.VirtualList;
    }
    return true;
  } catch (err) {
    return false;
  }
};

defineLibrary({
  slug: "my-library",
  name: "My Library",
  ecosystem: "react",

  create: async (container, itemCount) => {
    const loaded = await loadDependencies();
    if (!loaded) throw new Error("my-library not available");

    // mount the library...
    return instanceHandle;
  },

  destroy: async (instance) => {
    // unmount and clean up...
  },
});
```

4. **Import in script.js** (`benchmarks/script.js`):

```javascript
import "./libraries/my-library.js";
```

5. **Rebuild**:

```bash
bun run build
```

The library will automatically appear in the registry, sitemap, and all navigation.

See `benchmarks/libraries/_TEMPLATE.js` for a fully documented template.

## API Reference

### `POST /api/benchmarks`

Store a benchmark result. Called automatically by the benchmark runner — no manual action needed.

```json
{
  "librarySlug": "react-window",
  "libraryVersion": "1.8.10",
  "itemCount": 10000,
  "metrics": [
    { "label": "Render", "value": 8.5, "unit": "ms", "better": "lower", "rating": "good" },
    { "label": "Memory", "value": 2.26, "unit": "MB", "better": "lower", "rating": "ok" },
    { "label": "Scroll FPS", "value": 120.5, "unit": "fps", "better": "higher", "rating": "good" },
    { "label": "P95 Frame", "value": 9.1, "unit": "ms", "better": "lower", "rating": "good" }
  ],
  "duration": 45000,
  "success": true,
  "stressMs": 0,
  "userAgent": "...",
  "hardwareConcurrency": 10,
  "screenWidth": 1440,
  "screenHeight": 900
}
```

### `GET /api/benchmarks/stats`

Aggregated statistics for a library.

```
/api/benchmarks/stats?librarySlug=react-window&itemCount=10000
```

### `GET /api/benchmarks/history`

Time-series data for trend charts.

```
/api/benchmarks/history?librarySlug=react-window&metric=Render&days=90
```

## Contributing

Contributions are very welcome! This project is most valuable when it's comprehensive and fair.

**Ways to contribute:**
- Add a new library adapter
- Fix a measurement inaccuracy or bias
- Improve the methodology documentation
- Run benchmarks to grow the crowdsourced dataset
- Report issues with existing adapters

**Before submitting a PR:**
- Ensure the library adapter uses `ITEM_HEIGHT = 48px` (same as all other libraries)
- Ensure `DEFAULT_OVERSCAN = 5` is used where the library supports it
- Ensure the same 7-element DOM template is rendered
- Test that `destroy()` fully cleans up DOM, event listeners, and state
- Verify the library appears correctly in the benchmark UI

## License

MIT

## Acknowledgements

virtuallist.io was created by [Floor IO](https://floor.io) as a neutral benchmark resource for the virtual list ecosystem.

The benchmark methodology is derived from experience building [vlist.dev](https://vlist.dev), with adaptations to ensure every library is treated equally.
