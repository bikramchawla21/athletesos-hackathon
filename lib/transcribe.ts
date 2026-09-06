import OpenAI, { toFile } from "openai";

/** ~3 minutes of compressed audio with headroom for iOS m4a. */
export const MAX_TRANSCRIBE_BYTES = 12 * 1024 * 1024;

export const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

const ALLOWED_MIME_PREFIXES = [
  "audio/",
  "video/webm", // some browsers label webm audio this way
  "application/octet-stream",
];

export type TranscribeValidationError = {
  status: 400 | 413;
  code:
    | "MISSING_FILE"
    | "EMPTY_FILE"
    | "FILE_TOO_LARGE"
    | "UNSUPPORTED_TYPE";
  error: string;
};

export type TranscribeSuccess = {
  text: string;
};

export function isAllowedAudioMime(mime: string | null | undefined): boolean {
  const value = (mime ?? "").trim().toLowerCase();
  if (!value) return true; // browsers sometimes omit type; OpenAI still accepts by filename
  return ALLOWED_MIME_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function validateTranscribeUpload(args: {
  file: File | null | undefined;
}): TranscribeValidationError | null {
  if (!args.file) {
    return {
      status: 400,
      code: "MISSING_FILE",
      error: "Audio file is required.",
    };
  }
  if (args.file.size <= 0) {
    return {
      status: 400,
      code: "EMPTY_FILE",
      error: "Recording was empty.",
    };
  }
  if (args.file.size > MAX_TRANSCRIBE_BYTES) {
    return {
      status: 413,
      code: "FILE_TOO_LARGE",
      error: "Recording is too long. Keep it under about 3 minutes.",
    };
  }
  if (!isAllowedAudioMime(args.file.type)) {
    return {
      status: 400,
      code: "UNSUPPORTED_TYPE",
      error: "Unsupported audio format.",
    };
  }
  return null;
}

/** True when the upload looks like a real File (Node/undici File or browser File). */
export function isUploadFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).size === "number" &&
    typeof (value as File).name === "string"
  );
}

export function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isBlankTranscript(text: string): boolean {
  return normalizeTranscript(text).length === 0;
}

/**
 * Server-side STT. Caller must never persist the file bytes.
 */
export async function transcribeAudioFile(args: {
  file: File | null | undefined;
  apiKey?: string;
  modelClient?: {
    transcribe: (input: {
      file: File;
      model: string;
    }) => Promise<{ text: string }>;
  };
}): Promise<
  | { ok: true; text: string }
  | { ok: false; status: number; code: string; error: string }
> {
  const validation = validateTranscribeUpload({ file: args.file });
  if (validation) {
    return {
      ok: false,
      status: validation.status,
      code: validation.code,
      error: validation.error,
    };
  }

  const file = args.file as File;

  const apiKey = args.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim() || apiKey.includes("replace_me")) {
    return {
      ok: false,
      status: 503,
      code: "STT_UNAVAILABLE",
      error: "Speech transcription is not configured.",
    };
  }

  try {
    const modelClient =
      args.modelClient ??
      (() => {
        const client = new OpenAI({ apiKey });
        return {
          async transcribe(input: { file: File; model: string }) {
            const upload = await toFile(
              Buffer.from(await input.file.arrayBuffer()),
              input.file.name || "recording.audio",
              { type: input.file.type || undefined },
            );
            const result = await client.audio.transcriptions.create({
              file: upload,
              model: input.model,
            });
            const text =
              typeof result === "string"
                ? result
                : typeof (result as { text?: string }).text === "string"
                  ? (result as { text: string }).text
                  : "";
            return { text };
          },
        };
      })();

    const started = Date.now();
    const result = await modelClient.transcribe({
      file,
      model: TRANSCRIBE_MODEL,
    });
    console.info("[transcribe] stt_ok", {
      mime: file.type || null,
      size: file.size,
      durationMs: Date.now() - started,
      textChars: (result.text ?? "").length,
    });
    const text = normalizeTranscript(result.text ?? "");
    if (isBlankTranscript(text)) {
      return {
        ok: false,
        status: 422,
        code: "EMPTY_TRANSCRIPT",
        error: "We didn’t quite catch that. Try again.",
      };
    }
    return { ok: true, text };
  } catch (error) {
    console.error("[transcribe]", {
      code: "STT_FAILED",
      mime: file.type || null,
      size: file.size,
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      status: 502,
      code: "STT_FAILED",
      error: "Couldn't transcribe that. Try again.",
    };
  }
}
