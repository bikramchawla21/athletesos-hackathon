import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  observations,
  patterns,
  patternEvidence,
  timelineEvents,
  workspaceMemberships,
  type DbObservation,
} from "@/db/schema";
import { canViewVisibility, type VisibilityLevel } from "@/server/authz/permissions";
import { createNotification } from "./notification-service";

export async function createObservation(args: {
  workspaceId: string;
  authorPersonId: string;
  authorRole: "athlete" | "coach";
  statement: string;
  category: string;
  context: "training" | "match" | "competition" | "conversation" | "other";
  visibility: VisibilityLevel;
  sourceType: "coach_onboarding" | "coach_manual" | "athlete_discovery" | "system";
  conversationId?: string | null;
  sourceMessageId?: string | null;
  occurredAt?: Date | null;
}): Promise<DbObservation> {
  const db = getDb();
  const [row] = await db
    .insert(observations)
    .values({
      workspaceId: args.workspaceId,
      authorPersonId: args.authorPersonId,
      authorRole: args.authorRole,
      statement: args.statement.trim(),
      category: args.category.trim() || "general",
      context: args.context,
      visibility: args.visibility,
      sourceType: args.sourceType,
      conversationId: args.conversationId ?? null,
      sourceMessageId: args.sourceMessageId ?? null,
      occurredAt: args.occurredAt ?? null,
      confidence: "tentative",
      status: "active",
    })
    .returning();

  if (!row) throw new Error("Failed to create observation.");

  await db.insert(timelineEvents).values({
    workspaceId: args.workspaceId,
    personId: args.authorPersonId,
    kind: "coach_observation_added",
    visibility: args.visibility === "coach_private" ? "coach_private" : "workspace",
    payload: {
      observationId: row.id,
      visibility: args.visibility,
      sourceType: args.sourceType,
    },
  });

  if (args.visibility === "workspace" && args.authorRole === "coach") {
    const athletes = await db
      .select()
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, args.workspaceId),
          eq(workspaceMemberships.role, "athlete"),
          eq(workspaceMemberships.status, "active"),
        ),
      );
    for (const athlete of athletes) {
      await createNotification({
        recipientPersonId: athlete.personId,
        workspaceId: args.workspaceId,
        kind: "shared_coach_observation",
        payload: { observationId: row.id },
      });
    }
  }

  await evaluateObservationAgainstPatterns(row);
  return row;
}

/**
 * Link observation as supporting/contradicting evidence when it relates to an
 * existing pattern. Never promotes a strong/confirmed pattern from one observation.
 */
export async function evaluateObservationAgainstPatterns(
  observation: DbObservation,
): Promise<{ relation: "support" | "context" | "none"; patternId?: string }> {
  const db = getDb();
  const activePatterns = await db
    .select()
    .from(patterns)
    .where(
      and(
        eq(patterns.workspaceId, observation.workspaceId),
        inArray(patterns.status, ["emerging", "supported", "proposed"]),
        eq(patterns.visibility, "workspace"),
      ),
    )
    .orderBy(desc(patterns.updatedAt))
    .limit(5);

  if (activePatterns.length === 0) return { relation: "none" };

  const obsText = observation.statement.toLowerCase();
  let best: { patternId: string; score: number } | null = null;
  for (const pattern of activePatterns) {
    const tokens = pattern.statement
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 4);
    const hits = tokens.filter((t) => obsText.includes(t)).length;
    if (hits >= 2 && (!best || hits > best.score)) {
      best = { patternId: pattern.id, score: hits };
    }
  }

  if (!best) return { relation: "none" };

  await db.insert(patternEvidence).values({
    patternId: best.patternId,
    sourceType: "observation",
    sourceId: observation.id,
    note:
      best.score >= 4
        ? "Supports existing pattern (tentative)"
        : "Adds context to existing pattern",
  });

  // Keep status emerging/supported — never jump to confirmed from one obs.
  return {
    relation: best.score >= 4 ? "support" : "context",
    patternId: best.patternId,
  };
}

export async function listObservationsForViewer(args: {
  workspaceId: string;
  role: "athlete" | "coach";
  personId: string;
}): Promise<DbObservation[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(observations)
    .where(
      and(
        eq(observations.workspaceId, args.workspaceId),
        eq(observations.status, "active"),
      ),
    )
    .orderBy(desc(observations.createdAt));

  return rows.filter((row) =>
    canViewVisibility({
      role: args.role,
      personId: args.personId,
      visibility: row.visibility,
      authorPersonId: row.authorPersonId,
    }),
  );
}
