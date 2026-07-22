/** @typedef {import('./types').Message} Message */
/** @typedef {import('./types').AthleteMemory} AthleteMemory */
/** @typedef {import('./types').ReflectionReport} ReflectionReport */
/** @typedef {import('./types').MemoryUpdateReason} MemoryUpdateReason */

import OpenAI from "openai";
import { z } from "zod";
import { hasUsableApiKey, reflectionReportSchema } from "./insights.mjs";
import { nextRelationshipStage } from "./memory-guards.mjs";

export const MEMORY_TIMEOUT_MS = 25_000;
export const ATHLETE_MEMORY_VERSION = 1;

export const memoryMessageSchema = z.object({
  id: z.string().min(1).max(80),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(5000),
});

const coverageField = z.number().min(0).max(100);
const statementField = z.string().min(1).max(400);
const idField = z.string().min(1).max(80);

export const memoryItemSchema = z.object({
  statement: statementField,
  sourceMessageIds: z.array(idField).min(1).max(10),
  confidence: z.enum(["tentative", "supported", "strong"]),
});

export const patternMemorySchema = z.object({
  statement: statementField,
  supportingMessageIds: z.array(idField).min(1).max(10),
  status: z.enum(["emerging", "supported", "revised", "rejected"]),
});

export const correctionMemorySchema = z.object({
  originalInterpretation: statementField,
  athleteCorrection: statementField,
  sourceMessageId: idField,
});

export const priorityMemorySchema = z.object({
  priority: z.string().min(1).max(400),
  focusAreas: z.array(z.string().min(1).max(200)).max(3),
  createdAt: z.string().min(1),
});

export const understandingCoverageSchema = z.object({
  story: coverageField,
  goals: coverageField,
  motivation: coverageField,
  competitiveMindset: coverageField,
  trainingContext: coverageField,
  recoveryContext: coverageField,
  supportEnvironment: coverageField,
});

const optionalName = z
  .union([z.string().min(1).max(120), z.null()])
  .optional()
  .transform((value) => (value == null || value === "" ? undefined : value));

export const athleteMemorySchema = z.object({
  version: z.literal(ATHLETE_MEMORY_VERSION),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  relationshipStage: z.enum([
    "first_conversation",
    "building_understanding",
    "training_together",
  ]),
  identity: z.object({
    name: optionalName,
    sport: optionalName,
    level: optionalName,
    background: z.array(z.string().min(1).max(200)).max(8),
  }),
  goals: z.array(memoryItemSchema).max(8),
  motivations: z.array(memoryItemSchema).max(8),
  challenges: z.array(memoryItemSchema).max(8),
  significantExperiences: z.array(memoryItemSchema).max(8),
  observedPatterns: z.array(patternMemorySchema).max(6),
  athleteCorrections: z.array(correctionMemorySchema).max(8),
  previousPriorities: z.array(priorityMemorySchema).max(5),
  openQuestions: z.array(z.string().min(1).max(300)).max(8),
  understandingCoverage: understandingCoverageSchema,
  sessionCount: z.number().int().min(0).max(10_000),
});

export const athleteMemoryJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "number" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    relationshipStage: {
      type: "string",
      enum: ["first_conversation", "building_understanding", "training_together"],
    },
    identity: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: ["string", "null"] },
        sport: { type: ["string", "null"] },
        level: { type: ["string", "null"] },
        background: { type: "array", items: { type: "string" }, maxItems: 8 },
      },
      required: ["name", "sport", "level", "background"],
    },
    goals: { type: "array", maxItems: 8, items: memoryItemJsonSchema() },
    motivations: { type: "array", maxItems: 8, items: memoryItemJsonSchema() },
    challenges: { type: "array", maxItems: 8, items: memoryItemJsonSchema() },
    significantExperiences: { type: "array", maxItems: 8, items: memoryItemJsonSchema() },
    observedPatterns: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          statement: { type: "string" },
          supportingMessageIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10,
          },
          status: {
            type: "string",
            enum: ["emerging", "supported", "revised", "rejected"],
          },
        },
        required: ["statement", "supportingMessageIds", "status"],
      },
    },
    athleteCorrections: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          originalInterpretation: { type: "string" },
          athleteCorrection: { type: "string" },
          sourceMessageId: { type: "string" },
        },
        required: ["originalInterpretation", "athleteCorrection", "sourceMessageId"],
      },
    },
    previousPriorities: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          priority: { type: "string" },
          focusAreas: { type: "array", items: { type: "string" }, maxItems: 3 },
          createdAt: { type: "string" },
        },
        required: ["priority", "focusAreas", "createdAt"],
      },
    },
    openQuestions: { type: "array", items: { type: "string" }, maxItems: 8 },
    understandingCoverage: {
      type: "object",
      additionalProperties: false,
      properties: {
        story: { type: "number" },
        goals: { type: "number" },
        motivation: { type: "number" },
        competitiveMindset: { type: "number" },
        trainingContext: { type: "number" },
        recoveryContext: { type: "number" },
        supportEnvironment: { type: "number" },
      },
      required: [
        "story",
        "goals",
        "motivation",
        "competitiveMindset",
        "trainingContext",
        "recoveryContext",
        "supportEnvironment",
      ],
    },
    sessionCount: { type: "number" },
  },
  required: [
    "version",
    "createdAt",
    "updatedAt",
    "relationshipStage",
    "identity",
    "goals",
    "motivations",
    "challenges",
    "significantExperiences",
    "observedPatterns",
    "athleteCorrections",
    "previousPriorities",
    "openQuestions",
    "understandingCoverage",
    "sessionCount",
  ],
};

function memoryItemJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      statement: { type: "string" },
      sourceMessageIds: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 10,
      },
      confidence: { type: "string", enum: ["tentative", "supported", "strong"] },
    },
    required: ["statement", "sourceMessageIds", "confidence"],
  };
}

/**
 * Partial memory update from the model. All sections optional.
 * Never assign a patch directly over AthleteMemory — always merge.
 * Strict: unknown keys are rejected so garbage model output fails closed.
 */
export const memoryPatchSchema = z
  .object({
    version: z.literal(ATHLETE_MEMORY_VERSION).optional(),
    createdAt: z.string().min(1).optional(),
    updatedAt: z.string().min(1).optional(),
    relationshipStage: z
      .enum(["first_conversation", "building_understanding", "training_together"])
      .optional(),
    identity: z
      .object({
        name: optionalName,
        sport: optionalName,
        level: optionalName,
        background: z.array(z.string().min(1).max(200)).max(8).optional(),
      })
      .optional(),
    goals: z.array(memoryItemSchema).max(8).optional(),
    motivations: z.array(memoryItemSchema).max(8).optional(),
    challenges: z.array(memoryItemSchema).max(8).optional(),
    significantExperiences: z.array(memoryItemSchema).max(8).optional(),
    observedPatterns: z.array(patternMemorySchema).max(6).optional(),
    athleteCorrections: z.array(correctionMemorySchema).max(8).optional(),
    previousPriorities: z.array(priorityMemorySchema).max(5).optional(),
    openQuestions: z.array(z.string().min(1).max(300)).max(8).optional(),
    understandingCoverage: understandingCoverageSchema.optional(),
    sessionCount: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

const MEMORY_PATCH_CONTENT_KEYS = [
  "identity",
  "goals",
  "motivations",
  "challenges",
  "significantExperiences",
  "observedPatterns",
  "athleteCorrections",
  "previousPriorities",
  "openQuestions",
  "understandingCoverage",
  "relationshipStage",
  "sessionCount",
];

/**
 * @param {import('./types').MemoryPatch} patch
 */
export function memoryPatchHasContent(patch) {
  if (!patch || typeof patch !== "object") return false;
  return MEMORY_PATCH_CONTENT_KEYS.some((key) => patch[key] !== undefined);
}

/**
 * @param {unknown} data
 * @returns {import('./types').MemoryPatch}
 */
export function parseMemoryPatch(data) {
  const patch = memoryPatchSchema.parse(data);
  if (!memoryPatchHasContent(patch)) {
    throw new z.ZodError([
      {
        code: "custom",
        path: [],
        message: "Memory patch must include at least one memory field",
      },
    ]);
  }
  return patch;
}

/**
 * Prefer full AthleteMemory parse; fall back to MemoryPatch for sparse model output.
 * @param {unknown} raw
 * @returns {{ kind: "full", memory: AthleteMemory } | { kind: "patch", patch: import('./types').MemoryPatch }}
 */
export function parseMemoryUpdateCandidate(raw) {
  try {
    return { kind: "full", memory: parseAthleteMemory(raw) };
  } catch {
    return { kind: "patch", patch: parseMemoryPatch(raw) };
  }
}

export const memoryRequestSchema = z.object({
  memory: athleteMemorySchema,
  messages: z.array(memoryMessageSchema).min(1).max(40),
  report: reflectionReportSchema.nullable().optional(),
  reason: z.enum(["checkpoint", "pre_insights", "correction", "session_complete"]),
});

export const MEMORY_INSTRUCTIONS = `
You are AthleteOS memory updater. Return JSON only matching the AthleteMemory schema.

Update structured athlete memory from:
- existingMemory (preserve valid claims unless contradicted)
- conversation transcript with message ids
- optional reflection report
- update reason

Hard rules:
- Every new MemoryItem / PatternMemory / CorrectionMemory claim MUST cite real athlete message ids from the transcript.
- Do not invent facts, coaches, matches, wearables, or events absent from athlete messages.
- Preserve valid existing memories. Merge duplicates into one field only—never copy the same fact across goals, challenges, and patterns.
- Keep tentative statements tentative. Do not upgrade confidence without additional athlete-grounded support.
- If the athlete corrects AthleteOS, record an athleteCorrections entry and mark contradicted patterns revised or rejected.
- Keep lists concise. Prefer updating existing statements over appending near-duplicates.
- understandingCoverage values are 0–100 approximate routing signals from athlete messages only (not scientific scores).
- Never invent coverage; base it only on what athletes actually shared.
- version must remain 1. Preserve createdAt from existingMemory. Set updatedAt to now (ISO).
- Preserve sessionCount from existingMemory unless reason is session_complete (then keep the provided sessionCount).
- Do not include hidden reasoning, scratchpads, or meta commentary—schema fields only.
- identity.name/sport/level may be null when unknown.
`;

export const MEMORY_REPAIR_INSTRUCTIONS = `
The previous JSON did not match the AthleteMemory schema or cited invalid message ids.

Return corrected JSON that:
- Matches the schema exactly
- Cites only message ids present in the transcript
- Preserves valid existing memory
- Does not invent unstated facts
- Keeps confidence honest
`;

/**
 * Scale legacy 0–1 coverage snapshots to 0–100.
 * @param {unknown} coverage
 */
export function normalizeUnderstandingCoverage(coverage) {
  if (!coverage || typeof coverage !== "object") return coverage;
  const values = Object.values(coverage).filter((v) => typeof v === "number");
  if (values.length === 0) return coverage;
  const allLegacy = values.every((v) => v >= 0 && v <= 1);
  if (!allLegacy) return coverage;
  /** @type {Record<string, number>} */
  const next = {};
  for (const [key, value] of Object.entries(coverage)) {
    next[key] = typeof value === "number" ? Math.round(value * 100) : value;
  }
  return next;
}

/**
 * @param {unknown} data
 * @returns {AthleteMemory}
 */
export function parseAthleteMemory(data) {
  if (data && typeof data === "object" && "understandingCoverage" in data) {
    const draft = /** @type {Record<string, unknown>} */ ({ ...data });
    draft.understandingCoverage = normalizeUnderstandingCoverage(draft.understandingCoverage);
    return athleteMemorySchema.parse(draft);
  }
  return athleteMemorySchema.parse(data);
}

/**
 * @param {string} [now]
 * @returns {AthleteMemory}
 */
export function createEmptyAthleteMemory(now = new Date().toISOString()) {
  return parseAthleteMemory({
    version: ATHLETE_MEMORY_VERSION,
    createdAt: now,
    updatedAt: now,
    relationshipStage: "first_conversation",
    identity: {
      name: null,
      sport: null,
      level: null,
      background: [],
    },
    goals: [],
    motivations: [],
    challenges: [],
    significantExperiences: [],
    observedPatterns: [],
    athleteCorrections: [],
    previousPriorities: [],
    openQuestions: [],
    understandingCoverage: {
      story: 0,
      goals: 0,
      motivation: 0,
      competitiveMindset: 0,
      trainingContext: 0,
      recoveryContext: 0,
      supportEnvironment: 0,
    },
    sessionCount: 0,
  });
}

/**
 * @param {Message[]} messages
 */
export function formatMemoryTranscript(messages) {
  return messages
    .map((message) => {
      const speaker = message.role === "user" ? "Athlete" : "AthleteOS";
      return `[id=${message.id}] ${speaker}: ${message.content}`;
    })
    .join("\n\n");
}

/**
 * @param {AthleteMemory} memory
 * @param {Message[]} messages
 * @param {ReflectionReport | null | undefined} report
 * @param {MemoryUpdateReason} reason
 */
export function getDemoMemoryUpdate(memory, messages, report, reason) {
  const now = new Date().toISOString();
  const knownIds = new Set(messages.map((m) => m.id));
  const userMessages = messages.filter((m) => m.role === "user");
  const next = structuredClone(memory);

  next.updatedAt = now;
  next.version = ATHLETE_MEMORY_VERSION;

  const sports = [
    ["tennis", "tennis"],
    ["runner", "running"],
    ["running", "running"],
    ["soccer", "soccer"],
    ["football", "football"],
    ["basketball", "basketball"],
    ["swimming", "swimming"],
  ];
  for (const user of userMessages) {
    const lower = user.content.toLowerCase();
    for (const [needle, sport] of sports) {
      if (lower.includes(needle) && !next.identity.sport) {
        next.identity.sport = sport;
        break;
      }
    }
    if (
      (lower.includes("freeze") || lower.includes("lost") || lower.includes("losing")) &&
      knownIds.has(user.id) &&
      next.challenges.length < 8 &&
      !next.challenges.some((item) => item.sourceMessageIds.includes(user.id))
    ) {
      next.challenges.push({
        statement: user.content.trim().slice(0, 400),
        sourceMessageIds: [user.id],
        confidence: "tentative",
      });
    }
  }

  if (userMessages.length > 0) {
    next.understandingCoverage.story = Math.min(100, 20 + userMessages.length * 15);
  }

  if (report && (reason === "pre_insights" || reason === "session_complete")) {
    const already = next.previousPriorities.some((p) => p.priority === report.sharedPriority);
    if (!already) {
      next.previousPriorities = [
        {
          priority: report.sharedPriority,
          focusAreas: report.focusAreas.slice(0, 3),
          createdAt: now,
        },
        ...next.previousPriorities,
      ].slice(0, 5);
    }
    if (report.pattern?.title && next.observedPatterns.length < 6) {
      const supportIds = userMessages.slice(-3).map((m) => m.id).filter((id) => knownIds.has(id));
      if (supportIds.length > 0) {
        next.observedPatterns = [
          {
            statement: report.pattern.title,
            supportingMessageIds: supportIds.slice(0, 10),
            status: "emerging",
          },
          ...next.observedPatterns.filter((p) => p.statement !== report.pattern.title),
        ].slice(0, 6);
      }
    }
  }

  if (reason === "session_complete") {
    next.sessionCount = Math.max(next.sessionCount, memory.sessionCount);
    next.relationshipStage = nextRelationshipStage(next.relationshipStage, next.sessionCount);
  }

  return parseAthleteMemory(next);
}

/**
 * @param {string} apiKey
 * @param {{ timeoutMs?: number }} [options]
 */
export function createOpenAIMemoryClient(apiKey, options = {}) {
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4.1";
  const timeoutMs = options.timeoutMs ?? MEMORY_TIMEOUT_MS;

  return {
    /**
     * @param {{ input: string, repair: boolean }} args
     */
    async generateMemory({ input, repair }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await client.responses.create(
          {
            model,
            instructions: repair
              ? `${MEMORY_INSTRUCTIONS}\n\n${MEMORY_REPAIR_INSTRUCTIONS}`
              : MEMORY_INSTRUCTIONS,
            input,
            text: {
              format: {
                type: "json_schema",
                name: "athlete_memory",
                strict: true,
                schema: athleteMemoryJsonSchema,
              },
            },
          },
          { signal: controller.signal },
        );
        const text = response.output_text?.trim();
        if (!text) throw new Error("Empty model output");
        return JSON.parse(text);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Drop claims that cite unknown message ids.
 * @param {AthleteMemory} memory
 * @param {Set<string>} knownIds
 * @returns {AthleteMemory}
 */
export function sanitizeMemoryMessageIds(memory, knownIds) {
  const filterItems = (items) =>
    items
      .map((item) => ({
        ...item,
        sourceMessageIds: item.sourceMessageIds.filter((id) => knownIds.has(id)),
      }))
      .filter((item) => item.sourceMessageIds.length > 0);

  const next = {
    ...memory,
    goals: filterItems(memory.goals),
    motivations: filterItems(memory.motivations),
    challenges: filterItems(memory.challenges),
    significantExperiences: filterItems(memory.significantExperiences),
    observedPatterns: memory.observedPatterns
      .map((item) => ({
        ...item,
        supportingMessageIds: item.supportingMessageIds.filter((id) => knownIds.has(id)),
      }))
      .filter((item) => item.supportingMessageIds.length > 0),
    athleteCorrections: memory.athleteCorrections.filter((item) =>
      knownIds.has(item.sourceMessageId),
    ),
  };
  return parseAthleteMemory(next);
}

/**
 * @param {string} statement
 */
function statementKey(statement) {
  return statement.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Merge validated memory or patch into existing full memory.
 * Empty incoming list fields do not wipe existing non-empty lists.
 * @param {AthleteMemory} existing
 * @param {AthleteMemory | import('./types').MemoryPatch} incoming
 * @returns {AthleteMemory}
 */
export function mergeAthleteMemory(existing, incoming) {
  if (!incoming || typeof incoming !== "object") {
    const error = new Error("MEMORY_MERGE_FAILED: invalid patch");
    error.code = "MEMORY_MERGE_FAILED";
    throw error;
  }

  const now = new Date().toISOString();

  /**
   * @template {{ statement: string }} T
   * @param {T[]} prev
   * @param {T[] | undefined} next
   * @param {number} max
   */
  function mergeByStatement(prev, next, max) {
    if (!Array.isArray(next) || next.length === 0) return prev.slice(0, max);
    const map = new Map();
    for (const item of prev) map.set(statementKey(item.statement), item);
    for (const item of next) map.set(statementKey(item.statement), item);
    return [...map.values()].slice(0, max);
  }

  const incomingCorrections = Array.isArray(incoming.athleteCorrections)
    ? incoming.athleteCorrections
    : [];
  const corrections = [];
  const seenCorrection = new Set();
  for (const item of [...incomingCorrections, ...existing.athleteCorrections]) {
    const key = `${item.sourceMessageId}|${statementKey(item.athleteCorrection)}`;
    if (seenCorrection.has(key)) continue;
    seenCorrection.add(key);
    corrections.push(item);
  }

  const incomingPriorities = Array.isArray(incoming.previousPriorities)
    ? incoming.previousPriorities
    : [];
  const priorityMap = new Map();
  for (const item of [...incomingPriorities, ...existing.previousPriorities]) {
    const key = statementKey(item.priority);
    if (!priorityMap.has(key)) priorityMap.set(key, item);
  }

  const incomingOpen = Array.isArray(incoming.openQuestions) ? incoming.openQuestions : [];
  const openQuestions =
    incomingOpen.length > 0
      ? [...new Set([...incomingOpen, ...existing.openQuestions])].slice(0, 8)
      : existing.openQuestions;

  const draft = {
    version: ATHLETE_MEMORY_VERSION,
    createdAt: existing.createdAt || incoming.createdAt || now,
    updatedAt: now,
    relationshipStage: incoming.relationshipStage || existing.relationshipStage,
    identity: {
      name: incoming.identity?.name ?? existing.identity?.name,
      sport: incoming.identity?.sport ?? existing.identity?.sport,
      level: incoming.identity?.level ?? existing.identity?.level,
      background: [
        ...new Set([
          ...(incoming.identity?.background || []),
          ...(existing.identity?.background || []),
        ]),
      ].slice(0, 8),
    },
    goals: mergeByStatement(existing.goals, incoming.goals, 8),
    motivations: mergeByStatement(existing.motivations, incoming.motivations, 8),
    challenges: mergeByStatement(existing.challenges, incoming.challenges, 8),
    significantExperiences: mergeByStatement(
      existing.significantExperiences,
      incoming.significantExperiences,
      8,
    ),
    observedPatterns: mergeByStatement(existing.observedPatterns, incoming.observedPatterns, 6),
    athleteCorrections: corrections.slice(0, 8),
    previousPriorities: [...priorityMap.values()].slice(0, 5),
    openQuestions,
    understandingCoverage: incoming.understandingCoverage || existing.understandingCoverage,
    sessionCount: Math.max(
      existing.sessionCount || 0,
      typeof incoming.sessionCount === "number" ? incoming.sessionCount : 0,
    ),
  };

  return parseAthleteMemory(draft);
}

/**
 * Apply a model memory candidate via merge only (never direct replace).
 * @param {AthleteMemory} existing
 * @param {unknown} raw
 * @param {Set<string>} knownIds
 * @returns {AthleteMemory}
 */
export function applyMemoryModelUpdate(existing, raw, knownIds) {
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  let candidate;
  try {
    candidate = parseMemoryUpdateCandidate(payload);
  } catch (error) {
    const err = new Error("MEMORY_MERGE_FAILED: could not parse memory update");
    err.code = "MEMORY_MERGE_FAILED";
    err.cause = error;
    throw err;
  }

  const incoming = candidate.kind === "full" ? candidate.memory : candidate.patch;
  try {
    const merged = mergeAthleteMemory(existing, incoming);
    return sanitizeMemoryMessageIds(merged, knownIds);
  } catch (error) {
    const err = new Error("MEMORY_MERGE_FAILED: merge rejected");
    err.code = "MEMORY_MERGE_FAILED";
    err.cause = error;
    throw err;
  }
}

/**
 * @param {{
 *   memory: unknown,
 *   messages: Message[],
 *   report?: ReflectionReport | null,
 *   reason: MemoryUpdateReason,
 *   apiKey?: string,
 *   modelClient?: { generateMemory: Function },
 * }} args
 */
export async function generateMemoryUpdate(args) {
  const { messages, reason } = args;
  let memory;
  try {
    memory = parseAthleteMemory(args.memory);
  } catch (error) {
    console.warn("Resetting invalid existing memory before update", error);
    memory = createEmptyAthleteMemory();
  }
  const report = args.report ?? null;

  if (!Array.isArray(messages) || messages.length < 1) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "The memory request did not match the expected schema.",
        message: "The memory request did not match the expected schema.",
        code: "INVALID_MEMORY_REQUEST",
      },
    };
  }

  const apiKey = "apiKey" in args ? args.apiKey : process.env.OPENAI_API_KEY;
  if (!hasUsableApiKey(apiKey)) {
    return {
      ok: true,
      status: 200,
      body: {
        memory: getDemoMemoryUpdate(memory, messages, report, reason),
        demoMode: true,
      },
    };
  }

  const knownIds = new Set(messages.map((m) => m.id));
  const modelClient = args.modelClient ?? createOpenAIMemoryClient(apiKey);
  const input = [
    `reason: ${reason}`,
    `existingMemory:\n${JSON.stringify(memory)}`,
    report ? `reflectionReport:\n${JSON.stringify(report)}` : "reflectionReport: null",
    `transcript:\n${formatMemoryTranscript(messages)}`,
  ].join("\n\n");

  try {
    let raw = await modelClient.generateMemory({ input, repair: false });
    try {
      const next = applyMemoryModelUpdate(memory, raw, knownIds);
      return {
        ok: true,
        status: 200,
        body: { memory: next, demoMode: false },
      };
    } catch (firstParseError) {
      if (
        !(firstParseError instanceof z.ZodError) &&
        !(firstParseError instanceof SyntaxError) &&
        firstParseError?.code !== "MEMORY_MERGE_FAILED"
      ) {
        throw firstParseError;
      }
      raw = await modelClient.generateMemory({ input, repair: true });
      try {
        const next = applyMemoryModelUpdate(memory, raw, knownIds);
        return {
          ok: true,
          status: 200,
          body: { memory: next, demoMode: false },
        };
      } catch (secondParseError) {
        if (
          secondParseError instanceof z.ZodError ||
          secondParseError instanceof SyntaxError ||
          secondParseError?.code === "MEMORY_MERGE_FAILED"
        ) {
          return {
            ok: false,
            status: 502,
            body: {
              error: "AthleteOS couldn’t update memory right now. Please try again.",
              message: "AthleteOS couldn’t update memory right now. Please try again.",
              code:
                secondParseError?.code === "MEMORY_MERGE_FAILED"
                  ? "MEMORY_MERGE_FAILED"
                  : "INVALID_MEMORY_RESPONSE",
            },
          };
        }
        throw secondParseError;
      }
    }
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      status: 502,
      body: {
        error: "AthleteOS couldn’t update memory right now. Please try again.",
        message: "AthleteOS couldn’t update memory right now. Please try again.",
        code: "OPENAI_REQUEST_FAILED",
      },
    };
  }
}
