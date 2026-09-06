import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  ERROR_CODES,
  formatZodIssues,
  logValidationFailure,
  validationErrorBody,
} from "@/lib/api-errors.mjs";
import { generateInsights, generateSpokenInsightSynthesis } from "@/lib/insights.mjs";
import { parseInsightsRequest } from "@/lib/request-contract.mjs";
import { authzErrorResponse } from "@/server/authz/http";
import { assertEntityWorkspace, requireWorkspaceMembership } from "@/server/authz";
import { assertCanPerform } from "@/server/authz/permissions";
import { getConversationForWorkspace } from "@/server/services/conversation-service";
import {
  buildInsightsContext,
  recordModelOperation,
} from "@/server/services/context-builders";
import {
  loadReflectionForConversation,
  persistInsightsResult,
} from "@/server/services/insights-persist-service";
import { loadAthleteMemory } from "@/server/services/memory-service";
import {
  insertPilotEvent,
  isFirstCompletedReflection,
} from "@/server/services/pilot-events-service";
import { logOps } from "@/lib/ops-log.mjs";

const workspaceInsightsSchema = z.object({
  workspaceId: z.string().uuid(),
  conversationId: z.string().uuid(),
  /** Additive: include spokenSynthesis for voice PWA closing. */
  client: z.enum(["voice_pwa"]).optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();

    if (
      json &&
      typeof json === "object" &&
      !Array.isArray(json) &&
      "workspaceId" in json &&
      (json as { workspaceId?: unknown }).workspaceId
    ) {
      return handleWorkspaceInsights(json);
    }

    const body = parseInsightsRequest(json);
    const result = await generateInsights(body.messages, { memory: body.memory });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof ZodError || error instanceof SyntaxError) {
      const issues = error instanceof ZodError ? formatZodIssues(error) : [];
      logValidationFailure("/api/insights", "request_validation", issues, json);
      return NextResponse.json(
        validationErrorBody({
          code: ERROR_CODES.INVALID_INSIGHTS_REQUEST,
          message: "The insights request did not match the expected schema.",
          issues,
          keys:
            json && typeof json === "object" && !Array.isArray(json)
              ? Object.keys(json as object)
              : [],
          phase: "request_validation",
        }),
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json(
      {
        error: "Unexpected insights error.",
        message: "Unexpected insights error.",
        code: ERROR_CODES.UNKNOWN,
      },
      { status: 500 },
    );
  }
}

async function maybeSpokenSynthesis(args: {
  client?: "voice_pwa";
  report: unknown;
  workspaceId: string;
}) {
  if (args.client !== "voice_pwa" || !args.report) return {};
  const memory = await loadAthleteMemory(args.workspaceId);
  const spoken = await generateSpokenInsightSynthesis(args.report as never, { memory });
  if (!spoken.ok || !spoken.body?.spokenSynthesis) return {};
  return { spokenSynthesis: spoken.body.spokenSynthesis };
}

async function handleWorkspaceInsights(json: unknown) {
  const body = workspaceInsightsSchema.parse(json);
  const access = await requireWorkspaceMembership(body.workspaceId);
  assertCanPerform(access, "athlete_discovery_chat");
  const conversation = await getConversationForWorkspace(
    body.conversationId,
    body.workspaceId,
  );
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }
  assertEntityWorkspace(conversation.workspaceId, body.workspaceId);

  // Idempotent finalize: conversation already completed → return existing reflection.
  if (conversation.status === "completed") {
    const existing = await loadReflectionForConversation(
      body.workspaceId,
      body.conversationId,
    );
    if (existing) {
      const spoken = await maybeSpokenSynthesis({
        client: body.client,
        report: existing.report,
        workspaceId: body.workspaceId,
      });
      return NextResponse.json({
        report: existing.report,
        demoMode: false,
        alreadyFinalized: true,
        reflectionId: existing.reflectionId,
        patternId: existing.patternId,
        priorityId: existing.priorityId,
        ...spoken,
      });
    }
  }

  const ctx = await buildInsightsContext(body.workspaceId, body.conversationId);
  await recordModelOperation({
    workspaceId: body.workspaceId,
    personId: access.person.id,
    kind: "insights",
    conversationId: body.conversationId,
    entityIds: { ...ctx.entityIds, client: body.client ?? null },
    status: "started",
  });

  const result = await generateInsights(ctx.messages, { memory: ctx.memory });

  if (result.status >= 400 || !result.body?.report) {
    await recordModelOperation({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      kind: "insights",
      conversationId: body.conversationId,
      entityIds: ctx.entityIds,
      status: "failed",
      errorCode: result.body?.code ?? ERROR_CODES.OPENAI_REQUEST_FAILED,
      demoMode: Boolean(result.body?.demoMode),
    });
    return NextResponse.json(result.body, { status: result.status });
  }

  const ids = await persistInsightsResult({
    workspaceId: body.workspaceId,
    conversationId: body.conversationId,
    personId: access.person.id,
    report: result.body.report,
  });

  const spoken = await maybeSpokenSynthesis({
    client: body.client,
    report: result.body.report,
    workspaceId: body.workspaceId,
  });

  await recordModelOperation({
    workspaceId: body.workspaceId,
    personId: access.person.id,
    kind: "insights",
    conversationId: body.conversationId,
    entityIds: { ...ctx.entityIds, ...ids, client: body.client ?? null },
    status: "succeeded",
    demoMode: Boolean(result.body.demoMode),
  });

  const firstReflection = await isFirstCompletedReflection(body.workspaceId);
  if (firstReflection) {
    await insertPilotEvent({
      workspaceId: body.workspaceId,
      personId: access.person.id,
      conversationId: body.conversationId,
      name: "athlete_activated",
      props: { source: "insights" },
    });
  }

  logOps("/api/insights", {
    status: 200,
    workspaceId: body.workspaceId,
    client: body.client ?? null,
    firstReflection,
  });

  return NextResponse.json({
    report: result.body.report,
    demoMode: Boolean(result.body.demoMode),
    alreadyFinalized: false,
    ...ids,
    ...spoken,
  });
}
