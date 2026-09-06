/** Shared voice-recording constants and pure helpers (no browser APIs). */

export const VOICE_PROMPT = "Talk about how your day went.";

/** Hard stop — do not allow indefinite recording. */
export const MAX_RECORDING_MS = 3 * 60 * 1000;

/**
 * Browser MIME negotiation (MediaRecorder.isTypeSupported):
 * - iPhone Safari / Home Screen PWA: typically `audio/mp4` (AAC in MP4 / m4a)
 * - Chrome desktop / Android: typically `audio/webm;codecs=opus` or `audio/webm`
 * Preference order tries iOS-friendly containers first, then webm/ogg.
 * OpenAI gpt-4o-mini-transcribe accepts these without client-side transcoding.
 */
export type VoiceRecordingState =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "recorded"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "ready_again"
  | "finalizing"
  | "speaking_insight"
  | "finished"
  | "error";

export type VoiceRecordingErrorCode =
  | "permission_denied"
  | "unsupported"
  | "no_microphone"
  | "recording_failed"
  | "upload_failed"
  | "empty_transcript"
  | "stt_failed"
  | "auth_failed"
  | "chat_failed"
  | "conversation_failed"
  | "speech_failed"
  | "insights_failed"
  | "insufficient_context"
  | "unknown";

const PREFERRED_MIME_TYPES = [
  "audio/mp4",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg",
] as const;

export function pickSupportedMimeType(
  isTypeSupported: (mime: string) => boolean,
): string | null {
  for (const mime of PREFERRED_MIME_TYPES) {
    try {
      if (isTypeSupported(mime)) return mime;
    } catch {
      // ignore
    }
  }
  return null;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function errorCopy(code: VoiceRecordingErrorCode): string {
  switch (code) {
    case "permission_denied":
      return "Microphone access is needed to talk to AthleteOS.";
    case "unsupported":
      return "This browser can’t record audio for AthleteOS yet.";
    case "no_microphone":
      return "No microphone was found.";
    case "recording_failed":
      return "Recording didn’t work. Try again.";
    case "upload_failed":
      return "Couldn't send that. Try again.";
    case "empty_transcript":
      return "We didn’t quite catch that. Try again.";
    case "stt_failed":
      return "Couldn't send that. Try again.";
    case "auth_failed":
      return "Sign in again to keep talking.";
    case "chat_failed":
      return "AthleteOS couldn’t continue. Try again — you don’t need to re-record.";
    case "conversation_failed":
      return "Couldn't start the conversation. Try again.";
    case "speech_failed":
      return "Couldn't play AthleteOS. Retry audio — your reply is saved.";
    case "insights_failed":
      return "Couldn't finish today’s reflection. Retry finishing — your conversation is saved.";
    case "insufficient_context":
      return "Need a bit more of your story before I can share a careful reflection.";
    default:
      return "Something went wrong. Try again.";
  }
}

export function extensionForMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  return "audio";
}

/**
 * Build a File ready for POST /api/transcribe multipart upload.
 */
export function recordingToFile(blob: Blob, mimeType: string, recordedAt = new Date()): File {
  const ext = extensionForMime(mimeType || blob.type || "audio/webm");
  const name = `athleteos-${recordedAt.toISOString().replace(/[:.]/g, "-")}.${ext}`;
  return new File([blob], name, { type: mimeType || blob.type || "application/octet-stream" });
}
