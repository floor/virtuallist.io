# virtuallist.io — Documentation

Independent, open-source benchmark platform for virtual list libraries.

---

## Documents

| File | What it covers |
|------|---------------|
| [architecture.md](./architecture.md) | Repository structure, tech stack, request flow overview |
| [server.md](./server.md) | Server entry point, router, config, shell template, static files, sitemap |
| [registry.md](./registry.md) | Library registry — the central source of truth for all benchmarked libraries |
| [pages.md](./pages.md) | Page renderers: homepage, benchmark overview, individual library pages, compare, results, methodology, about section |
| [api.md](./api.md) | REST API: endpoints, validation, rate limiting, storage, aggregation queries |
| [benchmark-engine.md](./benchmark-engine.md) | Server-side Puppeteer runner: measurement pipeline, intensity presets, five phases |
| [library-adapters.md](./library-adapters.md) | How adapters work, all 15 current adapters, fairness requirements |
| [database.md](./database.md) | SQLite schema, indexes, seed script |
| [build.md](./build.md) | Bun bundler build, framework deduplication, watch mode |
| [styling.md](./styling.md) | CSS strategy, theme tokens, BEM naming, page-specific styles |
| [adding-a-library.md](./adding-a-library.md) | Step-by-step guide for adding a new library benchmark |
| [development.md](./development.md) | Local setup, scripts reference, development notes |
| [deployment.md](./deployment.md) | PM2 config, environment variables, Nginx setup |
| [decisions.md](./decisions.md) | Key design decisions and the reasoning behind them |
| [roadmap.md](./roadmap.md) | Known gaps, unfinished adapters, next steps |

---

## Quick Start

```bash
bun install
bun run seed:db
bun run build
bun run dev
# → http://localhost:3456
```

See [development.md](./development.md) for the full workflow.