import { NextResponse } from "next/server";
import { authzErrorResponse } from "@/server/authz/http";
import { requireWorkspaceRole } from "@/server/authz";
import { resetAthleteWorkspace } from "@/server/services/workspace-reset-service";

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceId } = await context.params;
    const access = await requireWorkspaceRole(workspaceId, ["athlete"]);
    await resetAthleteWorkspace({
      workspaceId,
      personId: access.person.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    console.error(error);
    return NextResponse.json(
      { error: "Workspace reset failed.", code: "unknown" },
      { status: 500 },
    );
  }
}
