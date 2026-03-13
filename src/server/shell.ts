// src/server/shell.ts
// HTML shell template — wraps page content in a complete HTML document.
//
// Provides:
//   - Responsive meta tags
//   - Open Graph / Twitter card metadata
//   - Global styles (inline critical CSS + external stylesheet)
//   - Navigation header
//   - Page content slot
//   - Footer

import { SITE } from "./config";

// =============================================================================
// Types
// =============================================================================

export interface ShellOptions {
  /** Page title (appears in <title> and og:title). */
  title: string;

  /** Meta description for SEO. */
  description: string;

  /** Canonical URL for this page. */
  url: string;

  /** HTML content to inject into the <main> element. */
  content: string;

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

interface NavItem {
  label: string;
  href: string;
  slug: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Benchmarks", href: "/benchmarks", slug: "benchmarks" },
  { label: "Methodology", href: "/methodology", slug: "methodology" },
  { label: "About", href: "/about", slug: "about" },
];

function buildNav(activeSlug?: string): string {
  const items = NAV_ITEMS.map((item) => {
    const isActive = item.slug === activeSlug;
    const classes = `nav__link${isActive ? " nav__link--active" : ""}`;
    return `<a href="${item.href}" class="${classes}">${item.label}</a>`;
  }).join("\n        ");

  return `
    <header class="site-header">
      <nav class="nav">
        <a href="/" class="nav__logo">
          <span class="nav__logo-icon">⚡</span>
          <span class="nav__logo-text">virtuallist.io</span>
        </a>
        <div class="nav__links">
          ${items}
        </div>
        <a href="https://github.com/floor/virtuallist.io" class="nav__github" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        </a>
      </nav>
    </header>`;
}

// =============================================================================
// Footer
// =============================================================================

function buildFooter(): string {
  return `
    <footer class="site-footer">
      <div class="footer__inner">
        <p class="footer__text">
          <strong>virtuallist.io</strong> — Independent, open-source benchmark platform for virtual list libraries.
        </p>
        <p class="footer__text footer__text--secondary">
          All benchmarks run locally in your browser. Results depend on your hardware.
          <br>
          <a href="/methodology">Methodology</a>
          ·
          <a href="/about">About</a>
          ·
          <a href="/about/contribute">Contribute</a>
          ·
          <a href="/about/api">API</a>
          ·
          <a href="https://github.com/floor/virtuallist.io" target="_blank" rel="noopener noreferrer">GitHub</a>
        </p>
      </div>
    </footer>`;
}

// =============================================================================
// Critical CSS (inlined in <head> for fast first paint)
// =============================================================================

const CRITICAL_CSS = `
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
 */
export function renderShell(options: ShellOptions): string {
  const {
    title,
    description,
    url,
    content,
    extraHead = "",
    extraBody = "",
    mainClass = "",
    activeNav,
    ogType = "website",
  } = options;

  const escapedTitle = escapeHtml(title);
  const escapedDesc = escapeHtml(description);
  const mainClassAttr = mainClass ? ` class="${mainClass}"` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDesc}">

    <!-- Canonical -->
    <link rel="canonical" href="${escapeHtml(url)}">

    <!-- Open Graph -->
    <meta property="og:type" content="${ogType}">
    <meta property="og:title" content="${escapedTitle}">
    <meta property="og:description" content="${escapedDesc}">
    <meta property="og:url" content="${escapeHtml(url)}">
    <meta property="og:site_name" content="virtuallist.io">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapedTitle}">
    <meta name="twitter:description" content="${escapedDesc}">

    <!-- Preconnect to Google Fonts (if needed later) -->
    <!-- <link rel="preconnect" href="https://fonts.googleapis.com"> -->

    <!-- Critical CSS -->
    <style>${CRITICAL_CSS}</style>

    <!-- External stylesheets -->
    <link rel="stylesheet" href="/dist/benchmarks/styles.css">

    ${extraHead}
</head>
<body>
    ${buildNav(activeNav)}

    <main${mainClassAttr}>
      ${content}
    </main>

    ${buildFooter()}

    ${extraBody}
</body>
</html>`;
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
