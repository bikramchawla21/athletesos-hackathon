/** Voice session-end heuristics (no extra model call). */

export const MIN_USER_TURNS_BEFORE_SESSION_END = 3;

const END_INTENT_PATTERNS = [
  /^no\.?$/i,
  /^nope\.?$/i,
  /^nah\.?$/i,
  /^that's it\.?$/i,
  /^thats it\.?$/i,
  /^that is it\.?$/i,
  /^that's all\.?$/i,
  /^thats all\.?$/i,
  /^that is all\.?$/i,
  /^nothing else\.?$/i,
  /^nothing more\.?$/i,
  /^i'?m done\.?$/i,
  /^im done\.?$/i,
  /^done\.?$/i,
  /^all good\.?$/i,
  /^all set\.?$/i,
  /^no[,.]?\s+(that'?s|thats|nothing|i'?m|im)\b/i,
  /\b(nothing else|that'?s (it|all)|i'?m done|no more)\b/i,
];

/**
 * Clear conversational end intent from the athlete.
 * Short answers that are not end phrases must return false.
 * @param {string} text
 */
export function looksLikeSessionEndIntent(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  // Allow short natural endings, but not arbitrary short answers like "yeah" / "okay".
  if (value.length > 120) {
    // Still allow longer "No, that's it for today..." style closers.
    return END_INTENT_PATTERNS.some((pattern) => pattern.test(value));
  }
  return END_INTENT_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * @param {string} text
 */
export function looksLikeAnythingElsePrompt(text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return false;
  return (
    value.includes("anything else from today") ||
    value.includes("anything else today") ||
    /anything else\b/.test(value)
  );
}

/**
 * @param {{
 *   userTurnCount: number,
 *   athleteText: string,
 *   askedAnythingElse?: boolean,
 *   explicitDone?: boolean,
 * }} args
 */
export function shouldFinalizeVoiceSession(args) {
  if (args.explicitDone) {
    return args.userTurnCount >= 1;
  }
  if (args.userTurnCount < MIN_USER_TURNS_BEFORE_SESSION_END) {
    return false;
  }
  if (!looksLikeSessionEndIntent(args.athleteText)) {
    return false;
  }
  // Prefer end after AthleteOS asked "Anything else…", but clear end intent
  // with enough turns is also enough so the athlete stays in control.
  return true;
}
