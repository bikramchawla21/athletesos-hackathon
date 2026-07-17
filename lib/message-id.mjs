/** Create stable client-side message ids. */

export const OPENING_MESSAGE_ID = "opening";

/**
 * @returns {string}
 */
export function createMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
