/** Heuristics for memory sync checkpoints (client + tests). */

export const MEMORY_CHECKPOINT_USER_TURNS = 3;

const CORRECTION_PATTERNS = [
  /\bthat'?s not (right|correct|true|what i)\b/i,
  /\byou (misunderstood|misread|got that wrong)\b/i,
  /\bi (didn'?t|did not) mean\b/i,
  /\bactually[,:]?\s/i,
  /\bnot what i (said|meant)\b/i,
  /\bi'?m correcting\b/i,
  /\bthat'?s wrong\b/i,
];

/**
 * @param {string} text
 */
export function looksLikeAthleteCorrection(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return CORRECTION_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * @param {number} userTurnCount
 * @param {number} lastSyncedUserTurnCount
 * @param {number} [everyN]
 */
export function shouldSyncMemoryCheckpoint(
  userTurnCount,
  lastSyncedUserTurnCount,
  everyN = MEMORY_CHECKPOINT_USER_TURNS,
) {
  const turns = Number(userTurnCount) || 0;
  const last = Number(lastSyncedUserTurnCount) || 0;
  if (turns <= 0) return false;
  return turns - last >= everyN;
}

/**
 * @param {"first_conversation" | "building_understanding" | "training_together"} current
 * @param {number} sessionCount
 */
export function nextRelationshipStage(current, sessionCount) {
  if (sessionCount >= 2) return "training_together";
  if (sessionCount >= 1) return "building_understanding";
  return current || "first_conversation";
}
