// src/server/pages/methodology.ts
// Methodology page renderer — detailed documentation of how benchmarks work.
//
// Renders:
//   /methodology → Static documentation page explaining benchmark methodology
//
// All HTML lives in src/templates/methodology.eta.
// All user-facing strings live in locales/{locale}/methodology.json + common.json.
// This file is logic only: locale detection + template rendering.

import { SITE, IS_PROD } from "../config";
import { renderTemplate } from "../eta";
import { renderShell } from "../shell";
import { makeT, detectLocale, type Locale } from "../i18n";

// =============================================================================
// Cache (keyed by locale for multi-language support)
// =============================================================================

const pageCache = new Map<Locale, string>();

export function clearMethodologyCache(): void {
  pageCache.clear();
}

// =============================================================================
// Public API
// =============================================================================

export function renderMethodologyPage(req: Request): Response {
  const locale = detectLocale(req);

  if (IS_PROD && pageCache.has(locale)) {
    return new Response(pageCache.get(locale)!, htmlHeaders());
  }

  const t = makeT(locale, "methodology");

  // Render page content via Eta
  const content = renderTemplate("methodology", { t });

  // Wrap in shell
  const html = renderShell({
    locale,
    title: t("meta.title"),
    description: t("meta.description"),
    url: `${SITE}/methodology`,
    content,
    t,
    activeNav: "methodology",
    extraHead: `<style>${METHODOLOGY_CSS}</style>`,
    extraBody: "",
    mainClass: "",
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

const METHODOLOGY_CSS = `
/* ── Methodology Page ───────────────────────────────────────────────────── */
.meth {
  max-width: 800px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 3rem;
}

.meth__header {
  margin-bottom: 3rem;
}
.meth__title {
  font-size: clamp(2rem, 4vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text);
  margin-bottom: 0.75rem;
}
.meth__subtitle {
  font-size: 1.1rem;
  color: var(--text-secondary);
  line-height: 1.7;
  max-width: 600px;
}

/* ── Sections ───────────────────────────────────────────────────────────── */
.meth__section {
  margin-bottom: 3rem;
}
.meth__section-title {
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-subtle);
}
.meth__subsection-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}
.meth__text {
  font-size: 0.95rem;
  color: var(--text-secondary);
  line-height: 1.8;
  margin-bottom: 0.75rem;
}
.meth__text strong {
  color: var(--text);
  font-weight: 600;
}
.meth__text code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.85em;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--accent);
}
.meth__text--note {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-style: italic;
  margin-top: 0.5rem;
}
.meth__link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
  transition: color var(--transition);
}
.meth__link:hover {
  color: var(--accent-dim);
}

/* ── Metrics Grid ───────────────────────────────────────────────────────── */
.meth__metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}
.meth__metric-card {
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.meth__metric-icon {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}
.meth__metric-name {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.15rem;
}
.meth__metric-unit {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}
.meth__metric-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
.meth__metric-desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.82em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: var(--bg);
  color: var(--accent);
}

/* ── Phases ──────────────────────────────────────────────────────────────── */
.meth__phases {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
}
.meth__phase {
  display: flex;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.meth__phase-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--accent-glow);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.9rem;
  flex-shrink: 0;
}
.meth__phase-content {
  flex: 1;
}
.meth__phase-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.3rem;
}
.meth__phase-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
.meth__phase-desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.82em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: var(--bg);
  color: var(--accent);
}

/* ── List Items ─────────────────────────────────────────────────────────── */
.meth__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.75rem 0;
}
.meth__list-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.meth__list-item strong {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
}
.meth__list-item span {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
}
.meth__list-item code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.82em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: var(--bg);
  color: var(--accent);
}

/* ── Table ──────────────────────────────────────────────────────────────── */
.meth__table-wrapper {
  overflow-x: auto;
  margin: 1rem 0;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
}
.meth__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.meth__table th {
  text-align: left;
  padding: 0.65rem 1rem;
  background: var(--bg-surface);
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border-subtle);
}
.meth__table td {
  padding: 0.6rem 1rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);
}
.meth__table tr:last-child td {
  border-bottom: none;
}
.meth__table td:first-child {
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.meth__table tbody tr:hover {
  background: var(--bg-hover);
}

/* ── Diagram ────────────────────────────────────────────────────────────── */
.meth__diagram {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.25rem 0;
}
.meth__diagram-box {
  flex: 1;
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  text-align: center;
}
.meth__diagram-box p {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-top: 0.3rem;
}
.meth__diagram-box code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.82em;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  background: var(--bg);
  color: var(--accent);
}
.meth__diagram-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}
.meth__diagram-separator {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .meth {
    padding: 1.5rem 1rem 2.5rem;
  }
  .meth__metrics-grid {
    grid-template-columns: 1fr;
  }
  .meth__diagram {
    flex-direction: column;
    gap: 0.5rem;
  }
  .meth__diagram-separator {
    transform: rotate(90deg);
  }
  .meth__phase {
    flex-direction: column;
    gap: 0.5rem;
  }
  .meth__table {
    font-size: 0.78rem;
  }
  .meth__table th,
  .meth__table td {
    padding: 0.5rem 0.75rem;
  }
}
`.trim();
