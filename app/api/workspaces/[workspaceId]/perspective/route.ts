import { NextResponse } from "next/server";
import { authzErrorResponse } from "@/server/authz/http";
import { requireWorkspaceMembership } from "@/server/authz";
import { assertCanPerform } from "@/server/authz/permissions";
import { buildPerspectiveComparison } from "@/server/services/perspective-service";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const access = await requireWorkspaceMembership(workspaceId);
    assertCanPerform(access, "propose_shared_priority");
    const comparison = await buildPerspectiveComparison(workspaceId);
    return NextResponse.json({ comparison });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    console.error(error);
    return NextResponse.json({ error: "Perspective comparison failed.", code: "unknown" }, { status: 500 });
  }
}
