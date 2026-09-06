import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATHLETEOS_TTS_INSTRUCTIONS,
  ATHLETEOS_TTS_VOICE,
  MAX_SPEECH_CHARS,
  SPEECH_CONTENT_TYPE,
  SPEECH_MODEL,
  SPEECH_RESPONSE_FORMAT,
  synthesizeSpeechAudio,
  validateSpeechText,
} from "../lib/speech.ts";
import { fetchSpeechAudio } from "../lib/fetch-speech.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("speech validation", () => {
  it("rejects empty text", () => {
    const err = validateSpeechText("   ");
    assert.equal("ok" in err, false);
    if (!("ok" in err)) {
      assert.equal(err.code, "EMPTY_TEXT");
      assert.equal(err.status, 400);
    }
  });

  it("rejects oversized text", () => {
    const err = validateSpeechText("x".repeat(MAX_SPEECH_CHARS + 1));
    assert.equal("ok" in err, false);
    if (!("ok" in err)) {
      assert.equal(err.code, "TEXT_TOO_LONG");
    }
  });

  it("accepts concise AthleteOS replies", () => {
    const ok = validateSpeechText(
      "That shows up most when the score gets tight. What changes in your intention on the second serve?",
    );
    assert.equal("ok" in ok && ok.ok, true);
  });
});

describe("synthesizeSpeechAudio", () => {
  it("returns audio bytes for a mocked TTS client", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const result = await synthesizeSpeechAudio({
      text: "What changed under pressure?",
      apiKey: "sk-test",
      speechClient: {
        async create(input) {
          assert.equal(input.model, SPEECH_MODEL);
          assert.equal(input.voice, ATHLETEOS_TTS_VOICE);
          assert.equal(input.responseFormat, SPEECH_RESPONSE_FORMAT);
          assert.match(input.instructions, /calmly|confidently/i);
          return bytes;
        },
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.byteLength, 4);
  });

  it("handles OpenAI failure safely", async () => {
    const result = await synthesizeSpeechAudio({
      text: "What changed under pressure?",
      apiKey: "sk-test",
      speechClient: {
        async create() {
          throw new Error("upstream boom");
        },
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "TTS_FAILED");
      assert.equal(result.status, 502);
    }
  });
});

describe("fetchSpeechAudio client", () => {
  it("posts text and returns an audio blob", async () => {
    const result = await fetchSpeechAudio({
      text: "What changed under pressure?",
      workspaceId: "11111111-1111-1111-1111-111111111111",
      fetchImpl: async (url, init) => {
        assert.equal(url, "/api/speech");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.text, "What changed under pressure?");
        return new Response(new Uint8Array([9, 9, 9]), {
          status: 200,
          headers: { "Content-Type": SPEECH_CONTENT_TYPE },
        });
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.blob.size > 0);
  });

  it("maps TTS failures without touching chat", async () => {
    const result = await fetchSpeechAudio({
      text: "Hello",
      fetchImpl: async () =>
        new Response(JSON.stringify({ code: "TTS_FAILED", error: "Couldn't generate speech. Try again." }), {
          status: 502,
        }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "speech_failed");
  });
});

describe("speech route privacy + auth wiring", () => {
  it("protects /api/speech, uses gpt-4o-mini-tts, and does not persist audio", () => {
    const route = readFileSync(join(__dirname, "../app/api/speech/route.ts"), "utf8");
    const lib = readFileSync(join(__dirname, "../lib/speech.ts"), "utf8");
    const middleware = readFileSync(join(__dirname, "../middleware.ts"), "utf8");
    const home = readFileSync(join(__dirname, "../components/VoiceHome.tsx"), "utf8");

    assert.match(middleware, /\/api\/speech/);
    assert.match(route, /requireAuthenticatedPerson/);
    assert.match(lib, /gpt-4o-mini-tts/);
    assert.equal(ATHLETEOS_TTS_VOICE, "ash");
    assert.match(ATHLETEOS_TTS_INSTRUCTIONS, /training partner/i);
    assert.equal(SPEECH_CONTENT_TYPE, "audio/mpeg");
    assert.doesNotMatch(route, /\b(db\.|drizzle|writeFileSync|@aws-sdk|S3Client)\b/);
    assert.doesNotMatch(lib, /\b(db\.|drizzle|writeFileSync)\b/);
    assert.match(route, /no-store/);
    assert.match(home, /fetchSpeechAudio/);
    assert.match(home, /speaking/);
    assert.match(home, /ready_again/);
    assert.match(home, /Retry audio/);
    assert.match(home, /Tap to hear AthleteOS/);
    assert.match(home, /stopSpeaking/);
    assert.match(home, /revokeObjectURL/);
    // Retry audio must not re-invoke chat
    assert.match(home, /function retryAudio[\s\S]*runSpeech\(assistantReply\)/);
    assert.doesNotMatch(home, /retryAudio[\s\S]{0,80}runChat/);
  });
});
