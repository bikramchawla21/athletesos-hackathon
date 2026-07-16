/** Shared UI guards for empty input and stale async results. */

export function canSendMessage(input, loading, stage) {
  return Boolean(String(input || "").trim()) && !loading && stage === "conversation";
}

export function shouldApplyInsightsResult(currentRequestId, resultRequestId, stage) {
  return currentRequestId === resultRequestId && stage === "generating";
}
