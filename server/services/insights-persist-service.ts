import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  focusAreas,
  memoryItemSources,
  memoryItems,
  messages,
  patternEvidence,
  patterns,
  priorities,
  priorityEvidence,
  reflections,
  timelineEvents,
  conversations,
} from "@/db/schema";
import type { ReflectionReport } from "@/lib/types";
import {
  presentReportForPatternMaturity,
  resolveOccurrenceMaturity,
  resolvePatternPersistStatus,
} from "@/lib/pattern-threshold.mjs";

/**
 * Persist insights atomically: pattern + reflection + priority (+ focus areas).
 * Archives previous active priority for the workspace.
 *
 * Pattern status (occurrence-based — NOT conversation/session count):
 * - proposed when confident distinctOccurrences < 3 (observation / candidate)
 * - emerging when >= 3 distinct real-world occurrences of the same/similar phenomenon
 * Ambiguous occurrence lists → treat as 0 → proposed (precision over recall).
 *
 * Provenance (Pass 8 additive): pattern_evidence rows use sourceType "message"
 * with real message UUIDs from this conversation plus any workspace memory-linked
 * messages from other conversations. Occurrence episodes are stored on the
 * timeline payload (no occurrence table yet).
 */
export async function persistInsightsResult(args: {
  workspaceId: string;
  conversationId: string;
  personId: string;
  report: ReflectionReport;
}): Promise<{
  reflectionId: string;
  patternId: string;
  priorityId: string;
  patternMaturity: number;
  patternStatus: "proposed" | "emerging";
  report: ReflectionReport;
}> {
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx
      .update(reflections)
      .set({ status: "superseded" })
      .where(
        and(
          eq(reflections.workspaceId, args.workspaceId),
          eq(reflections.status, "active"),
        ),
      );

    const sessionMessages = await tx
      .select({
        id: messages.id,
        role: messages.role,
        conversationId: messages.conversationId,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, args.conversationId),
          eq(messages.workspaceId, args.workspaceId),
        ),
      );

    const evidenceConversationIds: string[] = [args.conversationId];
    const linkedMessageIds = new Set<string>();
    const evidenceInserts: { messageId: string; note: string }[] = [];

    for (const msg of sessionMessages) {
      if (msg.role !== "user") continue;
      linkedMessageIds.add(msg.id);
      evidenceInserts.push({ messageId: msg.id, note: "session_user_message" });
    }

    // Historical memory-linked messages from other conversations (same workspace).
    const activeMemory = await tx
      .select({ id: memoryItems.id })
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.workspaceId, args.workspaceId),
          eq(memoryItems.status, "active"),
        ),
      );
    const memoryIds = activeMemory.map((m) => m.id);
    if (memoryIds.length > 0) {
      const sources = await tx
        .select({
          messageId: memoryItemSources.messageId,
          conversationId: messages.conversationId,
        })
        .from(memoryItemSources)
        .innerJoin(messages, eq(messages.id, memoryItemSources.messageId))
        .where(
          and(
            inArray(memoryItemSources.memoryItemId, memoryIds),
            ne(messages.conversationId, args.conversationId),
            eq(messages.workspaceId, args.workspaceId),
          ),
        );

      for (const source of sources) {
        if (!source.messageId || linkedMessageIds.has(source.messageId)) continue;
        linkedMessageIds.add(source.messageId);
        if (source.conversationId) evidenceConversationIds.push(source.conversationId);
        evidenceInserts.push({
          messageId: source.messageId,
          note: "historical_memory_message",
        });
      }
    }

    // patternMaturity = distinct real-world occurrence count (not session count).
    const patternMaturity = resolveOccurrenceMaturity({ report: args.report });
    const patternStatus = resolvePatternPersistStatus(patternMaturity);
    const presentedReport = presentReportForPatternMaturity(args.report, patternMaturity);
    const occurrenceEpisodes = (args.report.distinctOccurrences ?? [])
      .filter(
        (o) =>
          typeof o?.episode === "string" &&
          o.episode.trim() &&
          typeof o?.whyDistinct === "string" &&
          o.whyDistinct.trim(),
      )
      .map((o) => ({ episode: o.episode.trim(), whyDistinct: o.whyDistinct.trim() }));
    const supportingConversationIds = [...new Set(evidenceConversationIds)];

    const [pattern] = await tx
      .insert(patterns)
      .values({
        workspaceId: args.workspaceId,
        statement: presentedReport.pattern.title,
        explanation: presentedReport.pattern.explanation,
        status: patternStatus,
        visibility: "workspace",
      })
      .returning();

    if (!pattern) throw new Error("Failed to insert pattern.");

    for (const row of evidenceInserts) {
      await tx.insert(patternEvidence).values({
        patternId: pattern.id,
        sourceType: "message",
        sourceId: row.messageId,
        note: row.note,
      });
    }

    // Category/explanation labels remain on reflections.evidence jsonb — not as fake FK rows.

    const [reflection] = await tx
      .insert(reflections)
      .values({
        workspaceId: args.workspaceId,
        conversationId: args.conversationId,
        observations: presentedReport.observations,
        evidenceIntro: presentedReport.evidenceIntro,
        evidence: presentedReport.evidence,
        evidenceNote: presentedReport.evidenceNote,
        patternId: pattern.id,
        sharedPriorityText: presentedReport.sharedPriority,
        focusIntro: presentedReport.focusIntro,
        closing: presentedReport.closing,
        visibility: "athlete_private",
        status: "active",
      })
      .returning();

    if (!reflection) throw new Error("Failed to insert reflection.");

    await tx
      .update(priorities)
      .set({ status: "archived", archivedAt: new Date() })
      .where(
        and(
          eq(priorities.workspaceId, args.workspaceId),
          eq(priorities.status, "active"),
        ),
      );

    const [priority] = await tx
      .insert(priorities)
      .values({
        workspaceId: args.workspaceId,
        reflectionId: reflection.id,
        statement: presentedReport.sharedPriority,
        visibility: "workspace",
        status: "active",
        whyNow: "From the athlete discovery reflection.",
      })
      .returning();

    if (!priority) throw new Error("Failed to insert priority.");

    await tx.insert(priorityEvidence).values({
      priorityId: priority.id,
      sourceType: "observation",
      sourceId: pattern.id,
      note: "Derived from reflection pattern",
    });

    const focusLabels = (presentedReport.focusAreas ?? []).slice(0, 3);
    for (let i = 0; i < focusLabels.length; i += 1) {
      await tx.insert(focusAreas).values({
        priorityId: priority.id,
        label: focusLabels[i]!,
        position: i + 1,
      });
    }

    await tx
      .update(conversations)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(conversations.id, args.conversationId));

    await tx.insert(timelineEvents).values({
      workspaceId: args.workspaceId,
      personId: args.personId,
      kind: "reflection_generated",
      visibility: "athlete_private",
      payload: {
        reflectionId: reflection.id,
        patternId: pattern.id,
        priorityId: priority.id,
        conversationId: args.conversationId,
        patternMaturity,
        patternStatus,
        occurrenceCount: patternMaturity,
        occurrences: occurrenceEpisodes,
        supportingConversationIds,
      },
    });

    await tx.insert(timelineEvents).values({
      workspaceId: args.workspaceId,
      personId: args.personId,
      kind: "priority_activated",
      visibility: "workspace",
      payload: { priorityId: priority.id },
    });

    return {
      reflectionId: reflection.id,
      patternId: pattern.id,
      priorityId: priority.id,
      patternMaturity,
      patternStatus,
      report: presentedReport,
    };
  });
}

export async function loadActiveReflectionReport(
  workspaceId: string,
): Promise<ReflectionReport | null> {
  const db = getDb();
  const [reflection] = await db
    .select()
    .from(reflections)
    .where(
      and(eq(reflections.workspaceId, workspaceId), eq(reflections.status, "active")),
    )
    .limit(1);
  if (!reflection) return null;
  return reflectionRowToReport(reflection);
}

/** Load the reflection tied to a specific conversation (for finalize idempotency). */
export async function loadReflectionForConversation(
  workspaceId: string,
  conversationId: string,
): Promise<{
  report: ReflectionReport;
  reflectionId: string;
  patternId: string | null;
  priorityId: string | null;
} | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(reflections)
    .where(
      and(
        eq(reflections.workspaceId, workspaceId),
        eq(reflections.conversationId, conversationId),
      ),
    );

  const chosen =
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  if (!chosen) return null;

  const report = await reflectionRowToReport(chosen);
  const [priority] = await db
    .select()
    .from(priorities)
    .where(eq(priorities.reflectionId, chosen.id))
    .limit(1);

  return {
    report,
    reflectionId: chosen.id,
    patternId: chosen.patternId,
    priorityId: priority?.id ?? null,
  };
}

async function reflectionRowToReport(reflection: {
  observations: string[] | null;
  evidenceIntro: string;
  evidence: ReflectionReport["evidence"] | null;
  evidenceNote: string;
  patternId: string | null;
  sharedPriorityText: string;
  focusIntro: string;
  closing: string;
  workspaceId: string;
}): Promise<ReflectionReport> {
  const db = getDb();
  let patternTitle = "Working pattern";
  let patternExplanation = "";
  if (reflection.patternId) {
    const [pattern] = await db
      .select()
      .from(patterns)
      .where(eq(patterns.id, reflection.patternId))
      .limit(1);
    if (pattern) {
      patternTitle = pattern.statement;
      patternExplanation = pattern.explanation;
    }
  }

  const [priority] = await db
    .select()
    .from(priorities)
    .where(
      and(
        eq(priorities.workspaceId, reflection.workspaceId),
        eq(priorities.status, "active"),
      ),
    )
    .limit(1);

  let focusAreaLabels: string[] = [];
  if (priority) {
    const focuses = await db
      .select()
      .from(focusAreas)
      .where(eq(focusAreas.priorityId, priority.id));
    focusAreaLabels = focuses
      .sort((a, b) => a.position - b.position)
      .map((f) => f.label);
  }

  return {
    observations: reflection.observations ?? [],
    evidenceIntro: reflection.evidenceIntro,
    evidence: reflection.evidence ?? [],
    evidenceNote: reflection.evidenceNote,
    pattern: {
      title: patternTitle,
      explanation: patternExplanation,
    },
    sharedPriority: reflection.sharedPriorityText,
    focusIntro: reflection.focusIntro,
    focusAreas: focusAreaLabels,
    closing: reflection.closing,
  };
}
