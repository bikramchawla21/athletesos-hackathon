/**
 * Client helper: upload a completed MediaRecorder File to POST /api/transcribe.
 * Uses same-origin credentials (Clerk session cookie). Does not call /api/chat.
 */

export type TranscribeClientResult =
  | { ok: true; text: string }
  | {
      ok: false;
      code: "upload_failed" | "empty_transcript" | "stt_failed" | "auth_failed";
      error: string;
      status?: number;
    };

export async function uploadRecordingForTranscription(args: {
  file: File;
  workspaceId?: string;
  fetchImpl?: typeof fetch;
}): Promise<TranscribeClientResult> {
  const form = new FormData();
  form.append("file", args.file, args.file.name);
  if (args.workspaceId) {
    form.append("workspaceId", args.workspaceId);
  }

  const fetchFn = args.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchFn("/api/transcribe", {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
  } catch {
    return {
      ok: false,
      code: "upload_failed",
      error: "Couldn't send that. Try again.",
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      code: "auth_failed",
      error: "Sign in again to keep talking.",
      status: response.status,
    };
  }

  let payload: { text?: string; error?: string; message?: string; code?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const code = payload.code;
    if (code === "EMPTY_TRANSCRIPT" || response.status === 422) {
      return {
        ok: false,
        code: "empty_transcript",
        error: payload.error || payload.message || "We didn’t quite catch that. Try again.",
        status: response.status,
      };
    }
    if (response.status >= 500) {
      return {
        ok: false,
        code: "stt_failed",
        error: "Couldn't send that. Try again.",
        status: response.status,
      };
    }
    return {
      ok: false,
      code: "upload_failed",
      error: payload.error || payload.message || "Couldn't send that. Try again.",
      status: response.status,
    };
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    return {
      ok: false,
      code: "empty_transcript",
      error: "We didn’t quite catch that. Try again.",
      status: response.status,
    };
  }

  return { ok: true, text };
}
