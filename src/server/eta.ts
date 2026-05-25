// src/server/eta.ts
// Eta template engine — singleton instance with file-based template loading.
//
// Provides:
//   - renderTemplate()      — render a named .eta template with data
//   - clearTemplateCache()  — flush compiled templates (dev reloading)
//
// Templates live in src/templates/*.eta and are accessed by name (no extension).
// Data is available in templates via the `it.` prefix:
//   - Escaped output:   <%= it.title %>
//   - Unescaped output: <%~ it.t("footer.tagline") %>
//   - Control flow:     <% it.items.forEach(function(item) { %> ... <% }) %>

import { Eta } from "eta";
import { resolve } from "path";

// =============================================================================
// Configuration
// =============================================================================

const TEMPLATES_DIR = resolve("./src/templates");

// =============================================================================
// Singleton Instance
// =============================================================================

/** Singleton Eta instance — configured once, reused across all requests. */
const eta = new Eta({
  views: TEMPLATES_DIR,
  cache: true,
  rmWhitespace: false,
  autoEscape: true,
  useWith: false,
  varName: "it",
});

// =============================================================================
// Public API
// =============================================================================

/**
 * Render a named template with the given data.
 *
 * @param name - Template file name without extension, e.g. "home" → src/templates/home.eta
 * @param data - Data object accessible as `it` inside the template
 * @returns Rendered HTML string
 */
export function renderTemplate(
  name: string,
  data: Record<string, unknown>,
): string {
  return eta.render(name, data);
}

/**
 * Clear Eta's compiled template cache.
 * Call this in development when .eta files change on disk.
 *
 * Uses the public Cacher.reset() API (Eta v4.x).
 */
export function clearTemplateCache(): void {
  eta.templatesSync.reset();
  eta.templatesAsync.reset();
}
