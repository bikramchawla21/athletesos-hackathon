/**
 * Thin client helpers: voice transcript → existing /api/conversations + /api/chat + /api/memory.
 * Does not call OpenAI from the browser.
 */

export const VOICE_CHAT_CLIENT = "voice_pwa" as const;

export type VoiceChatResult =
  | {
      ok: true;
      reply: string;
      messageId?: string;
      conversationId: string;
      demoMode?: boolean;
    }
  | {
      ok: false;
      code:
        | "conversation_failed"
        | "chat_failed"
        | "auth_failed"
        | "empty_reply"
        | "network";
      error: string;
      status?: number;
      conversationId?: string;
    };

export async function ensureActiveConversation(args: {
  workspaceId: string;
  conversationId?: string | null;
  /** Always create a new conversation (next-day / after finished session). */
  forceNew?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; conversationId: string }
  | { ok: false; code: "conversation_failed" | "auth_failed" | "network"; error: string; status?: number }
> {
  if (args.conversationId && !args.forceNew) {
    return { ok: true, conversationId: args.conversationId };
  }

  const fetchFn = args.fetchImpl ?? fetch;
  try {
    const response = await fetchFn("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ workspaceId: args.workspaceId }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      conversation?: { id?: string };
      error?: string;
      message?: string;
    };
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: "auth_failed",
        error: data.message || data.error || "Sign in again to keep talking.",
        status: response.status,
      };
    }
    if (!response.ok || !data.conversation?.id) {
      return {
        ok: false,
        code: "conversation_failed",
        error: data.message || data.error || "Couldn't start the conversation. Try again.",
        status: response.status,
      };
    }
    return { ok: true, conversationId: data.conversation.id };
  } catch {
    return {
      ok: false,
      code: "network",
      error: "Network issue. Please try again.",
    };
  }
}

/**
 * Sends transcript through the existing workspace /api/chat path.
 * Reuse the same clientMessageId on retry so appendMessage dedupes the athlete turn.
 */
export async function sendVoiceChatTurn(args: {
  workspaceId: string;
  conversationId: string;
  content: string;
  clientMessageId: string;
  fetchImpl?: typeof fetch;
}): Promise<VoiceChatResult> {
  const fetchFn = args.fetchImpl ?? fetch;
  try {
    const response = await fetchFn("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        workspaceId: args.workspaceId,
        conversationId: args.conversationId,
        content: args.content,
        clientMessageId: args.clientMessageId,
        client: VOICE_CHAT_CLIENT,
        mode: "chat",
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      reply?: string;
      messageId?: string;
      demoMode?: boolean;
      error?: string;
      message?: string;
      code?: string;
    };

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: "auth_failed",
        error: data.message || data.error || "Sign in again to keep talking.",
        status: response.status,
        conversationId: args.conversationId,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        code: "chat_failed",
        error:
          data.message ||
          data.error ||
          "AthleteOS couldn’t continue the conversation. Please try again.",
        status: response.status,
        conversationId: args.conversationId,
      };
    }

    const reply = typeof data.reply === "string" ? data.reply.trim() : "";
    if (!reply) {
      return {
        ok: false,
        code: "empty_reply",
        error: "AthleteOS couldn’t continue the conversation. Please try again.",
        status: response.status,
        conversationId: args.conversationId,
      };
    }

    return {
      ok: true,
      reply,
      messageId: data.messageId,
      conversationId: args.conversationId,
      demoMode: Boolean(data.demoMode),
    };
  } catch {
    return {
      ok: false,
      code: "network",
      error: "Network issue. Please try again.",
      conversationId: args.conversationId,
    };
  }
}

/** Fire-and-forget style memory checkpoint using the existing workspace /api/memory path. */
export async function requestVoiceMemoryCheckpoint(args: {
  workspaceId: string;
  conversationId: string;
  reason: "checkpoint" | "correction" | "pre_insights" | "session_complete";
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const fetchFn = args.fetchImpl ?? fetch;
  try {
    const response = await fetchFn("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        workspaceId: args.workspaceId,
        conversationId: args.conversationId,
        reason: args.reason,
      }),
    });
    if (!response.ok) return false;
    const data = (await response.json().catch(() => ({}))) as { memory?: unknown };
    return Boolean(data.memory);
  } catch {
    return false;
  }
}

export type VoiceInsightsResult =
  | {
      ok: true;
      report: unknown;
      spokenSynthesis: string | null;
      patternId: string | null;
      reflectionId: string | null;
      priorityId: string | null;
      alreadyFinalized?: boolean;
      demoMode?: boolean;
    }
  | {
      ok: false;
      code: "insights_failed" | "insufficient_context" | "auth_failed" | "network";
      error: string;
      status?: number;
    };

/** Canonical session finalize via existing /api/insights (+ optional spokenSynthesis). */
export async function requestVoiceInsights(args: {
  workspaceId: string;
  conversationId: string;
  fetchImpl?: typeof fetch;
}): Promise<VoiceInsightsResult> {
  const fetchFn = args.fetchImpl ?? fetch;
  try {
    const response = await fetchFn("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        workspaceId: args.workspaceId,
        conversationId: args.conversationId,
        client: VOICE_CHAT_CLIENT,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      report?: unknown;
      spokenSynthesis?: string;
      patternId?: string;
      reflectionId?: string;
      priorityId?: string;
      alreadyFinalized?: boolean;
      demoMode?: boolean;
      error?: string;
      message?: string;
      code?: string;
    };

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: "auth_failed",
        error: data.message || data.error || "Sign in again to keep talking.",
        status: response.status,
      };
    }

    if (response.status === 422 || data.code === "insufficient_context") {
      return {
        ok: false,
        code: "insufficient_context",
        error:
          data.message ||
          data.error ||
          "Need a bit more of your story before I can share a careful reflection.",
        status: response.status,
      };
    }

    if (!response.ok || !data.report) {
      return {
        ok: false,
        code: "insights_failed",
        error:
          data.message ||
          data.error ||
          "AthleteOS couldn’t finish the reflection right now.",
        status: response.status,
      };
    }

    return {
      ok: true,
      report: data.report,
      spokenSynthesis:
        typeof data.spokenSynthesis === "string" && data.spokenSynthesis.trim()
          ? data.spokenSynthesis.trim()
          : null,
      patternId: data.patternId ?? null,
      reflectionId: data.reflectionId ?? null,
      priorityId: data.priorityId ?? null,
      alreadyFinalized: Boolean(data.alreadyFinalized),
      demoMode: Boolean(data.demoMode),
    };
  } catch {
    return {
      ok: false,
      code: "network",
      error: "Network issue. Please try again.",
    };
  }
}

/** Map Yes / Kind of / No onto existing pattern feedback responses. */
export async function submitVoiceInsightFamiliarity(args: {
  workspaceId: string;
  patternId: string;
  answer: "yes" | "kind_of" | "no";
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const responseMap = {
    yes: "agree",
    kind_of: "partially_agree",
    no: "disagree",
  } as const;
  const fetchFn = args.fetchImpl ?? fetch;
  try {
    const response = await fetchFn(`/api/patterns/${args.patternId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        workspaceId: args.workspaceId,
        response: responseMap[args.answer],
        note: `Did you already know this? ${args.answer}`,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
