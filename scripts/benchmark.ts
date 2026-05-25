#!/usr/bin/env bun
// scripts/benchmark.ts — Run benchmarks from the command line
//
// Usage:
//   bun run scripts/benchmark.ts                          # all libraries, 10K, default intensity
//   bun run scripts/benchmark.ts --library vlist           # single library
//   bun run scripts/benchmark.ts --library vlist,virtua    # multiple libraries
//   bun run scripts/benchmark.ts --items 1M                # 1M items
//   bun run scripts/benchmark.ts --items 10K,1M            # both sizes
//   bun run scripts/benchmark.ts --items 50000             # custom count
//   bun run scripts/benchmark.ts --intensity quick          # quick/default/full
//   bun run scripts/benchmark.ts --runs 5                   # 5 runs per combo
//   bun run scripts/benchmark.ts --library vlist --items 1M --intensity full --runs 3

import { createProgress } from "./lib/progress";
import { checkServer, runBenchmark, formatCount, formatResult } from "./lib/runner";

const ALL_LIBRARIES = [
  "vlist",
  "clusterize",
  "react-window",
  "react-virtualized",
  "react-virtuoso",
  "tanstack-virtual",
  "tanstack-vue-virtual",
  "tanstack-solid-virtual",
  "vlist-react",
  "vlist-vue",
  "vlist-svelte",
  "vlist-solidjs",
  "virtua",
  "legend-list",
  "vue-virtual-scroller",
];

// =============================================================================
// Arg parsing
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      printUsage();
      process.exit(0);
    }
    if (args[i]!.startsWith("--") && i + 1 < args.length) {
      opts[args[i]!.slice(2)] = args[i + 1]!;
      i++;
    }
  }

  let libraries: string[];
  if (opts.library) {
    libraries = opts.library.split(",").map((s) => s.trim());
    const unknown = libraries.filter((l) => !ALL_LIBRARIES.includes(l));
    if (unknown.length > 0) {
      console.error(`\n  ✗ Unknown libraries: ${unknown.join(", ")}`);
      console.error(`  Available: ${ALL_LIBRARIES.join(", ")}\n`);
      process.exit(1);
    }
  } else {
    libraries = [...ALL_LIBRARIES];
  }

  let itemCounts: number[];
  if (opts.items) {
    itemCounts = opts.items.split(",").map((s) => parseItemCount(s.trim()));
  } else {
    itemCounts = [10_000];
  }

  const validIntensities = ["quick", "default", "full"];
  const intensity = opts.intensity ?? "default";
  if (!validIntensities.includes(intensity)) {
    console.error(`\n  ✗ Invalid intensity: ${intensity}`);
    console.error(`  Available: ${validIntensities.join(", ")}\n`);
    process.exit(1);
  }

  const runs = parseInt(opts.runs ?? "1", 10);
  if (isNaN(runs) || runs < 1) {
    console.error(`\n  ✗ Invalid --runs value: ${opts.runs}\n`);
    process.exit(1);
  }

  return { libraries, itemCounts, intensity, runs };
}

function parseItemCount(s: string): number {
  const lower = s.toLowerCase();
  if (lower.endsWith("m")) return parseFloat(lower) * 1_000_000;
  if (lower.endsWith("k")) return parseFloat(lower) * 1_000;
  const n = parseInt(s, 10);
  if (isNaN(n) || n <= 0) {
    console.error(`\n  ✗ Invalid item count: ${s}\n`);
    process.exit(1);
  }
  return n;
}

function printUsage() {
  console.log(`
  Usage: bun run scripts/benchmark.ts [options]

  Options:
    --library <slugs>      Comma-separated library slugs (default: all)
    --items <counts>       Comma-separated item counts: 10K, 1M, or number (default: 10K)
    --intensity <level>    quick | default | full (default: default)
    --runs <n>             Runs per library/size combo (default: 1)
    --help                 Show this help

  Examples:
    bun run scripts/benchmark.ts --library vlist --items 1M --intensity full
    bun run scripts/benchmark.ts --library vlist,virtua,react-window --items 10K,1M --runs 3
    bun run scripts/benchmark.ts --intensity quick

  Libraries:
    ${ALL_LIBRARIES.join(", ")}
`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const { libraries, itemCounts, intensity, runs } = parseArgs();

  const total = libraries.length * itemCounts.length * runs;
  const itemsLabel = itemCounts.map(formatCount).join(", ");

  console.log(`\n  Benchmark`);
  console.log(`  Libraries:  ${libraries.length === ALL_LIBRARIES.length ? "all" : libraries.join(", ")}`);
  console.log(`  Items:      ${itemsLabel}`);
  console.log(`  Intensity:  ${intensity}`);
  console.log(`  Runs:       ${runs}x`);
  console.log(`  Total:      ${total} benchmarks\n`);

  await checkServer();

  const progress = createProgress(total);
  let completed = 0;
  let failed = 0;

  for (const slug of libraries) {
    for (const itemCount of itemCounts) {
      const countLabel = formatCount(itemCount);

      for (let run = 1; run <= runs; run++) {
        const idx = completed + failed;
        const runSuffix = runs > 1 ? ` #${run}` : "";
        const label = `${slug} @ ${countLabel}${runSuffix}`;

        progress.update({ current: idx, label, phase: "starting..." });

        const result = await runBenchmark({
          librarySlug: slug,
          itemCount,
          intensity,
          onStatus: (phase) => progress.update({ current: idx, label, phase }),
        });

        if (result?.success) {
          progress.succeed(`${label}  ${formatResult(result)}`);
          completed++;
        } else {
          progress.fail(label);
          failed++;
        }
      }
    }
  }

  const status = failed === 0 ? `Done: ${completed}/${total} passed` : `Done: ${completed}/${total} passed, ${failed} failed`;
  progress.done(status);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
