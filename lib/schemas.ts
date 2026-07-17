import { memoryMessageSchema } from "./memory.mjs";
import {
  chatRequestStrictSchema,
  insightsRequestStrictSchema,
  memoryRequestStrictSchema,
  parseChatRequest,
  parseInsightsRequest,
  parseMemoryRequest,
} from "./request-contract.mjs";

export const messageSchema = memoryMessageSchema;

/** Canonical post-normalize insights request schema. Prefer parseInsightsRequest. */
export const insightsRequestSchema = insightsRequestStrictSchema;

/** Canonical post-normalize chat request schema. Prefer parseChatRequest. */
export const chatRequestSchema = chatRequestStrictSchema;

/** Canonical post-normalize memory request schema. Prefer parseMemoryRequest. */
export const memoryRequestSchema = memoryRequestStrictSchema;

export {
  parseChatRequest,
  parseInsightsRequest,
  parseMemoryRequest,
  chatRequestStrictSchema,
  insightsRequestStrictSchema,
  memoryRequestStrictSchema,
};

export {
  parseReflectionReport,
  reflectionReportJsonSchema,
  reflectionReportSchema,
} from "./insights.mjs";

export {
  athleteMemorySchema,
  athleteMemoryJsonSchema,
  createEmptyAthleteMemory,
  parseAthleteMemory,
  mergeAthleteMemory,
} from "./memory.mjs";
