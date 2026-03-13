// benchmarks/build.ts — Build the benchmark bundle for virtuallist.io
//
// Bundles all benchmark JS into dist/benchmarks/ for serving.
//
// Usage:
//   bun run benchmarks/build.ts
//   bun run benchmarks/build.ts --watch

import {
  existsSync,
  readFileSync,
  writeFileSync,
  watch,
} from "fs";
import { join } from "path";

const isWatch = process.argv.includes("--watch");
const BENCHMARKS_DIR = "./benchmarks";
const OUT_DIR = "./dist/benchmarks";

const BUILD_OPTIONS = {
  format: "esm" as const,
  target: "browser" as const,
};

// =============================================================================
// Framework dedupe plugin
// =============================================================================
// When libraries share framework dependencies (react, vue, solid-js), we must
// ensure a single instance of each framework is bundled — not one per library.
// This plugin forces all framework imports to resolve from the project root's
// node_modules, guaranteeing a single instance in the final bundle.
//
// Vue: resolves to the compiler-included build (vue.esm-bundler.js) so that
// string `template` options work at runtime without .vue SFC compilation.

const frameworkDedupePlugin: import("bun").BunPlugin = {
  name: "dedupe-frameworks",
  setup(build) {
    const PROJECT_ROOT = "./";

    // React + ReactDOM — always resolve from project root
    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => {
      try {
        const resolved = require.resolve(args.path, {
          paths: [PROJECT_ROOT],
        });
        return { path: resolved };
      } catch {
        return undefined;
      }
    });

    // Vue — resolve to compiler-included build for template string support
    build.onResolve({ filter: /^vue$/ }, () => {
      try {
        const resolved = require.resolve("vue/dist/vue.esm-bundler.js", {
          paths: [PROJECT_ROOT],
        });
        return { path: resolved };
      } catch {
        return undefined;
      }
    });

    // Vue sub-paths (@vue/runtime-core, @vue/reactivity, etc.)
    build.onResolve({ filter: /^@vue\// }, (args) => {
      try {
        const resolved = require.resolve(args.path, {
          paths: [PROJECT_ROOT],
        });
        return { path: resolved };
      } catch {
        return undefined;
      }
    });

    // SolidJS — always resolve from project root
    build.onResolve({ filter: /^solid-js(\/.*)?$/ }, (args) => {
      try {
        const resolved = require.resolve(args.path, {
          paths: [PROJECT_ROOT],
        });
        return { path: resolved };
      } catch {
        return undefined;
      }
    });

    // @floor/vlist — resolve from project root
    build.onResolve({ filter: /^@floor\/vlist(\/.*)?$/ }, (args) => {
      try {
        const resolved = require.resolve(args.path, {
          paths: [PROJECT_ROOT],
        });
        return { path: resolved };
      } catch {
        return undefined;
      }
    });
  },
};

// =============================================================================
// Build options factory
// =============================================================================

const buildOptions = () => ({
  ...BUILD_OPTIONS,
  minify: !isWatch,
  sourcemap: isWatch ? ("inline" as const) : ("none" as const),
});

// =============================================================================
// CSS minifier (simple, no dependencies)
// =============================================================================

function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "") // strip comments
    .replace(/\s*([{}:;,>~+])\s*/g, "$1") // collapse around symbols
    .replace(/;\}/g, "}") // drop trailing semicolons
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

// =============================================================================
// Size Formatting
// =============================================================================

function formatKB(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

function gzipSize(filePath: string): number {
  try {
    const file = Bun.file(filePath);
    const content = new Uint8Array(
      require("fs").readFileSync(filePath)
    );
    // Use Bun's built-in gzip via DecompressionStream to estimate size
    // Fallback to raw size if not available
    return Math.round(file.size * 0.3); // rough estimate
  } catch {
    return 0;
  }
}

// =============================================================================
// Ensure output directory exists
// =============================================================================

function ensureDir(dir: string): void {
  const { mkdirSync } = require("fs");
  mkdirSync(dir, { recursive: true });
}

// =============================================================================
// Build
// =============================================================================

async function build(): Promise<void> {
  const start = performance.now();

  ensureDir(OUT_DIR);

  const entrypoint = join(BENCHMARKS_DIR, "script.js");
  const runnerPath = join(BENCHMARKS_DIR, "runner.js");

  if (!existsSync(entrypoint)) {
    console.error("❌ benchmarks/script.js not found");
    process.exit(1);
  }

  console.log("🔨 Building benchmarks...\n");

  // Define Vue feature flags for production builds
  const define: Record<string, string> = {
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  };

  try {
    // ── Build runner.js as a standalone module ──────────────────────────
    console.log("  Building runner.js...");
    const runnerResult = await Bun.build({
      entrypoints: [runnerPath],
      outdir: OUT_DIR,
      ...buildOptions(),
      plugins: [frameworkDedupePlugin],
      define,
    });

    if (!runnerResult.success) {
      const errors = runnerResult.logs.map((log) => log.message).join("\n");
      console.error("❌ Runner build failed:\n", errors);
      process.exit(1);
    }
    console.log("  ✅ runner.js");

    // ── Build main script.js (includes all library adapters) ───────────
    console.log("  Building script.js...");
    const scriptResult = await Bun.build({
      entrypoints: [entrypoint],
      outdir: OUT_DIR,
      ...buildOptions(),
      plugins: [frameworkDedupePlugin],
      define,
    });

    if (!scriptResult.success) {
      const errors = scriptResult.logs.map((log) => log.message).join("\n");
      console.error("❌ Script build failed:\n", errors);
      console.error("\nBuild logs:");
      scriptResult.logs.forEach((log) => {
        console.error(`  ${log.level}: ${log.message}`);
      });
      process.exit(1);
    }
    console.log("  ✅ script.js");

    // ── Collect CSS from page renderers (inlined) and any external CSS ──
    // Note: CSS is currently inlined in the TypeScript renderers.
    // If a standalone benchmarks/styles.css exists, bundle it too.
    const cssPath = join(BENCHMARKS_DIR, "styles.css");
    if (existsSync(cssPath)) {
      const raw = readFileSync(cssPath, "utf-8");
      const minified = minifyCss(raw);
      const cssOutPath = join(OUT_DIR, "styles.css");
      writeFileSync(cssOutPath, minified);
      console.log(`  ✅ styles.css (${formatKB(Buffer.byteLength(minified, "utf-8"))} KB)`);
    } else {
      // Write an empty styles.css placeholder so the link tag doesn't 404
      writeFileSync(join(OUT_DIR, "styles.css"), "/* virtuallist.io benchmark styles */");
    }

    // ── Report bundle sizes ─────────────────────────────────────────────
    const jsPath = join(OUT_DIR, "script.js");
    const runnerOutPath = join(OUT_DIR, "runner.js");

    const jsSize = Bun.file(jsPath).size;
    const runnerSize = Bun.file(runnerOutPath).size;

    const elapsed = (performance.now() - start).toFixed(0);

    console.log(`
  ✅ Build complete in ${elapsed}ms

  script.js   ${formatKB(jsSize)} KB
  runner.js   ${formatKB(runnerSize)} KB
  Output:     ${OUT_DIR}/
    `);
  } catch (err) {
    console.error(
      "❌ Build error:",
      err instanceof Error ? err.message : String(err),
    );
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// =============================================================================
// Watch mode
// =============================================================================

async function watchMode(): Promise<void> {
  console.log("👀 Watching benchmarks for changes...\n");
  await build();

  watch(BENCHMARKS_DIR, { recursive: true }, async (_event, filename) => {
    if (
      filename &&
      !filename.includes("dist") &&
      !filename.includes("node_modules") &&
      (filename.endsWith(".js") ||
        filename.endsWith(".ts") ||
        filename.endsWith(".css"))
    ) {
      console.log(`\n📝 benchmarks/${filename} changed`);
      await build();
    }
  });
}

// =============================================================================
// Entry point
// =============================================================================

if (isWatch) {
  watchMode().catch((err) => {
    console.error("❌ Watch failed:", err);
    process.exit(1);
  });
} else {
  build().catch((err) => {
    console.error("❌ Build failed:", err);
    process.exit(1);
  });
}
