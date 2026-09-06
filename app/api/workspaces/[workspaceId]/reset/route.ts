import { NextResponse } from "next/server";
import { isWorkspaceResetAllowed } from "@/lib/env-safety";
import { logOps, logOpsError } from "@/lib/ops-log.mjs";
import { authzErrorResponse } from "@/server/authz/http";
import { requireWorkspaceRole } from "@/server/authz";
import { isPilotMarkedWorkspace } from "@/server/services/pilot-events-service";
import { resetAthleteWorkspace } from "@/server/services/workspace-reset-service";

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceId } = await context.params;
    const access = await requireWorkspaceRole(workspaceId, ["athlete"]);

    const pilotMarked = await isPilotMarkedWorkspace(workspaceId);
    if (pilotMarked && !isWorkspaceResetAllowed()) {
      logOps("/api/workspaces/:id/reset", {
        status: 403,
        code: "PILOT_RESET_BLOCKED",
        workspaceId,
      });
      return NextResponse.json(
        {
          error:
            "Pilot workspace reset is blocked in production. Prefer a new conversation.",
          code: "PILOT_RESET_BLOCKED",
        },
        { status: 403 },
      );
    }

    if (!isWorkspaceResetAllowed() && !pilotMarked) {
      // Extra belt: production always requires explicit allow for hard wipe.
      logOps("/api/workspaces/:id/reset", {
        status: 403,
        code: "RESET_DISABLED",
        workspaceId,
      });
      return NextResponse.json(
        {
          error: "Workspace hard-reset is disabled in this environment.",
          code: "RESET_DISABLED",
        },
        { status: 403 },
      );
    }

    await resetAthleteWorkspace({
      workspaceId,
      personId: access.person.id,
    });
    logOps("/api/workspaces/:id/reset", { status: 200, workspaceId, pilotMarked });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    logOpsError("/api/workspaces/:id/reset", error);
    return NextResponse.json(
      { error: "Workspace reset failed.", code: "unknown" },
      { status: 500 },
    );
  }
}
