import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { messages, modelOperations, priorities, patterns, focusAreas } from "@/db/schema";
import { loadAthleteMemory } from "./memory-service";
import type { AthleteMemory, Message, ReflectionReport } from "@/lib/types";

const MAX_DISCOVERY_MESSAGES = 40;
const MAX_INSIGHTS_MESSAGES = 60;

export async function recordModelOperation(args: {
  workspaceId: string;
  personId: string;
  kind: "chat" | "memory" | "insights" | "reopen" | "coach_onboarding" | "perspective" | "shared_priority";
  conversationId?: string | null;
  entityIds?: Record<string, unknown>;
  status: "started" | "succeeded" | "failed";
  errorCode?: string | null;
  demoMode?: boolean;
}): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(modelOperations)
    .values({
      workspaceId: args.workspaceId,
      personId: args.personId,
      kind: args.kind,
      conversationId: args.conversationId ?? null,
      entityIds: args.entityIds ?? {},
      status: args.status,
      errorCode: args.errorCode ?? null,
      demoMode: args.demoMode ?? false,
    })
    .returning();
  return row?.id ?? "";
}

function toDomainMessages(
  rows: { id: string; clientMessageId: string | null; role: string; content: string }[],
): Message[] {
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.clientMessageId || m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}

export async function buildDiscoveryContext(
  workspaceId: string,
  conversationId: string,
): Promise<{
  messages: Message[];
  memory: AthleteMemory;
  entityIds: Record<string, unknown>;
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.seq))
    .limit(MAX_DISCOVERY_MESSAGES);

  const ordered = [...rows].reverse();
  const memory = await loadAthleteMemory(workspaceId);
  const entityIds = {
    conversationId,
    messageIds: ordered.map((m) => m.id),
    memoryKinds: ["goals", "challenges", "corrections", "coverage"],
  };

  return {
    messages: toDomainMessages(ordered),
    memory,
    entityIds,
  };
}

export async function buildMemoryExtractionContext(
  workspaceId: string,
  conversationId: string,
): Promise<{
  messages: Message[];
  memory: AthleteMemory;
  entityIds: Record<string, unknown>;
}> {
  const ctx = await buildDiscoveryContext(workspaceId, conversationId);
  return {
    ...ctx,
    entityIds: {
      ...ctx.entityIds,
      purpose: "memory_extraction",
    },
  };
}

export async function buildInsightsContext(
  workspaceId: string,
  conversationId: string,
): Promise<{
  messages: Message[];
  memory: AthleteMemory;
  entityIds: Record<string, unknown>;
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.seq))
    .limit(MAX_INSIGHTS_MESSAGES);

  const ordered = [...rows].reverse();
  const memory = await loadAthleteMemory(workspaceId);
  return {
    messages: toDomainMessages(ordered),
    memory,
    entityIds: {
      conversationId,
      messageIds: ordered.map((m) => m.id),
      memorySnapshot: true,
    },
  };
}

export async function buildContinuationContext(
  workspaceId: string,
  conversationId: string,
): Promise<{
  messages: Message[];
  memory: AthleteMemory;
  report: ReflectionReport | null;
  entityIds: Record<string, unknown>;
}> {
  const discovery = await buildDiscoveryContext(workspaceId, conversationId);
  const db = getDb();

  const [priority] = await db
    .select()
    .from(priorities)
    .where(and(eq(priorities.workspaceId, workspaceId), eq(priorities.status, "active")))
    .limit(1);

  let report: ReflectionReport | null = null;
  if (priority) {
    const focuses = await db
      .select()
      .from(focusAreas)
      .where(eq(focusAreas.priorityId, priority.id));
    const [pattern] = await db
      .select()
      .from(patterns)
      .where(
        and(
          eq(patterns.workspaceId, workspaceId),
          inArray(patterns.status, ["emerging", "supported"]),
        ),
      )
      .orderBy(desc(patterns.updatedAt))
      .limit(1);

    report = {
      observations: [],
      evidenceIntro: "",
      evidence: [],
      evidenceNote: "",
      pattern: {
        title: pattern?.statement ?? "Working pattern",
        explanation: pattern?.explanation ?? "",
      },
      sharedPriority: priority.statement,
      focusIntro: "",
      focusAreas: focuses
        .sort((a, b) => a.position - b.position)
        .map((f) => f.label),
      closing: "",
    };
  }

  return {
    ...discovery,
    report,
    entityIds: {
      ...discovery.entityIds,
      priorityId: priority?.id ?? null,
      purpose: "continuation",
    },
  };
}

/** Athlete-facing context: discovery transcript + private+shared memory. */
export async function buildAthleteConversationContext(
  workspaceId: string,
  conversationId: string,
) {
  return buildDiscoveryContext(workspaceId, conversationId);
}

/**
 * Coach-facing conversation context — only coach_onboarding / shared-visible messages.
 */
export async function buildCoachConversationContext(
  workspaceId: string,
  conversationId: string,
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.seq))
    .limit(MAX_DISCOVERY_MESSAGES);
  const ordered = [...rows].reverse();
  const brief = await buildCoachBriefContext(workspaceId);
  return {
    messages: toDomainMessages(ordered),
    memory: brief.memory,
    entityIds: {
      conversationId,
      messageIds: ordered.map((m) => m.id),
      audience: "coach",
    },
  };
}

export async function buildCoachBriefContext(workspaceId: string) {
  const memory = await loadAthleteMemory(workspaceId);
  return {
    memory: {
      goals: memory.goals,
      challenges: memory.challenges,
      observedPatterns: memory.observedPatterns,
      previousPriorities: memory.previousPriorities,
      openQuestions: memory.openQuestions,
      identity: {
        sport: memory.identity.sport,
        level: memory.identity.level,
        background: [],
      },
    },
    entityIds: { workspaceId, audience: "coach_brief" },
  };
}

export async function buildSharedPatternContext(workspaceId: string) {
  const db = getDb();
  const patternRows = await db
    .select()
    .from(patterns)
    .where(and(eq(patterns.workspaceId, workspaceId), eq(patterns.visibility, "workspace")))
    .orderBy(desc(patterns.updatedAt))
    .limit(5);
  return {
    patterns: patternRows.map((p) => ({
      id: p.id,
      statement: p.statement,
      explanation: p.explanation,
      status: p.status,
      attributionRequired: true,
    })),
    entityIds: {
      workspaceId,
      patternIds: patternRows.map((p) => p.id),
      audience: "shared",
    },
  };
}

export async function buildSharedPriorityContext(workspaceId: string) {
  const memory = await loadAthleteMemory(workspaceId);
  const shared = await buildSharedPatternContext(workspaceId);
  return {
    memory: {
      goals: memory.goals,
      challenges: memory.challenges,
      observedPatterns: memory.observedPatterns,
      previousPriorities: memory.previousPriorities,
      openQuestions: memory.openQuestions,
    },
    patterns: shared.patterns,
    entityIds: { workspaceId, audience: "shared_priority" },
  };
}
