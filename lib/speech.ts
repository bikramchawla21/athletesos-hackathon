import OpenAI from "openai";

/** Concise AthleteOS replies + short spoken insight closings. */
export const MAX_SPEECH_CHARS = 1200;

export const SPEECH_MODEL = "gpt-4o-mini-tts";

/**
 * Fixed V1 AthleteOS voice.
 * `ash` — calm, clear, grounded; pairs well with concise performance coaching.
 */
export const ATHLETEOS_TTS_VOICE = "ash" as const;

export const ATHLETEOS_TTS_INSTRUCTIONS =
  "Speak calmly and confidently as a sharp training partner. Warm and grounded, never theatrical. Conversational pace. No therapist tone, no motivational hype, no cheerleading, no robotic narration.";

export const SPEECH_RESPONSE_FORMAT = "mp3" as const;
export const SPEECH_CONTENT_TYPE = "audio/mpeg";

export type SpeechValidationError = {
  status: 400;
  code: "EMPTY_TEXT" | "TEXT_TOO_LONG";
  error: string;
};

export function validateSpeechText(text: unknown): SpeechValidationError | { ok: true; text: string } {
  if (typeof text !== "string" || !text.trim()) {
    return {
      status: 400,
      code: "EMPTY_TEXT",
      error: "Text is required.",
    };
  }
  const trimmed = text.trim();
  if (trimmed.length > MAX_SPEECH_CHARS) {
    return {
      status: 400,
      code: "TEXT_TOO_LONG",
      error: "Text is too long for speech.",
    };
  }
  return { ok: true, text: trimmed };
}

/**
 * Server-side TTS. Returns raw MP3 bytes. Never persist the audio.
 */
export async function synthesizeSpeechAudio(args: {
  text: string;
  apiKey?: string;
  speechClient?: {
    create: (input: {
      text: string;
      model: string;
      voice: string;
      instructions: string;
      responseFormat: string;
    }) => Promise<ArrayBuffer>;
  };
}): Promise<
  | { ok: true; audio: ArrayBuffer; byteLength: number }
  | { ok: false; status: number; code: string; error: string }
> {
  const validated = validateSpeechText(args.text);
  if (!("ok" in validated)) {
    return {
      ok: false,
      status: validated.status,
      code: validated.code,
      error: validated.error,
    };
  }

  const apiKey = args.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim() || apiKey.includes("replace_me")) {
    return {
      ok: false,
      status: 503,
      code: "TTS_UNAVAILABLE",
      error: "Speech is not configured.",
    };
  }

  try {
    const speechClient =
      args.speechClient ??
      (() => {
        const client = new OpenAI({ apiKey });
        return {
          async create(input: {
            text: string;
            model: string;
            voice: string;
            instructions: string;
            responseFormat: string;
          }) {
            const response = await client.audio.speech.create({
              model: input.model,
              voice: input.voice as "ash",
              input: input.text,
              instructions: input.instructions,
              response_format: input.responseFormat as "mp3",
            });
            return await response.arrayBuffer();
          },
        };
      })();

    const started = Date.now();
    const audio = await speechClient.create({
      text: validated.text,
      model: SPEECH_MODEL,
      voice: ATHLETEOS_TTS_VOICE,
      instructions: ATHLETEOS_TTS_INSTRUCTIONS,
      responseFormat: SPEECH_RESPONSE_FORMAT,
    });

    console.info("[speech] tts_ok", {
      chars: validated.text.length,
      bytes: audio.byteLength,
      durationMs: Date.now() - started,
      voice: ATHLETEOS_TTS_VOICE,
      format: SPEECH_RESPONSE_FORMAT,
    });

    if (!audio.byteLength) {
      return {
        ok: false,
        status: 502,
        code: "TTS_FAILED",
        error: "Couldn't generate speech. Try again.",
      };
    }

    return { ok: true, audio, byteLength: audio.byteLength };
  } catch (error) {
    console.error("[speech]", {
      code: "TTS_FAILED",
      chars: validated.text.length,
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      status: 502,
      code: "TTS_FAILED",
      error: "Couldn't generate speech. Try again.",
    };
  }
}
