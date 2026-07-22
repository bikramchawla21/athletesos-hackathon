import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  focusAreas,
  observations,
  patterns,
  priorities,
  priorityEvidence,
  priorityReviews,
  timelineEvents,
  workspaceMemberships,
} from "@/db/schema";
import { createNotification } from "./notification-service";

export async function proposeSharedPriority(args: {
  workspaceId: string;
  proposedByPersonId: string;
  statement: string;
  whyNow?: string | null;
  athleteFocus?: string | null;
  coachFocus?: string | null;
  reviewCondition?: string | null;
  patternId?: string | null;
}): Promise<{ priorityId: string }> {
  const db = getDb();

  // Archive any previously active/proposed priorities being replaced
  await db
    .update(priorities)
    .set({ status: "replaced", archivedAt: new Date() })
    .where(
      and(
        eq(priorities.workspaceId, args.workspaceId),
        eq(priorities.status, "proposed"),
      ),
    );

  const [priority] = await db
    .insert(priorities)
    .values({
      workspaceId: args.workspaceId,
      statement: args.statement.trim(),
      whyNow: args.whyNow ?? null,
      athleteFocus: args.athleteFocus ?? null,
      coachFocus: args.coachFocus ?? null,
      reviewCondition: args.reviewCondition ?? null,
      visibility: "workspace",
      status: "proposed",
    })
    .returning();

  if (!priority) throw new Error("Failed to propose priority.");

  if (args.patternId) {
    await db.insert(priorityEvidence).values({
      priorityId: priority.id,
      sourceType: "observation",
      sourceId: args.patternId,
      note: "Linked shared pattern",
    });
  }

  const sharedObs = await db
    .select()
    .from(observations)
    .where(
      and(
        eq(observations.workspaceId, args.workspaceId),
        eq(observations.visibility, "workspace"),
        eq(observations.status, "active"),
      ),
    )
    .orderBy(desc(observations.createdAt))
    .limit(4);

  for (const obs of sharedObs) {
    await db.insert(priorityEvidence).values({
      priorityId: priority.id,
      sourceType: "observation",
      sourceId: obs.id,
      note: `${obs.authorRole} evidence`,
    });
  }

  await db.insert(timelineEvents).values({
    workspaceId: args.workspaceId,
    personId: args.proposedByPersonId,
    kind: "priority_proposed",
    visibility: "workspace",
    payload: { priorityId: priority.id },
  });

  const members = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, args.workspaceId),
        eq(workspaceMemberships.status, "active"),
      ),
    );
  for (const m of members) {
    await createNotification({
      recipientPersonId: m.personId,
      workspaceId: args.workspaceId,
      kind: "shared_priority_ready_for_review",
      payload: { priorityId: priority.id },
    });
  }

  return { priorityId: priority.id };
}

export async function reviewSharedPriority(args: {
  workspaceId: string;
  priorityId: string;
  personId: string;
  role: "athlete" | "coach";
  decision: "approve" | "revise" | "delegate";
  note?: string | null;
}): Promise<{ status: string; activated: boolean }> {
  const db = getDb();
  const [priority] = await db
    .select()
    .from(priorities)
    .where(
      and(
        eq(priorities.id, args.priorityId),
        eq(priorities.workspaceId, args.workspaceId),
      ),
    )
    .limit(1);
  if (!priority) throw new Error("Priority not found.");
  if (priority.status === "active") {
    return { status: "active", activated: false };
  }
  if (!["proposed", "athlete_reviewed", "coach_reviewed", "revised"].includes(priority.status)) {
    throw new Error("Priority is not open for review.");
  }

  const existing = await db
    .select()
    .from(priorityReviews)
    .where(
      and(
        eq(priorityReviews.priorityId, args.priorityId),
        eq(priorityReviews.personId, args.personId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(priorityReviews)
      .set({ decision: args.decision, note: args.note ?? null, role: args.role })
      .where(eq(priorityReviews.id, existing[0].id));
  } else {
    await db.insert(priorityReviews).values({
      priorityId: args.priorityId,
      personId: args.personId,
      role: args.role,
      decision: args.decision,
      note: args.note ?? null,
    });
  }

  if (args.decision === "revise") {
    await db
      .update(priorities)
      .set({ status: "revised" })
      .where(eq(priorities.id, args.priorityId));
    await db.insert(timelineEvents).values({
      workspaceId: args.workspaceId,
      personId: args.personId,
      kind: "priority_revised",
      visibility: "workspace",
      payload: { priorityId: args.priorityId },
    });
    return { status: "revised", activated: false };
  }

  const reviews = await db
    .select()
    .from(priorityReviews)
    .where(eq(priorityReviews.priorityId, args.priorityId));

  const athleteReview = reviews.find((r) => r.role === "athlete");
  const coachReview = reviews.find((r) => r.role === "coach");

  // Strict pilot rule: both must approve (delegate does not activate).
  const bothApprove =
    athleteReview?.decision === "approve" && coachReview?.decision === "approve";

  let nextStatus:
    | "proposed"
    | "athlete_reviewed"
    | "coach_reviewed"
    | "active"
    | "revised"
    | "completed"
    | "replaced"
    | "archived" = priority.status;

  if (athleteReview && !coachReview) nextStatus = "athlete_reviewed";
  else if (coachReview && !athleteReview) nextStatus = "coach_reviewed";
  else if (bothApprove) nextStatus = "active";
  else if (athleteReview && coachReview) nextStatus = "athlete_reviewed";

  if (nextStatus === "active") {
    await db
      .update(priorities)
      .set({ status: "archived", archivedAt: new Date() })
      .where(
        and(
          eq(priorities.workspaceId, args.workspaceId),
          eq(priorities.status, "active"),
        ),
      );
  }

  await db
    .update(priorities)
    .set({ status: nextStatus })
    .where(eq(priorities.id, args.priorityId));

  if (nextStatus === "active") {
    await db.insert(timelineEvents).values({
      workspaceId: args.workspaceId,
      personId: args.personId,
      kind: "priority_activated",
      visibility: "workspace",
      payload: { priorityId: args.priorityId },
    });
  }

  return { status: nextStatus, activated: nextStatus === "active" };
}

export async function getSharedPrioritySnapshot(workspaceId: string) {
  const db = getDb();
  const [priority] = await db
    .select()
    .from(priorities)
    .where(eq(priorities.workspaceId, workspaceId))
    .orderBy(desc(priorities.createdAt))
    .limit(1);

  if (!priority || priority.visibility !== "workspace") return null;

  const focuses = await db
    .select()
    .from(focusAreas)
    .where(eq(focusAreas.priorityId, priority.id));
  const reviews = await db
    .select()
    .from(priorityReviews)
    .where(eq(priorityReviews.priorityId, priority.id));
  const evidence = await db
    .select()
    .from(priorityEvidence)
    .where(eq(priorityEvidence.priorityId, priority.id));

  const [pattern] = await db
    .select()
    .from(patterns)
    .where(
      and(eq(patterns.workspaceId, workspaceId), eq(patterns.visibility, "workspace")),
    )
    .orderBy(desc(patterns.updatedAt))
    .limit(1);

  return {
    priority,
    focusAreas: focuses.sort((a, b) => a.position - b.position),
    reviews,
    evidence,
    pattern,
  };
}
