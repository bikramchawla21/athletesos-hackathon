/**
 * Environment separation helpers for pilot vs local/dev.
 *
 * ATHLETEOS_ENV: development | preview | production
 * DATABASE_URL / DATABASE_URL_UNPOOLED select which Neon project is targeted.
 */

export type AthleteOsEnv = "development" | "preview" | "production";

export function getAthleteOsEnv(): AthleteOsEnv {
  const raw = (process.env.ATHLETEOS_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  if (raw === "production") return "production";
  if (raw === "preview" || raw === "staging") return "preview";
  return "development";
}

export function isProductionLikeEnv(): boolean {
  return getAthleteOsEnv() === "production";
}

/** True when workspace hard-reset is allowed (never default-on in production). */
export function isWorkspaceResetAllowed(): boolean {
  if (!isProductionLikeEnv()) return true;
  return process.env.ALLOW_PILOT_WORKSPACE_RESET === "1";
}

/**
 * Heuristic: Neon / production DBs must not be migrated casually.
 * Prefer scripts/db-migrate-guard.mjs (blocks neon.tech unless allow flags set).
 */
export function databaseUrlLooksSensitive(url: string): boolean {
  const value = url.trim().toLowerCase();
  if (!value) return false;
  if (process.env.ATHLETEOS_ALLOW_PROD_MIGRATE === "1") return false;
  if (process.env.ATHLETEOS_ALLOW_NEON_MIGRATE === "1" && getAthleteOsEnv() !== "production") {
    return false;
  }
  if (getAthleteOsEnv() === "production") return true;
  if (value.includes("neon.tech")) return true;
  return false;
}
