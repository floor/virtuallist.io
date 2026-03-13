// src/server/pages/home.ts
// Homepage renderer — landing page for virtuallist.io.
//
// Renders:
//   - Hero section with tagline and CTA
//   - Library grid showing all benchmarked libraries by ecosystem
//   - Feature highlights (methodology, crowdsourced data, open source)
//   - How it works steps
//
// All HTML lives in src/templates/home.eta.
// All user-facing strings live in locales/{locale}/home.json + common.json.
// This file is logic only: data collection + template rendering.

import { SITE, IS_PROD } from "../config";
import { renderTemplate } from "../eta";
import { renderShell } from "../shell";
import { makeT, detectLocale, type Locale } from "../i18n";
import {
  getLibrariesByEcosystem,
  getEcosystemLabel,
  getLibraryCount,
  type Ecosystem,
} from "../registry";

// =============================================================================
// Cache (keyed by locale for multi-language support)
// =============================================================================

const pageCache = new Map<Locale, string>();

export function clearHomeCache(): void {
  pageCache.clear();
}

// =============================================================================
// Data
// =============================================================================

const FEATURES = [
  { icon: "🎯", titleKey: "fair_title", descKey: "fair_desc" },
  { icon: "🌍", titleKey: "crowdsourced_title", descKey: "crowdsourced_desc" },
  { icon: "📊", titleKey: "metrics_title", descKey: "metrics_desc" },
  { icon: "🔬", titleKey: "stress_title", descKey: "stress_desc" },
  { icon: "⚡", titleKey: "speeds_title", descKey: "speeds_desc" },
  { icon: "🔓", titleKey: "open_title", descKey: "open_desc" },
];

const STEPS = [
  { titleKey: "step1_title", descKey: "step1_desc" },
  { titleKey: "step2_title", descKey: "step2_desc" },
  { titleKey: "step3_title", descKey: "step3_desc" },
  { titleKey: "step4_title", descKey: "step4_desc" },
];

const ECOSYSTEM_ORDER: Ecosystem[] = [
  "vanilla",
  "react",
  "vue",
  "solid",
  "svelte",
  "multi",
];

// =============================================================================
// Public API
// =============================================================================

export function renderHomepage(req: Request): Response {
  const locale = detectLocale(req);

  if (IS_PROD && pageCache.has(locale)) {
    return new Response(pageCache.get(locale)!, htmlHeaders());
  }

  const t = makeT(locale, "home");

  // Build ecosystem data for the template
  const byEcosystem = getLibrariesByEcosystem();
  const count = getLibraryCount();

  const ecosystems = ECOSYSTEM_ORDER.map((eco) => ({
    label: getEcosystemLabel(eco),
    libs: (byEcosystem.get(eco) ?? []).map((lib) => ({
      slug: lib.slug,
      name: lib.name,
      tagline: lib.tagline,
      npm: lib.npm,
    })),
  })).filter((g) => g.libs.length > 0);

  // Render page content via Eta
  const content = renderTemplate("home", {
    t,
    ecosystems,
    features: FEATURES,
    steps: STEPS,
    count,
  });

  // Wrap in shell
  const html = renderShell({
    locale,
    title: t("meta.title"),
    description: t("meta.description"),
    url: `${SITE}/`,
    content,
    t,
    ogType: "website",
    activeNav: undefined,
    mainClass: "",
    extraHead: `<style>${HOME_CSS}</style>`,
    extraBody: "",
  });

  if (IS_PROD) pageCache.set(locale, html);

  return new Response(html, htmlHeaders());
}

// =============================================================================
// Helpers
// =============================================================================

function htmlHeaders(): ResponseInit {
  return {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": IS_PROD
        ? "public, max-age=3600, must-revalidate"
        : "no-cache, no-store, must-revalidate",
    },
  };
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
