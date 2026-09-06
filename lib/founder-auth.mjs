/** Pure founder allowlist helpers (no Clerk imports — safe for node:test). */

export function parseFounderClerkUserIds(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getFounderClerkUserIdsFromEnv(env = process.env) {
  return parseFounderClerkUserIds(env.FOUNDER_CLERK_USER_IDS);
}

export function isFounderClerkUserId(clerkUserId, env = process.env) {
  if (!clerkUserId) return false;
  return getFounderClerkUserIdsFromEnv(env).includes(clerkUserId);
}
