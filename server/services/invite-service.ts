import { createHash, randomBytes } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  timelineEvents,
  workspaceInvitations,
  workspaceMemberships,
  type WorkspaceInvitation,
} from "@/db/schema";
import { createNotification } from "./notification-service";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createCoachInvitation(args: {
  workspaceId: string;
  invitedByPersonId: string;
  invitedEmail: string;
}): Promise<{ invitation: WorkspaceInvitation; rawToken: string }> {
  const db = getDb();
  const email = normalizeEmail(args.invitedEmail);
  if (!email.includes("@")) {
    throw new Error("Invalid email address.");
  }

  const existingCoach = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, args.workspaceId),
        eq(workspaceMemberships.role, "coach"),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(1);
  if (existingCoach[0]) {
    throw new Error("This workspace already has an active coach.");
  }

  const pending = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.workspaceId, args.workspaceId),
        eq(workspaceInvitations.status, "pending"),
      ),
    )
    .limit(1);
  if (pending[0]) {
    throw new Error("A pending coach invitation already exists. Revoke it first.");
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const [invitation] = await db
    .insert(workspaceInvitations)
    .values({
      workspaceId: args.workspaceId,
      invitedEmail: email,
      role: "coach",
      invitedByPersonId: args.invitedByPersonId,
      tokenHash,
      status: "pending",
      expiresAt,
    })
    .returning();

  if (!invitation) throw new Error("Failed to create invitation.");

  await db.insert(timelineEvents).values({
    workspaceId: args.workspaceId,
    personId: args.invitedByPersonId,
    kind: "coach_invited",
    visibility: "workspace",
    payload: { invitationId: invitation.id, invitedEmail: email },
  });

  return { invitation, rawToken };
}

export async function listInvitations(workspaceId: string) {
  const db = getDb();
  return db
    .select()
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.workspaceId, workspaceId))
    .orderBy(desc(workspaceInvitations.createdAt));
}

export async function revokeInvitation(args: {
  workspaceId: string;
  invitationId: string;
  personId: string;
}): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, args.invitationId),
        eq(workspaceInvitations.workspaceId, args.workspaceId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Invitation not found.");
  if (row.status !== "pending") throw new Error("Only pending invitations can be revoked.");

  await db
    .update(workspaceInvitations)
    .set({ status: "revoked" })
    .where(eq(workspaceInvitations.id, row.id));

  await db.insert(timelineEvents).values({
    workspaceId: args.workspaceId,
    personId: args.personId,
    kind: "coach_invite_revoked",
    visibility: "workspace",
    payload: { invitationId: row.id },
  });
}

export async function getInvitationByRawToken(
  rawToken: string,
): Promise<WorkspaceInvitation | null> {
  const db = getDb();
  const tokenHash = hashInviteToken(rawToken);
  const [row] = await db
    .select()
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

/**
 * Accept invitation idempotently. Reconciles invited email with authenticated person email.
 */
export async function acceptInvitation(args: {
  rawToken: string;
  personId: string;
  personEmail: string | null;
}): Promise<{
  workspaceId: string;
  membershipId: string;
  alreadyAccepted: boolean;
}> {
  const db = getDb();
  const invitation = await getInvitationByRawToken(args.rawToken);
  if (!invitation) {
    throw new Error("Invalid invitation token.");
  }

  if (invitation.status === "accepted") {
    const [membership] = await db
      .select()
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, invitation.workspaceId),
          eq(workspaceMemberships.personId, args.personId),
          eq(workspaceMemberships.role, "coach"),
        ),
      )
      .limit(1);
    if (membership && membership.status === "active") {
      return {
        workspaceId: invitation.workspaceId,
        membershipId: membership.id,
        alreadyAccepted: true,
      };
    }
  }

  if (invitation.status === "revoked") throw new Error("Invitation was revoked.");
  if (invitation.status === "expired" || invitation.expiresAt.getTime() < Date.now()) {
    if (invitation.status === "pending") {
      await db
        .update(workspaceInvitations)
        .set({ status: "expired" })
        .where(eq(workspaceInvitations.id, invitation.id));
    }
    throw new Error("Invitation has expired.");
  }
  if (invitation.status !== "pending") throw new Error("Invitation is not pending.");

  const personEmail = args.personEmail ? normalizeEmail(args.personEmail) : "";
  if (!personEmail || personEmail !== normalizeEmail(invitation.invitedEmail)) {
    throw new Error(
      "Signed-in email does not match the invitation. Sign in with the invited email.",
    );
  }

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, invitation.workspaceId),
          eq(workspaceMemberships.personId, args.personId),
        ),
      )
      .limit(1);

    let membershipId: string;
    if (existing[0]) {
      const [updated] = await tx
        .update(workspaceMemberships)
        .set({ status: "active", role: "coach" })
        .where(eq(workspaceMemberships.id, existing[0].id))
        .returning();
      membershipId = updated!.id;
    } else {
      const [created] = await tx
        .insert(workspaceMemberships)
        .values({
          workspaceId: invitation.workspaceId,
          personId: args.personId,
          role: "coach",
          status: "active",
        })
        .returning();
      membershipId = created!.id;
    }

    await tx
      .update(workspaceInvitations)
      .set({
        status: "accepted",
        acceptedByPersonId: args.personId,
        acceptedAt: new Date(),
      })
      .where(eq(workspaceInvitations.id, invitation.id));

    await tx.insert(timelineEvents).values({
      workspaceId: invitation.workspaceId,
      personId: args.personId,
      kind: "coach_joined",
      visibility: "workspace",
      payload: { invitationId: invitation.id, membershipId },
    });

    await createNotification({
      recipientPersonId: invitation.invitedByPersonId,
      workspaceId: invitation.workspaceId,
      kind: "coach_accepted",
      payload: { coachPersonId: args.personId },
      tx,
    });

    return {
      workspaceId: invitation.workspaceId,
      membershipId,
      alreadyAccepted: false,
    };
  });
}

export async function removeCoach(args: {
  workspaceId: string;
  coachPersonId: string;
  removedByPersonId: string;
}): Promise<void> {
  const db = getDb();
  const [membership] = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, args.workspaceId),
        eq(workspaceMemberships.personId, args.coachPersonId),
        eq(workspaceMemberships.role, "coach"),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(1);

  if (!membership) throw new Error("Active coach membership not found.");

  await db
    .update(workspaceMemberships)
    .set({ status: "revoked" })
    .where(eq(workspaceMemberships.id, membership.id));

  await db
    .update(workspaceInvitations)
    .set({ status: "revoked" })
    .where(
      and(
        eq(workspaceInvitations.workspaceId, args.workspaceId),
        inArray(workspaceInvitations.status, ["pending"]),
      ),
    );

  await db.insert(timelineEvents).values({
    workspaceId: args.workspaceId,
    personId: args.removedByPersonId,
    kind: "coach_removed",
    visibility: "workspace",
    payload: { coachPersonId: args.coachPersonId },
  });
}

export async function listActiveCoaches(workspaceId: string) {
  const db = getDb();
  return db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.role, "coach"),
        eq(workspaceMemberships.status, "active"),
      ),
    );
}
