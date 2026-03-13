// src/server/shell.ts
// HTML shell — wraps page content in a complete HTML document via Eta template.
//
// Exports:
//   - renderShell()   — render the shell template with page data + t() function
//   - CRITICAL_CSS    — inlined in <head> for fast first paint
//   - NAV_ITEMS       — navigation links (used by shell template)
//   - ShellOptions    — options interface for renderShell()

import { renderTemplate } from "./eta";
import type { T } from "./i18n";

// =============================================================================
// Types
// =============================================================================

export interface NavItem {
  href: string;
  slug: string;
}

export interface ShellOptions {
  /** BCP 47 locale code for the <html lang> attribute. */
  locale: string;

  /** Page title (appears in <title> and og:title). */
  title: string;

  /** Meta description for SEO. */
  description: string;

  /** Canonical URL for this page. */
  url: string;

  /** Rendered page content to inject into <main>. */
  content: string;

  /** Translation function scoped to this request's locale. */
  t: T;

  /** Additional <head> content (stylesheets, preloads, etc.). */
  extraHead?: string;

  /** Additional content before </body> (scripts, etc.). */
  extraBody?: string;

  /** CSS class(es) to add to <main>. */
  mainClass?: string;

  /** Active navigation item slug (for highlighting). */
  activeNav?: string;

  /** og:type — defaults to "website". */
  ogType?: string;
}

// =============================================================================
// Navigation
// =============================================================================

export const NAV_ITEMS: NavItem[] = [
  { href: "/benchmarks", slug: "benchmarks" },
  { href: "/methodology", slug: "methodology" },
  { href: "/about", slug: "about" },
];

// =============================================================================
// Critical CSS (inlined in <head> for fast first paint)
// =============================================================================

export const CRITICAL_CSS = `
/* ── Reset ──────────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
main { flex: 1; }

/* ── Theme tokens ───────────────────────────────────────────────────────── */
:root {
  --bg:           #0a0a0f;
  --bg-surface:   #12121a;
  --bg-elevated:  #1a1a26;
  --bg-hover:     #22222e;
  --border:       #2a2a3a;
  --border-subtle:#1e1e2e;
  --text:         #e8e8f0;
  --text-secondary:#9090a8;
  --text-muted:   #606078;
  --accent:       #6c8cff;
  --accent-dim:   #4a6ae0;
  --accent-glow:  rgba(108, 140, 255, 0.12);
  --green:        #4ade80;
  --green-dim:    rgba(74, 222, 128, 0.12);
  --yellow:       #fbbf24;
  --yellow-dim:   rgba(251, 191, 36, 0.12);
  --red:          #f87171;
  --red-dim:      rgba(248, 113, 113, 0.12);
  --radius:       8px;
  --radius-lg:    12px;
  --shadow:       0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
  --shadow-lg:    0 4px 12px rgba(0,0,0,0.4);
  --transition:   150ms ease;
  --max-width:    1200px;
}

/* ── Navigation ─────────────────────────────────────────────────────────── */
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-subtle);
}
.nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 1.5rem;
  height: 56px;
}
.nav__logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: var(--text);
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}
.nav__logo-icon { font-size: 1.2rem; }
.nav__links {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}
.nav__link {
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  transition: color var(--transition), background var(--transition);
}
.nav__link:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.nav__link--active {
  color: var(--accent);
  background: var(--accent-glow);
}
.nav__github {
  display: flex;
  align-items: center;
  padding: 0.4rem;
  border-radius: var(--radius);
  color: var(--text-secondary);
  text-decoration: none;
  transition: color var(--transition), background var(--transition);
}
.nav__github:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* ── Footer ─────────────────────────────────────────────────────────────── */
.site-footer {
  border-top: 1px solid var(--border-subtle);
  padding: 2rem 1.5rem;
  margin-top: 3rem;
}
.footer__inner {
  max-width: var(--max-width);
  margin: 0 auto;
  text-align: center;
}
.footer__text {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.7;
}
.footer__text--secondary {
  margin-top: 0.5rem;
  color: var(--text-muted);
  font-size: 0.8rem;
}
.footer__text a {
  color: var(--text-secondary);
  text-decoration: none;
  transition: color var(--transition);
}
.footer__text a:hover { color: var(--accent); }

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .nav { padding: 0 1rem; gap: 0.75rem; }
  .nav__logo-text { display: none; }
  .nav__link { padding: 0.35rem 0.5rem; font-size: 0.82rem; }
}
`.trim();

// =============================================================================
// Shell Renderer
// =============================================================================

/**
 * Render a complete HTML page by wrapping content in the site shell.
 *
 * The shell template (src/templates/shell.eta) handles all HTML structure:
 * navigation, footer, meta tags, and the content slot.
 */
export function renderShell(options: ShellOptions): string {
  const {
    locale,
    title,
    description,
    url,
    content,
    t,
    extraHead = "",
    extraBody = "",
    mainClass = "",
    activeNav,
    ogType = "website",
  } = options;

  return renderTemplate("shell", {
    locale,
    title,
    description,
    url,
    content,
    t,
    extraHead,
    extraBody,
    mainClass,
    activeNav,
    ogType,
    criticalCss: CRITICAL_CSS,
    navItems: NAV_ITEMS,
  });
}
