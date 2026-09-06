/** Shared voice-recording constants and pure helpers (no browser APIs). */

export const VOICE_PROMPT = "Talk about how your day went.";

/** Hard stop — do not allow indefinite recording. */
export const MAX_RECORDING_MS = 3 * 60 * 1000;

export type VoiceRecordingState =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "recorded"
  | "error";

export type VoiceRecordingErrorCode =
  | "permission_denied"
  | "unsupported"
  | "no_microphone"
  | "recording_failed"
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
 * Build a File ready for a future POST /api/transcribe multipart upload.
 * Next Agent pass can send this directly.
 */
export function recordingToFile(blob: Blob, mimeType: string, recordedAt = new Date()): File {
  const ext = extensionForMime(mimeType || blob.type || "audio/webm");
  const name = `athleteos-${recordedAt.toISOString().replace(/[:.]/g, "-")}.${ext}`;
  return new File([blob], name, { type: mimeType || blob.type || "application/octet-stream" });
}
