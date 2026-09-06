#!/usr/bin/env node
/**
 * Print pilot health SQL and optionally execute it when DATABASE_URL is set.
 * Never prints message content.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local" });
config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(__dirname, "pilot-health.sql");
const sql = readFileSync(sqlPath, "utf8");

console.log("--- pilot health SQL ---");
console.log(sql);
console.log("--- end SQL ---\n");

const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.info("No DATABASE_URL set — paste the SQL into Neon SQL Editor.");
  process.exit(0);
}

if (process.env.PILOT_HEALTH_EXECUTE !== "1") {
  console.info(
    "DATABASE_URL is set. Re-run with PILOT_HEALTH_EXECUTE=1 to query (read-only SQL).",
  );
  process.exit(0);
}

const { default: pg } = await import("pg").catch(() => ({ default: null }));
if (!pg) {
  console.info(
    "Optional execute needs the `pg` package. Prefer Neon SQL Editor with scripts/pilot-health.sql.",
  );
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const result = await client.query(sql);
  console.table(result.rows);
} finally {
  await client.end();
}
