// src/server/pages/about.ts
// About section renderer — three public-facing sub-pages under /about/*.
//
// Routes:
//   /about            → What virtuallist.io is, neutrality, open source
//   /about/api        → Public API reference for querying crowdsourced data
//   /about/contribute → How to add a library (audience: library authors)
//
// All HTML lives in src/templates/about*.eta.
// All user-facing strings live in locales/{locale}/about.json + common.json.
// This file is logic only: data collection + template rendering.

import { SITE, IS_PROD } from "../config";
import { renderTemplate } from "../eta";
import { renderShell } from "../shell";
import { makeT, detectLocale, type Locale } from "../i18n";
import { getLibraryCount } from "../registry";

// =============================================================================
// Types
// =============================================================================

type AboutSlug = "about" | "api" | "contribute";

// =============================================================================
// Cache (keyed by locale + slug for multi-language support)
// =============================================================================

const pageCache = new Map<string, string>();

export function clearAboutCache(): void {
  pageCache.clear();
}

// =============================================================================
// Sidebar data
// =============================================================================

interface SidebarItem {
  slug: AboutSlug;
  href: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { slug: "about", href: "/about" },
  { slug: "api", href: "/about/api" },
  { slug: "contribute", href: "/about/contribute" },
];

// =============================================================================
// Page content renderers (via Eta templates)
// =============================================================================

function renderPageContent(
  slug: AboutSlug,
  t: ReturnType<typeof makeT>,
): string {
  switch (slug) {
    case "about":
      return renderTemplate("about", { t, count: getLibraryCount() });
    case "api":
      return renderTemplate("about-api", { t });
    case "contribute":
      return renderTemplate("about-contribute", { t });
  }
}

// =============================================================================
// Page Assembly
// =============================================================================

function assemblePage(slug: AboutSlug, locale: string): string {
  const t = makeT(locale, "about");

  // Render sidebar
  const sidebar = renderTemplate("about-sidebar", {
    t,
    sidebarItems: SIDEBAR_ITEMS,
    activeSlug: slug,
  });

  // Render page content
  const pageContent = renderPageContent(slug, t);

  // Meta title/description from locale
  const titleKey = `meta.${slug}_title`;
  const descKey = `meta.${slug}_description`;

  return renderShell({
    locale,
    title: t(titleKey),
    description: t(descKey),
    url: `${SITE}/${slug === "about" ? "about" : `about/${slug}`}`,
    content: `
      <div class="about-layout">
        ${sidebar}
        <div class="about-layout__content">
          ${pageContent}
        </div>
      </div>`,
    t,
    activeNav: "about",
    extraHead: `<style>${ABOUT_CSS}</style>`,
    extraBody: "",
    mainClass: "",
  });
}

// =============================================================================
// Public API
// =============================================================================

export function renderAboutPage(
  slug: string | null,
  req: Request,
): Response | null {
  const resolved: AboutSlug | null =
    slug === null || slug === "about"
      ? "about"
      : slug === "api"
        ? "api"
        : slug === "contribute"
          ? "contribute"
          : null;

  if (resolved === null) return null;

  const locale = detectLocale(req);
  const cacheKey = `${locale}/${resolved}`;

  if (IS_PROD) {
    const cached = pageCache.get(cacheKey);
    if (cached !== undefined) {
      return new Response(cached, htmlHeaders());
    }
  }

  const html = assemblePage(resolved, locale);

  pageCache.set(cacheKey, html);

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

const ABOUT_CSS = `
/* ── Layout ─────────────────────────────────────────────────────────────── */
.about-layout {
  display: flex;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 1.5rem;
  gap: 2.5rem;
  min-height: calc(100vh - 56px - 120px);
}
.about-layout__content {
  flex: 1;
  min-width: 0;
  padding: 2.5rem 0;
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.about-sidebar {
  position: sticky;
  top: 56px;
  align-self: flex-start;
  width: 180px;
  flex-shrink: 0;
  padding: 2.5rem 0 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.about-sidebar__link {
  display: block;
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  transition: color var(--transition), background var(--transition);
}
.about-sidebar__link:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.about-sidebar__link--active {
  color: var(--accent);
  background: var(--accent-glow);
}

/* ── Page chrome ─────────────────────────────────────────────────────────── */
.about-page {
  max-width: 720px;
}
.about-header {
  margin-bottom: 2.5rem;
}
.about-header__title {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text);
  margin-bottom: 0.5rem;
}
.about-header__subtitle {
  font-size: 1.05rem;
  color: var(--text-secondary);
  line-height: 1.7;
}

/* ── Sections ────────────────────────────────────────────────────────────── */
.about-section {
  margin-bottom: 2.75rem;
}
.about-section__title {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-subtle);
}
.about-text {
  font-size: 0.93rem;
  color: var(--text-secondary);
  line-height: 1.8;
  margin-bottom: 0.65rem;
}
.about-text strong {
  color: var(--text);
  font-weight: 600;
}
.about-text code,
.about-text a code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--accent);
}
.about-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
  transition: color var(--transition);
}
.about-link:hover {
  color: var(--accent-dim);
}

/* ── CTA row ─────────────────────────────────────────────────────────────── */
.about-cta-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 1.25rem;
}
.about-cta-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.55rem 1.25rem;
  border-radius: var(--radius);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 600;
  transition: background var(--transition), color var(--transition), box-shadow var(--transition);
  background: var(--accent);
  color: #fff;
}
.about-cta-btn:hover {
  background: var(--accent-dim);
  box-shadow: 0 0 18px var(--accent-glow);
}
.about-cta-btn--secondary {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.about-cta-btn--secondary:hover {
  color: var(--text);
  background: var(--bg-hover);
  box-shadow: none;
}

/* ── Pre / code blocks ───────────────────────────────────────────────────── */
.about-pre {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.8rem;
  line-height: 1.65;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  overflow-x: auto;
  color: var(--text-secondary);
  white-space: pre;
  margin: 0.75rem 0;
}

/* ── API endpoint cards ──────────────────────────────────────────────────── */
.api-endpoint {
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  margin-bottom: 0.75rem;
}
.api-endpoint__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.api-method {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.api-method--get {
  background: var(--green-dim);
  color: var(--green);
}
.api-method--post {
  background: var(--accent-glow);
  color: var(--accent);
}
.api-path {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.875rem;
  color: var(--text);
  font-weight: 600;
}
.api-desc {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 0.5rem;
}
.api-desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--accent);
}
.api-params {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}
.api-param {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.82rem;
}
.api-param__name {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.8rem;
  color: var(--accent);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  flex-shrink: 0;
}
.api-param__req {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--yellow);
  flex-shrink: 0;
}
.api-param__desc {
  color: var(--text-secondary);
  line-height: 1.5;
}
.api-param__desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

/* ── Requirements list ───────────────────────────────────────────────────── */
.about-req-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.about-req {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.about-req__label {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text);
}
.about-req__desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.55;
}
.about-req__desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--accent);
}

/* ── Steps ───────────────────────────────────────────────────────────────── */
.about-steps {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.about-step {
  display: flex;
  gap: 1rem;
  padding: 1.1rem 1.25rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.about-step__number {
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
  margin-top: 0.1rem;
}
.about-step__content {
  flex: 1;
  min-width: 0;
}
.about-step__title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.3rem;
}
.about-step__desc {
  font-size: 0.84rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 0.4rem;
}
.about-step__desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--accent);
}
.about-step__desc a {
  color: var(--accent);
  text-decoration: none;
}
.about-step__desc a:hover {
  color: var(--accent-dim);
  text-decoration: underline;
}

/* ── Template helpers ────────────────────────────────────────────────────── */
.about-helpers {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.about-helper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.about-helper__name {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.78rem;
  color: var(--accent);
}
.about-helper__desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
}
.about-helper__desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

/* ── Other contributions ─────────────────────────────────────────────────── */
.about-contrib-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.about-contrib {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  font-size: 0.85rem;
}
.about-contrib strong {
  color: var(--text);
  font-weight: 600;
}
.about-contrib span {
  color: var(--text-secondary);
  line-height: 1.55;
}

/* ── Responsive ──────────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .about-layout {
    flex-direction: column;
    gap: 0;
    padding: 0 1.5rem;
  }
  .about-sidebar {
    position: static;
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 1rem 0 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .about-sidebar__link {
    font-size: 0.83rem;
    padding: 0.3rem 0.65rem;
  }
  .about-layout__content {
    padding-top: 2rem;
  }
}

@media (max-width: 640px) {
  .about-layout {
    padding: 0 1rem;
  }
  .about-header__title {
    font-size: 1.6rem;
  }
  .about-step {
    flex-direction: column;
    gap: 0.5rem;
  }
  .about-step__number {
    margin-top: 0;
  }
  .about-pre {
    font-size: 0.72rem;
    padding: 0.75rem 1rem;
  }
}
`.trim();
