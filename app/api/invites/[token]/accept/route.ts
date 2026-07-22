import { NextResponse } from "next/server";
import { authzErrorResponse } from "@/server/authz/http";
import { requireAuthenticatedPerson } from "@/server/authz";
import { acceptInvitation } from "@/server/services/invite-service";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { person } = await requireAuthenticatedPerson();
    const { token } = await context.params;
    const result = await acceptInvitation({
      rawToken: token,
      personId: person.id,
      personEmail: person.email,
    });
    return NextResponse.json(result);
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Accept failed.",
        code: "INVITE_ACCEPT_FAILED",
      },
      { status: 400 },
    );
  }
}
