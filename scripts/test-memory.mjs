import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createEmptyAthleteMemory,
  generateMemoryUpdate,
  getDemoMemoryUpdate,
  memoryPatchSchema,
  memoryRequestSchema,
  mergeAthleteMemory,
  parseAthleteMemory,
  parseMemoryPatch,
  sanitizeMemoryMessageIds,
} from "../lib/memory.mjs";
import {
  looksLikeAthleteCorrection,
  nextRelationshipStage,
  shouldSyncMemoryCheckpoint,
} from "../lib/memory-guards.mjs";
import {
  STORAGE_KEY,
  clearAthleteOsStorage,
  loadPersistedState,
  migratePersistedState,
  parsePersistedAppState,
  savePersistedState,
} from "../lib/persistence.mjs";
import { fallbackReport } from "../lib/insights.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(__dirname, "../app/api/memory/route.ts"), "utf8");

const opening = {
  id: "opening",
  role: "assistant",
  content: "Whenever you’re ready, I’m listening.",
};

const richMessages = [
  opening,
  {
    id: "u1",
    role: "user",
    content: "I have played tennis since I was eight, but lately I feel lost.",
  },
  {
    id: "a1",
    role: "assistant",
    content: "Long tennis history, recent lostness. What specifically feels unclear?",
  },
  {
    id: "u2",
    role: "user",
    content: "I freeze in important matches even when training feels solid.",
  },
  {
    id: "a2",
    role: "assistant",
    content: "When you freeze, do decisions slow down or does your body tighten?",
  },
  {
    id: "u3",
    role: "user",
    content: "Actually, that’s not right — it’s more that I stop committing to the plan.",
  },
];

describe("athlete memory schema", () => {
  it("creates a valid empty memory", () => {
    const memory = createEmptyAthleteMemory("2026-01-01T00:00:00.000Z");
    assert.equal(memory.version, 1);
    assert.equal(memory.relationshipStage, "first_conversation");
    assert.equal(memory.sessionCount, 0);
    assert.deepEqual(memory.goals, []);
    assert.equal(memory.understandingCoverage.story, 0);
  });

  it("rejects coverage outside 0–100", () => {
    const memory = createEmptyAthleteMemory();
    assert.throws(() =>
      parseAthleteMemory({
        ...memory,
        understandingCoverage: { ...memory.understandingCoverage, story: 150 },
      }),
    );
  });

  it("normalizes legacy 0–1 coverage to 0–100", () => {
    const memory = createEmptyAthleteMemory();
    const parsed = parseAthleteMemory({
      ...memory,
      understandingCoverage: {
        story: 0.4,
        goals: 0.2,
        motivation: 0,
        competitiveMindset: 0.1,
        trainingContext: 0,
        recoveryContext: 0,
        supportEnvironment: 0,
      },
    });
    assert.equal(parsed.understandingCoverage.story, 40);
    assert.equal(parsed.understandingCoverage.goals, 20);
    assert.equal(parsed.understandingCoverage.competitiveMindset, 10);
  });

  it("requires message ids on memory requests", () => {
    assert.throws(() =>
      memoryRequestSchema.parse({
        memory: createEmptyAthleteMemory(),
        messages: [{ role: "user", content: "hello" }],
        reason: "checkpoint",
      }),
    );
  });
});

describe("memory guards", () => {
  it("detects correction language", () => {
    assert.equal(looksLikeAthleteCorrection("Actually, that’s not right"), true);
    assert.equal(looksLikeAthleteCorrection("I train harder after losses"), false);
  });

  it("gates checkpoints every three user turns", () => {
    assert.equal(shouldSyncMemoryCheckpoint(3, 0), true);
    assert.equal(shouldSyncMemoryCheckpoint(4, 3), false);
    assert.equal(shouldSyncMemoryCheckpoint(6, 3), true);
  });

  it("advances relationship stage from session count", () => {
    assert.equal(nextRelationshipStage("first_conversation", 1), "building_understanding");
    assert.equal(nextRelationshipStage("building_understanding", 2), "training_together");
  });
});

describe("demo memory update", () => {
  it("preserves existing memory and adds grounded demo claims", async () => {
    const existing = createEmptyAthleteMemory();
    const result = await generateMemoryUpdate({
      memory: existing,
      messages: richMessages,
      report: null,
      reason: "checkpoint",
      apiKey: "",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.demoMode, true);
    assert.equal(result.body.memory.identity.sport, "tennis");
    assert.ok(result.body.memory.challenges.length >= 1);
    assert.ok(
      result.body.memory.challenges.every((item) =>
        item.sourceMessageIds.every((id) => richMessages.some((m) => m.id === id)),
      ),
    );
  });

  it("folds reflection priorities on session_complete", () => {
    const memory = createEmptyAthleteMemory();
    memory.sessionCount = 1;
    const updated = getDemoMemoryUpdate(memory, richMessages, fallbackReport, "session_complete");
    assert.ok(updated.previousPriorities.length >= 1);
    assert.equal(updated.previousPriorities[0].priority, fallbackReport.sharedPriority);
    assert.equal(updated.relationshipStage, "building_understanding");
  });

  it("strips claims with unknown message ids", () => {
    const memory = createEmptyAthleteMemory();
    memory.goals = [
      {
        statement: "Win a title",
        sourceMessageIds: ["missing"],
        confidence: "tentative",
      },
    ];
    const cleaned = sanitizeMemoryMessageIds(memory, new Set(["u1"]));
    assert.deepEqual(cleaned.goals, []);
  });
});

describe("memory model client paths", () => {
  it("repairs once after invalid first output", async () => {
    let calls = 0;
    const result = await generateMemoryUpdate({
      memory: createEmptyAthleteMemory(),
      messages: richMessages,
      reason: "checkpoint",
      apiKey: "sk-test",
      modelClient: {
        async generateMemory() {
          calls += 1;
          if (calls === 1) return { bad: true };
          return createEmptyAthleteMemory();
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
  });

  it("returns upstream when the provider throws", async () => {
    const result = await generateMemoryUpdate({
      memory: createEmptyAthleteMemory(),
      messages: richMessages,
      reason: "checkpoint",
      apiKey: "sk-test",
      modelClient: {
        async generateMemory() {
          throw new Error("provider down");
        },
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 502);
    assert.equal(result.body.code, "OPENAI_REQUEST_FAILED");
  });
});

describe("persistence", () => {
  /** @type {Map<string, string>} */
  let store;

  beforeEach(() => {
    store = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => {
          store.set(key, String(value));
        },
        removeItem: (key) => {
          store.delete(key);
        },
      },
    };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("round-trips valid state and migrates v1 to v2", () => {
    const memory = createEmptyAthleteMemory();
    savePersistedState({
      version: 1,
      savedAt: "2026-01-01T00:00:00.000Z",
      stage: "conversation",
      messages: richMessages,
      memory,
      report: null,
      demoMode: true,
    });
    const loaded = loadPersistedState();
    assert.ok(loaded);
    assert.equal(loaded.version, 2);
    assert.equal(loaded.stage, "conversation");
    assert.equal(loaded.demoMode, true);
    assert.equal(loaded.messages[1].id, "u1");
    assert.equal(store.has(STORAGE_KEY), true);
  });

  it("recovers from malformed JSON", () => {
    store.set(STORAGE_KEY, "{not-json");
    assert.equal(loadPersistedState(), null);
    assert.equal(store.has(STORAGE_KEY), false);
  });

  it("migrates legacy blobs with missing message ids", () => {
    const memory = createEmptyAthleteMemory();
    const result = migratePersistedState({
      version: 1,
      savedAt: "2026-01-01T00:00:00.000Z",
      stage: "conversation",
      messages: [
        { role: "assistant", content: "Hi" },
        { role: "user", content: "I freeze in matches." },
      ],
      memory: {
        ...memory,
        goals: [{ statement: "bad", sourceMessageIds: [], confidence: "supported" }],
        challenges: [
          {
            statement: "I freeze",
            sourceMessageIds: ["keep"],
            confidence: "supported",
          },
        ],
      },
      report: null,
      demoMode: false,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.version, 2);
    assert.ok(result.state.messages.every((m) => m.id));
    assert.equal(result.state.memory.goals.length, 0);
    assert.equal(result.state.memory.challenges.length, 1);
  });

  it("clearAthleteOsStorage removes the key", () => {
    store.set(STORAGE_KEY, "x");
    clearAthleteOsStorage();
    assert.equal(store.has(STORAGE_KEY), false);
  });

  it("parsePersistedAppState nulls invalid report instead of crashing", () => {
    const state = parsePersistedAppState({
      version: 1,
      savedAt: "2026-01-01T00:00:00.000Z",
      stage: "complete",
      messages: richMessages,
      memory: createEmptyAthleteMemory(),
      report: { observations: ["only one"] },
      demoMode: false,
    });
    assert.equal(state.report, null);
    assert.equal(state.version, 2);
  });

  it("mergeAthleteMemory preserves priorities and corrections", () => {
    const existing = createEmptyAthleteMemory();
    existing.previousPriorities = [
      {
        priority: "Recover between points",
        focusAreas: ["reset routine"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    existing.athleteCorrections = [
      {
        originalInterpretation: "technique",
        athleteCorrection: "commitment",
        sourceMessageId: "u3",
      },
    ];
    const incoming = createEmptyAthleteMemory();
    incoming.challenges = [
      {
        statement: "I freeze",
        sourceMessageIds: ["u2"],
        confidence: "supported",
      },
    ];
    const merged = mergeAthleteMemory(existing, incoming);
    assert.equal(merged.previousPriorities.length, 1);
    assert.equal(merged.athleteCorrections.length, 1);
    assert.equal(merged.challenges.length, 1);
  });

  it("empty MemoryPatch lists do not wipe existing memories", () => {
    const existing = createEmptyAthleteMemory();
    existing.goals = [
      {
        statement: "Win my age group",
        sourceMessageIds: ["u1"],
        confidence: "supported",
      },
    ];
    const patch = parseMemoryPatch({
      goals: [],
      challenges: [
        {
          statement: "I tighten late",
          sourceMessageIds: ["u2"],
          confidence: "tentative",
        },
      ],
    });
    assert.ok(memoryPatchSchema.safeParse(patch).success);
    const merged = mergeAthleteMemory(existing, patch);
    assert.equal(merged.goals.length, 1);
    assert.equal(merged.goals[0].statement, "Win my age group");
    assert.equal(merged.challenges.length, 1);
  });

  it("rejects invalid merge input", () => {
    const existing = createEmptyAthleteMemory();
    assert.throws(() => mergeAthleteMemory(existing, null));
  });
});

describe("memory route wiring", () => {
  it("wires generateMemoryUpdate through the route", () => {
    assert.match(routeSource, /generateMemoryUpdate/);
    assert.match(routeSource, /parseMemoryRequest/);
  });
});
