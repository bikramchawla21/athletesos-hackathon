#!/usr/bin/env node
/**
 * Guard for `npm run db:migrate`.
 *
 * Blocks accidental migrations against Neon / production unless explicitly allowed.
 * Temporary overrides (not permanent bypasses):
 *   ATHLETEOS_ALLOW_PROD_MIGRATE=1  — when ATHLETEOS_ENV=production
 *   ATHLETEOS_ALLOW_NEON_MIGRATE=1  — intentional migrate against a Neon URL from local/dev
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";

config({ path: ".env.local" });
config();

const url =
  process.env.DATABASE_URL_UNPOOLED?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";

const raw = (process.env.ATHLETEOS_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "")
  .trim()
  .toLowerCase();
const env =
  raw === "production" ? "production" : raw === "preview" || raw === "staging" ? "preview" : "development";

console.info(`[db:migrate] ATHLETEOS_ENV=${env}`);

if (!url) {
  console.error("[db:migrate] No DATABASE_URL / DATABASE_URL_UNPOOLED configured.");
  process.exit(1);
}

const allowProd = process.env.ATHLETEOS_ALLOW_PROD_MIGRATE === "1";
const allowNeon = process.env.ATHLETEOS_ALLOW_NEON_MIGRATE === "1";
const isNeon = url.toLowerCase().includes("neon.tech");

if (env === "production" && !allowProd) {
  console.error(
    "[db:migrate] Refusing production migrate.\n" +
      "Temporary authorization: ATHLETEOS_ALLOW_PROD_MIGRATE=1 npm run db:migrate\n" +
      "Unset ATHLETEOS_ALLOW_PROD_MIGRATE after the migration succeeds.",
  );
  process.exit(1);
}

if (isNeon && !allowProd && !allowNeon) {
  console.error(
    "[db:migrate] Refusing migrate against a Neon URL without explicit allow.\n" +
      "Local/dev and pilot often share Neon projects by mistake.\n" +
      "If this URL is intentional: ATHLETEOS_ALLOW_NEON_MIGRATE=1 npm run db:migrate\n" +
      "If this is production/pilot: ATHLETEOS_ENV=production ATHLETEOS_ALLOW_PROD_MIGRATE=1 npm run db:migrate\n" +
      "Unset the allow flag after success.",
  );
  process.exit(1);
}

const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
