/** Shared API error codes and response helpers for AthleteOS routes. */

export const ERROR_CODES = {
  INVALID_CHAT_REQUEST: "INVALID_CHAT_REQUEST",
  INVALID_INSIGHTS_REQUEST: "INVALID_INSIGHTS_REQUEST",
  INVALID_MEMORY_REQUEST: "INVALID_MEMORY_REQUEST",
  INVALID_CHAT_RESPONSE: "INVALID_CHAT_RESPONSE",
  INVALID_INSIGHTS_RESPONSE: "INVALID_INSIGHTS_RESPONSE",
  INVALID_MEMORY_RESPONSE: "INVALID_MEMORY_RESPONSE",
  MEMORY_MIGRATION_FAILED: "MEMORY_MIGRATION_FAILED",
  OPENAI_REQUEST_FAILED: "OPENAI_REQUEST_FAILED",
  INSUFFICIENT_CONTEXT: "insufficient_context",
  UNKNOWN: "unknown",
};

/**
 * @returns {boolean}
 */
export function isDevEnvironment() {
  return process.env.NODE_ENV !== "production";
}

/**
 * @param {import('zod').ZodError | { issues?: { path: (string|number)[], message: string }[] }} error
 * @returns {{ path: string, message: string }[]}
 */
export function formatZodIssues(error) {
  const issues = error?.issues;
  if (!Array.isArray(issues)) return [];
  return issues.slice(0, 20).map((issue) => ({
    path: Array.isArray(issue.path) ? issue.path.join(".") : String(issue.path ?? ""),
    message: issue.message || "Invalid value",
  }));
}

/**
 * @param {{
 *   code: string,
 *   message: string,
 *   issues?: { path: string, message: string }[],
 *   keys?: string[],
 *   phase?: string,
 * }} args
 */
export function validationErrorBody(args) {
  /** @type {Record<string, unknown>} */
  const body = {
    error: args.message,
    message: args.message,
    code: args.code,
  };
  if (isDevEnvironment()) {
    if (args.issues?.length) body.issues = args.issues;
    if (args.keys) body.requestKeys = args.keys;
    if (args.phase) body.phase = args.phase;
  }
  return body;
}

/**
 * Safe log of validation failure (no secrets / full transcripts).
 * @param {string} route
 * @param {string} phase
 * @param {{ path: string, message: string }[]} [issues]
 * @param {unknown} [json]
 */
export function logValidationFailure(route, phase, issues = [], json) {
  const keys =
    json && typeof json === "object" && !Array.isArray(json)
      ? Object.keys(/** @type {object} */ (json))
      : [];
  console.warn(`[${route}] ${phase}`, {
    issuePaths: issues.map((i) => i.path).slice(0, 12),
    requestKeys: keys,
  });
}
