import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { requireWorkspaceMembership } from "@/server/authz";
import { assertCanPerform } from "@/server/authz/permissions";
import {
  getSharedPrioritySnapshot,
  proposeSharedPriority,
  reviewSharedPriority,
} from "@/server/services/priority-review-service";

type Ctx = { params: Promise<{ workspaceId: string }> };

const proposeSchema = z.object({
  statement: z.string().trim().min(1).max(500),
  whyNow: z.string().trim().max(500).nullable().optional(),
  athleteFocus: z.string().trim().max(300).nullable().optional(),
  coachFocus: z.string().trim().max(300).nullable().optional(),
  reviewCondition: z.string().trim().max(300).nullable().optional(),
  patternId: z.string().uuid().nullable().optional(),
});

const reviewSchema = z.object({
  priorityId: z.string().uuid(),
  decision: z.enum(["approve", "revise", "delegate"]),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function GET(_request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    await requireWorkspaceMembership(workspaceId);
    const snapshot = await getSharedPrioritySnapshot(workspaceId);
    return NextResponse.json({ snapshot });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    console.error(error);
    return NextResponse.json({ error: "Failed to load priority.", code: "unknown" }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const access = await requireWorkspaceMembership(workspaceId);
    const json = await request.json();

    if (json?.action === "review") {
      assertCanPerform(access, "review_shared_priority");
      const body = reviewSchema.parse(json);
      const result = await reviewSharedPriority({
        workspaceId,
        priorityId: body.priorityId,
        personId: access.person.id,
        role: access.membership.role,
        decision: body.decision,
        note: body.note ?? null,
      });
      return NextResponse.json(result);
    }

    assertCanPerform(access, "propose_shared_priority");
    const body = proposeSchema.parse(json);
    const result = await proposeSharedPriority({
      workspaceId,
      proposedByPersonId: access.person.id,
      statement: body.statement,
      whyNow: body.whyNow ?? null,
      athleteFocus: body.athleteFocus ?? null,
      coachFocus: body.coachFocus ?? null,
      reviewCondition: body.reviewCondition ?? null,
      patternId: body.patternId ?? null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid priority request.", code: "validation" }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Priority action failed.",
        code: "SHARED_PRIORITY_FAILED",
      },
      { status: 400 },
    );
  }
}
