import { and, asc, desc, eq, max } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  conversations,
  messages,
  timelineEvents,
  type Conversation,
  type DbMessage,
} from "@/db/schema";
import { OPENING_MESSAGE_ID } from "@/lib/message-id.mjs";

const OPENING_CONTENT =
  "Hi.\nI’m AthleteOS.\n\nI’m looking forward to getting to know you.\n\nThe better I understand your journey, the better we’ll think through your performance together.\n\nWhenever you’re ready, I’m listening.";

export async function startConversation(args: {
  workspaceId: string;
  personId: string;
  withOpeningMessage?: boolean;
  kind?: "athlete_discovery" | "coach_onboarding";
  visibility?: "athlete_private" | "coach_private" | "workspace";
  openingContent?: string;
}): Promise<{ conversation: Conversation; messages: DbMessage[] }> {
  const db = getDb();
  const kind = args.kind ?? "athlete_discovery";
  const visibility =
    args.visibility ??
    (kind === "coach_onboarding" ? "coach_private" : "athlete_private");
  const opening =
    args.openingContent ??
    (kind === "coach_onboarding"
      ? "Thanks for joining this athlete’s workspace.\n\nI’ll ask a few precise questions so we can compare perspectives carefully — not to diagnose, just to understand what you see in their performance.\n\nHow long have you been coaching this athlete, and in what capacity?"
      : OPENING_CONTENT);

  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        workspaceId: args.workspaceId,
        createdByPersonId: args.personId,
        kind,
        visibility,
        status: "active",
      })
      .returning();

    if (!conversation) {
      throw new Error("Failed to create conversation.");
    }

    const seeded: DbMessage[] = [];
    if (args.withOpeningMessage !== false) {
      const [openingMsg] = await tx
        .insert(messages)
        .values({
          conversationId: conversation.id,
          workspaceId: args.workspaceId,
          role: "assistant",
          content: opening,
          clientMessageId: OPENING_MESSAGE_ID,
          seq: 1,
        })
        .returning();
      if (openingMsg) seeded.push(openingMsg);
    }

    await tx.insert(timelineEvents).values({
      workspaceId: args.workspaceId,
      personId: args.personId,
      kind: "conversation_started",
      visibility,
      payload: { conversationId: conversation.id, conversationKind: kind },
    });

    return { conversation, messages: seeded };
  });
}

export async function getConversationForWorkspace(
  conversationId: string,
  workspaceId: string,
): Promise<Conversation | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listMessages(conversationId: string): Promise<DbMessage[]> {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.seq), asc(messages.createdAt));
}

export async function getLatestConversation(
  workspaceId: string,
  kind: "athlete_discovery" | "coach_onboarding" = "athlete_discovery",
): Promise<Conversation | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.status, "active"),
        eq(conversations.kind, kind),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function nextSeq(conversationId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ maxSeq: max(messages.seq) })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));
  return Number(row?.maxSeq ?? 0) + 1;
}

/**
 * Insert a message, deduping on (conversationId, clientMessageId) when provided.
 */
export async function appendMessage(args: {
  conversationId: string;
  workspaceId: string;
  role: "user" | "assistant" | "system";
  content: string;
  clientMessageId?: string | null;
}): Promise<DbMessage> {
  const db = getDb();

  if (args.clientMessageId) {
    const existing = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, args.conversationId),
          eq(messages.clientMessageId, args.clientMessageId),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];
  }

  const seq = await nextSeq(args.conversationId);
  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId: args.conversationId,
      workspaceId: args.workspaceId,
      role: args.role,
      content: args.content,
      clientMessageId: args.clientMessageId ?? null,
      seq,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to insert message.");
  }

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, args.conversationId));

  return inserted;
}

export async function markConversationCompleted(conversationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export function toClientMessages(
  rows: DbMessage[],
): { id: string; role: "user" | "assistant"; content: string }[] {
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.clientMessageId || m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}
