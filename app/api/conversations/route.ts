import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { requireWorkspaceMembership } from "@/server/authz";
import {
  startConversation,
  toClientMessages,
} from "@/server/services/conversation-service";
import { loadAthleteMemory } from "@/server/services/memory-service";

const createSchema = z.object({
  workspaceId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = createSchema.parse(json);
    const access = await requireWorkspaceMembership(body.workspaceId);
    const started = await startConversation({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      withOpeningMessage: true,
    });
    const memory = await loadAthleteMemory(body.workspaceId);
    return NextResponse.json(
      {
        conversation: {
          id: started.conversation.id,
          status: started.conversation.status,
        },
        messages: toClientMessages(started.messages),
        memory,
      },
      { status: 201 },
    );
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
