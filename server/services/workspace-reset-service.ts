import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  athleteWorkspaces,
  conversations,
  focusAreas,
  memoryItemSources,
  memoryItems,
  messages,
  modelOperations,
  notifications,
  observations,
  patternEvidence,
  patternFeedback,
  patterns,
  perspectiveComparisons,
  priorities,
  priorityEvidence,
  priorityReviews,
  reflections,
  timelineEvents,
  workspaceInvitations,
} from "@/db/schema";
import { createEmptyAthleteMemory } from "@/lib/memory.mjs";

/**
 * Archive performance data for a workspace. Does not delete Person or Clerk identity.
 */
export async function resetAthleteWorkspace(args: {
  workspaceId: string;
  personId: string;
}): Promise<void> {
  const db = getDb();
  const empty = createEmptyAthleteMemory();

  await db.transaction(async (tx) => {
    const workspaceId = args.workspaceId;

    const convRows = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.workspaceId, workspaceId));
    const conversationIds = convRows.map((c) => c.id);

    const priorityRows = await tx
      .select({ id: priorities.id })
      .from(priorities)
      .where(eq(priorities.workspaceId, workspaceId));
    const priorityIds = priorityRows.map((p) => p.id);

    const patternRows = await tx
      .select({ id: patterns.id })
      .from(patterns)
      .where(eq(patterns.workspaceId, workspaceId));
    const patternIds = patternRows.map((p) => p.id);

    const memoryRows = await tx
      .select({ id: memoryItems.id })
      .from(memoryItems)
      .where(eq(memoryItems.workspaceId, workspaceId));
    const memoryIds = memoryRows.map((m) => m.id);

    if (priorityIds.length > 0) {
      await tx.delete(focusAreas).where(inArray(focusAreas.priorityId, priorityIds));
      await tx
        .delete(priorityEvidence)
        .where(inArray(priorityEvidence.priorityId, priorityIds));
      await tx
        .delete(priorityReviews)
        .where(inArray(priorityReviews.priorityId, priorityIds));
    }

    if (patternIds.length > 0) {
      await tx
        .delete(patternEvidence)
        .where(inArray(patternEvidence.patternId, patternIds));
      await tx
        .delete(patternFeedback)
        .where(inArray(patternFeedback.patternId, patternIds));
    }

    if (memoryIds.length > 0) {
      await tx
        .delete(memoryItemSources)
        .where(inArray(memoryItemSources.memoryItemId, memoryIds));
    }

    await tx
      .delete(perspectiveComparisons)
      .where(eq(perspectiveComparisons.workspaceId, workspaceId));
    await tx.delete(notifications).where(eq(notifications.workspaceId, workspaceId));
    await tx
      .delete(workspaceInvitations)
      .where(eq(workspaceInvitations.workspaceId, workspaceId));
    await tx.delete(reflections).where(eq(reflections.workspaceId, workspaceId));
    await tx.delete(priorities).where(eq(priorities.workspaceId, workspaceId));
    await tx.delete(patterns).where(eq(patterns.workspaceId, workspaceId));
    await tx.delete(observations).where(eq(observations.workspaceId, workspaceId));
    await tx.delete(memoryItems).where(eq(memoryItems.workspaceId, workspaceId));
    await tx.delete(modelOperations).where(eq(modelOperations.workspaceId, workspaceId));

    if (conversationIds.length > 0) {
      await tx.delete(messages).where(inArray(messages.conversationId, conversationIds));
    }
    await tx.delete(conversations).where(eq(conversations.workspaceId, workspaceId));

    await tx
      .update(athleteWorkspaces)
      .set({
        relationshipStage: "first_conversation",
        sessionCount: 0,
        understandingCoverage: empty.understandingCoverage,
        sport: null,
        level: null,
        updatedAt: new Date(),
      })
      .where(eq(athleteWorkspaces.id, workspaceId));

    await tx.insert(timelineEvents).values({
      workspaceId,
      personId: args.personId,
      kind: "workspace_reset",
      visibility: "athlete_private",
      payload: {},
    });
  });
}
