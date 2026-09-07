#!/usr/bin/env node
/**
 * Longitudinal memory stress harness (evaluator-only).
 * Same pipeline as /api/conversations → /api/chat → /api/memory → /api/insights.
 *
 * Usage:
 *   node --import ./scripts/stress-longitudinal/alias-register.mjs --experimental-strip-types scripts/stress-longitudinal/run.mts
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, and, desc, inArray } from "drizzle-orm";

config({ path: ".env.stress-longitudinal.local", override: true });
if (!process.env.OPENAI_API_KEY) config({ path: ".env.local" });

import { getDb } from "./db-http-client.ts";
import {
  people,
  memoryItems,
  memoryItemSources,
  occurrenceLedger,
  patterns,
  patternEvidence,
  reflections,
  timelineEvents,
  workspaceMemberships,
} from "../../db/schema.ts";
import { createAthleteWorkspace } from "../../server/services/workspace-service.ts";
import {
  startConversation,
  appendMessage,
  listMessages,
} from "../../server/services/conversation-service.ts";
import {
  buildDiscoveryContext,
  buildMemoryExtractionContext,
  buildInsightsContext,
} from "../../server/services/context-builders.ts";
import {
  loadAthleteMemory,
  persistAthleteMemory,
  buildWorkspaceMessageIdLookup,
} from "../../server/services/memory-service.ts";
import { persistInsightsResult } from "../../server/services/insights-persist-service.ts";
import { generateChatReply, formatMemoryContextForChat } from "../../lib/chat.mjs";
import { generateMemoryUpdate } from "../../lib/memory.mjs";
import { generateInsights } from "../../lib/insights.mjs";
import { CONVERSATIONS, HIDDEN, BUILD_COMMIT } from "./scenarios.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out");
mkdirSync(OUT_DIR, { recursive: true });

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientHarnessError(err) {
  const msg = String(err?.message || err || "");
  const cause = String(err?.cause?.message || err?.cause?.sourceError?.message || "");
  const blob = `${msg} ${cause} ${err?.name || ""} ${JSON.stringify(err?.body || {})}`.toLowerCase();
  return (
    blob.includes("fetch failed") ||
    blob.includes("aborted") ||
    blob.includes("econnreset") ||
    blob.includes("enotfound") ||
    blob.includes("etimedout") ||
    blob.includes("socket") ||
    blob.includes("network") ||
    blob.includes("429") ||
    blob.includes("503") ||
    blob.includes("502") ||
    blob.includes("chat failed") ||
    blob.includes("insights failed") ||
    blob.includes("openai_request_failed") ||
    blob.includes("couldn’t continue") ||
    blob.includes("couldn't continue") ||
    blob.includes("couldn’t finish") ||
    blob.includes("couldn't finish")
  );
}

async function withRetries(label, fn, { attempts = 6, baseMs = 4000 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientHarnessError(err) || i === attempts) throw err;
      const wait = baseMs * i;
      console.warn(`transient ${label} (attempt ${i}/${attempts}): ${err?.message || err}; retry in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function redactText(s, max = 220) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

async function ensurePerson(clerkUserId, displayName) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(people)
    .where(eq(people.clerkUserId, clerkUserId))
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(people)
    .values({
      clerkUserId,
      email: `${clerkUserId}@stress.athleteos.local`,
      displayName,
    })
    .returning();
  return row;
}

async function runMemory(workspaceId, conversationId, reason, report = null) {
  try {
    return await withRetries(`memory:${reason}`, async () => {
      const ctx = await buildMemoryExtractionContext(workspaceId, conversationId);
      const result = await generateMemoryUpdate({
        memory: ctx.memory,
        messages: ctx.messages,
        report,
        reason,
      });
      if (result.status >= 400 || !result.body?.memory) {
        return { ok: false, status: result.status, body: result.body, memoryBefore: ctx.memory };
      }
      const lookup = await buildWorkspaceMessageIdLookup(workspaceId);
      await persistAthleteMemory(workspaceId, result.body.memory, lookup);
      const persisted = await loadAthleteMemory(workspaceId);
      return { ok: true, demoMode: result.body.demoMode, memory: persisted };
    });
  } catch (err) {
    console.warn(`runMemory soft-fail ${reason}:`, err?.message || err);
    return { ok: false, status: 502, body: { error: String(err?.message || err) } };
  }
}

async function auditWorkspace(workspaceId, conversationId, conversationN) {
  const db = getDb();
  const msgs = await listMessages(conversationId);
  const memItems = await db
    .select()
    .from(memoryItems)
    .where(and(eq(memoryItems.workspaceId, workspaceId), eq(memoryItems.status, "active")));
  const sources =
    memItems.length === 0
      ? []
      : await db
          .select()
          .from(memoryItemSources)
          .where(inArray(memoryItemSources.memoryItemId, memItems.map((m) => m.id)));

  const patternRows = await db
    .select()
    .from(patterns)
    .where(eq(patterns.workspaceId, workspaceId))
    .orderBy(desc(patterns.createdAt));

  const evidence =
    patternRows.length === 0
      ? []
      : await db
          .select()
          .from(patternEvidence)
          .where(inArray(patternEvidence.patternId, patternRows.map((p) => p.id)));

  const [reflection] = await db
    .select()
    .from(reflections)
    .where(eq(reflections.conversationId, conversationId))
    .orderBy(desc(reflections.createdAt))
    .limit(1);

  const timeline = await db
    .select()
    .from(timelineEvents)
    .where(eq(timelineEvents.workspaceId, workspaceId))
    .orderBy(desc(timelineEvents.createdAt))
    .limit(12);

  const memory = await loadAthleteMemory(workspaceId);

  const ledgerRows = await db
    .select({
      phenomenonKey: occurrenceLedger.phenomenonKey,
      episode: occurrenceLedger.episode,
      episodeKey: occurrenceLedger.episodeKey,
      whyDistinct: occurrenceLedger.whyDistinct,
      conversationId: occurrenceLedger.conversationId,
      patternId: occurrenceLedger.patternId,
      createdAt: occurrenceLedger.createdAt,
    })
    .from(occurrenceLedger)
    .where(eq(occurrenceLedger.workspaceId, workspaceId));

  /** @type {Record<string, number>} */
  const ledgerCounts = {};
  for (const row of ledgerRows) {
    ledgerCounts[row.phenomenonKey] = (ledgerCounts[row.phenomenonKey] || 0) + 1;
  }

  return {
    conversationN,
    conversationId,
    messageIds: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      seq: m.seq,
      preview: redactText(m.content, 120),
    })),
    reflection: reflection
      ? {
          id: reflection.id,
          patternId: reflection.patternId,
          observations: reflection.observations,
          evidenceIntro: redactText(reflection.evidenceIntro, 160),
          evidenceNote: redactText(reflection.evidenceNote, 160),
          sharedPriority: reflection.sharedPriorityText,
          status: reflection.status,
        }
      : null,
    memoryItems: memItems.map((m) => ({
      id: m.id,
      kind: m.kind,
      statement: redactText(m.statement, 180),
      confidence: m.confidence,
      status: m.status,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      sourceMessageIds: sources.filter((s) => s.memoryItemId === m.id).map((s) => s.messageId),
    })),
    patterns: patternRows.map((p) => ({
      id: p.id,
      statement: redactText(p.statement, 180),
      explanation: redactText(p.explanation, 220),
      status: p.status,
      createdAt: p.createdAt,
      evidence: evidence
        .filter((e) => e.patternId === p.id)
        .map((e) => ({ sourceType: e.sourceType, sourceId: e.sourceId, note: e.note })),
    })),
    occurrenceLedger: ledgerRows.map((r) => ({
      phenomenonKey: r.phenomenonKey,
      episode: redactText(r.episode, 140),
      episodeKey: r.episodeKey,
      whyDistinct: redactText(r.whyDistinct, 140),
      conversationId: r.conversationId,
      patternId: r.patternId,
      createdAt: r.createdAt,
    })),
    occurrenceLedgerCounts: ledgerCounts,
    athleteMemorySummary: {
      sessionCount: memory.sessionCount,
      relationshipStage: memory.relationshipStage,
      goals: (memory.goals || []).map((g) => redactText(g.statement, 100)),
      challenges: (memory.challenges || []).map((c) => redactText(c.statement, 100)),
      significantExperiences: (memory.significantExperiences || []).map((s) =>
        redactText(s.statement, 100),
      ),
      observedPatterns: (memory.observedPatterns || []).map((p) => ({
        statement: redactText(p.statement, 120),
        status: p.status,
      })),
      previousPriorities: (memory.previousPriorities || []).map((p) =>
        redactText(p.priority || p.statement || "", 100),
      ),
    },
    timelineKinds: timeline.map((t) => ({
      kind: t.kind,
      payloadKeys: Object.keys(t.payload || {}),
      payload: t.payload,
      createdAt: t.createdAt,
    })),
  };
}

function detectHistoricalRefs(assistantText, memory) {
  const text = String(assistantText || "").toLowerCase();
  const hits = [];
  const pools = [
    ...(memory.challenges || []),
    ...(memory.goals || []),
    ...(memory.significantExperiences || []),
    ...(memory.observedPatterns || []).map((p) => ({ statement: p.statement })),
  ];
  for (const item of pools) {
    const stmt = String(item.statement || "");
    const tokens = stmt
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 5)
      .slice(0, 6);
    const matched = tokens.filter((t) => text.includes(t));
    if (matched.length >= 2) hits.push({ statement: redactText(stmt, 120), matchedTokens: matched });
  }
  const cues = [];
  for (const re of [
    /\b(earlier|previously|before|last time|across|over time|we've talked|you mentioned|in past|pattern)\b/i,
    /\b(when you're ahead|when you lead|protect|tentative|warm-?up|routine|overthink)\b/i,
  ]) {
    if (re.test(assistantText || "")) cues.push(String(re));
  }
  return { lexicalHits: hits, cueMatches: cues };
}

async function runOneConversation(args) {
  const { workspaceId, personId, scenario } = args;
  const { conversation } = await startConversation({ workspaceId, personId });

  const turnLog = [];
  let userTurns = 0;
  let lastSynced = 0;

  for (let i = 0; i < scenario.turns.length; i += 1) {
    const content = scenario.turns[i];
    const clientMessageId = uid(`u${scenario.n}_${i}`);
    const userMessage = await appendMessage({
      conversationId: conversation.id,
      workspaceId,
      role: "user",
      content,
      clientMessageId,
    });
    userTurns += 1;

    const ctx = await buildDiscoveryContext(workspaceId, conversation.id);
    const memoryInjected = formatMemoryContextForChat(ctx.memory);
    const chat = await generateChatReply(ctx.messages, { memory: ctx.memory });
    if (chat.status >= 400) {
      throw new Error(`Chat failed conv ${scenario.n} turn ${i}: ${JSON.stringify(chat.body)}`);
    }
    const reply = String(chat.body.reply || "").trim();
    const assistant = await appendMessage({
      conversationId: conversation.id,
      workspaceId,
      role: "assistant",
      content: reply,
    });

    const refs = detectHistoricalRefs(reply, ctx.memory);
    turnLog.push({
      turn: i + 1,
      userMessageId: userMessage.id,
      assistantMessageId: assistant.id,
      assistantPreview: redactText(reply, 200),
      memoryInjectedPreview: redactText(memoryInjected, 400),
      memoryInjectedChars: memoryInjected.length,
      observedPatternsInContext: (ctx.memory.observedPatterns || []).length,
      challengesInContext: (ctx.memory.challenges || []).length,
      sessionCountInContext: ctx.memory.sessionCount,
      historicalRefSignals: refs,
      demoMode: Boolean(chat.body.demoMode),
    });

    if (userTurns - lastSynced >= 3) {
      const mem = await runMemory(workspaceId, conversation.id, "checkpoint");
      turnLog[turnLog.length - 1].checkpoint = { ok: mem.ok, demoMode: mem.demoMode ?? null };
      lastSynced = userTurns;
    }
  }

  const pre = await runMemory(workspaceId, conversation.id, "pre_insights");
  const insightsCtx = await buildInsightsContext(workspaceId, conversation.id);
  const insights = await generateInsights(insightsCtx.messages, {
    memory: insightsCtx.memory,
    occurrenceLedgerContext: insightsCtx.occurrenceLedgerContext,
  });
  if (insights.status >= 400 || !insights.body?.report) {
    throw new Error(`Insights failed conv ${scenario.n}: ${JSON.stringify(insights.body)}`);
  }

  const persisted = await persistInsightsResult({
    workspaceId,
    conversationId: conversation.id,
    personId,
    report: insights.body.report,
  });

  const post = await runMemory(workspaceId, conversation.id, "session_complete", persisted.report);

  const snapshot = await auditWorkspace(workspaceId, conversation.id, scenario.n);
  snapshot.tags = scenario.tags;
  snapshot.turnLog = turnLog;
  snapshot.insights = {
    demoMode: Boolean(insights.body.demoMode),
    phenomenonKey: persisted.phenomenonKey || insights.body.report?.phenomenonKey || null,
    patternMaturity: persisted.patternMaturity,
    patternStatus: persisted.patternStatus,
    patternTitle: redactText(persisted.report?.pattern?.title, 160),
    patternExplanation: redactText(persisted.report?.pattern?.explanation, 260),
    distinctOccurrences: persisted.report?.distinctOccurrences ?? [],
    observations: persisted.report?.observations ?? [],
  };
  snapshot.memoryOps = { preInsightsOk: pre.ok, sessionCompleteOk: post.ok };

  const path = join(OUT_DIR, `conv-${String(scenario.n).padStart(2, "0")}.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
  console.log(
    `OK conv ${scenario.n} id=${conversation.id} patternStatus=${persisted.patternStatus} maturity=${persisted.patternMaturity} patterns=${snapshot.patterns.length} memItems=${snapshot.memoryItems.length}`,
  );
  return snapshot;
}

async function isolationControl(workspaceA, workspaceB) {
  const memA = await loadAthleteMemory(workspaceA);
  const memB = await loadAthleteMemory(workspaceB);
  const db = getDb();

  const aItems = await db
    .select()
    .from(memoryItems)
    .where(and(eq(memoryItems.workspaceId, workspaceA), eq(memoryItems.status, "active")));
  const bItems = await db
    .select()
    .from(memoryItems)
    .where(and(eq(memoryItems.workspaceId, workspaceB), eq(memoryItems.status, "active")));

  const leakedToB = aItems.filter((a) =>
    bItems.some((b) => b.statement === a.statement && a.statement.length > 20),
  );

  const membershipCross = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(eq(workspaceMemberships.workspaceId, workspaceA), eq(workspaceMemberships.role, "athlete")),
    );

  return {
    workspaceA,
    workspaceB,
    aMemoryItemCount: aItems.length,
    bMemoryItemCount: bItems.length,
    aPatternCount: (memA.observedPatterns || []).length,
    bPatternCount: (memB.observedPatterns || []).length,
    identicalStatementsAcrossWorkspaces: leakedToB.length,
    aMembershipCount: membershipCross.length,
    notes: [
      "loadAthleteMemory is workspace-scoped by construction",
      "No HTTP authz probe in this harness (Clerk session not used); DB scoping verified",
    ],
  };
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL missing — set .env.stress-longitudinal.local");
  }
  if (!process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY === "replace_me") {
    throw new Error("OPENAI_API_KEY required for live stress test");
  }

  const statePath = join(OUT_DIR, "state.json");
  let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;

  if (!state) {
    const personA = await ensurePerson(uid("stress_qa_a"), "Stress QA Athlete A");
    const personB = await ensurePerson(uid("stress_qa_b"), "Stress QA Athlete B");
    const wsA = await createAthleteWorkspace({ person: personA, sport: "tennis", level: "college" });
    const wsB = await createAthleteWorkspace({ person: personB, sport: "tennis", level: "college" });
    state = {
      buildCommit: BUILD_COMMIT,
      startedAt: new Date().toISOString(),
      personAId: personA.id,
      personBId: personB.id,
      workspaceAId: wsA.id,
      workspaceBId: wsB.id,
      completed: [],
    };
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    console.log("Created synthetic workspaces", { A: wsA.id, B: wsB.id });
  } else {
    console.log("Resuming state", { A: state.workspaceAId, completed: state.completed });
  }

  const startFrom = Number(process.env.STRESS_START_FROM || 1);
  const maxN = Number(process.env.STRESS_MAX_N || 999);
  for (const scenario of CONVERSATIONS) {
    if (scenario.n < startFrom || scenario.n > maxN) continue;
    if (state.completed.includes(scenario.n)) {
      console.log(`skip conv ${scenario.n} (already completed)`);
      continue;
    }
    await withRetries(`conv-${scenario.n}`, () =>
      runOneConversation({
        workspaceId: state.workspaceAId,
        personId: state.personAId,
        scenario,
      }),
    );
    state.completed.push(scenario.n);
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  if (maxN < 18) {
    console.log(`Partial run complete (STRESS_MAX_N=${maxN}). Skipping B isolation.`);
    return;
  }

  if (!state.completed.includes("B1")) {
    await withRetries("athlete-B", () =>
      runOneConversation({
        workspaceId: state.workspaceBId,
        personId: state.personBId,
        scenario: {
          n: 101,
          tags: ["athlete_b_control"],
          turns: [
            "I’m a doubles specialist mostly. Today we worked poaching patterns.",
            "My partner’s return was the story — I barely hit groundstrokes.",
            "No singles drama this week. Just doubles drills and a short set.",
          ],
        },
      }),
    );
    state.completed.push("B1");
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  const isolation = await isolationControl(state.workspaceAId, state.workspaceBId);
  writeFileSync(join(OUT_DIR, "isolation.json"), JSON.stringify(isolation, null, 2));
  writeFileSync(join(OUT_DIR, "hidden-ground-truth.json"), JSON.stringify(HIDDEN, null, 2));

  console.log("DONE. Snapshots in", OUT_DIR);
  console.log("Workspace A", state.workspaceAId);
  console.log("Workspace B", state.workspaceBId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
