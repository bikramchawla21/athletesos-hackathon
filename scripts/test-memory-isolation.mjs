import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyMemoryModelUpdate,
  collectExistingEvidenceIds,
  createEmptyAthleteMemory,
  sanitizeMemoryMessageIds,
} from "../lib/memory.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function baseMemoryWithSecondServe() {
  const memory = createEmptyAthleteMemory("2026-01-01T00:00:00.000Z");
  memory.challenges = [
    {
      statement: "Second serve becomes conservative when the score gets tight.",
      sourceMessageIds: ["conv1-u1"],
      confidence: "supported",
    },
  ];
  memory.observedPatterns = [
    {
      statement: "Second serve conservatism under score pressure",
      supportingMessageIds: ["conv1-u1"],
      status: "emerging",
    },
  ];
  return memory;
}

describe("cross-conversation memory durability", () => {
  it("preserves prior conversation citations when current transcript ids differ", () => {
    const existing = baseMemoryWithSecondServe();
    const preserveIds = collectExistingEvidenceIds(existing);
    assert.ok(preserveIds.has("conv1-u1"));

    // Simulate a new conversation checkpoint whose transcript only has new ids.
    const currentIds = new Set(["conv2-opening", "conv2-u1"]);
    const cleaned = sanitizeMemoryMessageIds(existing, currentIds, {
      preserveIds,
      previousMemory: existing,
    });

    assert.equal(cleaned.challenges.length, 1);
    assert.equal(
      cleaned.challenges[0].statement,
      "Second serve becomes conservative when the score gets tight.",
    );
    assert.deepEqual(cleaned.challenges[0].sourceMessageIds, ["conv1-u1"]);
    assert.equal(cleaned.observedPatterns.length, 1);
  });

  it("applyMemoryModelUpdate does not blank prior challenges on a new conversation", () => {
    const existing = baseMemoryWithSecondServe();
    const patch = {
      challenges: [
        {
          statement: "Second serve becomes conservative when the score gets tight.",
          sourceMessageIds: ["conv1-u1"],
          confidence: "supported",
        },
        {
          statement: "Felt rushed after a double fault today.",
          sourceMessageIds: ["conv2-u1"],
          confidence: "tentative",
        },
      ],
    };

    const next = applyMemoryModelUpdate(existing, patch, new Set(["conv2-opening", "conv2-u1"]));
    assert.ok(
      next.challenges.some((c) =>
        c.statement.includes("Second serve becomes conservative"),
      ),
      "prior challenge must survive",
    );
    assert.ok(
      next.challenges.some((c) => c.statement.includes("Felt rushed after a double fault")),
      "new challenge with current-transcript citation must remain",
    );
    const prior = next.challenges.find((c) => c.statement.includes("Second serve"));
    assert.deepEqual(prior?.sourceMessageIds, ["conv1-u1"]);
  });

  it("rejects brand-new claims that cite foreign or nonexistent message ids", () => {
    const existing = baseMemoryWithSecondServe();
    const patch = {
      challenges: [
        {
          statement: "Backhand return is late against left-handers.",
          sourceMessageIds: ["athlete-b-msg"],
          confidence: "tentative",
        },
      ],
    };
    const next = applyMemoryModelUpdate(existing, patch, new Set(["conv2-u1"]));
    assert.ok(
      !next.challenges.some((c) => c.statement.includes("Backhand return")),
      "foreign citation must not create a new claim",
    );
    assert.ok(
      next.challenges.some((c) => c.statement.includes("Second serve")),
      "existing workspace memory must remain",
    );
  });

  it("starting a conceptual conversation 2 does not create blank AthleteMemory", () => {
    const day1 = baseMemoryWithSecondServe();
    let memory = day1;
    for (let i = 2; i <= 5; i += 1) {
      const uid = `conv${i}-u1`;
      memory = applyMemoryModelUpdate(
        memory,
        {
          challenges: [
            ...memory.challenges,
            {
              statement: `Day ${i} note about tight-score serving.`,
              sourceMessageIds: [uid],
              confidence: "tentative",
            },
          ],
        },
        new Set([`conv${i}-opening`, uid]),
      );
      assert.ok(
        memory.challenges.some((c) => c.statement.includes("Second serve")),
        `day ${i} must still carry day-1 challenge`,
      );
    }
    assert.ok(memory.challenges.length >= 2);
  });
});

describe("cross-athlete isolation (unit)", () => {
  it("Athlete A preserve set does not admit Athlete B citations", () => {
    const athleteA = baseMemoryWithSecondServe();
    const athleteB = createEmptyAthleteMemory();
    athleteB.challenges = [
      {
        statement: "Backhand return is late against left-handers.",
        sourceMessageIds: ["b-u1"],
        confidence: "supported",
      },
    ];

    const aPreserve = collectExistingEvidenceIds(athleteA);
    const bPreserve = collectExistingEvidenceIds(athleteB);
    assert.ok(aPreserve.has("conv1-u1"));
    assert.ok(bPreserve.has("b-u1"));
    assert.equal(aPreserve.has("b-u1"), false);
    assert.equal(bPreserve.has("conv1-u1"), false);

    const aLoaded = sanitizeMemoryMessageIds(athleteA, new Set(["a-new"]), {
      preserveIds: aPreserve,
      previousMemory: athleteA,
    });
    assert.ok(aLoaded.challenges.every((c) => !c.statement.includes("Backhand")));
    assert.ok(aLoaded.challenges.some((c) => c.statement.includes("Second serve")));
  });
});

describe("authorization pairing invariants", () => {
  it("conversation fetch requires matching workspaceId in SQL where clause", () => {
    const source = readFileSync(
      join(__dirname, "../server/services/conversation-service.ts"),
      "utf8",
    );
    assert.match(source, /eq\(conversations\.id, conversationId\)/);
    assert.match(source, /eq\(conversations\.workspaceId, workspaceId\)/);
  });

  it("workspace memory route asserts conversation belongs to workspace", () => {
    const source = readFileSync(join(__dirname, "../app/api/memory/route.ts"), "utf8");
    assert.match(source, /requireWorkspaceMembership\(body\.workspaceId\)/);
    assert.match(source, /getConversationForWorkspace/);
    assert.match(source, /assertEntityWorkspace\(conversation\.workspaceId, body\.workspaceId\)/);
    assert.match(source, /buildWorkspaceMessageIdLookup\(body\.workspaceId\)/);
  });

  it("chat and insights routes pair workspace + conversation authorization", () => {
    for (const rel of ["../app/api/chat/route.ts", "../app/api/insights/route.ts"]) {
      const source = readFileSync(join(__dirname, rel), "utf8");
      assert.match(source, /requireWorkspaceMembership/);
      assert.match(source, /getConversationForWorkspace/);
      assert.match(source, /assertEntityWorkspace/);
    }
  });

  it("loadAthleteMemory queries are workspace-scoped", () => {
    const source = readFileSync(
      join(__dirname, "../server/services/memory-service.ts"),
      "utf8",
    );
    assert.match(source, /eq\(memoryItems\.workspaceId, workspaceId\)/);
    assert.match(source, /eq\(patterns\.workspaceId, workspaceId\)/);
    assert.match(source, /eq\(priorities\.workspaceId, workspaceId\)/);
    assert.match(source, /eq\(conversations\.workspaceId, workspaceId\)/);
  });

  it("persistAthleteMemory archive+insert runs inside a transaction", () => {
    const source = readFileSync(
      join(__dirname, "../server/services/memory-service.ts"),
      "utf8",
    );
    assert.match(source, /db\.transaction\(async \(tx\) =>/);
    assert.match(source, /status: "archived"/);
  });

  it("pattern feedback requires pattern to belong to workspace", () => {
    const source = readFileSync(
      join(__dirname, "../server/services/perspective-service.ts"),
      "utf8",
    );
    assert.match(
      source,
      /eq\(patterns\.id, args\.patternId\), eq\(patterns\.workspaceId, args\.workspaceId\)/,
    );
  });
});
