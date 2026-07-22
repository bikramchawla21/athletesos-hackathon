import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { assertEntityWorkspace, requireWorkspaceMembership } from "@/server/authz";
import {
  getConversationForWorkspace,
  listMessages,
  toClientMessages,
} from "@/server/services/conversation-service";
import { loadAthleteMemory } from "@/server/services/memory-service";
import { loadActiveReflectionReport } from "@/server/services/insights-persist-service";

type RouteContext = { params: Promise<{ conversationId: string }> };

const querySchema = z.object({
  workspaceId: z.string().uuid(),
});

export async function GET(request: Request, context: RouteContext) {
  try {
    const { conversationId } = await context.params;
    const { searchParams } = new URL(request.url);
    const { workspaceId } = querySchema.parse({
      workspaceId: searchParams.get("workspaceId"),
    });
    await requireWorkspaceMembership(workspaceId);
    const conversation = await getConversationForWorkspace(conversationId, workspaceId);
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    assertEntityWorkspace(conversation.workspaceId, workspaceId);
    const rows = await listMessages(conversationId);
    const memory = await loadAthleteMemory(workspaceId);
    const report =
      conversation.status === "completed"
        ? await loadActiveReflectionReport(workspaceId)
        : null;

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        status: conversation.status,
        workspaceId: conversation.workspaceId,
      },
      messages: toClientMessages(rows),
      memory,
      report,
    });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid conversation request.", code: "validation" },
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Unexpected conversation error.", code: "unknown" },
      { status: 500 },
    );
  }
}
