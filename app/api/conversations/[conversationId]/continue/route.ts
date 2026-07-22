import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { assertEntityWorkspace, requireWorkspaceMembership } from "@/server/authz";
import { generateReopeningMessage } from "@/lib/chat.mjs";
import {
  appendMessage,
  getConversationForWorkspace,
} from "@/server/services/conversation-service";
import {
  buildContinuationContext,
  recordModelOperation,
} from "@/server/services/context-builders";

type RouteContext = { params: Promise<{ conversationId: string }> };

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { conversationId } = await context.params;
    const json = await request.json();
    const body = bodySchema.parse(json);
    const access = await requireWorkspaceMembership(body.workspaceId);
    const conversation = await getConversationForWorkspace(
      conversationId,
      body.workspaceId,
    );
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    assertEntityWorkspace(conversation.workspaceId, body.workspaceId);

    const ctx = await buildContinuationContext(body.workspaceId, conversationId);
    await recordModelOperation({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      kind: "reopen",
      conversationId,
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
        conversationId,
        entityIds: ctx.entityIds,
        status: "failed",
        errorCode: result.body?.code ?? "OPENAI_REQUEST_FAILED",
        demoMode: Boolean(result.body?.demoMode),
      });
      return NextResponse.json(result.body, { status: result.status });
    }

    const reply = String(result.body.reply || "").trim();
    const assistant = await appendMessage({
      conversationId,
      workspaceId: body.workspaceId,
      role: "assistant",
      content: reply,
    });

    await recordModelOperation({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      kind: "reopen",
      conversationId,
      entityIds: { ...ctx.entityIds, assistantMessageId: assistant.id },
      status: "succeeded",
      demoMode: Boolean(result.body.demoMode),
    });

    return NextResponse.json({
      reply,
      demoMode: Boolean(result.body.demoMode),
      conversationId,
      messageId: assistant.clientMessageId || assistant.id,
    });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid continue request.", code: "validation" },
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Unexpected continue error.", code: "unknown" },
      { status: 500 },
    );
  }
}
