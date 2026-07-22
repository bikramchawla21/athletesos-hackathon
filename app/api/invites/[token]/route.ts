import { NextResponse } from "next/server";
import { authzErrorResponse } from "@/server/authz/http";
import { requireAuthenticatedPerson } from "@/server/authz";
import { getInvitationByRawToken } from "@/server/services/invite-service";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Ctx) {
  try {
    await requireAuthenticatedPerson();
    const { token } = await context.params;
    const invitation = await getInvitationByRawToken(token);
    if (!invitation) {
      return NextResponse.json({ error: "Invalid invitation.", code: "INVALID_TOKEN" }, { status: 404 });
    }
    return NextResponse.json({
      invitation: {
        id: invitation.id,
        invitedEmail: invitation.invitedEmail,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
        workspaceId: invitation.workspaceId,
      },
    });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    console.error(error);
    return NextResponse.json({ error: "Failed to load invitation.", code: "unknown" }, { status: 500 });
  }
}
