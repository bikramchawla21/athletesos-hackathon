/**
 * Longitudinal pattern threshold: thrice is a pattern.
 *
 * "Thrice" = three DISTINCT REAL-WORLD OCCURRENCES of the same/similar phenomenon.
 * NOT three conversations, NOT three messages about one event.
 *
 * Maturity = workspace occurrence ledger (prior confirmed episodes for the phenomenon)
 * PLUS confident new episodes from the current reflection report, deduped by episodeKey.
 * If the combined set is < 3 (or ambiguous), AthleteOS MUST NOT present an athlete-facing
 * pattern (precision over recall). Conversation IDs remain provenance only.
 */

import {
  extractConfidentOccurrences,
  mergeOccurrenceEpisodes,
  countMergedOccurrences,
} from "./occurrence-ledger.mjs";

export const PATTERN_MIN_DISTINCT_OCCURRENCES = 3;

/** Statuses that may enter AthleteMemory as longitudinal patterns. */
export const ATHLETE_FACING_PATTERN_STATUSES = Object.freeze(
  /** @type {readonly ["emerging", "revised"]} */ (["emerging", "revised"]),
);

/**
 * @param {number} distinctOccurrenceCount
 * @returns {"proposed" | "emerging"}
 */
export function resolvePatternPersistStatus(distinctOccurrenceCount) {
  const n = Number(distinctOccurrenceCount) || 0;
  if (n >= PATTERN_MIN_DISTINCT_OCCURRENCES) return "emerging";
  return "proposed";
}

/**
 * @param {number} distinctOccurrenceCount
 */
export function isAthleteFacingLongitudinalPattern(distinctOccurrenceCount) {
  return (Number(distinctOccurrenceCount) || 0) >= PATTERN_MIN_DISTINCT_OCCURRENCES;
}

/**
 * Count confident distinct real-world occurrences from a reflection report only
 * (current session enumeration). Ambiguous / missing → 0.
 *
 * @param {{
 *   distinctOccurrences?: Array<{ episode?: string, whyDistinct?: string } | null> | null
 * } | null | undefined} report
 */
export function countConfidentDistinctOccurrences(report) {
  return extractConfidentOccurrences(report).length;
}

/**
 * Resolve occurrence maturity for persist/presentation.
 * Does NOT use conversation/session counts as the eligibility unit.
 * Prefer priorOccurrences from the workspace ledger for the same phenomenonKey.
 *
 * @param {{
 *   report?: object | null,
 *   priorOccurrences?: Array<{ episode?: string, episodeKey?: string, whyDistinct?: string }>
 * }} args
 */
export function resolveOccurrenceMaturity(args = {}) {
  const incoming = extractConfidentOccurrences(args.report);
  const merged = mergeOccurrenceEpisodes(args.priorOccurrences || [], incoming);
  return countMergedOccurrences(merged);
}

const LONGITUDINAL_CLAIM =
  /\b(this is a pattern|you tend to|you often|this keeps happening|we(?:'|’)ve seen|becoming a pattern|lasting pattern|longitudinal)\b/i;

/**
 * Rewrite athlete-facing report language when occurrence threshold is not met.
 * @param {import('./types').ReflectionReport} report
 * @param {number} distinctOccurrenceCount
 * @returns {import('./types').ReflectionReport}
 */
export function presentReportForPatternMaturity(report, distinctOccurrenceCount) {
  const n = Number(distinctOccurrenceCount) || 0;
  if (!report?.pattern) return report;
  if (n >= PATTERN_MIN_DISTINCT_OCCURRENCES) return report;

  const title = String(report.pattern.title || "").trim() || "something from today";
  const explanation = String(report.pattern.explanation || "").trim();
  const occurrences = Array.isArray(report.distinctOccurrences)
    ? report.distinctOccurrences
    : [];

  if (n <= 1) {
    return {
      ...report,
      distinctOccurrences: occurrences,
      evidenceIntro:
        "From what you described, a few details stood out — still not enough distinct real-world episodes to call this a pattern.",
      evidenceNote:
        "AthleteOS only treats something as a pattern after three clearly separate occurrences of the same phenomenon. Repeated wording about one event still counts as one occurrence.",
      pattern: {
        title: title.replace(/^pattern:\s*/i, ""),
        explanation:
          (explanation && !LONGITUDINAL_CLAIM.test(explanation)
            ? explanation
            : `From what you described today, ${title.replace(/\.$/, "")} showed up.`) +
          " I’m treating this as an observation/candidate signal, not an established pattern yet.",
      },
    };
  }

  // Two confident occurrences: coincidence / early recurrence — not a pattern.
  return {
    ...report,
    distinctOccurrences: occurrences,
    evidenceIntro:
      "This has shown up in more than one distinct situation — still early, not an established pattern.",
    evidenceNote:
      "Two occurrences can mark coincidence or a possible signal. AthleteOS waits for a third distinct real-world occurrence before calling it a pattern.",
    pattern: {
      title: title.replace(/^pattern:\s*/i, ""),
      explanation:
        (explanation && !LONGITUDINAL_CLAIM.test(explanation)
          ? explanation
          : `This has come up in two separate situations: ${title.replace(/\.$/, "")}.`) +
        " I’m watching it as a possible signal, not locking it in as a pattern yet.",
    },
  };
}

/**
 * Deterministic spoken closing keyed to occurrence maturity.
 * @param {import('./types').ReflectionReport} report
 * @param {number} distinctOccurrenceCount
 */
export function spokenSynthesisForPatternMaturity(report, distinctOccurrenceCount) {
  const n = Number(distinctOccurrenceCount) || 0;
  const title = report?.pattern?.title?.trim() || "something from today’s session";
  const clean = title.replace(/\.$/, "");
  if (n >= PATTERN_MIN_DISTINCT_OCCURRENCES) {
    return `This is becoming a pattern worth watching: ${clean}. It has shown up across enough separate situations to take seriously.`;
  }
  if (n === 2) {
    return `This has shown up in two separate situations: ${clean}. Still early — not an established pattern yet.`;
  }
  return `One thing I noticed from today: ${clean}. I’m treating that as today’s observation, not a lasting pattern.`;
}

/**
 * @param {number} distinctOccurrenceCount
 */
export function spokenMaturityInstruction(distinctOccurrenceCount) {
  const n = Number(distinctOccurrenceCount) || 0;
  if (n >= PATTERN_MIN_DISTINCT_OCCURRENCES) {
    return "Maturity: three or more distinct real-world occurrences. You may carefully name an emerging pattern.";
  }
  if (n === 2) {
    return "Maturity: two distinct occurrences only (coincidence). You may note cautious recurrence. Do NOT call it a pattern, tendency, or something that keeps happening.";
  }
  return "Maturity: fewer than two confident distinct occurrences (or ambiguous). Use observation language (Today… / From what you described…). Do NOT claim a pattern, tendency, or longitudinal certainty. Do not treat multiple statements about one event as multiple occurrences.";
}

/** @deprecated Use PATTERN_MIN_DISTINCT_OCCURRENCES */
export const PATTERN_MIN_DISTINCT_CONVERSATIONS = PATTERN_MIN_DISTINCT_OCCURRENCES;

/**
 * @deprecated Conversation count is not pattern eligibility. Prefer resolveOccurrenceMaturity.
 */
export function resolveSessionPatternMaturity() {
  return 0;
}

export function countDistinctConversationIds(conversationIds) {
  const set = new Set();
  for (const id of conversationIds || []) {
    if (typeof id === "string" && id.trim()) set.add(id.trim());
  }
  return set.size;
}
