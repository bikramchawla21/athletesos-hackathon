/** Anonymous same-browser persistence for AthleteOS (client-only). */

import { z } from "zod";
import { createEmptyAthleteMemory } from "./memory.mjs";
import {
  normalizeAthleteMemory,
  normalizeConversationMessages,
  normalizeReflectionReport,
} from "./request-contract.mjs";

export const STORAGE_KEY = "athletesos:v1";
/** Envelope version after contract repair (v1 blobs still migrate). */
export const PERSISTED_STATE_VERSION = 2;

const stageEnum = z.enum([
  "welcome",
  "conversation",
  "generating",
  "observations",
  "evidence",
  "pattern",
  "focus",
  "complete",
]);

/**
 * @returns {boolean}
 */
function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * Migrate legacy / partial persisted blobs into the current envelope.
 * @param {unknown} raw
 * @returns {{
 *   ok: true,
 *   state: import('./types').PersistedAppState,
 *   migrated: boolean,
 *   warnings: string[],
 * } | {
 *   ok: false,
 *   code: "PERSISTED_STATE_MIGRATION_FAILED",
 *   warnings: string[],
 * }}
 */
export function migratePersistedState(raw) {
  const warnings = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "PERSISTED_STATE_MIGRATION_FAILED", warnings: ["not_an_object"] };
  }

  const src = /** @type {Record<string, unknown>} */ (raw);
  const priorVersion = typeof src.version === "number" ? src.version : 0;
  const migrated = priorVersion !== PERSISTED_STATE_VERSION;

  const messages = normalizeConversationMessages(src.messages);
  if (messages.length < 1) {
    warnings.push("messages: empty after normalize");
    return { ok: false, code: "PERSISTED_STATE_MIGRATION_FAILED", warnings };
  }

  const memoryResult = normalizeAthleteMemory(src.memory, { allowEmptyFallback: true });
  if (!memoryResult.ok) {
    return { ok: false, code: "PERSISTED_STATE_MIGRATION_FAILED", warnings: memoryResult.warnings };
  }
  if (memoryResult.warnings?.length) warnings.push(...memoryResult.warnings);
  if (memoryResult.migrationFailed) {
    warnings.push("memory_reset_empty");
  }

  let stage = typeof src.stage === "string" ? src.stage : "welcome";
  if (stage === "generating") {
    stage = "conversation";
    warnings.push("stage: generating → conversation");
  }
  const stageParsed = stageEnum.safeParse(stage);
  if (!stageParsed.success) {
    stage = "conversation";
    warnings.push("stage: invalid → conversation");
  } else {
    stage = stageParsed.data;
  }

  const report = normalizeReflectionReport(src.report);
  const savedAt =
    typeof src.savedAt === "string" && src.savedAt.trim()
      ? src.savedAt.trim()
      : new Date().toISOString();

  const state = {
    version: PERSISTED_STATE_VERSION,
    savedAt,
    stage,
    messages,
    memory: memoryResult.memory,
    report,
    demoMode: Boolean(src.demoMode),
  };

  // Final envelope check without relying on z.any memory
  const envelope = z
    .object({
      version: z.literal(PERSISTED_STATE_VERSION),
      savedAt: z.string().min(1),
      stage: stageEnum,
      messages: z.array(z.object({
        id: z.string().min(1),
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })).min(1).max(40),
      demoMode: z.boolean(),
    })
    .safeParse(state);

  if (!envelope.success) {
    console.warn("PERSISTED_STATE_MIGRATION_FAILED", envelope.error.issues?.slice(0, 8));
    return { ok: false, code: "PERSISTED_STATE_MIGRATION_FAILED", warnings };
  }

  if (migrated || warnings.length) {
    console.warn("migratePersistedState", { priorVersion, warnings: warnings.slice(0, 12) });
  }

  return { ok: true, state, migrated, warnings };
}

/**
 * @param {unknown} data
 */
export function parsePersistedAppState(data) {
  const migrated = migratePersistedState(data);
  if (!migrated.ok) {
    throw new Error(migrated.code);
  }
  return migrated.state;
}

/**
 * @returns {import('./types').PersistedAppState | null}
 */
export function loadPersistedState() {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const result = migratePersistedState(JSON.parse(raw));
    if (!result.ok) {
      console.warn("PERSISTED_STATE_MIGRATION_FAILED — clearing AthleteOS storage", result.warnings);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      return null;
    }
    if (result.migrated || result.warnings.length) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result.state));
      } catch {
        // ignore re-save failure
      }
    }
    return result.state;
  } catch (error) {
    console.warn("PERSISTED_STATE_MIGRATION_FAILED — clearing AthleteOS storage", error);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

/**
 * @param {import('./types').PersistedAppState} state
 */
export function savePersistedState(state) {
  if (!canUseStorage()) return;
  try {
    const result = migratePersistedState({
      ...state,
      version: PERSISTED_STATE_VERSION,
    });
    if (!result.ok) {
      console.error("Failed to persist AthleteOS state", result.warnings);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result.state));
  } catch (error) {
    console.error("Failed to persist AthleteOS state", error);
  }
}

/** Clears all AthleteOS browser state. */
export function clearAthleteOsStorage() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * @returns {import('./types').PersistedAppState}
 */
export function createDefaultPersistedState() {
  const now = new Date().toISOString();
  return {
    version: PERSISTED_STATE_VERSION,
    savedAt: now,
    stage: "welcome",
    messages: [],
    memory: createEmptyAthleteMemory(now),
    report: null,
    demoMode: false,
  };
}
