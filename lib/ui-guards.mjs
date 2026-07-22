/** Shared UI guards for empty input and stale async results. */

export function canSendMessage(input, loading, stage) {
  return Boolean(String(input || "").trim()) && !loading && stage === "conversation";
}

export function shouldApplyInsightsResult(currentRequestId, resultRequestId, stage) {
  return currentRequestId === resultRequestId && stage === "generating";
}

/**
 * Apply a chat/reopen result only if this request is still the active one.
 * @param {number} currentRequestId
 * @param {number} resultRequestId
 */
export function shouldApplyChatResult(currentRequestId, resultRequestId) {
  return currentRequestId === resultRequestId;
}

/**
 * Only clear loading when the finishing controller is still active.
 * @param {AbortController | null} activeController
 * @param {AbortController} finishingController
 */
export function shouldClearChatLoading(activeController, finishingController) {
  return activeController === finishingController;
}
