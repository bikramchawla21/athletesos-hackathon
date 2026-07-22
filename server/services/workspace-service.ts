import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  athleteWorkspaces,
  timelineEvents,
  workspaceMemberships,
  type AthleteWorkspace,
} from "@/db/schema";
import type { Person } from "@/db/schema";
import { createEmptyAthleteMemory } from "@/lib/memory.mjs";

export type CreateWorkspaceInput = {
  person: Person;
  sport?: string | null;
  level?: string | null;
};

/**
 * Create athlete workspace + owner membership in one transaction.
 */
export async function createAthleteWorkspace(
  input: CreateWorkspaceInput,
): Promise<AthleteWorkspace> {
  const db = getDb();
  const empty = createEmptyAthleteMemory();

  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(athleteWorkspaces)
      .values({
        ownerPersonId: input.person.id,
        sport: input.sport?.trim() || null,
        level: input.level?.trim() || null,
        relationshipStage: "first_conversation",
        sessionCount: 0,
        understandingCoverage: empty.understandingCoverage,
        status: "active",
      })
      .returning();

    if (!workspace) {
      throw new Error("Failed to create workspace.");
    }

    await tx.insert(workspaceMemberships).values({
      workspaceId: workspace.id,
      personId: input.person.id,
      role: "athlete",
      status: "active",
    });

    await tx.insert(timelineEvents).values({
      workspaceId: workspace.id,
      personId: input.person.id,
      kind: "workspace_created",
      visibility: "workspace",
      payload: {},
    });

    return workspace;
  });
}

export async function listActiveWorkspacesForPerson(
  personId: string,
  role?: "athlete" | "coach",
): Promise<AthleteWorkspace[]> {
  const db = getDb();
  const rows = await db
    .select({ workspace: athleteWorkspaces, membership: workspaceMemberships })
    .from(workspaceMemberships)
    .innerJoin(
      athleteWorkspaces,
      eq(workspaceMemberships.workspaceId, athleteWorkspaces.id),
    )
    .where(
      and(
        eq(workspaceMemberships.personId, personId),
        eq(workspaceMemberships.status, "active"),
        eq(athleteWorkspaces.status, "active"),
        ...(role ? [eq(workspaceMemberships.role, role)] : []),
      ),
    )
    .orderBy(desc(athleteWorkspaces.updatedAt));

  return rows.map((r) => r.workspace);
}

/** Owned / athlete-role workspaces only — never treat coach membership as primary athlete home. */
export async function getPrimaryAthleteWorkspace(
  personId: string,
): Promise<AthleteWorkspace | null> {
  const workspaces = await listActiveWorkspacesForPerson(personId, "athlete");
  return workspaces[0] ?? null;
}

export async function getPrimaryCoachWorkspace(
  personId: string,
): Promise<AthleteWorkspace | null> {
  const workspaces = await listActiveWorkspacesForPerson(personId, "coach");
  return workspaces[0] ?? null;
}

export async function listMembershipsWithRoles(personId: string) {
  const db = getDb();
  return db
    .select({
      workspace: athleteWorkspaces,
      membership: workspaceMemberships,
    })
    .from(workspaceMemberships)
    .innerJoin(
      athleteWorkspaces,
      eq(workspaceMemberships.workspaceId, athleteWorkspaces.id),
    )
    .where(
      and(
        eq(workspaceMemberships.personId, personId),
        eq(workspaceMemberships.status, "active"),
        eq(athleteWorkspaces.status, "active"),
      ),
    )
    .orderBy(desc(athleteWorkspaces.updatedAt));
}

export async function updateWorkspaceProfile(
  workspaceId: string,
  patch: { sport?: string | null; level?: string | null },
): Promise<AthleteWorkspace> {
  const db = getDb();
  const [updated] = await db
    .update(athleteWorkspaces)
    .set({
      ...(patch.sport !== undefined ? { sport: patch.sport } : {}),
      ...(patch.level !== undefined ? { level: patch.level } : {}),
      updatedAt: new Date(),
    })
    .where(eq(athleteWorkspaces.id, workspaceId))
    .returning();

  if (!updated) {
    throw new Error("Workspace not found.");
  }
  return updated;
}
