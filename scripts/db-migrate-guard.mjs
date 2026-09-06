#!/usr/bin/env node
/**
 * Guard for `npm run db:migrate`.
 * Blocks accidental migrations when ATHLETEOS_ENV=production
 * unless ATHLETEOS_ALLOW_PROD_MIGRATE=1.
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

const allow = process.env.ATHLETEOS_ALLOW_PROD_MIGRATE === "1";
const treatNeonAsPilot = process.env.ATHLETEOS_TREAT_NEON_AS_PILOT === "1";
const sensitive =
  !allow &&
  (env === "production" || (treatNeonAsPilot && url.toLowerCase().includes("neon.tech")));

if (sensitive) {
  console.error(
    "[db:migrate] Refusing to migrate a production/pilot-like database.\n" +
      "Use a separate Neon project for local/dev.\n" +
      "To proceed deliberately: ATHLETEOS_ALLOW_PROD_MIGRATE=1 npm run db:migrate",
  );
  process.exit(1);
}

const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
