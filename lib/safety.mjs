/**
 * Conservative crisis / self-harm heuristics for AthleteOS.
 * Not a clinical classifier — when unsure, we steer toward human help.
 */

const CRISIS_PATTERNS = [
  /\bkill myself\b/i,
  /\bend my life\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\bself[-\s]?harm\b/i,
  /\bwant to die\b/i,
  /\bgoing to die\b/i,
  /\bhurt myself\b/i,
  /\bcut myself\b/i,
  /\boverdose\b/i,
  /\btake my (?:own )?life\b/i,
  /\bno reason to live\b/i,
  /\bdon't want to (?:be )?alive\b/i,
  /\bdon'?t want to (?:be )?alive\b/i,
];

export const CRISIS_REPLY = `I’m really glad you reached out, and I’m concerned about your safety.

I’m AthleteOS — a performance reflection companion. I’m not a therapist, doctor, or emergency service, and I can’t provide crisis care.

If you might be in immediate danger, please contact local emergency services now, or talk with someone you trust nearby.

If you’re in the US, you can call or text 988 (Suicide & Crisis Lifeline). If you’re elsewhere, please use your local emergency number or a regional crisis line.

When you feel safer, I’m here to listen about your athletic journey — but your safety comes first.`;

/**
 * @param {string} text
 */
export function detectCrisis(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return CRISIS_PATTERNS.some((pattern) => pattern.test(value));
}
