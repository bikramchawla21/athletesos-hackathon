import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import {
  athleteWorkspaces,
  people,
  workspaceMemberships,
  type AthleteWorkspace,
  type Person,
  type WorkspaceMembership,
} from "@/db/schema";
import { AUTHZ_CODES, AuthzError } from "./errors";

export type AuthenticatedPerson = {
  clerkUserId: string;
  person: Person;
};

export type WorkspaceAccess = AuthenticatedPerson & {
  workspace: AthleteWorkspace;
  membership: WorkspaceMembership;
};

/**
 * Resolve Clerk identity to an AthleteOS Person (upsert by clerkUserId).
 * Never trusts client-supplied person IDs.
 */
export async function requireAuthenticatedPerson(): Promise<AuthenticatedPerson> {
  if (!isDatabaseConfigured()) {
    throw new AuthzError(
      "Database is not configured.",
      AUTHZ_CODES.DATABASE_UNAVAILABLE,
      503,
    );
  }

  const session = await auth();
  const clerkUserId = session.userId;
  if (!clerkUserId) {
    throw new AuthzError("Sign in required.", AUTHZ_CODES.UNAUTHENTICATED, 401);
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(people)
    .where(eq(people.clerkUserId, clerkUserId))
    .limit(1);

  if (existing[0]) {
    return { clerkUserId, person: existing[0] };
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.username ||
    email ||
    null;

  try {
    const inserted = await db
      .insert(people)
      .values({
        clerkUserId,
        email,
        displayName,
      })
      .returning();

    const person = inserted[0];
    if (!person) {
      throw new AuthzError(
        "Could not sync identity.",
        AUTHZ_CODES.PERSON_SYNC_FAILED,
        500,
      );
    }
    return { clerkUserId, person };
  } catch (error) {
    // Race: another request may have inserted the same clerk user.
    const raced = await db
      .select()
      .from(people)
      .where(eq(people.clerkUserId, clerkUserId))
      .limit(1);
    if (raced[0]) {
      return { clerkUserId, person: raced[0] };
    }
    console.error("Person sync failed", error);
    throw new AuthzError(
      "Could not sync identity.",
      AUTHZ_CODES.PERSON_SYNC_FAILED,
      500,
    );
  }
}

/**
 * Verify the authenticated person has an active membership on the workspace.
 * Does not trust client-supplied roles.
 */
export async function requireWorkspaceMembership(
  workspaceId: string,
): Promise<WorkspaceAccess> {
  const identity = await requireAuthenticatedPerson();
  const db = getDb();

  const rows = await db
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
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.personId, identity.person.id),
        eq(workspaceMemberships.status, "active"),
        eq(athleteWorkspaces.status, "active"),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AuthzError(
      "You do not have access to this workspace.",
      AUTHZ_CODES.FORBIDDEN_WORKSPACE,
      403,
    );
  }

  return {
    ...identity,
    workspace: row.workspace,
    membership: row.membership,
  };
}

export async function requireWorkspaceRole(
  workspaceId: string,
  roles: Array<"athlete" | "coach">,
): Promise<WorkspaceAccess> {
  const access = await requireWorkspaceMembership(workspaceId);
  if (!roles.includes(access.membership.role)) {
    throw new AuthzError(
      "Insufficient workspace role.",
      AUTHZ_CODES.FORBIDDEN_ROLE,
      403,
    );
  }
  return access;
}

export function assertEntityWorkspace(
  entityWorkspaceId: string,
  workspaceId: string,
): void {
  if (entityWorkspaceId !== workspaceId) {
    throw new AuthzError(
      "Entity does not belong to this workspace.",
      AUTHZ_CODES.FORBIDDEN_WORKSPACE,
      403,
    );
  }
}

export function canReadEntity(access: WorkspaceAccess, entityWorkspaceId: string): boolean {
  return (
    access.membership.status === "active" &&
    access.workspace.status === "active" &&
    entityWorkspaceId === access.workspace.id
  );
}

export function canWriteEntity(access: WorkspaceAccess, entityWorkspaceId: string): boolean {
  return canReadEntity(access, entityWorkspaceId);
}
