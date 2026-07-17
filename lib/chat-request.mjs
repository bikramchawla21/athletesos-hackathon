/** Re-exports shared request contract helpers (canonical module: request-contract.mjs). */

export {
  MAX_MESSAGES,
  ensureMessageId,
  normalizeConversationMessages,
  normalizeChatMessages,
  normalizeAthleteMemory,
  normalizeReflectionReport,
  softParseAthleteMemory,
  softParseReflectionReport,
  chatRequestStrictSchema,
  insightsRequestStrictSchema,
  memoryRequestStrictSchema,
  parseChatRequest,
  parseInsightsRequest,
  parseMemoryRequest,
} from "./request-contract.mjs";

export { mergeAthleteMemory } from "./memory.mjs";
