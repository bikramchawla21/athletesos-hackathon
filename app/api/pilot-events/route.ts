import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { ERROR_CODES, formatZodIssues, validationErrorBody } from "@/lib/api-errors.mjs";
import { PILOT_EVENT_NAMES } from "@/lib/pilot-events";
import { logOps, logOpsError } from "@/lib/ops-log.mjs";
import { authzErrorResponse } from "@/server/authz/http";
import { requireWorkspaceMembership } from "@/server/authz";
import { insertPilotEvent } from "@/server/services/pilot-events-service";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  name: z.enum(PILOT_EVENT_NAMES as unknown as [string, ...string[]]),
  props: z.record(z.unknown()).optional(),
  clientSessionId: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  const started = Date.now();
  let json: unknown;
  try {
    json = await request.json();
    const body = bodySchema.parse(json);
    const access = await requireWorkspaceMembership(body.workspaceId);

    const inserted = await insertPilotEvent({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      conversationId: body.conversationId,
      name: body.name,
      props: body.props,
      clientSessionId: body.clientSessionId,
    });

    if (!inserted) {
      return NextResponse.json(
        { error: "Invalid pilot event.", code: "INVALID_PILOT_EVENT" },
        { status: 400 },
      );
    }

    logOps("/api/pilot-events", {
      status: 200,
      name: inserted.name,
      workspaceId: body.workspaceId,
      latencyMs: Date.now() - started,
    });

    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof ZodError || error instanceof SyntaxError) {
      const issues = error instanceof ZodError ? formatZodIssues(error) : [];
      return NextResponse.json(
        validationErrorBody({
          code: ERROR_CODES.UNKNOWN,
          message: "Invalid pilot event payload.",
          issues,
          keys:
            json && typeof json === "object" && !Array.isArray(json)
              ? Object.keys(json as object)
              : [],
          phase: "request_validation",
        }),
        { status: 400 },
      );
    }
    logOpsError("/api/pilot-events", error, { latencyMs: Date.now() - started });
    return NextResponse.json(
      { error: "Could not record pilot event.", code: ERROR_CODES.UNKNOWN },
      { status: 500 },
    );
  }
}
