/**
 * Structured operational logs — no transcripts, audio, or secrets.
 * @param {string} route
 * @param {Record<string, unknown>} fields
 */
export function logOps(route, fields = {}) {
  const safe = { ...fields };
  for (const key of Object.keys(safe)) {
    if (/transcript|content|message|reply|audio|secret|key|authorization/i.test(key)) {
      delete safe[key];
    }
  }
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      route,
      ...safe,
    }),
  );
}

/**
 * @param {string} route
 * @param {unknown} error
 * @param {Record<string, unknown>} [fields]
 */
export function logOpsError(route, error, fields = {}) {
  const message =
    error instanceof Error ? error.message.slice(0, 200) : "unknown_error";
  logOps(route, {
    level: "error",
    errorCategory: message,
    ...fields,
  });
}
