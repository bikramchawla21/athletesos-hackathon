import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { athleteWorkspaces, conversations, pilotEvents } from "@/db/schema";
import {
  isPilotEventName,
  sanitizePilotEventProps,
  type PilotEventName,
} from "@/lib/pilot-events";

export async function insertPilotEvent(args: {
  workspaceId: string;
  personId: string;
  conversationId?: string | null;
  name: string;
  props?: Record<string, unknown>;
  clientSessionId?: string | null;
}): Promise<{ id: string; name: PilotEventName } | null> {
  if (!isPilotEventName(args.name)) return null;

  const db = getDb();
  if (args.conversationId) {
    const [conversation] = await db
      .select({ id: conversations.id, workspaceId: conversations.workspaceId })
      .from(conversations)
      .where(eq(conversations.id, args.conversationId))
      .limit(1);
    if (!conversation || conversation.workspaceId !== args.workspaceId) {
      return null;
    }
  }

  const [row] = await db
    .insert(pilotEvents)
    .values({
      workspaceId: args.workspaceId,
      personId: args.personId,
      conversationId: args.conversationId ?? null,
      name: args.name,
      props: sanitizePilotEventProps(args.props),
      clientSessionId: args.clientSessionId ?? null,
    })
    .returning({ id: pilotEvents.id, name: pilotEvents.name });

  return row ? { id: row.id, name: row.name as PilotEventName } : null;
}

/** True when this workspace has never completed a reflection before. */
export async function isFirstCompletedReflection(
  workspaceId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.status, "completed"),
      ),
    );
  return (row?.count ?? 0) <= 1;
}

export async function markWorkspaceAsPilot(workspaceId: string): Promise<void> {
  const db = getDb();
  await db
    .update(athleteWorkspaces)
    .set({ pilotMarkedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(athleteWorkspaces.id, workspaceId), sql`${athleteWorkspaces.pilotMarkedAt} is null`));
}

export async function isPilotMarkedWorkspace(workspaceId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ pilotMarkedAt: athleteWorkspaces.pilotMarkedAt })
    .from(athleteWorkspaces)
    .where(
      and(eq(athleteWorkspaces.id, workspaceId), isNotNull(athleteWorkspaces.pilotMarkedAt)),
    )
    .limit(1);
  return Boolean(row?.pilotMarkedAt);
}
