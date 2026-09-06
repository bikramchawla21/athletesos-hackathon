import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  athleteWorkspaces,
  conversations,
  messages,
  patternEvidence,
  patternFeedback,
  patterns,
  people,
  pilotEvents,
  reflections,
  workspaceMemberships,
} from "@/db/schema";
import {
  aggregateIntelligenceRates,
  analyzeInsightProvenance,
  computeRetentionDn,
  deriveUsageStatus,
  feedbackLabel,
} from "@/lib/pilot-dashboard.mjs";

export type PilotAthleteRow = {
  workspaceId: string;
  athleteLabel: string;
  email: string | null;
  activationAt: Date | null;
  lastActivityAt: Date | null;
  lastCompletedAt: Date | null;
  sessionsCompleted: number;
  sessionsLast7d: number;
  sessionsLast14d: number;
  sessionsLast30d: number;
  totalConversations: number;
  userMessageCount: number;
  completedInsights: number;
  feedbackCount: number;
  feedbackNoCount: number;
  latestInsightAt: Date | null;
  oldestEvidenceAt: Date | null;
  longestMemoryAgeDays: number | null;
  crossSessionInsights: number;
  usageStatus: ReturnType<typeof deriveUsageStatus>;
  provenanceAvailable: boolean;
};

export type PilotOverview = {
  athletesTotal: number;
  athletesActivated: number;
  athletesActive24h: number;
  athletesActive7d: number;
  athletesActive14d: number;
  sessionsStarted: number;
  sessionsCompletedEvents: number;
  completionRate: number | null;
  totalConversations: number;
  completedConversations: number;
  totalUserTurns: number;
  avgCompletedSessionsPerAthlete: number | null;
  avgSessionsPerActiveAthlete7d: number | null;
  retention: {
    d1: ReturnType<typeof computeRetentionDn>;
    d3: ReturnType<typeof computeRetentionDn>;
    d7: ReturnType<typeof computeRetentionDn>;
    d14: ReturnType<typeof computeRetentionDn>;
    d30: ReturnType<typeof computeRetentionDn>;
  };
  intelligence: ReturnType<typeof aggregateIntelligenceRates>;
  reliability: {
    sttAttempts: number;
    sttSuccesses: number;
    sttFailures: number;
    sttSuccessRate: number | null;
    ttsAttempts: number;
    ttsSuccesses: number;
    ttsFailures: number;
    ttsSuccessRate: number | null;
    chatFailures: number;
    finalizationFailures: number;
  };
  asOf: string;
};

function daysAgo(n: number, asOf = new Date()) {
  return new Date(asOf.getTime() - n * 86_400_000);
}

function rate(success: number, total: number): number | null {
  if (total <= 0) return null;
  return success / total;
}

/** Load pilot workspaces (pilot_marked_at set). Falls back to all athlete workspaces if none marked. */
async function loadPilotWorkspaces() {
  const db = getDb();
  const marked = await db
    .select({
      workspace: athleteWorkspaces,
      person: people,
    })
    .from(athleteWorkspaces)
    .innerJoin(people, eq(people.id, athleteWorkspaces.ownerPersonId))
    .where(
      and(eq(athleteWorkspaces.status, "active"), isNotNull(athleteWorkspaces.pilotMarkedAt)),
    );

  if (marked.length > 0) return marked;

  // Fallback while founders mark cohorts: active athlete-owned workspaces.
  return db
    .select({
      workspace: athleteWorkspaces,
      person: people,
    })
    .from(athleteWorkspaces)
    .innerJoin(people, eq(people.id, athleteWorkspaces.ownerPersonId))
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, athleteWorkspaces.id),
        eq(workspaceMemberships.personId, people.id),
        eq(workspaceMemberships.role, "athlete"),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .where(eq(athleteWorkspaces.status, "active"));
}

async function loadMessageEvidenceForPatterns(patternIds: string[]) {
  if (patternIds.length === 0) {
    return new Map<string, { conversationId: string; createdAt: Date; messageId: string }[]>();
  }
  const db = getDb();
  const rows = await db
    .select({
      patternId: patternEvidence.patternId,
      messageId: messages.id,
      conversationId: messages.conversationId,
      createdAt: messages.createdAt,
      sourceType: patternEvidence.sourceType,
    })
    .from(patternEvidence)
    .innerJoin(
      messages,
      and(eq(patternEvidence.sourceId, messages.id), eq(patternEvidence.sourceType, "message")),
    )
    .where(inArray(patternEvidence.patternId, patternIds));

  const map = new Map<string, { conversationId: string; createdAt: Date; messageId: string }[]>();
  for (const row of rows) {
    const list = map.get(row.patternId) ?? [];
    list.push({
      conversationId: row.conversationId,
      createdAt: row.createdAt,
      messageId: row.messageId,
    });
    map.set(row.patternId, list);
  }
  return map;
}

function athleteLabel(person: { displayName: string | null; email: string | null }) {
  return person.displayName?.trim() || person.email?.trim() || "Athlete";
}

/**
 * Read-only pilot overview + per-athlete rows. Never mutates athlete data.
 */
export async function loadPilotDashboard(args?: {
  filter?: "all" | "active_7d" | "inactive_7d";
  asOf?: Date;
}): Promise<{ overview: PilotOverview; athletes: PilotAthleteRow[] }> {
  const asOf = args?.asOf ?? new Date();
  const filter = args?.filter ?? "all";
  const db = getDb();
  const pilots = await loadPilotWorkspaces();
  const workspaceIds = pilots.map((p) => p.workspace.id);

  if (workspaceIds.length === 0) {
    return {
      overview: emptyOverview(asOf),
      athletes: [],
    };
  }

  const convRows = await db
    .select({
      id: conversations.id,
      workspaceId: conversations.workspaceId,
      status: conversations.status,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(inArray(conversations.workspaceId, workspaceIds));

  const messageRows = await db
    .select({
      workspaceId: messages.workspaceId,
      conversationId: messages.conversationId,
      role: messages.role,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.workspaceId, workspaceIds));

  const reflectionRows = await db
    .select({
      id: reflections.id,
      workspaceId: reflections.workspaceId,
      conversationId: reflections.conversationId,
      patternId: reflections.patternId,
      createdAt: reflections.createdAt,
    })
    .from(reflections)
    .where(inArray(reflections.workspaceId, workspaceIds));

  const patternIds = reflectionRows
    .map((r) => r.patternId)
    .filter((id): id is string => Boolean(id));

  const evidenceByPattern = await loadMessageEvidenceForPatterns(patternIds);

  const feedbackRows =
    patternIds.length === 0
      ? []
      : await db
          .select({
            patternId: patternFeedback.patternId,
            response: patternFeedback.response,
            createdAt: patternFeedback.createdAt,
          })
          .from(patternFeedback)
          .where(inArray(patternFeedback.patternId, patternIds));

  const feedbackByPattern = new Map(
    feedbackRows.map((f) => [f.patternId, f] as const),
  );

  const eventRows = await db
    .select({
      workspaceId: pilotEvents.workspaceId,
      name: pilotEvents.name,
      createdAt: pilotEvents.createdAt,
      props: pilotEvents.props,
    })
    .from(pilotEvents)
    .where(inArray(pilotEvents.workspaceId, workspaceIds));

  const insightAnalyses: {
    provenance: ReturnType<typeof analyzeInsightProvenance>;
    feedback: "Yes" | "Kind of" | "No" | null;
  }[] = [];

  const athletes: PilotAthleteRow[] = [];

  for (const pilot of pilots) {
    const wid = pilot.workspace.id;
    const convs = convRows.filter((c) => c.workspaceId === wid);
    const completed = convs.filter((c) => c.status === "completed");
    const completedDates = completed.map((c) => c.updatedAt);
    const activationAt =
      completedDates.length === 0
        ? null
        : new Date(Math.min(...completedDates.map((d) => d.getTime())));
    const lastCompletedAt =
      completedDates.length === 0
        ? null
        : new Date(Math.max(...completedDates.map((d) => d.getTime())));

    const msgs = messageRows.filter((m) => m.workspaceId === wid);
    const userMsgs = msgs.filter((m) => m.role === "user");
    const lastMessageAt =
      msgs.length === 0
        ? null
        : new Date(Math.max(...msgs.map((m) => m.createdAt.getTime())));

    const events = eventRows.filter((e) => e.workspaceId === wid);
    const lastEventAt =
      events.length === 0
        ? null
        : new Date(Math.max(...events.map((e) => e.createdAt.getTime())));

    const lastActivityAt = [lastCompletedAt, lastMessageAt, lastEventAt]
      .filter(Boolean)
      .reduce<Date | null>((max, d) => {
        if (!d) return max;
        if (!max || d.getTime() > max.getTime()) return d;
        return max;
      }, null);

    const reflectionsForWs = reflectionRows.filter((r) => r.workspaceId === wid);
    let crossSessionInsights = 0;
    let oldestEvidenceAt: Date | null = null;
    let longestMemoryAgeDays: number | null = null;
    let provenanceAvailable = false;
    let feedbackCount = 0;
    let feedbackNoCount = 0;
    let latestInsightAt: Date | null = null;

    for (const reflection of reflectionsForWs) {
      if (reflection.createdAt && (!latestInsightAt || reflection.createdAt > latestInsightAt)) {
        latestInsightAt = reflection.createdAt;
      }
      const evidence = reflection.patternId
        ? evidenceByPattern.get(reflection.patternId) ?? []
        : [];
      const provenance = analyzeInsightProvenance({
        insightAt: reflection.createdAt,
        evidence,
      });
      const fb = reflection.patternId ? feedbackByPattern.get(reflection.patternId) : null;
      const label = fb ? (feedbackLabel(fb.response) as "Yes" | "Kind of" | "No") : null;
      if (label === "Yes" || label === "Kind of" || label === "No") {
        feedbackCount += 1;
        if (label === "No") feedbackNoCount += 1;
      }
      insightAnalyses.push({ provenance, feedback: label });
      if (provenance.available) {
        provenanceAvailable = true;
        if (provenance.crossSession) crossSessionInsights += 1;
        if (
          provenance.oldestSupportingEvidenceAt &&
          (!oldestEvidenceAt ||
            provenance.oldestSupportingEvidenceAt < oldestEvidenceAt)
        ) {
          oldestEvidenceAt = provenance.oldestSupportingEvidenceAt;
        }
        if (provenance.memoryReferenceAgeDays != null) {
          longestMemoryAgeDays = Math.max(
            longestMemoryAgeDays ?? 0,
            provenance.memoryReferenceAgeDays,
          );
        }
      }
    }

    const inWindow = (from: Date) =>
      completed.filter((c) => c.updatedAt >= from).length;

    const row: PilotAthleteRow = {
      workspaceId: wid,
      athleteLabel: athleteLabel(pilot.person),
      email: pilot.person.email,
      activationAt,
      lastActivityAt,
      lastCompletedAt,
      sessionsCompleted: completed.length,
      sessionsLast7d: inWindow(daysAgo(7, asOf)),
      sessionsLast14d: inWindow(daysAgo(14, asOf)),
      sessionsLast30d: inWindow(daysAgo(30, asOf)),
      totalConversations: convs.length,
      userMessageCount: userMsgs.length,
      completedInsights: reflectionsForWs.length,
      feedbackCount,
      feedbackNoCount,
      latestInsightAt,
      oldestEvidenceAt,
      longestMemoryAgeDays,
      crossSessionInsights,
      usageStatus: deriveUsageStatus(lastCompletedAt, asOf),
      provenanceAvailable,
    };

    athletes.push(row);
  }

  let filtered = athletes;
  if (filter === "active_7d") {
    filtered = athletes.filter((a) => (a.sessionsLast7d ?? 0) > 0);
  } else if (filter === "inactive_7d") {
    filtered = athletes.filter((a) => (a.sessionsLast7d ?? 0) === 0);
  }

  const retentionAthletes = athletes
    .filter((a) => a.activationAt)
    .map((a) => ({
      activationDate: a.activationAt!,
      completedDates: convRows
        .filter((c) => c.workspaceId === a.workspaceId && c.status === "completed")
        .map((c) => c.updatedAt),
    }));

  const sessionsStarted = eventRows.filter((e) => e.name === "session_started").length;
  const sessionsCompletedEvents = eventRows.filter(
    (e) => e.name === "session_completed",
  ).length;
  const sttSuccesses = eventRows.filter((e) => e.name === "transcription_succeeded").length;
  const sttFailures = eventRows.filter((e) => e.name === "transcription_failed").length;
  const ttsSuccesses = eventRows.filter((e) => e.name === "tts_succeeded").length;
  const ttsFailures = eventRows.filter((e) => e.name === "tts_failed").length;
  const chatFailures = eventRows.filter(
    (e) => e.name === "session_interrupted" && (e.props as { overlay?: string })?.overlay === "thinking",
  ).length;
  // Prefer explicit failure events when present; insights_failed is client-only overlay — count interrupted during finalizing.
  const finalizationFailures = eventRows.filter(
    (e) =>
      e.name === "session_interrupted" &&
      (e.props as { overlay?: string })?.overlay === "finalizing",
  ).length;

  const completedConversations = convRows.filter((c) => c.status === "completed").length;
  const totalUserTurns = messageRows.filter((m) => m.role === "user").length;
  const activated = athletes.filter((a) => a.activationAt).length;
  const active24h = athletes.filter(
    (a) => a.lastActivityAt && a.lastActivityAt >= daysAgo(1, asOf),
  ).length;
  const active7d = athletes.filter(
    (a) => a.lastActivityAt && a.lastActivityAt >= daysAgo(7, asOf),
  ).length;
  const active14d = athletes.filter(
    (a) => a.lastActivityAt && a.lastActivityAt >= daysAgo(14, asOf),
  ).length;

  const overview: PilotOverview = {
    athletesTotal: athletes.length,
    athletesActivated: activated,
    athletesActive24h: active24h,
    athletesActive7d: active7d,
    athletesActive14d: active14d,
    sessionsStarted,
    sessionsCompletedEvents,
    completionRate: rate(sessionsCompletedEvents, sessionsStarted),
    totalConversations: convRows.length,
    completedConversations,
    totalUserTurns,
    avgCompletedSessionsPerAthlete: athletes.length
      ? completedConversations / athletes.length
      : null,
    avgSessionsPerActiveAthlete7d: active7d
      ? athletes.reduce((s, a) => s + a.sessionsLast7d, 0) / active7d
      : null,
    retention: {
      d1: computeRetentionDn(retentionAthletes, 1, asOf),
      d3: computeRetentionDn(retentionAthletes, 3, asOf),
      d7: computeRetentionDn(retentionAthletes, 7, asOf),
      d14: computeRetentionDn(retentionAthletes, 14, asOf),
      d30: computeRetentionDn(retentionAthletes, 30, asOf),
    },
    intelligence: aggregateIntelligenceRates(insightAnalyses),
    reliability: {
      sttAttempts: sttSuccesses + sttFailures,
      sttSuccesses,
      sttFailures,
      sttSuccessRate: rate(sttSuccesses, sttSuccesses + sttFailures),
      ttsAttempts: ttsSuccesses + ttsFailures,
      ttsSuccesses,
      ttsFailures,
      ttsSuccessRate: rate(ttsSuccesses, ttsSuccesses + ttsFailures),
      chatFailures,
      finalizationFailures,
    },
    asOf: asOf.toISOString(),
  };

  return { overview, athletes: filtered };
}

function emptyOverview(asOf: Date): PilotOverview {
  const emptyRet = (n: number) =>
    computeRetentionDn([], n, asOf);
  return {
    athletesTotal: 0,
    athletesActivated: 0,
    athletesActive24h: 0,
    athletesActive7d: 0,
    athletesActive14d: 0,
    sessionsStarted: 0,
    sessionsCompletedEvents: 0,
    completionRate: null,
    totalConversations: 0,
    completedConversations: 0,
    totalUserTurns: 0,
    avgCompletedSessionsPerAthlete: null,
    avgSessionsPerActiveAthlete7d: null,
    retention: {
      d1: emptyRet(1),
      d3: emptyRet(3),
      d7: emptyRet(7),
      d14: emptyRet(14),
      d30: emptyRet(30),
    },
    intelligence: aggregateIntelligenceRates([]),
    reliability: {
      sttAttempts: 0,
      sttSuccesses: 0,
      sttFailures: 0,
      sttSuccessRate: null,
      ttsAttempts: 0,
      ttsSuccesses: 0,
      ttsFailures: 0,
      ttsSuccessRate: null,
      chatFailures: 0,
      finalizationFailures: 0,
    },
    asOf: asOf.toISOString(),
  };
}

export type PilotAthleteDetail = {
  athlete: PilotAthleteRow;
  sessions: { conversationId: string; status: string; updatedAt: Date; userTurns: number }[];
  insights: {
    reflectionId: string;
    patternId: string | null;
    title: string;
    generatedAt: Date;
    feedback: string | null;
    provenance: ReturnType<typeof analyzeInsightProvenance>;
    evidenceTimeline: { conversationId: string; createdAt: Date }[];
  }[];
  timeline: { at: Date; label: string }[];
  sessionsStarted: number;
  sessionsCompletedEvents: number;
  interruptedSessions: number;
};

export async function loadPilotAthleteDetail(
  workspaceId: string,
): Promise<PilotAthleteDetail | null> {
  const { athletes } = await loadPilotDashboard({ filter: "all" });
  const athlete = athletes.find((a) => a.workspaceId === workspaceId);
  if (!athlete) return null;

  const db = getDb();
  const convs = await db
    .select()
    .from(conversations)
    .where(eq(conversations.workspaceId, workspaceId))
    .orderBy(desc(conversations.updatedAt));

  const msgs = await db
    .select({
      conversationId: messages.conversationId,
      role: messages.role,
    })
    .from(messages)
    .where(eq(messages.workspaceId, workspaceId));

  const turnsByConv = new Map<string, number>();
  for (const m of msgs) {
    if (m.role !== "user") continue;
    turnsByConv.set(m.conversationId, (turnsByConv.get(m.conversationId) ?? 0) + 1);
  }

  const reflectionRows = await db
    .select()
    .from(reflections)
    .where(eq(reflections.workspaceId, workspaceId))
    .orderBy(desc(reflections.createdAt));

  const patternIds = reflectionRows
    .map((r) => r.patternId)
    .filter((id): id is string => Boolean(id));
  const evidenceByPattern = await loadMessageEvidenceForPatterns(patternIds);
  const feedbackRows =
    patternIds.length === 0
      ? []
      : await db
          .select()
          .from(patternFeedback)
          .where(inArray(patternFeedback.patternId, patternIds));
  const feedbackByPattern = new Map(feedbackRows.map((f) => [f.patternId, f]));

  const insights = [];
  const patternTitleById = new Map<string, string>();
  if (patternIds.length > 0) {
    const patternRows = await db
      .select({ id: patterns.id, statement: patterns.statement })
      .from(patterns)
      .where(inArray(patterns.id, patternIds));
    for (const p of patternRows) patternTitleById.set(p.id, p.statement);
  }

  for (const r of reflectionRows) {
    const evidence = r.patternId ? evidenceByPattern.get(r.patternId) ?? [] : [];
    const provenance = analyzeInsightProvenance({
      insightAt: r.createdAt,
      evidence,
    });
    const fb = r.patternId ? feedbackByPattern.get(r.patternId) : null;
    insights.push({
      reflectionId: r.id,
      patternId: r.patternId,
      title: (r.patternId && patternTitleById.get(r.patternId)) || "Insight",
      generatedAt: r.createdAt,
      feedback: fb ? feedbackLabel(fb.response) : null,
      provenance,
      evidenceTimeline: evidence
        .map((e) => ({ conversationId: e.conversationId, createdAt: e.createdAt }))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    });
  }

  const events = await db
    .select()
    .from(pilotEvents)
    .where(eq(pilotEvents.workspaceId, workspaceId))
    .orderBy(desc(pilotEvents.createdAt));

  const timeline: { at: Date; label: string }[] = [];
  for (const c of convs) {
    if (c.status === "completed") {
      timeline.push({ at: c.updatedAt, label: "Session completed" });
    }
  }
  for (const insight of insights) {
    timeline.push({ at: insight.generatedAt, label: `Insight: ${insight.title.slice(0, 80)}` });
    if (insight.feedback) {
      timeline.push({
        at: insight.generatedAt,
        label: `Feedback: ${insight.feedback}`,
      });
    }
    if (insight.provenance.available && insight.provenance.crossSession) {
      timeline.push({
        at: insight.generatedAt,
        label: `Historical insight — oldest evidence ${insight.provenance.memoryReferenceAgeDays}d`,
      });
    }
  }
  for (const e of events) {
    if (e.name === "session_interrupted") {
      timeline.push({ at: e.createdAt, label: "Session interrupted / abandoned" });
    }
  }
  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    athlete,
    sessions: convs.map((c) => ({
      conversationId: c.id,
      status: c.status,
      updatedAt: c.updatedAt,
      userTurns: turnsByConv.get(c.id) ?? 0,
    })),
    insights,
    timeline: timeline.slice(0, 80),
    sessionsStarted: events.filter((e) => e.name === "session_started").length,
    sessionsCompletedEvents: events.filter((e) => e.name === "session_completed").length,
    interruptedSessions: events.filter((e) => e.name === "session_interrupted").length,
  };
}
