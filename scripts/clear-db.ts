// scripts/clear-db.ts
// Clears all data from the benchmarks database without dropping tables.
//
// Usage:
//   bun run clear:db

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { resolve } from "path";

const DB_PATH = resolve(import.meta.dir, "../data/benchmarks.db");

if (!existsSync(DB_PATH)) {
  console.log(`\n  ✗ benchmarks.db not found at ${DB_PATH}`);
  console.log(`  Run: bun run seed:db\n`);
  process.exit(1);
}

const db = new Database(DB_PATH);

type CountRow = { count: number };

const before = {
  runs: db.query<CountRow, []>("SELECT COUNT(*) as count FROM benchmark_runs").get()!.count,
  metrics: db.query<CountRow, []>("SELECT COUNT(*) as count FROM benchmark_metrics").get()!.count,
};

db.run("DELETE FROM benchmark_metrics");
db.run("DELETE FROM benchmark_runs");
db.run("VACUUM");

console.log(`\n  Cleared benchmarks database\n`);
console.log(`  benchmark_runs:    ${before.runs} → 0`);
console.log(`  benchmark_metrics: ${before.metrics} → 0`);

const fileSize = Bun.file(DB_PATH).size;
const sizeKB = (fileSize / 1024).toFixed(1);
console.log(`\n  Database size: ${sizeKB} KB\n`);

db.close();
