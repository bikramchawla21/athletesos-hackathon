import { and, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { getDb } from "@/db/client";
import {
  conversations,
  legacyImports,
  messages,
  timelineEvents,
} from "@/db/schema";
import { migratePersistedState } from "@/lib/persistence.mjs";
import { persistAthleteMemory, buildMessageIdLookup } from "./memory-service";
import { persistInsightsResult } from "./insights-persist-service";
import type { PersistedAppState } from "@/lib/types";

export function hashLegacyPayload(payload: unknown): string {
  const normalized = JSON.stringify(payload);
  return createHash("sha256").update(normalized).digest("hex");
}

export async function importLegacyState(args: {
  workspaceId: string;
  personId: string;
  payload: unknown;
}): Promise<{
  imported: boolean;
  duplicate: boolean;
  conversationId: string | null;
  contentHash: string;
}> {
  const migrated = migratePersistedState(args.payload);
  if (!migrated.ok || !migrated.state) {
    throw new Error("Legacy payload failed migration.");
  }

  const state = migrated.state as PersistedAppState;
  const contentHash = hashLegacyPayload({
    stage: state.stage,
    messages: state.messages,
    memory: state.memory,
    report: state.report,
  });

  const db = getDb();
  const existing = await db
    .select()
    .from(legacyImports)
    .where(
      and(
        eq(legacyImports.workspaceId, args.workspaceId),
        eq(legacyImports.contentHash, contentHash),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return {
      imported: false,
      duplicate: true,
      conversationId: null,
      contentHash,
    };
  }

  const conversationId = await db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        workspaceId: args.workspaceId,
        createdByPersonId: args.personId,
        status:
          state.stage === "complete" || state.report
            ? "completed"
            : "active",
        title: "Imported conversation",
      })
      .returning();

    if (!conversation) throw new Error("Failed to create import conversation.");

    let seq = 0;
    for (const message of state.messages) {
      seq += 1;
      await tx.insert(messages).values({
        conversationId: conversation.id,
        workspaceId: args.workspaceId,
        role: message.role,
        content: message.content,
        clientMessageId: message.id,
        seq,
      });
    }

    await tx.insert(legacyImports).values({
      workspaceId: args.workspaceId,
      personId: args.personId,
      contentHash,
      status: "completed",
    });

    await tx.insert(timelineEvents).values({
      workspaceId: args.workspaceId,
      personId: args.personId,
      kind: "import_completed",
      payload: { conversationId: conversation.id, contentHash },
    });

    return conversation.id;
  });

  const lookup = await buildMessageIdLookup(conversationId);
  await persistAthleteMemory(args.workspaceId, state.memory, lookup);

  if (state.report) {
    await persistInsightsResult({
      workspaceId: args.workspaceId,
      conversationId,
      personId: args.personId,
      report: state.report,
    });
  }

  return {
    imported: true,
    duplicate: false,
    conversationId,
    contentHash,
  };
}
