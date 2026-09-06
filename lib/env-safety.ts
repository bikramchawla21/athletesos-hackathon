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
 * Heuristic: Neon hostnames that look like the known pilot/production project
 * should not be migrated without an explicit override.
 */
export function databaseUrlLooksSensitive(url: string): boolean {
  const value = url.trim().toLowerCase();
  if (!value) return false;
  if (process.env.ATHLETEOS_ALLOW_PROD_MIGRATE === "1") return false;
  // Local / ephemeral Neon branches often include "ep-"; still require explicit
  // ATHLETEOS_ENV=production + ALLOW for any migrate when env is production.
  if (getAthleteOsEnv() === "production") return true;
  if (value.includes("neon.tech") && process.env.ATHLETEOS_TREAT_NEON_AS_PILOT === "1") {
    return true;
  }
  return false;
}
