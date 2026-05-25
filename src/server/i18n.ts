// src/server/i18n.ts
// Internationalization loader — JSON locale files + typed t() factory.
//
// Provides:
//   - loadMessages()   — load a single namespace for a locale (with cache)
//   - preloadLocale()  — warm the cache for all namespaces at startup
//   - clearI18nCache() — flush cache (dev reloading)
//   - detectLocale()   — pick locale from cookie / Accept-Language / default
//   - makeT()          — build a t() function scoped to a locale + page namespace

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

// =============================================================================
// Types
// =============================================================================

/** BCP 47 language tag: "en", "fr", "de", "pt-BR", … */
export type Locale = string;

/** Flat or one-level-deep string map loaded from a JSON file. */
export type Messages = Record<string, string | Record<string, string>>;

/** Page namespace — corresponds to a JSON file name in locales/{locale}/. */
export type Namespace =
  | "common"
  | "home"
  | "benchmarks"
  | "methodology"
  | "about";

/**
 * Translation function returned by makeT().
 *
 * Keys use dot notation for one-level nesting: "hero.title"
 * Variables use {placeholder} syntax: t("hero.subtitle", { count: 13 })
 */
export type T = (key: string, vars?: Record<string, string | number>) => string;

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_LOCALE: Locale = "en";
export const SUPPORTED_LOCALES: Locale[] = ["en"];

const LOCALES_DIR = resolve("./locales");

// =============================================================================
// In-memory cache
// key: "{locale}/{namespace}" → Messages
// =============================================================================

const cache = new Map<string, Messages>();

// =============================================================================
// Loader
// =============================================================================

/**
 * Load messages for a locale + namespace. Results are cached in memory.
 * Falls back to DEFAULT_LOCALE if the requested locale file doesn't exist.
 * Throws only if the English fallback file is also missing.
 */
function loadMessages(locale: Locale, namespace: Namespace): Messages {
  const key = `${locale}/${namespace}`;

  if (cache.has(key)) return cache.get(key)!;

  const filePath = join(LOCALES_DIR, locale, `${namespace}.json`);

  if (!existsSync(filePath)) {
    // Fall back to English silently
    if (locale !== DEFAULT_LOCALE) {
      return loadMessages(DEFAULT_LOCALE, namespace);
    }
    throw new Error(`Missing locale file: ${filePath}`);
  }

  const messages = JSON.parse(readFileSync(filePath, "utf-8")) as Messages;
  cache.set(key, messages);
  return messages;
}

/**
 * Preload all namespaces for a locale into the cache.
 * Call this at server startup to avoid cold-read latency on first requests.
 */
export function preloadLocale(locale: Locale): void {
  const namespaces: Namespace[] = [
    "common",
    "home",
    "benchmarks",
    "methodology",
    "about",
  ];
  for (const ns of namespaces) {
    try {
      loadMessages(locale, ns);
    } catch {
      // Namespace file may not exist for a partially translated locale — skip
    }
  }
}

/** Clear the entire message cache. Used in development to reflect file edits. */
export function clearI18nCache(): void {
  cache.clear();
}

// =============================================================================
// Locale detection
// =============================================================================

/**
 * Detect the preferred locale from an HTTP request.
 *
 * Priority order:
 *   1. URL prefix: /fr/benchmarks → "fr"  (Phase 2 — not yet implemented)
 *   2. Cookie: locale=fr
 *   3. Accept-Language header: fr-FR,fr;q=0.9,en;q=0.8
 *   4. Default: "en"
 *
 * Only returns a locale that exists in SUPPORTED_LOCALES.
 */
export function detectLocale(req: Request): Locale {
  // 1. Cookie (fast path for returning visitors who switched language)
  const cookie = req.headers.get("cookie") ?? "";
  const cookieMatch = cookie.match(
    /(?:^|;\s*)locale=([a-z]{2}(?:-[A-Z]{2})?)/,
  );
  if (cookieMatch) {
    const candidate = cookieMatch[1];
    if (SUPPORTED_LOCALES.includes(candidate)) return candidate;
  }

  // 2. Accept-Language header
  const acceptLang = req.headers.get("accept-language") ?? "";
  for (const part of acceptLang.split(",")) {
    const tag = part.split(";")[0].trim();
    // Exact match first (e.g. "pt-BR")
    if (SUPPORTED_LOCALES.includes(tag)) return tag;
    // Language-only match (e.g. "fr" from "fr-FR")
    const lang = tag.split("-")[0];
    if (SUPPORTED_LOCALES.includes(lang)) return lang;
  }

  return DEFAULT_LOCALE;
}

// =============================================================================
// t() factory
// =============================================================================

/**
 * Build a translation function for a specific locale and page namespace.
 *
 * The returned t() function looks up keys in this priority:
 *   1. Page namespace (e.g. "home")
 *   2. Common namespace
 *   3. Returns the raw key as fallback (never throws)
 *
 * Keys use dot notation for one-level nesting: "hero.title"
 * Variables use {placeholder} syntax: t("hero.subtitle", { count: 13 })
 */
export function makeT(locale: Locale, namespace: Namespace): T {
  const pageMessages = loadMessages(locale, namespace);
  const commonMessages =
    namespace === "common"
      ? pageMessages
      : loadMessages(locale, "common");

  return function t(
    key: string,
    vars?: Record<string, string | number>,
  ): string {
    // Dot-notation lookup (one level only: "section.field")
    const dotIndex = key.indexOf(".");
    const section = dotIndex !== -1 ? key.slice(0, dotIndex) : null;
    const field = dotIndex !== -1 ? key.slice(dotIndex + 1) : key;

    let value: string | undefined;

    if (section) {
      // Look in page namespace first
      const pageSection = pageMessages[section];
      if (pageSection && typeof pageSection === "object") {
        value = (pageSection as Record<string, string>)[field];
      }
      // Fall back to common namespace
      if (value === undefined) {
        const commonSection = commonMessages[section];
        if (commonSection && typeof commonSection === "object") {
          value = (commonSection as Record<string, string>)[field];
        }
      }
    } else {
      // Top-level key (no dot)
      value =
        (typeof pageMessages[field] === "string"
          ? (pageMessages[field] as string)
          : undefined) ??
        (typeof commonMessages[field] === "string"
          ? (commonMessages[field] as string)
          : undefined);
    }

    // Fallback: return the raw key so missing translations are visible
    if (value === undefined) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] Missing key: ${locale}/${namespace}/${key}`);
      }
      return key;
    }

    // Variable substitution: {name} → vars[name]
    if (vars) {
      return value.replace(
        /\{(\w+)\}/g,
        (_, name) => String(vars[name] ?? `{${name}}`),
      );
    }

    return value;
  };
}
