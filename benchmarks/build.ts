// benchmarks/build.ts — Build the benchmark bundle for virtuallist.io
//
// Bundles all benchmark JS into dist/benchmarks/ for serving.
//
// Usage:
//   bun run benchmarks/build.ts
//   bun run benchmarks/build.ts --watch

import { existsSync, readFileSync, readdirSync, writeFileSync, watch } from "fs";
import { join, resolve } from "path";

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

    // SolidJS — resolve to browser builds (not server builds)
    // solid-js's package.json exports use conditional exports where the
    // default/node/module entries point to dist/server.js which throws
    // "Client-only API called on the server side". require.resolve()
    // runs in Bun/Node context so it picks the server entry. We
    // explicitly map each sub-path to its browser bundle.
    const solidBrowserMap: Record<string, string> = {
      "solid-js": "solid-js/dist/solid.js",
      "solid-js/web": "solid-js/web/dist/web.js",
      "solid-js/store": "solid-js/store/dist/store.js",
    };

    build.onResolve({ filter: /^solid-js(\/.*)?$/ }, (args) => {
      try {
        const browserEntry = solidBrowserMap[args.path];
        const target = browserEntry ?? args.path;
        const resolved = require.resolve(target, {
          paths: [PROJECT_ROOT],
        });
        return { path: resolved };
      } catch {
        return undefined;
      }
    });

    // vlist — only resolve from our benchmark adapters, not from node_modules
    build.onResolve({ filter: /^vlist$/ }, (args) => {
      if (args.importer?.includes("node_modules")) return undefined;
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

// Per-adapter builds redirect ../runner.js imports to the global shim
// so adapters read from window globals set by headless-base.js.
const adapterRunnerShimPlugin: import("bun").BunPlugin = {
  name: "adapter-runner-shim",
  setup(build) {
    build.onResolve({ filter: /\.\.\/runner\.js$/ }, () => {
      return { path: resolve("./benchmarks/runner-global.js") };
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
    const content = new Uint8Array(require("fs").readFileSync(filePath));
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
  const compareEntrypoint = join(BENCHMARKS_DIR, "compare.js");
  const resultsEntrypoint = join(BENCHMARKS_DIR, "results.js");
  const runnerPath = join(BENCHMARKS_DIR, "runner.js");

  if (!existsSync(entrypoint)) {
    console.error("❌ benchmarks/script.js not found");
    process.exit(1);
  }

  if (!existsSync(compareEntrypoint)) {
    console.error("❌ benchmarks/compare.js not found");
    process.exit(1);
  }

  if (!existsSync(resultsEntrypoint)) {
    console.error("❌ benchmarks/results.js not found");
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

    // ── Build compare.js (compare page entry point) ─────────────────────
    console.log("  Building compare.js...");
    const compareResult = await Bun.build({
      entrypoints: [compareEntrypoint],
      outdir: OUT_DIR,
      ...buildOptions(),
      plugins: [frameworkDedupePlugin],
      define,
    });

    if (!compareResult.success) {
      const errors = compareResult.logs.map((log) => log.message).join("\n");
      console.error("❌ Compare build failed:\n", errors);
      console.error("\nBuild logs:");
      compareResult.logs.forEach((log) => {
        console.error(`  ${log.level}: ${log.message}`);
      });
      process.exit(1);
    }
    console.log("  ✅ compare.js");

    // ── Build results.js (results page entry point) ─────────────────────
    console.log("  Building results.js...");
    const resultsResult = await Bun.build({
      entrypoints: [resultsEntrypoint],
      outdir: OUT_DIR,
      ...buildOptions(),
      define,
    });

    if (!resultsResult.success) {
      const errors = resultsResult.logs.map((log) => log.message).join("\n");
      console.error("❌ Results build failed:\n", errors);
      console.error("\nBuild logs:");
      resultsResult.logs.forEach((log) => {
        console.error(`  ${log.level}: ${log.message}`);
      });
      process.exit(1);
    }
    console.log("  ✅ results.js");

    // ── Build headless-base.js (Puppeteer runner API, no adapters) ───────
    const headlessBaseEntrypoint = join(BENCHMARKS_DIR, "headless-base.js");
    console.log("  Building headless-base.js...");
    const headlessBaseResult = await Bun.build({
      entrypoints: [headlessBaseEntrypoint],
      outdir: OUT_DIR,
      ...buildOptions(),
      plugins: [frameworkDedupePlugin],
      define,
    });

    if (!headlessBaseResult.success) {
      const errors = headlessBaseResult.logs.map((log) => log.message).join("\n");
      console.error("❌ Headless base build failed:\n", errors);
      process.exit(1);
    }
    console.log("  ✅ headless-base.js");

    // ── Build per-adapter bundles (one per library) ─────────────────────
    // Each adapter is isolated — a crash in one (e.g. SolidJS module init)
    // doesn't prevent other libraries from being benchmarked.
    const ADAPTERS_DIR = join(BENCHMARKS_DIR, "libraries");
    const ADAPTERS_OUT = join(OUT_DIR, "adapters");
    ensureDir(ADAPTERS_OUT);

    const adapterFiles = readdirSync(ADAPTERS_DIR)
      .filter((f) => f.endsWith(".js") && !f.startsWith("_"));

    console.log(`  Building ${adapterFiles.length} adapter bundles...`);

    const adapterResults = await Promise.all(
      adapterFiles.map(async (file) => {
        const slug = file.replace(/\.js$/, "");
        const result = await Bun.build({
          entrypoints: [join(ADAPTERS_DIR, file)],
          outdir: ADAPTERS_OUT,
          naming: `${slug}.js`,
          ...buildOptions(),
          plugins: [adapterRunnerShimPlugin, frameworkDedupePlugin],
          define,
        });
        return { slug, result };
      }),
    );

    let adaptersFailed = 0;
    for (const { slug, result } of adapterResults) {
      if (!result.success) {
        adaptersFailed++;
        const errors = result.logs.map((log) => log.message).join("; ");
        console.error(`  ❌ ${slug}: ${errors}`);
      }
    }
    console.log(`  ✅ ${adapterFiles.length - adaptersFailed}/${adapterFiles.length} adapters built`);

    // ── Collect CSS ─────────────────────────────────────────────────────
    // Bundle required stylesheets from library packages, then any local
    // overrides. Order matters — later rules win on conflicts.
    const cssParts: string[] = [];

    // Libraries that require their own CSS to render correctly
    const libCssPaths: Array<{ path: string; label: string }> = [
      {
        path: join(".", "node_modules", "vlist", "dist", "vlist.css"),
        label: "vlist",
      },
      {
        path: join(
          ".",
          "node_modules",
          "vue-virtual-scroller",
          "dist",
          "vue-virtual-scroller.css",
        ),
        label: "vue-virtual-scroller",
      },
      {
        path: join(".", "node_modules", "clusterize.js", "clusterize.css"),
        label: "clusterize.js",
      },
    ];

    for (const { path, label } of libCssPaths) {
      if (existsSync(path)) {
        cssParts.push(readFileSync(path, "utf-8"));
        console.log(`  ✅ ${label} CSS (bundled)`);
      } else {
        console.warn(`  ⚠️  ${label} CSS not found at ${path}`);
      }
    }

    const cssPath = join(BENCHMARKS_DIR, "styles.css");
    if (existsSync(cssPath)) {
      cssParts.push(readFileSync(cssPath, "utf-8"));
    }

    const cssOutPath = join(OUT_DIR, "styles.css");
    if (cssParts.length > 0) {
      const minified = minifyCss(cssParts.join("\n"));
      writeFileSync(cssOutPath, minified);
      console.log(
        `  ✅ styles.css (${formatKB(Buffer.byteLength(minified, "utf-8"))} KB)`,
      );
    } else {
      // Write a placeholder so the <link> tag doesn't 404
      writeFileSync(cssOutPath, "/* virtuallist.io benchmark styles */");
    }

    // ── Report bundle sizes ─────────────────────────────────────────────
    const jsPath = join(OUT_DIR, "script.js");
    const compareOutPath = join(OUT_DIR, "compare.js");
    const runnerOutPath = join(OUT_DIR, "runner.js");
    const headlessBaseOutPath = join(OUT_DIR, "headless-base.js");

    const jsSize = Bun.file(jsPath).size;
    const compareSize = Bun.file(compareOutPath).size;
    const resultsOutPath = join(OUT_DIR, "results.js");
    const resultsSize = Bun.file(resultsOutPath).size;
    const runnerSize = Bun.file(runnerOutPath).size;
    const baseSize = Bun.file(headlessBaseOutPath).size;

    let totalAdapterSize = 0;
    for (const file of adapterFiles) {
      const slug = file.replace(/\.js$/, "");
      const p = join(ADAPTERS_OUT, `${slug}.js`);
      if (existsSync(p)) totalAdapterSize += Bun.file(p).size;
    }

    const elapsed = (performance.now() - start).toFixed(0);

    console.log(`
  ✅ Build complete in ${elapsed}ms

  script.js        ${formatKB(jsSize)} KB
  compare.js       ${formatKB(compareSize)} KB
  results.js       ${formatKB(resultsSize)} KB
  headless-base.js ${formatKB(baseSize)} KB
  adapters/        ${formatKB(totalAdapterSize)} KB total (${adapterFiles.length} bundles)
  runner.js        ${formatKB(runnerSize)} KB
  Output:          ${OUT_DIR}/
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
