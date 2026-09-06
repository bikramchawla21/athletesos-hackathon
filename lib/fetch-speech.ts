/**
 * Client helper: fetch ephemeral TTS audio from POST /api/speech.
 * Does not call /api/chat. Retry-safe relative to conversation/memory.
 */

const SPEECH_CONTENT_TYPE = "audio/mpeg";

export type FetchSpeechResult =
  | { ok: true; blob: Blob }
  | {
      ok: false;
      code: "auth_failed" | "speech_failed" | "empty_audio" | "network";
      error: string;
      status?: number;
    };

export async function fetchSpeechAudio(args: {
  text: string;
  workspaceId?: string;
  fetchImpl?: typeof fetch;
}): Promise<FetchSpeechResult> {
  const fetchFn = args.fetchImpl ?? fetch;
  try {
    const response = await fetchFn("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        text: args.text,
        ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
      }),
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: "auth_failed",
        error: "Sign in again to keep talking.",
        status: response.status,
      };
    }

    if (!response.ok) {
      let message = "Couldn't generate speech. Try again.";
      try {
        const data = (await response.json()) as { error?: string; message?: string };
        message = data.message || data.error || message;
      } catch {
        // binary/error body
      }
      return {
        ok: false,
        code: "speech_failed",
        error: message,
        status: response.status,
      };
    }

    const blob = await response.blob();
    if (!blob.size) {
      return {
        ok: false,
        code: "empty_audio",
        error: "Couldn't generate speech. Try again.",
        status: response.status,
      };
    }

    const type = blob.type || SPEECH_CONTENT_TYPE;
    return {
      ok: true,
      blob: type === blob.type ? blob : new Blob([blob], { type }),
    };
  } catch {
    return {
      ok: false,
      code: "network",
      error: "Couldn't generate speech. Try again.",
    };
  }
}
