import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  ERROR_CODES,
  formatZodIssues,
  logValidationFailure,
  validationErrorBody,
} from "@/lib/api-errors.mjs";
import { generateMemoryUpdate } from "@/lib/memory.mjs";
import { parseMemoryRequest } from "@/lib/request-contract.mjs";
import { authzErrorResponse } from "@/server/authz/http";
import { assertEntityWorkspace, requireWorkspaceMembership } from "@/server/authz";
import { assertCanPerform } from "@/server/authz/permissions";
import { getConversationForWorkspace } from "@/server/services/conversation-service";
import {
  buildMemoryExtractionContext,
  recordModelOperation,
} from "@/server/services/context-builders";
import {
  buildMessageIdLookup,
  loadAthleteMemory,
  persistAthleteMemory,
} from "@/server/services/memory-service";

const workspaceMemorySchema = z.object({
  workspaceId: z.string().uuid(),
  conversationId: z.string().uuid(),
  reason: z.enum(["checkpoint", "pre_insights", "correction", "session_complete"]),
  report: z.unknown().nullable().optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();

    if (
      json &&
      typeof json === "object" &&
      !Array.isArray(json) &&
      "workspaceId" in json &&
      (json as { workspaceId?: unknown }).workspaceId
    ) {
      return handleWorkspaceMemory(json);
    }

    const body = parseMemoryRequest(json);
    const result = await generateMemoryUpdate({
      memory: body.memory,
      messages: body.messages,
      report: body.report ?? null,
      reason: body.reason,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof ZodError || error instanceof SyntaxError) {
      const issues = error instanceof ZodError ? formatZodIssues(error) : [];
      logValidationFailure("/api/memory", "request_validation", issues, json);
      return NextResponse.json(
        validationErrorBody({
          code: ERROR_CODES.INVALID_MEMORY_REQUEST,
          message: "The memory request did not match the expected schema.",
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
    console.error(error);
    return NextResponse.json(
      {
        error: "Unexpected memory error.",
        message: "Unexpected memory error.",
        code: ERROR_CODES.UNKNOWN,
      },
      { status: 500 },
    );
  }
}

async function handleWorkspaceMemory(json: unknown) {
  const body = workspaceMemorySchema.parse(json);
  const access = await requireWorkspaceMembership(body.workspaceId);
  assertCanPerform(access, "athlete_discovery_chat");
  const conversation = await getConversationForWorkspace(
    body.conversationId,
    body.workspaceId,
  );
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }
  assertEntityWorkspace(conversation.workspaceId, body.workspaceId);

  const ctx = await buildMemoryExtractionContext(body.workspaceId, body.conversationId);
  await recordModelOperation({
    workspaceId: body.workspaceId,
    personId: access.person.id,
    kind: "memory",
    conversationId: body.conversationId,
    entityIds: ctx.entityIds,
    status: "started",
  });

  const result = await generateMemoryUpdate({
    memory: ctx.memory,
    messages: ctx.messages,
    report: (body.report as never) ?? null,
    reason: body.reason,
  });

  if (result.status >= 400 || !result.body?.memory) {
    await recordModelOperation({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      kind: "memory",
      conversationId: body.conversationId,
      entityIds: ctx.entityIds,
      status: "failed",
      errorCode: result.body?.code ?? ERROR_CODES.MEMORY_MERGE_FAILED,
      demoMode: Boolean(result.body?.demoMode),
    });
    return NextResponse.json(result.body, { status: result.status });
  }

  const lookup = await buildMessageIdLookup(body.conversationId);
  await persistAthleteMemory(body.workspaceId, result.body.memory, lookup);
  const persisted = await loadAthleteMemory(body.workspaceId);

  await recordModelOperation({
    workspaceId: body.workspaceId,
    personId: access.person.id,
    kind: "memory",
    conversationId: body.conversationId,
    entityIds: ctx.entityIds,
    status: "succeeded",
    demoMode: Boolean(result.body.demoMode),
  });

  return NextResponse.json({
    memory: persisted,
    demoMode: Boolean(result.body.demoMode),
  });
}
