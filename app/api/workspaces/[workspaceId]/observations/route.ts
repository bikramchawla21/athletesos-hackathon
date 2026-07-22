import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { requireWorkspaceMembership, requireWorkspaceRole } from "@/server/authz";
import { assertCanPerform } from "@/server/authz/permissions";
import {
  createObservation,
  listObservationsForViewer,
} from "@/server/services/observation-service";

type Ctx = { params: Promise<{ workspaceId: string }> };

const createSchema = z.object({
  statement: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(1).max(80).default("general"),
  context: z
    .enum(["training", "match", "competition", "conversation", "other"])
    .default("other"),
  visibility: z.enum(["workspace", "coach_private"]),
  occurredAt: z.string().datetime().nullable().optional(),
  sourceType: z.enum(["coach_manual", "coach_onboarding"]).default("coach_manual"),
});

export async function GET(_request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const access = await requireWorkspaceMembership(workspaceId);
    const rows = await listObservationsForViewer({
      workspaceId,
      role: access.membership.role,
      personId: access.person.id,
    });
    return NextResponse.json({
      observations: rows.map((o) => ({
        id: o.id,
        statement: o.statement,
        category: o.category,
        context: o.context,
        visibility: o.visibility,
        authorRole: o.authorRole,
        authorPersonId: o.authorPersonId,
        sourceType: o.sourceType,
        occurredAt: o.occurredAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    console.error(error);
    return NextResponse.json({ error: "Failed to list observations.", code: "unknown" }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const access = await requireWorkspaceRole(workspaceId, ["coach"]);
    assertCanPerform(access, "add_coach_observation");
    const body = createSchema.parse(await request.json());
    const row = await createObservation({
      workspaceId,
      authorPersonId: access.person.id,
      authorRole: "coach",
      statement: body.statement,
      category: body.category,
      context: body.context,
      visibility: body.visibility,
      sourceType: body.sourceType,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : null,
    });
    return NextResponse.json(
      {
        observation: {
          id: row.id,
          statement: row.statement,
          visibility: row.visibility,
          authorRole: row.authorRole,
          category: row.category,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid observation.", code: "validation" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create observation.", code: "unknown" }, { status: 500 });
  }
}
