import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { requireWorkspaceMembership } from "@/server/authz";
import { assertCanPerform } from "@/server/authz/permissions";
import { submitPatternFeedback } from "@/server/services/perspective-service";

type Ctx = { params: Promise<{ patternId: string }> };

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  response: z.enum(["agree", "partially_agree", "disagree", "needs_more_context"]),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request: Request, context: Ctx) {
  try {
    const { patternId } = await context.params;
    const body = bodySchema.parse(await request.json());
    const access = await requireWorkspaceMembership(body.workspaceId);
    assertCanPerform(access, "pattern_feedback");
    await submitPatternFeedback({
      patternId,
      workspaceId: body.workspaceId,
      personId: access.person.id,
      role: access.membership.role,
      response: body.response,
      note: body.note ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid feedback.", code: "validation" }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Feedback failed.",
        code: "PATTERN_FEEDBACK_FAILED",
      },
      { status: 400 },
    );
  }
}
