import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { messages, patternEvidence, reflections } from "@/db/schema";
import { authzErrorResponse } from "@/server/authz/http";
import { requireFounder } from "@/server/authz/founder";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  patternId: z.string().uuid(),
});

/**
 * Founder-only: return short previews of messages linked as pattern evidence.
 * Does not return an athlete's full conversation history.
 */
export async function GET(request: Request) {
  try {
    await requireFounder();
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      workspaceId: url.searchParams.get("workspaceId"),
      patternId: url.searchParams.get("patternId"),
    });

    const db = getDb();
    const [reflection] = await db
      .select({ id: reflections.id })
      .from(reflections)
      .where(
        and(
          eq(reflections.workspaceId, parsed.workspaceId),
          eq(reflections.patternId, parsed.patternId),
        ),
      )
      .limit(1);

    if (!reflection) {
      return NextResponse.json({ error: "Not found.", code: "NOT_FOUND" }, { status: 404 });
    }

    const evidence = await db
      .select({ sourceId: patternEvidence.sourceId })
      .from(patternEvidence)
      .where(
        and(
          eq(patternEvidence.patternId, parsed.patternId),
          eq(patternEvidence.sourceType, "message"),
        ),
      );

    const messageIds = evidence.map((e) => e.sourceId);
    if (messageIds.length === 0) {
      return NextResponse.json({ snippets: [] });
    }

    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        createdAt: messages.createdAt,
        role: messages.role,
        content: messages.content,
        workspaceId: messages.workspaceId,
      })
      .from(messages)
      .where(
        and(inArray(messages.id, messageIds), eq(messages.workspaceId, parsed.workspaceId)),
      );

    const snippets = rows.map((m) => ({
      messageId: m.id,
      conversationId: m.conversationId,
      createdAt: m.createdAt.toISOString(),
      role: m.role,
      preview: m.content.slice(0, 280) + (m.content.length > 280 ? "…" : ""),
    }));

    return NextResponse.json({ snippets });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
