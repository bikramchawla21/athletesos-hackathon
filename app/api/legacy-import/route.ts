import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { requireWorkspaceMembership } from "@/server/authz";
import { assertCanPerform } from "@/server/authz/permissions";
import { importLegacyState } from "@/server/services/legacy-import-service";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  payload: z.unknown(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = bodySchema.parse(json);
    const access = await requireWorkspaceMembership(body.workspaceId);
    assertCanPerform(access, "legacy_import");
    const result = await importLegacyState({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      payload: body.payload,
    });
    return NextResponse.json(result);
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid legacy import request.", code: "validation" },
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json(
      {
        error: "Legacy import failed.",
        message: error instanceof Error ? error.message : "Legacy import failed.",
        code: "LEGACY_IMPORT_FAILED",
      },
      { status: 400 },
    );
  }
}
