/**
 * Pure pilot-dashboard analytics (no DB I/O).
 * Retention and memory-age helpers are defined here so tests can fixture them.
 */

/** Status thresholds (days since last completed session). Easy to change. */
export const PILOT_STATUS = {
  activeWithinDays: 3,
  atRiskWithinDays: 7,
};

/**
 * Retention Dn:
 * Among athletes whose first completed reflection was at least `n` calendar days ago,
 * the share who completed at least one additional reflection on calendar day
 * (activation_day + n). Athletes not yet old enough are excluded (not counted as failures).
 *
 * @param {{ activationDate: Date, completedDates: Date[] }[]} athletes
 * @param {number} n
 * @param {Date} [asOf]
 */
export function computeRetentionDn(athletes, n, asOf = new Date()) {
  const eligible = [];
  let retained = 0;
  for (const athlete of athletes) {
    if (!athlete.activationDate) continue;
    const act = startOfUtcDay(athlete.activationDate);
    const ageDays = diffUtcDays(act, startOfUtcDay(asOf));
    if (ageDays < n) continue;
    eligible.push(athlete);
    const target = addUtcDays(act, n);
    const hit = athlete.completedDates.some((d) => sameUtcDay(d, target));
    if (hit) retained += 1;
  }
  return {
    n,
    eligible: eligible.length,
    retained,
    rate: eligible.length === 0 ? null : retained / eligible.length,
  };
}

/**
 * @param {Date} insightAt
 * @param {Date | null} oldestEvidenceAt
 * @returns {"same_day"|"1_7"|"8_14"|"15_30"|"30_plus"|"unavailable"}
 */
export function memoryAgeBucket(insightAt, oldestEvidenceAt) {
  if (!oldestEvidenceAt) return "unavailable";
  const days = diffUtcDays(startOfUtcDay(oldestEvidenceAt), startOfUtcDay(insightAt));
  if (days <= 0) return "same_day";
  if (days <= 7) return "1_7";
  if (days <= 14) return "8_14";
  if (days <= 30) return "15_30";
  return "30_plus";
}

/**
 * @param {{
 *   insightAt: Date,
 *   evidence: { conversationId: string, createdAt: Date }[],
 * }} args
 */
export function analyzeInsightProvenance(args) {
  const evidence = args.evidence || [];
  if (evidence.length === 0) {
    return {
      available: false,
      supportingEvidenceCount: 0,
      supportingConversationCount: 0,
      oldestSupportingEvidenceAt: null,
      newestSupportingEvidenceAt: null,
      memoryReferenceAgeDays: null,
      crossSession: false,
      bucket: /** @type {const} */ ("unavailable"),
    };
  }

  const conversationIds = new Set(evidence.map((e) => e.conversationId).filter(Boolean));
  const times = evidence.map((e) => e.createdAt.getTime()).sort((a, b) => a - b);
  const oldest = new Date(times[0]);
  const newest = new Date(times[times.length - 1]);
  const ageDays = diffUtcDays(startOfUtcDay(oldest), startOfUtcDay(args.insightAt));

  return {
    available: true,
    supportingEvidenceCount: evidence.length,
    supportingConversationCount: conversationIds.size,
    oldestSupportingEvidenceAt: oldest,
    newestSupportingEvidenceAt: newest,
    memoryReferenceAgeDays: Math.max(0, ageDays),
    crossSession: conversationIds.size >= 2,
    bucket: memoryAgeBucket(args.insightAt, oldest),
  };
}

/**
 * @param {Date | null} lastCompletedAt
 * @param {Date} [asOf]
 * @returns {"active"|"at_risk"|"inactive"|"never"}
 */
export function deriveUsageStatus(lastCompletedAt, asOf = new Date()) {
  if (!lastCompletedAt) return "never";
  const days = diffUtcDays(startOfUtcDay(lastCompletedAt), startOfUtcDay(asOf));
  if (days <= PILOT_STATUS.activeWithinDays) return "active";
  if (days <= PILOT_STATUS.atRiskWithinDays) return "at_risk";
  return "inactive";
}

/**
 * Map pattern_feedback.response → founder label.
 * @param {string} response
 */
export function feedbackLabel(response) {
  if (response === "agree") return "Yes";
  if (response === "partially_agree") return "Kind of";
  if (response === "disagree") return "No";
  return response;
}

export function startOfUtcDay(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function sameUtcDay(a, b) {
  return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}

export function addUtcDays(date, days) {
  const d = startOfUtcDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Whole calendar days from `from` to `to` (UTC). */
export function diffUtcDays(from, to) {
  const ms = startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Aggregate pilot-level intelligence rates from analyzed insights + feedback.
 * @param {{
 *   provenance: ReturnType<typeof analyzeInsightProvenance>,
 *   feedback: "Yes"|"Kind of"|"No"|null,
 * }[]} insights
 */
export function aggregateIntelligenceRates(insights) {
  const completed = insights.length;
  const withEvidence = insights.filter((i) => i.provenance.available);
  const crossSession = withEvidence.filter((i) => i.provenance.crossSession).length;
  const historical7 = withEvidence.filter(
    (i) => (i.provenance.memoryReferenceAgeDays ?? 0) > 7,
  ).length;
  const historical14 = withEvidence.filter(
    (i) => (i.provenance.memoryReferenceAgeDays ?? 0) > 14,
  ).length;
  const answered = insights.filter((i) => i.feedback);
  const novel = answered.filter((i) => i.feedback === "No").length;
  const historicalAnswered = withEvidence.filter(
    (i) => (i.provenance.memoryReferenceAgeDays ?? 0) > 7 && i.feedback,
  );
  const historicalNovel = historicalAnswered.filter((i) => i.feedback === "No").length;

  return {
    completedInsights: completed,
    withEvidenceCount: withEvidence.length,
    crossSessionCount: crossSession,
    crossSessionRate: withEvidence.length ? crossSession / withEvidence.length : null,
    historicalInsightRate: withEvidence.length ? historical7 / withEvidence.length : null,
    longMemoryInsightRate: withEvidence.length ? historical14 / withEvidence.length : null,
    novelInsightRate: answered.length ? novel / answered.length : null,
    historicalNovelInsightRate: historicalAnswered.length
      ? historicalNovel / historicalAnswered.length
      : null,
    feedbackYes: answered.filter((i) => i.feedback === "Yes").length,
    feedbackKindOf: answered.filter((i) => i.feedback === "Kind of").length,
    feedbackNo: answered.filter((i) => i.feedback === "No").length,
  };
}
