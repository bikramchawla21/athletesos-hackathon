import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  observations,
  patterns,
  patternFeedback,
  perspectiveComparisons,
  timelineEvents,
  workspaceMemberships,
} from "@/db/schema";
import { createNotification } from "./notification-service";

export type PerspectiveComparison = {
  alignedSignals: {
    statement: string;
    athleteEvidenceIds: string[];
    coachEvidenceIds: string[];
  }[];
  differingPerspectives: {
    topic: string;
    athletePerspective: string;
    coachPerspective: string;
    evidenceIds: string[];
    openQuestion: string;
  }[];
  newPatternCandidates: {
    statement: string;
    explanation: string;
    evidenceIds: string[];
  }[];
};

/**
 * Deterministic multi-source comparison from attributed observations.
 * Does not label either party as wrong.
 */
export async function buildPerspectiveComparison(
  workspaceId: string,
): Promise<PerspectiveComparison & { id: string }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(observations)
    .where(
      and(
        eq(observations.workspaceId, workspaceId),
        eq(observations.status, "active"),
        eq(observations.visibility, "workspace"),
      ),
    )
    .orderBy(desc(observations.createdAt))
    .limit(40);

  const athleteObs = rows.filter((o) => o.authorRole === "athlete");
  const coachObs = rows.filter((o) => o.authorRole === "coach");

  const alignedSignals: PerspectiveComparison["alignedSignals"] = [];
  const differingPerspectives: PerspectiveComparison["differingPerspectives"] = [];
  const usedCoach = new Set<string>();

  for (const a of athleteObs.slice(0, 12)) {
    const aTokens = significantTokens(a.statement);
    let best: { coach: (typeof coachObs)[0]; score: number } | null = null;
    for (const c of coachObs) {
      if (usedCoach.has(c.id)) continue;
      const score = overlapScore(aTokens, significantTokens(c.statement));
      if (score >= 2 && (!best || score > best.score)) {
        best = { coach: c, score };
      }
    }
    if (best && best.score >= 3) {
      usedCoach.add(best.coach.id);
      alignedSignals.push({
        statement: `Both note something similar around: ${shortTopic(a.statement)}`,
        athleteEvidenceIds: [a.id],
        coachEvidenceIds: [best.coach.id],
      });
    } else if (best && best.score === 2) {
      usedCoach.add(best.coach.id);
      differingPerspectives.push({
        topic: shortTopic(a.statement),
        athletePerspective: a.statement,
        coachPerspective: best.coach.statement,
        evidenceIds: [a.id, best.coach.id],
        openQuestion: "What would help reconcile these two views?",
      });
    }
  }

  for (const c of coachObs.slice(0, 8)) {
    if (usedCoach.has(c.id)) continue;
    if (athleteObs.length === 0) {
      differingPerspectives.push({
        topic: shortTopic(c.statement),
        athletePerspective: "Not yet reported by the athlete in shared evidence.",
        coachPerspective: c.statement,
        evidenceIds: [c.id],
        openQuestion: "Has the athlete described this from their side?",
      });
    }
  }

  const newPatternCandidates: PerspectiveComparison["newPatternCandidates"] = [];
  if (alignedSignals[0]) {
    newPatternCandidates.push({
      statement: alignedSignals[0].statement,
      explanation:
        "Candidate only — needs human review before treating as a confirmed pattern.",
      evidenceIds: [
        ...alignedSignals[0].athleteEvidenceIds,
        ...alignedSignals[0].coachEvidenceIds,
      ],
    });
  }

  const result: PerspectiveComparison = {
    alignedSignals: alignedSignals.slice(0, 5),
    differingPerspectives: differingPerspectives.slice(0, 5),
    newPatternCandidates: newPatternCandidates.slice(0, 3),
  };

  const [saved] = await db
    .insert(perspectiveComparisons)
    .values({
      workspaceId,
      alignedSignals: result.alignedSignals,
      differingPerspectives: result.differingPerspectives,
      newPatternCandidates: result.newPatternCandidates,
    })
    .returning();

  await db.insert(timelineEvents).values({
    workspaceId,
    kind: "shared_pattern_proposed",
    visibility: "workspace",
    payload: { perspectiveComparisonId: saved?.id },
  });

  return { id: saved!.id, ...result };
}

export async function submitPatternFeedback(args: {
  patternId: string;
  workspaceId: string;
  personId: string;
  role: "athlete" | "coach";
  response: "agree" | "partially_agree" | "disagree" | "needs_more_context";
  note?: string | null;
}): Promise<void> {
  const db = getDb();
  const [pattern] = await db
    .select()
    .from(patterns)
    .where(
      and(eq(patterns.id, args.patternId), eq(patterns.workspaceId, args.workspaceId)),
    )
    .limit(1);
  if (!pattern) throw new Error("Pattern not found.");

  const existing = await db
    .select()
    .from(patternFeedback)
    .where(
      and(
        eq(patternFeedback.patternId, args.patternId),
        eq(patternFeedback.personId, args.personId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(patternFeedback)
      .set({
        response: args.response,
        note: args.note ?? null,
        role: args.role,
      })
      .where(eq(patternFeedback.id, existing[0].id));
  } else {
    await db.insert(patternFeedback).values({
      patternId: args.patternId,
      personId: args.personId,
      role: args.role,
      response: args.response,
      note: args.note ?? null,
    });
  }

  await db.insert(timelineEvents).values({
    workspaceId: args.workspaceId,
    personId: args.personId,
    kind: "pattern_feedback_submitted",
    visibility: "workspace",
    payload: { patternId: args.patternId, response: args.response, role: args.role },
  });

  await refreshPatternStatus(args.patternId, args.workspaceId);

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
    if (m.personId === args.personId) continue;
    await createNotification({
      recipientPersonId: m.personId,
      workspaceId: args.workspaceId,
      kind: "pattern_ready_for_review",
      payload: { patternId: args.patternId },
    });
  }
}

async function refreshPatternStatus(patternId: string, workspaceId: string) {
  const db = getDb();
  const feedback = await db
    .select()
    .from(patternFeedback)
    .where(eq(patternFeedback.patternId, patternId));

  const athlete = feedback.find((f) => f.role === "athlete");
  const coach = feedback.find((f) => f.role === "coach");

  let status: "emerging" | "supported" | "proposed" | "confirmed" | "revised" | "rejected" =
    "proposed";

  if (athlete?.response === "disagree" || coach?.response === "disagree") {
    status = "revised";
  } else if (
    athlete?.response === "agree" &&
    coach?.response === "agree"
  ) {
    status = "confirmed";
  } else if (athlete || coach) {
    status = "supported";
  }

  await db
    .update(patterns)
    .set({ status, updatedAt: new Date(), visibility: "workspace" })
    .where(and(eq(patterns.id, patternId), eq(patterns.workspaceId, workspaceId)));
}

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 4)
    .slice(0, 24);
}

function overlapScore(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((t) => setB.has(t)).length;
}

function shortTopic(statement: string): string {
  const trimmed = statement.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
}
