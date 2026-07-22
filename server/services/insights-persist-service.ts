import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  focusAreas,
  patternEvidence,
  patterns,
  priorities,
  priorityEvidence,
  reflections,
  timelineEvents,
  conversations,
} from "@/db/schema";
import type { ReflectionReport } from "@/lib/types";

/**
 * Persist insights atomically: pattern + reflection + priority (+ focus areas).
 * Archives previous active priority for the workspace.
 */
export async function persistInsightsResult(args: {
  workspaceId: string;
  conversationId: string;
  personId: string;
  report: ReflectionReport;
}): Promise<{ reflectionId: string; patternId: string; priorityId: string }> {
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

    const [pattern] = await tx
      .insert(patterns)
      .values({
        workspaceId: args.workspaceId,
        statement: args.report.pattern.title,
        explanation: args.report.pattern.explanation,
        status: "supported",
        visibility: "workspace",
      })
      .returning();

    if (!pattern) throw new Error("Failed to insert pattern.");

    for (const evidence of args.report.evidence) {
      await tx.insert(patternEvidence).values({
        patternId: pattern.id,
        sourceType: "observation",
        sourceId: pattern.id,
        note: `${evidence.category}: ${evidence.explanation}`,
      });
    }

    const [reflection] = await tx
      .insert(reflections)
      .values({
        workspaceId: args.workspaceId,
        conversationId: args.conversationId,
        observations: args.report.observations,
        evidenceIntro: args.report.evidenceIntro,
        evidence: args.report.evidence,
        evidenceNote: args.report.evidenceNote,
        patternId: pattern.id,
        sharedPriorityText: args.report.sharedPriority,
        focusIntro: args.report.focusIntro,
        closing: args.report.closing,
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
        statement: args.report.sharedPriority,
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

    const focusLabels = (args.report.focusAreas ?? []).slice(0, 3);
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
      and(eq(priorities.workspaceId, workspaceId), eq(priorities.status, "active")),
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
