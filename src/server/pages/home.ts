// src/server/pages/home.ts
// Homepage renderer — landing page for virtuallist.io.
//
// Renders:
//   - Hero section with tagline and CTA
//   - Library grid showing all benchmarked libraries by ecosystem
//   - Feature highlights (methodology, crowdsourced data, open source)
//   - Quick stats

import { SITE } from "../config";
import { renderShell } from "../shell";
import {
  getLibraries,
  getLibrariesByEcosystem,
  getEcosystemLabel,
  getLibraryCount,
  type LibraryInfo,
  type Ecosystem,
} from "../registry";

// =============================================================================
// Cache
// =============================================================================

let cachedHtml: string | null = null;

export function clearHomeCache(): void {
  cachedHtml = null;
}

// =============================================================================
// Content Builders
// =============================================================================

function buildHero(): string {
  const count = getLibraryCount();

  return `
    <section class="hero">
      <div class="hero__inner">
        <div class="hero__badge">Open Source · Independent · Transparent</div>
        <h1 class="hero__title">Virtual List<br>Benchmarks</h1>
        <p class="hero__subtitle">
          Fair, transparent performance benchmarks for <strong>${count} virtual list libraries</strong>
          across React, Vue, SolidJS, Svelte, and Vanilla JS.
          Every benchmark runs live in your browser — no pre-recorded results, no bias.
        </p>
        <div class="hero__actions">
          <a href="/benchmarks" class="hero__btn hero__btn--primary">Run Benchmarks</a>
          <a href="/methodology" class="hero__btn hero__btn--secondary">Methodology</a>
        </div>
      </div>
    </section>`;
}

function buildLibraryCard(lib: LibraryInfo): string {
  return `
        <a href="/benchmarks/${lib.slug}" class="lib-card">
          <div class="lib-card__header">
            <span class="lib-card__name">${escapeHtml(lib.name)}</span>
          </div>
          <p class="lib-card__tagline">${escapeHtml(lib.tagline)}</p>
          <div class="lib-card__links">
            <span class="lib-card__npm">${escapeHtml(lib.npm)}</span>
          </div>
        </a>`;
}

function buildLibraryGrid(): string {
  const byEcosystem = getLibrariesByEcosystem();

  // Render order for ecosystems
  const ecosystemOrder: Ecosystem[] = [
    "react",
    "vue",
    "solid",
    "svelte",
    "vanilla",
    "multi",
  ];

  const sections: string[] = [];

  for (const eco of ecosystemOrder) {
    const libs = byEcosystem.get(eco);
    if (!libs || libs.length === 0) continue;

    const label = getEcosystemLabel(eco);
    const cards = libs.map(buildLibraryCard).join("");

    sections.push(`
      <div class="libs__ecosystem">
        <h3 class="libs__ecosystem-label">${label}</h3>
        <div class="libs__grid">
          ${cards}
        </div>
      </div>`);
  }

  return `
    <section class="libs">
      <div class="libs__inner">
        <h2 class="section-title">Libraries</h2>
        <p class="section-desc">
          Every library is treated equally — same test conditions, same DOM structure, same measurement pipeline.
          Click any library to run its benchmark.
        </p>
        ${sections.join("")}
      </div>
    </section>`;
}

function buildFeatures(): string {
  return `
    <section class="features">
      <div class="features__inner">
        <h2 class="section-title">Why virtuallist.io?</h2>
        <div class="features__grid">

          <div class="feature-card">
            <div class="feature-card__icon">🎯</div>
            <h3 class="feature-card__title">Fair Methodology</h3>
            <p class="feature-card__desc">
              Randomized execution order, GC barriers between runs, identical DOM templates.
              No library gets an unfair advantage from JIT warmth or GC timing.
            </p>
          </div>

          <div class="feature-card">
            <div class="feature-card__icon">🌍</div>
            <h3 class="feature-card__title">Crowdsourced Data</h3>
            <p class="feature-card__desc">
              Every benchmark run is automatically stored and aggregated.
              See real-world performance across different hardware, browsers, and versions.
            </p>
          </div>

          <div class="feature-card">
            <div class="feature-card__icon">📊</div>
            <h3 class="feature-card__title">4 Key Metrics</h3>
            <p class="feature-card__desc">
              Initial render time, memory usage, scroll FPS, and P95 frame time.
              Comprehensive performance profiling in under 30 seconds.
            </p>
          </div>

          <div class="feature-card">
            <div class="feature-card__icon">🔬</div>
            <h3 class="feature-card__title">Stress Testing</h3>
            <p class="feature-card__desc">
              Simulate real application overhead by burning CPU per frame.
              See which libraries hold up under pressure when your app does real work.
            </p>
          </div>

          <div class="feature-card">
            <div class="feature-card__icon">⚡</div>
            <h3 class="feature-card__title">7 Scroll Speeds</h3>
            <p class="feature-card__desc">
              From 720 px/s crawl to 36,000 px/s extreme stress.
              Progressive speed testing reveals performance cliffs invisible at a single speed.
            </p>
          </div>

          <div class="feature-card">
            <div class="feature-card__icon">🔓</div>
            <h3 class="feature-card__title">Open Source</h3>
            <p class="feature-card__desc">
              Every line of measurement code is open for review.
              Library authors are welcome to contribute and ensure fair representation.
            </p>
          </div>

        </div>
      </div>
    </section>`;
}

function buildHowItWorks(): string {
  return `
    <section class="how-it-works">
      <div class="how-it-works__inner">
        <h2 class="section-title">How It Works</h2>
        <div class="steps">
          <div class="step">
            <div class="step__number">1</div>
            <div class="step__content">
              <h3 class="step__title">Choose Libraries</h3>
              <p class="step__desc">Select any library to benchmark it. Each benchmark tests the library in isolation.</p>
            </div>
          </div>
          <div class="step">
            <div class="step__number">2</div>
            <div class="step__content">
              <h3 class="step__title">Run in Your Browser</h3>
              <p class="step__desc">Benchmarks execute live using real DOM operations — no simulated or pre-recorded data.</p>
            </div>
          </div>
          <div class="step">
            <div class="step__number">3</div>
            <div class="step__content">
              <h3 class="step__title">Compare Results</h3>
              <p class="step__desc">View side-by-side metrics with percentage differences and quality ratings.</p>
            </div>
          </div>
          <div class="step">
            <div class="step__number">4</div>
            <div class="step__content">
              <h3 class="step__title">Contribute Data</h3>
              <p class="step__desc">Results are automatically stored for crowdsourced aggregation across devices and browsers.</p>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

// =============================================================================
// Page Assembly
// =============================================================================

function buildPageContent(): string {
  return [
    buildHero(),
    buildLibraryGrid(),
    buildFeatures(),
    buildHowItWorks(),
  ].join("\n");
}

// =============================================================================
// Public API
// =============================================================================

export function renderHomepage(): Response {
  if (!cachedHtml) {
    const content = buildPageContent();

    cachedHtml = renderShell({
      title: "virtuallist.io — Independent Virtual List Benchmarks",
      description:
        "Fair, transparent performance benchmarks for virtual list libraries. " +
        "Compare React, Vue, SolidJS, Svelte, and Vanilla JS implementations with live browser tests.",
      url: `${SITE}/`,
      content,
      activeNav: undefined,
      extraHead: `<style>${HOME_CSS}</style>`,
    });
  }

  return new Response(cachedHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}

// =============================================================================
// Helpers
// =============================================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// =============================================================================
// Page-specific CSS
// =============================================================================

const HOME_CSS = `
/* ── Hero ──────────────────────────────────────────────────────────────── */
.hero {
  padding: 5rem 1.5rem 4rem;
  text-align: center;
}
.hero__inner {
  max-width: var(--max-width);
  margin: 0 auto;
}
.hero__badge {
  display: inline-block;
  padding: 0.3rem 1rem;
  border-radius: 100px;
  background: var(--accent-glow);
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  margin-bottom: 1.5rem;
}
.hero__title {
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--text);
  margin-bottom: 1.25rem;
}
.hero__subtitle {
  font-size: clamp(1rem, 2vw, 1.2rem);
  color: var(--text-secondary);
  max-width: 640px;
  margin: 0 auto 2rem;
  line-height: 1.7;
}
.hero__subtitle strong {
  color: var(--text);
  font-weight: 600;
}
.hero__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}
.hero__btn {
  display: inline-flex;
  align-items: center;
  padding: 0.7rem 1.5rem;
  border-radius: var(--radius);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  transition: background var(--transition), color var(--transition), box-shadow var(--transition);
}
.hero__btn--primary {
  background: var(--accent);
  color: #fff;
}
.hero__btn--primary:hover {
  background: var(--accent-dim);
  box-shadow: 0 0 20px var(--accent-glow);
}
.hero__btn--secondary {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.hero__btn--secondary:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* ── Section Shared ────────────────────────────────────────────────────── */
.section-title {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  margin-bottom: 0.5rem;
}
.section-desc {
  font-size: 0.95rem;
  color: var(--text-secondary);
  max-width: 600px;
  line-height: 1.7;
  margin-bottom: 2rem;
}

/* ── Libraries ─────────────────────────────────────────────────────────── */
.libs {
  padding: 3rem 1.5rem;
}
.libs__inner {
  max-width: var(--max-width);
  margin: 0 auto;
}
.libs__ecosystem {
  margin-bottom: 2rem;
}
.libs__ecosystem-label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  padding-left: 0.125rem;
}
.libs__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.75rem;
}
.lib-card {
  display: flex;
  flex-direction: column;
  padding: 1rem 1.25rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  text-decoration: none;
  color: var(--text);
  transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
}
.lib-card:hover {
  border-color: var(--border);
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
}
.lib-card__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.lib-card__name {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text);
}
.lib-card__tagline {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
  flex: 1;
  margin-bottom: 0.5rem;
}
.lib-card__links {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.lib-card__npm {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  background: var(--bg);
}

/* ── Features ──────────────────────────────────────────────────────────── */
.features {
  padding: 3rem 1.5rem;
}
.features__inner {
  max-width: var(--max-width);
  margin: 0 auto;
}
.features__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}
.feature-card {
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.feature-card__icon {
  font-size: 1.5rem;
  margin-bottom: 0.75rem;
}
.feature-card__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.4rem;
}
.feature-card__desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* ── How It Works ──────────────────────────────────────────────────────── */
.how-it-works {
  padding: 3rem 1.5rem;
}
.how-it-works__inner {
  max-width: var(--max-width);
  margin: 0 auto;
}
.steps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}
.step {
  display: flex;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.step__number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--accent-glow);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.step__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.25rem;
}
.step__desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ── Responsive ────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .hero { padding: 3rem 1rem 2.5rem; }
  .hero__title { font-size: 2.25rem; }
  .libs, .features, .how-it-works { padding: 2rem 1rem; }
  .features__grid { grid-template-columns: 1fr; }
  .steps { grid-template-columns: 1fr; }
  .libs__grid { grid-template-columns: 1fr; }
}
`.trim();
