/** Client-safe pilot event names + recorder (no transcript content). */

export const PILOT_EVENT_NAMES = [
  "athlete_activated",
  "session_started",
  "session_recovered",
  "recording_started",
  "transcription_succeeded",
  "transcription_failed",
  "message_persisted",
  "assistant_response_generated",
  "tts_succeeded",
  "tts_failed",
  "session_completed",
  "insight_generated",
  "insight_feedback",
  "session_interrupted",
] as const;

export type PilotEventName = (typeof PILOT_EVENT_NAMES)[number];

const FORBIDDEN_PROP_KEYS = new Set([
  "transcript",
  "text",
  "content",
  "message",
  "reply",
  "audio",
  "spokenSynthesis",
  "report",
]);

/** Strip accidental private content keys from event props. */
export function sanitizePilotEventProps(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!props) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_PROP_KEYS.has(key)) continue;
    if (typeof value === "string" && value.length > 200) continue;
    out[key] = value;
  }
  return out;
}

export function isPilotEventName(value: string): value is PilotEventName {
  return (PILOT_EVENT_NAMES as readonly string[]).includes(value);
}

let cachedClientSessionId: string | null = null;

export function getOrCreateClientSessionId(): string {
  if (cachedClientSessionId) return cachedClientSessionId;
  try {
    const key = "athleteos:pilot_session_id";
    const existing = sessionStorage.getItem(key);
    if (existing) {
      cachedClientSessionId = existing;
      return existing;
    }
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ps_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, id);
    cachedClientSessionId = id;
    return id;
  } catch {
    cachedClientSessionId = `ps_${Date.now()}`;
    return cachedClientSessionId;
  }
}

/** Fire-and-forget pilot event (never throws into product flow). */
export function recordPilotEvent(args: {
  name: PilotEventName;
  workspaceId: string;
  conversationId?: string | null;
  props?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): void {
  const fetchFn = args.fetchImpl ?? fetch;
  const body = {
    workspaceId: args.workspaceId,
    conversationId: args.conversationId ?? undefined,
    name: args.name,
    props: sanitizePilotEventProps(args.props),
    clientSessionId: getOrCreateClientSessionId(),
  };
  try {
    void fetchFn("/api/pilot-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      // ignore
    });
  } catch {
    // ignore
  }
}
