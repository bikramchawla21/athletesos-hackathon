import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  ERROR_CODES,
  formatZodIssues,
  logValidationFailure,
  validationErrorBody,
} from "@/lib/api-errors.mjs";
import { generateChatReply, generateReopeningMessage } from "@/lib/chat.mjs";
import { parseChatRequest } from "@/lib/request-contract.mjs";
import { authzErrorResponse } from "@/server/authz/http";
import { assertEntityWorkspace, requireWorkspaceMembership } from "@/server/authz";
import { assertCanPerform } from "@/server/authz/permissions";
import {
  appendMessage,
  getConversationForWorkspace,
} from "@/server/services/conversation-service";
import {
  buildContinuationContext,
  buildDiscoveryContext,
  recordModelOperation,
} from "@/server/services/context-builders";

const workspaceChatSchema = z.object({
  workspaceId: z.string().uuid(),
  conversationId: z.string().uuid(),
  mode: z.enum(["chat", "reopen"]).optional().default("chat"),
  clientMessageId: z.string().min(1).max(120).optional(),
  content: z.string().min(1).max(8000).optional(),
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
      return handleWorkspaceChat(json);
    }

    const body = parseChatRequest(json);

    if (body.mode === "reopen") {
      const result = await generateReopeningMessage({
        messages: body.messages,
        memory: body.memory,
        report: body.report ?? null,
      });
      return NextResponse.json(result.body, { status: result.status });
    }

    const result = await generateChatReply(body.messages, {
      memory: body.memory,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof ZodError || error instanceof SyntaxError) {
      const issues = error instanceof ZodError ? formatZodIssues(error) : [];
      logValidationFailure("/api/chat", "request_validation", issues, json);
      return NextResponse.json(
        validationErrorBody({
          code: ERROR_CODES.INVALID_CHAT_REQUEST,
          message: "The chat request did not match the expected schema.",
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
        error: "Unexpected chat error.",
        message: "Unexpected chat error.",
        code: ERROR_CODES.UNKNOWN,
      },
      { status: 500 },
    );
  }
}

async function handleWorkspaceChat(json: unknown) {
  const body = workspaceChatSchema.parse(json);
  const access = await requireWorkspaceMembership(body.workspaceId);
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

  if (conversation.kind === "coach_onboarding") {
    assertCanPerform(access, "coach_onboarding_chat");
  } else {
    assertCanPerform(access, "athlete_discovery_chat");
  }

  if (body.mode === "reopen") {
    const ctx = await buildContinuationContext(body.workspaceId, body.conversationId);
    await recordModelOperation({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      kind: "reopen",
      conversationId: body.conversationId,
      entityIds: ctx.entityIds,
      status: "started",
    });

    const result = await generateReopeningMessage({
      messages: ctx.messages,
      memory: ctx.memory,
      report: ctx.report,
    });

    if (result.status >= 400) {
      await recordModelOperation({
        workspaceId: body.workspaceId,
        personId: access.person.id,
        kind: "reopen",
        conversationId: body.conversationId,
        entityIds: ctx.entityIds,
        status: "failed",
        errorCode: result.body?.code ?? ERROR_CODES.OPENAI_REQUEST_FAILED,
        demoMode: Boolean(result.body?.demoMode),
      });
      return NextResponse.json(result.body, { status: result.status });
    }

    const reply = String(result.body.reply || "").trim();
    const assistant = await appendMessage({
      conversationId: body.conversationId,
      workspaceId: body.workspaceId,
      role: "assistant",
      content: reply,
    });

    await recordModelOperation({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      kind: "reopen",
      conversationId: body.conversationId,
      entityIds: { ...ctx.entityIds, assistantMessageId: assistant.id },
      status: "succeeded",
      demoMode: Boolean(result.body.demoMode),
    });

    return NextResponse.json({
      reply,
      demoMode: Boolean(result.body.demoMode),
      messageId: assistant.clientMessageId || assistant.id,
    });
  }

  if (!body.content?.trim() || !body.clientMessageId) {
    throw new ZodError([
      {
        code: "custom",
        path: ["content"],
        message: "content and clientMessageId are required for workspace chat",
      },
    ]);
  }

  await appendMessage({
    conversationId: body.conversationId,
    workspaceId: body.workspaceId,
    role: "user",
    content: body.content.trim(),
    clientMessageId: body.clientMessageId,
  });

  const ctx = await buildDiscoveryContext(body.workspaceId, body.conversationId);
  await recordModelOperation({
    workspaceId: body.workspaceId,
    personId: access.person.id,
    kind: "chat",
    conversationId: body.conversationId,
    entityIds: ctx.entityIds,
    status: "started",
  });

  const result = await generateChatReply(ctx.messages, { memory: ctx.memory });

  if (result.status >= 400) {
    await recordModelOperation({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      kind: "chat",
      conversationId: body.conversationId,
      entityIds: ctx.entityIds,
      status: "failed",
      errorCode: result.body?.code ?? ERROR_CODES.OPENAI_REQUEST_FAILED,
      demoMode: Boolean(result.body?.demoMode),
    });
    return NextResponse.json(result.body, { status: result.status });
  }

  const reply = String(result.body.reply || "").trim();
  const assistant = await appendMessage({
    conversationId: body.conversationId,
    workspaceId: body.workspaceId,
    role: "assistant",
    content: reply,
  });

  await recordModelOperation({
    workspaceId: body.workspaceId,
    personId: access.person.id,
    kind: "chat",
    conversationId: body.conversationId,
    entityIds: { ...ctx.entityIds, assistantMessageId: assistant.id },
    status: "succeeded",
    demoMode: Boolean(result.body.demoMode),
  });

  return NextResponse.json({
    reply,
    demoMode: Boolean(result.body.demoMode),
    messageId: assistant.clientMessageId || assistant.id,
  });
}
