import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  athleteWorkspaces,
  memoryItemSources,
  memoryItems,
  messages,
  patternFeedback,
  patterns,
  focusAreas,
  priorities,
} from "@/db/schema";
import { createEmptyAthleteMemory } from "@/lib/memory.mjs";
import type { AthleteMemory, MemoryItem, PatternMemory, CorrectionMemory, PriorityMemory } from "@/lib/types";

function mapConfidence(value: string): MemoryItem["confidence"] {
  if (value === "supported" || value === "strong") return value;
  return "tentative";
}

/**
 * Assemble domain AthleteMemory from normalized workspace tables.
 */
export async function loadAthleteMemory(workspaceId: string): Promise<AthleteMemory> {
  const db = getDb();
  const empty = createEmptyAthleteMemory() as AthleteMemory;

  const [workspace] = await db
    .select()
    .from(athleteWorkspaces)
    .where(eq(athleteWorkspaces.id, workspaceId))
    .limit(1);

  if (!workspace) return empty;

  const items = await db
    .select()
    .from(memoryItems)
    .where(
      and(eq(memoryItems.workspaceId, workspaceId), eq(memoryItems.status, "active")),
    );

  const itemIds = items.map((i) => i.id);
  const sources =
    itemIds.length === 0
      ? []
      : await db
          .select()
          .from(memoryItemSources)
          .where(inArray(memoryItemSources.memoryItemId, itemIds));

  const messageIdByDbId = new Map<string, string>();
  const sourceMessageDbIds = [
    ...new Set(sources.map((s) => s.messageId).filter(Boolean) as string[]),
  ];
  if (sourceMessageDbIds.length > 0) {
    const msgRows = await db
      .select()
      .from(messages)
      .where(inArray(messages.id, sourceMessageDbIds));
    for (const m of msgRows) {
      messageIdByDbId.set(m.id, m.clientMessageId || m.id);
    }
  }

  const sourcesByItem = new Map<string, string[]>();
  for (const s of sources) {
    const list = sourcesByItem.get(s.memoryItemId) ?? [];
    if (s.messageId) {
      list.push(messageIdByDbId.get(s.messageId) ?? s.messageId);
    }
    sourcesByItem.set(s.memoryItemId, list);
  }

  const goals: MemoryItem[] = [];
  const motivations: MemoryItem[] = [];
  const challenges: MemoryItem[] = [];
  const significantExperiences: MemoryItem[] = [];
  const openQuestions: string[] = [];
  const background: string[] = [];
  const athleteCorrections: CorrectionMemory[] = [];

  for (const item of items) {
    const sourceMessageIds = sourcesByItem.get(item.id) ?? [];
    if (item.kind === "open_question") {
      openQuestions.push(item.statement);
      continue;
    }
    if (item.kind === "identity_background") {
      background.push(item.statement);
      continue;
    }
    if (item.kind === "correction") {
      const meta = (item.metadata ?? {}) as {
        originalInterpretation?: string;
        sourceMessageId?: string;
      };
      athleteCorrections.push({
        originalInterpretation: meta.originalInterpretation || "",
        athleteCorrection: item.statement,
        sourceMessageId: meta.sourceMessageId || sourceMessageIds[0] || "",
      });
      continue;
    }

    const mapped: MemoryItem = {
      statement: item.statement,
      sourceMessageIds,
      confidence: mapConfidence(item.confidence),
    };
    if (item.kind === "goal") goals.push(mapped);
    else if (item.kind === "motivation") motivations.push(mapped);
    else if (item.kind === "challenge") challenges.push(mapped);
    else if (item.kind === "significant_experience") significantExperiences.push(mapped);
  }

  const patternRows = await db
    .select()
    .from(patterns)
    .where(
      and(
        eq(patterns.workspaceId, workspaceId),
        inArray(patterns.status, ["emerging", "supported", "revised", "rejected"]),
      ),
    );

  const observedPatterns: PatternMemory[] = patternRows.map((p) => ({
    statement: p.statement,
    supportingMessageIds: [],
    status: p.status === "archived" ? "revised" : (p.status as PatternMemory["status"]),
  }));

  const feedbackRows = await db
    .select()
    .from(patternFeedback)
    .innerJoin(patterns, eq(patternFeedback.patternId, patterns.id))
    .where(eq(patterns.workspaceId, workspaceId));

  for (const row of feedbackRows) {
    if (row.pattern_feedback.role !== "athlete") continue;
    if (
      row.pattern_feedback.response !== "disagree" &&
      row.pattern_feedback.response !== "needs_more_context"
    ) {
      continue;
    }
    athleteCorrections.push({
      originalInterpretation: row.patterns.statement,
      athleteCorrection: row.pattern_feedback.note || row.pattern_feedback.response,
      sourceMessageId: row.pattern_feedback.sourceMessageId || "",
    });
  }

  const priorityRows = await db
    .select()
    .from(priorities)
    .where(eq(priorities.workspaceId, workspaceId));

  const previousPriorities: PriorityMemory[] = [];
  for (const p of priorityRows) {
    const focuses = await db
      .select()
      .from(focusAreas)
      .where(eq(focusAreas.priorityId, p.id));
    previousPriorities.push({
      priority: p.statement,
      focusAreas: focuses
        .sort((a, b) => a.position - b.position)
        .map((f) => f.label),
      createdAt: p.createdAt.toISOString(),
    });
  }

  const coverage = workspace.understandingCoverage ?? empty.understandingCoverage;

  return {
    version: empty.version,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    relationshipStage: workspace.relationshipStage,
    identity: {
      name: undefined,
      sport: workspace.sport ?? undefined,
      level: workspace.level ?? undefined,
      background,
    },
    goals,
    motivations,
    challenges,
    significantExperiences,
    observedPatterns,
    athleteCorrections,
    previousPriorities,
    openQuestions,
    understandingCoverage: coverage,
    sessionCount: workspace.sessionCount,
  };
}

/**
 * Replace active structured memory items from a validated AthleteMemory snapshot.
 * Archives previous active items (soft), then inserts the new set with source links.
 */
export async function persistAthleteMemory(
  workspaceId: string,
  memory: AthleteMemory,
  messageIdLookup: Map<string, string>,
): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx
      .update(memoryItems)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(eq(memoryItems.workspaceId, workspaceId), eq(memoryItems.status, "active")),
      );

    const insertKind = async (
      kind:
        | "goal"
        | "motivation"
        | "challenge"
        | "significant_experience"
        | "open_question"
        | "identity_background"
        | "correction",
      statement: string,
      confidence: MemoryItem["confidence"] = "tentative",
      sourceMessageIds: string[] = [],
      metadata: Record<string, unknown> = {},
    ) => {
      const [row] = await tx
        .insert(memoryItems)
        .values({
          workspaceId,
          kind,
          statement,
          confidence,
          status: "active",
          metadata,
        })
        .returning();
      if (!row) return;
      for (const clientId of sourceMessageIds) {
        const dbMessageId = messageIdLookup.get(clientId);
        if (!dbMessageId) continue;
        await tx.insert(memoryItemSources).values({
          memoryItemId: row.id,
          messageId: dbMessageId,
        });
      }
    };

    for (const g of memory.goals ?? []) {
      await insertKind("goal", g.statement, g.confidence, g.sourceMessageIds);
    }
    for (const g of memory.motivations ?? []) {
      await insertKind("motivation", g.statement, g.confidence, g.sourceMessageIds);
    }
    for (const g of memory.challenges ?? []) {
      await insertKind("challenge", g.statement, g.confidence, g.sourceMessageIds);
    }
    for (const g of memory.significantExperiences ?? []) {
      await insertKind(
        "significant_experience",
        g.statement,
        g.confidence,
        g.sourceMessageIds,
      );
    }
    for (const q of memory.openQuestions ?? []) {
      await insertKind("open_question", q, "tentative", []);
    }
    for (const b of memory.identity?.background ?? []) {
      await insertKind("identity_background", b, "supported", []);
    }
    for (const c of memory.athleteCorrections ?? []) {
      await insertKind("correction", c.athleteCorrection, "strong", [c.sourceMessageId], {
        originalInterpretation: c.originalInterpretation,
        sourceMessageId: c.sourceMessageId,
      });
    }

    await tx
      .update(athleteWorkspaces)
      .set({
        sport: memory.identity?.sport ?? null,
        level: memory.identity?.level ?? null,
        relationshipStage: memory.relationshipStage,
        sessionCount: memory.sessionCount,
        understandingCoverage: memory.understandingCoverage,
        updatedAt: new Date(),
      })
      .where(eq(athleteWorkspaces.id, workspaceId));
  });
}

export async function buildMessageIdLookup(
  conversationId: string,
): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId));
  const map = new Map<string, string>();
  for (const m of rows) {
    map.set(m.id, m.id);
    if (m.clientMessageId) map.set(m.clientMessageId, m.id);
  }
  return map;
}
