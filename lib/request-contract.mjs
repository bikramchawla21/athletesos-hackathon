/**
 * Canonical normalize → strict-parse boundary for chat, insights, and memory requests.
 * Item-level memory repair preserves valid claims; whole-object discard only when unrecoverable.
 */

import { z } from "zod";
import { formatZodIssues } from "./api-errors.mjs";
import { reflectionReportSchema } from "./insights.mjs";
import {
  ATHLETE_MEMORY_VERSION,
  athleteMemorySchema,
  correctionMemorySchema,
  createEmptyAthleteMemory,
  memoryItemSchema,
  memoryMessageSchema,
  normalizeUnderstandingCoverage,
  patternMemorySchema,
  priorityMemorySchema,
  understandingCoverageSchema,
} from "./memory.mjs";

export const MAX_MESSAGES = 40;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function ensureMessageId(value) {
  if (typeof value === "string" && value.trim().length > 0 && value.length <= 80) {
    return value.trim();
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {unknown} messages
 * @returns {{ id: string, role: "user" | "assistant", content: string }[]}
 */
export function normalizeConversationMessages(messages) {
  if (!Array.isArray(messages)) return [];

  const normalized = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const role = raw.role === "user" || raw.role === "assistant" ? raw.role : null;
    const content = typeof raw.content === "string" ? raw.content.trim() : "";
    if (!role || !content) continue;
    const parsed = memoryMessageSchema.safeParse({
      id: ensureMessageId(raw.id),
      role,
      content: content.slice(0, 5000),
    });
    if (parsed.success) normalized.push(parsed.data);
  }

  return normalized.slice(-MAX_MESSAGES);
}

/** @deprecated Use normalizeConversationMessages */
export const normalizeChatMessages = normalizeConversationMessages;

/**
 * @param {unknown} items
 * @param {z.ZodTypeAny} itemSchema
 * @param {string} field
 * @param {string[]} warnings
 */
function filterValidItems(items, itemSchema, field, warnings) {
  if (items == null) return [];
  if (!Array.isArray(items)) {
    warnings.push(`${field}: expected array, coerced to []`);
    return [];
  }
  const kept = [];
  for (let i = 0; i < items.length; i += 1) {
    const result = itemSchema.safeParse(items[i]);
    if (result.success) {
      kept.push(result.data);
    } else {
      warnings.push(`${field}[${i}]: dropped (${result.error.issues[0]?.message || "invalid"})`);
    }
  }
  return kept;
}

/**
 * @param {unknown} items
 * @param {string[]} warnings
 */
function filterOpenQuestions(items, warnings) {
  if (items == null) return [];
  if (!Array.isArray(items)) {
    warnings.push("openQuestions: expected array, coerced to []");
    return [];
  }
  const kept = [];
  for (let i = 0; i < items.length; i += 1) {
    const result = z.string().min(1).max(300).safeParse(items[i]);
    if (result.success) kept.push(result.data);
    else warnings.push(`openQuestions[${i}]: dropped`);
  }
  return kept.slice(0, 8);
}

/**
 * Normalize athlete memory with item-level repair, then strict-parse.
 * @param {unknown} raw
 * @param {{ allowEmptyFallback?: boolean }} [options]
 * @returns {{
 *   ok: true,
 *   memory: import('./types').AthleteMemory,
 *   warnings: string[],
 *   migrationFailed?: boolean,
 * } | {
 *   ok: false,
 *   issues: { path: string, message: string }[],
 *   warnings: string[],
 * }}
 */
export function normalizeAthleteMemory(raw, options = {}) {
  const allowEmptyFallback = options.allowEmptyFallback !== false;
  const rejectUnrecoverable = options.rejectUnrecoverable === true;
  const warnings = [];
  const empty = createEmptyAthleteMemory();

  if (raw == null) {
    warnings.push("memory: missing — using empty default");
    if (rejectUnrecoverable) {
      return {
        ok: false,
        issues: [{ path: "memory", message: "Memory was required but missing" }],
        warnings,
      };
    }
    return { ok: true, memory: empty, warnings };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    const issues = [{ path: "memory", message: "Expected an object" }];
    if (!allowEmptyFallback || rejectUnrecoverable) return { ok: false, issues, warnings };
    console.warn("MEMORY_MIGRATION_FAILED: memory was not an object; resetting to empty");
    return {
      ok: true,
      memory: empty,
      warnings: [...warnings, "memory: not an object — reset"],
      migrationFailed: true,
    };
  }

  const src = /** @type {Record<string, unknown>} */ (raw);
  const stages = new Set([
    "first_conversation",
    "building_understanding",
    "training_together",
  ]);

  const identityRaw =
    src.identity && typeof src.identity === "object" && !Array.isArray(src.identity)
      ? /** @type {Record<string, unknown>} */ (src.identity)
      : {};

  const coverageRaw = normalizeUnderstandingCoverage(src.understandingCoverage);
  const coverageParsed = understandingCoverageSchema.safeParse(coverageRaw);
  if (!coverageParsed.success && src.understandingCoverage != null) {
    warnings.push("understandingCoverage: repaired to defaults");
  }

  const draft = {
    version: ATHLETE_MEMORY_VERSION,
    createdAt:
      typeof src.createdAt === "string" && src.createdAt.trim()
        ? src.createdAt.trim()
        : empty.createdAt,
    updatedAt:
      typeof src.updatedAt === "string" && src.updatedAt.trim()
        ? src.updatedAt.trim()
        : empty.updatedAt,
    relationshipStage: stages.has(/** @type {string} */ (src.relationshipStage))
      ? src.relationshipStage
      : empty.relationshipStage,
    identity: {
      name: identityRaw.name ?? null,
      sport: identityRaw.sport ?? null,
      level: identityRaw.level ?? null,
      background: Array.isArray(identityRaw.background)
        ? identityRaw.background
            .filter((v) => typeof v === "string" && v.trim())
            .map((v) => String(v).trim().slice(0, 200))
            .slice(0, 8)
        : [],
    },
    goals: filterValidItems(src.goals, memoryItemSchema, "goals", warnings).slice(0, 8),
    motivations: filterValidItems(src.motivations, memoryItemSchema, "motivations", warnings).slice(
      0,
      8,
    ),
    challenges: filterValidItems(src.challenges, memoryItemSchema, "challenges", warnings).slice(
      0,
      8,
    ),
    significantExperiences: filterValidItems(
      src.significantExperiences,
      memoryItemSchema,
      "significantExperiences",
      warnings,
    ).slice(0, 8),
    observedPatterns: filterValidItems(
      src.observedPatterns,
      patternMemorySchema,
      "observedPatterns",
      warnings,
    ).slice(0, 6),
    athleteCorrections: filterValidItems(
      src.athleteCorrections,
      correctionMemorySchema,
      "athleteCorrections",
      warnings,
    ).slice(0, 8),
    previousPriorities: filterValidItems(
      src.previousPriorities,
      priorityMemorySchema,
      "previousPriorities",
      warnings,
    ).slice(0, 5),
    openQuestions: filterOpenQuestions(src.openQuestions, warnings),
    understandingCoverage: coverageParsed.success
      ? coverageParsed.data
      : empty.understandingCoverage,
    sessionCount:
      typeof src.sessionCount === "number" &&
      Number.isInteger(src.sessionCount) &&
      src.sessionCount >= 0
        ? Math.min(src.sessionCount, 10_000)
        : 0,
  };

  if (warnings.length) {
    console.warn("normalizeAthleteMemory repairs", warnings.slice(0, 12));
  }

  const strict = athleteMemorySchema.safeParse(draft);
  if (strict.success) {
    return { ok: true, memory: strict.data, warnings };
  }

  const issues = formatZodIssues(strict.error);
  if (!allowEmptyFallback || rejectUnrecoverable) {
    return { ok: false, issues, warnings };
  }

  console.warn(
    "MEMORY_MIGRATION_FAILED: unrecoverable memory; resetting to empty",
    issues.slice(0, 8),
  );
  return {
    ok: true,
    memory: empty,
    warnings: [...warnings, "unrecoverable_memory_reset_empty"],
    migrationFailed: true,
  };
}

/**
 * @param {unknown} report
 * @returns {import('./types').ReflectionReport | null}
 */
export function normalizeReflectionReport(report) {
  if (report == null) return null;
  const result = reflectionReportSchema.safeParse(report);
  if (result.success) return result.data;
  console.warn(
    "normalizeReflectionReport: invalid report ignored",
    formatZodIssues(result.error).slice(0, 5),
  );
  return null;
}

/** Compat: returns normalized memory (never null — empty on failure). */
export function softParseAthleteMemory(memory) {
  const result = normalizeAthleteMemory(memory, { allowEmptyFallback: true });
  if (!result.ok) return createEmptyAthleteMemory();
  return result.memory;
}

/** @deprecated Prefer normalizeReflectionReport */
export function softParseReflectionReport(report) {
  return normalizeReflectionReport(report);
}

export const chatRequestStrictSchema = z.object({
  messages: z.array(memoryMessageSchema).min(1).max(MAX_MESSAGES),
  memory: athleteMemorySchema,
  mode: z.enum(["chat", "reopen"]).optional().default("chat"),
  report: reflectionReportSchema.nullable().optional(),
});

export const insightsRequestStrictSchema = z.object({
  messages: z.array(memoryMessageSchema).min(2).max(MAX_MESSAGES),
  memory: athleteMemorySchema,
});

export const memoryRequestStrictSchema = z.object({
  memory: athleteMemorySchema,
  messages: z.array(memoryMessageSchema).min(1).max(MAX_MESSAGES),
  report: reflectionReportSchema.nullable().optional(),
  reason: z.enum(["checkpoint", "pre_insights", "correction", "session_complete"]),
});

/**
 * @param {unknown} json
 */
export function parseChatRequest(json) {
  const input = json && typeof json === "object" ? json : {};
  const messages = normalizeConversationMessages(
    /** @type {{ messages?: unknown }} */ (input).messages,
  );
  const memoryPresent = /** @type {{ memory?: unknown }} */ (input).memory != null;
  const memoryResult = normalizeAthleteMemory(
    /** @type {{ memory?: unknown }} */ (input).memory,
    {
      allowEmptyFallback: !memoryPresent,
      rejectUnrecoverable: memoryPresent,
    },
  );
  if (!memoryResult.ok) {
    throw new z.ZodError(
      memoryResult.issues.map((issue) => ({
        code: "custom",
        path: issue.path.split(".").filter(Boolean),
        message: issue.message,
      })),
    );
  }

  const report = normalizeReflectionReport(
    /** @type {{ report?: unknown }} */ (input).report,
  );

  return chatRequestStrictSchema.parse({
    messages,
    memory: memoryResult.memory,
    mode: /** @type {{ mode?: unknown }} */ (input).mode,
    report,
  });
}

/**
 * @param {unknown} json
 */
export function parseInsightsRequest(json) {
  const input = json && typeof json === "object" ? json : {};
  const messages = normalizeConversationMessages(
    /** @type {{ messages?: unknown }} */ (input).messages,
  );
  const memoryPresent = /** @type {{ memory?: unknown }} */ (input).memory != null;
  const memoryResult = normalizeAthleteMemory(
    /** @type {{ memory?: unknown }} */ (input).memory,
    {
      allowEmptyFallback: !memoryPresent,
      rejectUnrecoverable: memoryPresent,
    },
  );
  if (!memoryResult.ok) {
    throw new z.ZodError(
      memoryResult.issues.map((issue) => ({
        code: "custom",
        path: issue.path.split(".").filter(Boolean),
        message: issue.message,
      })),
    );
  }

  return insightsRequestStrictSchema.parse({
    messages,
    memory: memoryResult.memory,
  });
}

/**
 * @param {unknown} json
 */
export function parseMemoryRequest(json) {
  const input = json && typeof json === "object" ? json : {};
  const messages = normalizeConversationMessages(
    /** @type {{ messages?: unknown }} */ (input).messages,
  );
  const memoryPresent = /** @type {{ memory?: unknown }} */ (input).memory != null;
  const memoryResult = normalizeAthleteMemory(
    /** @type {{ memory?: unknown }} */ (input).memory,
    {
      allowEmptyFallback: !memoryPresent,
      rejectUnrecoverable: memoryPresent,
    },
  );
  if (!memoryResult.ok) {
    throw new z.ZodError(
      memoryResult.issues.map((issue) => ({
        code: "custom",
        path: issue.path.split(".").filter(Boolean),
        message: issue.message,
      })),
    );
  }

  const report = normalizeReflectionReport(
    /** @type {{ report?: unknown }} */ (input).report,
  );

  return memoryRequestStrictSchema.parse({
    memory: memoryResult.memory,
    messages,
    report,
    reason: /** @type {{ reason?: unknown }} */ (input).reason,
  });
}
