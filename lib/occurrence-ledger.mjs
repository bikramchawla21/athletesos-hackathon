/**
 * Workspace-level occurrence ledger helpers.
 * Episodes = distinct real-world events. Conversations are provenance only.
 */

/**
 * @param {string | null | undefined} value
 */
export function normalizePhenomenonKey(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!raw) return "";
  // Cap length for index safety
  return raw.slice(0, 80);
}

/**
 * @param {string | null | undefined} value
 */
export function normalizeEpisodeKey(value) {
  return normalizePhenomenonKey(value);
}

/**
 * Resolve a stable phenomenon key for ledger writes.
 * Prefers explicit report.phenomenonKey; falls back to normalized pattern title.
 * @param {{ phenomenonKey?: string, pattern?: { title?: string } } | null | undefined} report
 */
export function resolvePhenomenonKeyFromReport(report) {
  const explicit = normalizePhenomenonKey(report?.phenomenonKey);
  if (explicit) return explicit;
  return normalizePhenomenonKey(report?.pattern?.title);
}

/**
 * Extract confident occurrence rows from a reflection report.
 * @param {{
 *   distinctOccurrences?: Array<{ episode?: string, whyDistinct?: string } | null> | null
 * } | null | undefined} report
 * @returns {Array<{ episode: string, episodeKey: string, whyDistinct: string }>}
 */
export function extractConfidentOccurrences(report) {
  const list = report?.distinctOccurrences;
  if (!Array.isArray(list) || list.length === 0) return [];
  const seen = new Set();
  /** @type {Array<{ episode: string, episodeKey: string, whyDistinct: string }>} */
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const episode = typeof item.episode === "string" ? item.episode.trim() : "";
    const why = typeof item.whyDistinct === "string" ? item.whyDistinct.trim() : "";
    if (!episode || !why) continue;
    const episodeKey = normalizeEpisodeKey(episode);
    if (!episodeKey || seen.has(episodeKey)) continue;
    seen.add(episodeKey);
    out.push({ episode, episodeKey, whyDistinct: why });
  }
  return out;
}

/**
 * Merge prior ledger episodes with new report episodes (dedupe by episodeKey).
 * @param {Array<{ episode?: string, episodeKey?: string, whyDistinct?: string }>} prior
 * @param {Array<{ episode: string, episodeKey: string, whyDistinct: string }>} incoming
 */
export function mergeOccurrenceEpisodes(prior = [], incoming = []) {
  const map = new Map();
  for (const row of prior || []) {
    const episodeKey =
      normalizeEpisodeKey(row.episodeKey || row.episode || "") || "";
    if (!episodeKey) continue;
    const episode = String(row.episode || "").trim() || episodeKey;
    const whyDistinct = String(row.whyDistinct || "").trim() || "prior ledger episode";
    map.set(episodeKey, { episode, episodeKey, whyDistinct, fromLedger: true });
  }
  for (const row of incoming || []) {
    const episodeKey = normalizeEpisodeKey(row.episodeKey || row.episode || "");
    if (!episodeKey) continue;
    if (map.has(episodeKey)) continue;
    map.set(episodeKey, {
      episode: row.episode,
      episodeKey,
      whyDistinct: row.whyDistinct,
      fromLedger: false,
    });
  }
  return [...map.values()];
}

/**
 * @param {Array<{ episodeKey?: string }>} merged
 */
export function countMergedOccurrences(merged) {
  return Array.isArray(merged) ? merged.length : 0;
}

/**
 * Compact ledger summary for insights prompts (reuse phenomenonKey; do not invent episodes).
 * @param {Array<{ phenomenonKey: string, episode: string, whyDistinct?: string, conversationId?: string | null }>} rows
 */
export function formatOccurrenceLedgerForInsights(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "Occurrence ledger: (empty — no confirmed distinct real-world episodes stored yet).";
  }
  /** @type {Map<string, Array<{ episode: string }>>} */
  const byKey = new Map();
  for (const row of rows) {
    const key = normalizePhenomenonKey(row.phenomenonKey);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ episode: String(row.episode || "").trim() });
  }
  const lines = ["Occurrence ledger (workspace, confirmed episodes). Reuse phenomenonKey when the same underlying phenomenon recurs:"];
  for (const [key, episodes] of byKey.entries()) {
    lines.push(
      `- ${key} (${episodes.length}): ${episodes
        .map((e) => e.episode)
        .filter(Boolean)
        .slice(0, 6)
        .join(" | ")}`,
    );
  }
  lines.push(
    "When listing distinctOccurrences for this session, include only episodes evidenced in THIS transcript (plus clearly restated distinct historical episodes the athlete named again). Do not fabricate episodes from the ledger alone.",
  );
  return lines.join("\n");
}
