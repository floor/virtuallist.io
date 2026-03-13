# Styling

CSS is distributed across three locations, each serving a distinct purpose. There is no single global stylesheet — styles are co-located with the code that needs them.

---

## Three Layers

### 1. Critical CSS — `src/server/shell.ts`

Approximately 140 lines of CSS inlined in a `<style>` block inside every page's `<head>`. Delivered inline to prevent FOUC (flash of unstyled content) on first paint.

Covers:
- Box-model reset
- CSS custom property theme tokens (see below)
- `body` as flex column (footer sticks to bottom)
- Navigation header layout and styles
- Footer layout and styles
- Mobile breakpoint at 640px

This CSS applies to every page on the site. It cannot reference external resources.

### 2. Page-specific CSS — each page renderer

Each renderer in `src/server/pages/` defines its own CSS as a TypeScript string constant and passes it via the `extraHead` slot of `renderShell()`. It is injected as an inline `<style>` block in the page's `<head>`.

| Renderer | Constant | Covers |
|----------|----------|--------|
| `home.ts` | `HOME_CSS` | Hero, library grid, feature cards, how-it-works steps |
| `benchmarks.ts` | `BENCH_CSS` | Two-column layout, sidebar, benchmark UI components |
| `methodology.ts` | `METHODOLOGY_CSS` | Article typography, metric cards, tables, diagrams |

The methodology page does not load benchmark UI styles. The homepage does not load sidebar styles. Each page only gets the CSS it needs.

### 3. `dist/benchmarks/styles.css`

A linked external stylesheet referenced by all pages via:

```html
<link rel="stylesheet" href="/dist/benchmarks/styles.css">
```

Currently a placeholder. Intended for styles that must be shared across multiple benchmark pages and cannot be inlined (e.g. third-party library overrides that are injected at runtime by the benchmark engine). Built by `benchmarks/build.ts` — see [build.md](./build.md).

---

## Theme Tokens

All colors, radii, shadows, and spacing are defined as CSS custom properties on `:root` in the critical CSS. This makes the entire color system available to every inline `<style>` block and the external stylesheet without importing anything.

The theme is dark by default. There is no light mode toggle.

### Color tokens

| Token | Value | Role |
|-------|-------|------|
| `--bg` | `#0a0a0f` | Page background |
| `--bg-surface` | `#12121a` | Card and surface background |
| `--bg-elevated` | `#1a1a26` | Elevated surface (hover state of a surface) |
| `--bg-hover` | `#22222e` | Hover state background |
| `--border` | `#2a2a3a` | Standard border |
| `--border-subtle` | `#1e1e2e` | Subtle divider between elements |
| `--text` | `#e8e8f0` | Primary text |
| `--text-secondary` | `#9090a8` | Secondary text (descriptions, labels) |
| `--text-muted` | `#606078` | Muted text (timestamps, hints, disabled) |
| `--accent` | `#6c8cff` | Blue accent — links, active states, CTAs |
| `--accent-dim` | `#4a6ae0` | Darker blue — accent hover state |
| `--accent-glow` | `rgba(108,140,255,0.12)` | Accent background tint — active nav, badges |
| `--green` | `#4ade80` | Good metric rating |
| `--green-dim` | `rgba(74,222,128,0.12)` | Green background tint |
| `--yellow` | `#fbbf24` | Ok metric rating |
| `--yellow-dim` | `rgba(251,191,36,0.12)` | Yellow background tint |
| `--red` | `#f87171` | Bad metric rating / error state |
| `--red-dim` | `rgba(248,113,113,0.12)` | Red background tint |

### Spacing and shape tokens

| Token | Value | Role |
|-------|-------|------|
| `--radius` | `8px` | Standard border radius (buttons, tags, small cards) |
| `--radius-lg` | `12px` | Large border radius (cards, panels, viewports) |
| `--shadow` | `0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)` | Standard card shadow |
| `--shadow-lg` | `0 4px 12px rgba(0,0,0,0.4)` | Elevated card shadow |
| `--transition` | `150ms ease` | Standard transition duration and easing |
| `--max-width` | `1200px` | Content max width — used on all centred containers |

---

## BEM Naming

All class names use BEM (Block, Element, Modifier) convention.

```
.block
.block__element
.block--modifier
.block__element--modifier
```

### Class prefix reference

| Prefix | Where defined | What it covers |
|--------|--------------|----------------|
| `.site-header`, `.nav`, `.nav__*` | Critical CSS | Sticky navigation header |
| `.site-footer`, `.footer__*` | Critical CSS | Site footer |
| `.bench-layout`, `.bench-layout__*` | `BENCH_CSS` | Two-column page layout |
| `.sidebar`, `.sidebar__*` | `BENCH_CSS` | Library navigation sidebar |
| `.bench-overview`, `.bench-overview__*` | `BENCH_CSS` | Benchmark overview page content |
| `.bench-overview-card`, `.bench-overview-card__*` | `BENCH_CSS` | Library cards on overview |
| `.bench-page`, `.bench-header`, `.bench-header__*` | `BENCH_CSS` | Individual library page header |
| `.bench-controls`, `.bench-controls__*` | `BENCH_CSS` | Item count + stress controls bar |
| `.bench-suites`, `.bench-suite`, `.bench-suite__*` | `BENCH_CSS` | Benchmark result card injected by JS |
| `.bench-metric`, `.bench-metric__*` | `BENCH_CSS` | Individual metric value card |
| `.bench-item`, `.bench-item__*` | `BENCH_CSS` | Virtual list row template |
| `.bench-viewport`, `.bench-viewport__*` | `BENCH_CSS` | Live preview area during a run |
| `.bench-progress`, `.bench-progress__*` | `BENCH_CSS` | Progress bar below status text |
| `.bench-tag` | `BENCH_CSS` | Pill badge (ecosystem, npm package, browser) |
| `.ui-btn`, `.ui-btn--*` | `BENCH_CSS` | Run/Stop button |
| `.ui-segmented`, `.ui-segmented__btn` | `BENCH_CSS` | Segmented button group (counts, stress levels) |
| `.hero`, `.hero__*` | `HOME_CSS` | Homepage hero section |
| `.libs`, `.libs__*` | `HOME_CSS` | Homepage library grid |
| `.lib-card`, `.lib-card__*` | `HOME_CSS` | Library card on homepage |
| `.features`, `.features__*` | `HOME_CSS` | Feature cards section |
| `.feature-card`, `.feature-card__*` | `HOME_CSS` | Individual feature card |
| `.how-it-works`, `.steps`, `.step`, `.step__*` | `HOME_CSS` | How it works section |
| `.section-title`, `.section-desc` | `HOME_CSS` | Shared section heading styles |
| `.meth`, `.meth__*` | `METHODOLOGY_CSS` | Methodology page content |
| `.about-layout`, `.about-layout__content` | `ABOUT_CSS` | Two-column about section layout |
| `.about-sidebar`, `.about-sidebar__link` | `ABOUT_CSS` | About section left sidebar |
| `.about-page`, `.about-header`, `.about-header__*` | `ABOUT_CSS` | About page chrome and header |
| `.about-section`, `.about-section__title` | `ABOUT_CSS` | About section dividers |
| `.about-text`, `.about-link`, `.about-pre` | `ABOUT_CSS` | Body text, inline links, code blocks |
| `.about-cta-row`, `.about-cta-btn`, `.about-cta-btn--secondary` | `ABOUT_CSS` | CTA buttons on the About page |
| `.api-endpoint`, `.api-endpoint__header` | `ABOUT_CSS` | API endpoint cards (`/about/api`) |
| `.api-method`, `.api-method--get`, `.api-method--post` | `ABOUT_CSS` | HTTP method badges |
| `.api-path`, `.api-desc`, `.api-params`, `.api-param`, `.api-param__*` | `ABOUT_CSS` | Endpoint path, description, parameter rows |
| `.about-req-list`, `.about-req`, `.about-req__*` | `ABOUT_CSS` | Fairness requirements list (`/about/contribute`) |
| `.about-steps`, `.about-step`, `.about-step__*` | `ABOUT_CSS` | Numbered step cards |
| `.about-helpers`, `.about-helper`, `.about-helper__*` | `ABOUT_CSS` | Template helper reference cards |
| `.about-contrib-list`, `.about-contrib` | `ABOUT_CSS` | Other contributions list |

---

## Benchmark UI Components

These classes are used by both the server-rendered HTML (initial page shell) and the JavaScript that populates results at runtime. Both layers must use the same class names.

The about section classes (`.about-*`, `.api-*`) are used only server-side — the about pages ship no JavaScript.

### Metric cards

```
.bench-metric                          — base card
.bench-metric--good                    — green value
.bench-metric--ok                      — yellow value
.bench-metric--bad                     — red value
.bench-metric--empty                   — dimmed, value shows "—"
  .bench-metric__label                 — metric name (e.g. "Render")
  .bench-metric__value                 — numeric value
    .bench-metric__unit                — unit suffix (e.g. "ms")
  .bench-metric__meta                  — secondary note (e.g. "Chrome required")
```

Rating classes are applied by `script.js` via `renderMetrics()` based on the `rating` field in the result.

### Segmented buttons

```
.ui-segmented                          — container
  .ui-segmented__btn                   — individual button
  .ui-segmented__btn--active           — selected state
```

Active state is toggled by `script.js` click handlers. The server renders the first button with `--active` as the default.

### Bench item (virtual list row)

The `.bench-item` template is rendered inside the live preview viewport during a benchmark run. The same 7-element structure is produced by all four template helpers in `runner.js`:

```
.bench-item                            — row container (height: 48px)
  .bench-item__avatar                  — circular initials badge
  .bench-item__content                 — text content wrapper
    .bench-item__title                 — primary text
    .bench-item__sub                   — secondary text
  .bench-item__meta                    — right-aligned metadata
    .bench-item__badge                 — coloured status tag
    .bench-item__time                  — timestamp text
```

---

## Responsive Breakpoints

| Breakpoint | Applies to |
|-----------|-----------|
| `max-width: 900px` | Benchmark layout switches to single column; sidebar collapses to horizontal strip |
| `max-width: 640px` | Navigation logo text hidden; page padding reduced; homepage grids switch to single column |
| `max-width: 480px` | Metric grid switches from 2 columns to 1 column |

---

## Navigation: Glassmorphism Header

The sticky header uses `backdrop-filter: blur(12px)` with a semi-transparent background (`rgba(10, 10, 15, 0.85)`) to create a frosted-glass effect over page content as it scrolls underneath.

```css
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-subtle);
}
```

The `-webkit-` prefix is included for Safari compatibility.

---

## Typography

No external fonts are loaded. The font stack uses system fonts:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

For monospace (npm package names, code snippets):

```css
font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
```

Font sizes use a mix of fixed values and `clamp()` for the largest display text:

```css
/* Hero title */
font-size: clamp(2.5rem, 6vw, 4.5rem);

/* Hero subtitle */
font-size: clamp(1rem, 2vw, 1.2rem);
```

`clamp()` is used only for the largest headings where fluid sizing meaningfully improves the layout at intermediate viewport widths. Body text and UI elements use fixed sizes.