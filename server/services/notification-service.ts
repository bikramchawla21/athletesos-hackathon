import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NeonQueryResultHKT } from "drizzle-orm/neon-serverless";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { notifications } from "@/db/schema";

type Tx = PgTransaction<
  NeonQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export async function createNotification(args: {
  recipientPersonId: string;
  workspaceId?: string | null;
  kind: string;
  payload?: Record<string, unknown>;
  tx?: Tx;
}): Promise<void> {
  const db = args.tx ?? getDb();
  await db.insert(notifications).values({
    recipientPersonId: args.recipientPersonId,
    workspaceId: args.workspaceId ?? null,
    kind: args.kind,
    payload: args.payload ?? {},
  });
}

export async function listNotificationsForPerson(personId: string, limit = 30) {
  const db = getDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientPersonId, personId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationRead(args: {
  notificationId: string;
  personId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, args.notificationId),
        eq(notifications.recipientPersonId, args.personId),
        isNull(notifications.readAt),
      ),
    );
}
