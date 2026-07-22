import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { requireWorkspaceRole } from "@/server/authz";
import { assertCanPerform } from "@/server/authz/permissions";
import {
  createCoachInvitation,
  listActiveCoaches,
  listInvitations,
  removeCoach,
  revokeInvitation,
} from "@/server/services/invite-service";

type Ctx = { params: Promise<{ workspaceId: string }> };

const inviteSchema = z.object({
  email: z.string().email().max(320),
});

const revokeSchema = z.object({
  invitationId: z.string().uuid(),
});

const removeSchema = z.object({
  coachPersonId: z.string().uuid(),
});

export async function GET(_request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const access = await requireWorkspaceRole(workspaceId, ["athlete"]);
    assertCanPerform(access, "invite_coach");
    const [invitations, coaches] = await Promise.all([
      listInvitations(workspaceId),
      listActiveCoaches(workspaceId),
    ]);
    return NextResponse.json({
      invitations: invitations.map((i) => ({
        id: i.id,
        invitedEmail: i.invitedEmail,
        status: i.status,
        expiresAt: i.expiresAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
        acceptedAt: i.acceptedAt?.toISOString() ?? null,
      })),
      coaches: coaches.map((c) => ({
        personId: c.personId,
        membershipId: c.id,
        status: c.status,
      })),
    });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    console.error(error);
    return NextResponse.json({ error: "Failed to list invites.", code: "unknown" }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const access = await requireWorkspaceRole(workspaceId, ["athlete"]);
    assertCanPerform(access, "invite_coach");
    const body = inviteSchema.parse(await request.json());
    const { invitation, rawToken } = await createCoachInvitation({
      workspaceId,
      invitedByPersonId: access.person.id,
      invitedEmail: body.email,
    });

    const origin = new URL(request.url).origin;
    const inviteUrl = `${origin}/invite/${rawToken}`;

    return NextResponse.json(
      {
        invitation: {
          id: invitation.id,
          invitedEmail: invitation.invitedEmail,
          status: invitation.status,
          expiresAt: invitation.expiresAt.toISOString(),
        },
        inviteUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid invite request.", code: "validation" }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invite failed.",
        code: "INVITE_FAILED",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const access = await requireWorkspaceRole(workspaceId, ["athlete"]);
    const json = await request.json();
    if (json?.action === "revoke") {
      assertCanPerform(access, "revoke_invite");
      const body = revokeSchema.parse(json);
      await revokeInvitation({
        workspaceId,
        invitationId: body.invitationId,
        personId: access.person.id,
      });
      return NextResponse.json({ ok: true });
    }
    if (json?.action === "remove_coach") {
      assertCanPerform(access, "remove_coach");
      const body = removeSchema.parse(json);
      await removeCoach({
        workspaceId,
        coachPersonId: body.coachPersonId,
        removedByPersonId: access.person.id,
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action.", code: "validation" }, { status: 400 });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Update failed.",
        code: "INVITE_UPDATE_FAILED",
      },
      { status: 400 },
    );
  }
}
