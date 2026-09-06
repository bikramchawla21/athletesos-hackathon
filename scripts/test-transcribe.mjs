import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_TRANSCRIBE_BYTES,
  TRANSCRIBE_MODEL,
  isAllowedAudioMime,
  isBlankTranscript,
  normalizeTranscript,
  transcribeAudioFile,
  validateTranscribeUpload,
} from "../lib/transcribe.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function fakeFile(args) {
  const size = args.bytes ?? 12;
  const data = new Uint8Array(size).fill(1);
  return new File([data], args.name ?? "rec.webm", {
    type: args.type ?? "audio/webm",
  });
}

describe("transcribe validation", () => {
  it("rejects missing file", () => {
    const err = validateTranscribeUpload({ file: null });
    assert.equal(err?.code, "MISSING_FILE");
    assert.equal(err?.status, 400);
  });

  it("rejects empty file", () => {
    const err = validateTranscribeUpload({ file: fakeFile({ bytes: 0 }) });
    assert.equal(err?.code, "EMPTY_FILE");
    assert.equal(err?.status, 400);
  });

  it("rejects oversized file", () => {
    const err = validateTranscribeUpload({
      file: fakeFile({ bytes: MAX_TRANSCRIBE_BYTES + 1 }),
    });
    assert.equal(err?.code, "FILE_TOO_LARGE");
    assert.equal(err?.status, 413);
  });

  it("rejects unsupported content types", () => {
    assert.equal(isAllowedAudioMime("text/plain"), false);
    const err = validateTranscribeUpload({
      file: fakeFile({ type: "text/plain" }),
    });
    assert.equal(err?.code, "UNSUPPORTED_TYPE");
  });

  it("allows browser audio types including empty mime", () => {
    assert.equal(isAllowedAudioMime("audio/mp4"), true);
    assert.equal(isAllowedAudioMime("audio/webm;codecs=opus"), true);
    assert.equal(isAllowedAudioMime("video/webm"), true);
    assert.equal(isAllowedAudioMime(""), true);
  });
});

describe("transcribeAudioFile", () => {
  it("returns { text } for a valid mocked STT response", async () => {
    const result = await transcribeAudioFile({
      file: fakeFile({}),
      apiKey: "sk-test",
      modelClient: {
        async transcribe(input) {
          assert.equal(input.model, TRANSCRIBE_MODEL);
          assert.ok(input.file.size > 0);
          return { text: "  Practice was good today.  " };
        },
      },
    });
    assert.deepEqual(result, { ok: true, text: "Practice was good today." });
  });

  it("handles OpenAI failure safely without throwing", async () => {
    const result = await transcribeAudioFile({
      file: fakeFile({}),
      apiKey: "sk-test",
      modelClient: {
        async transcribe() {
          throw new Error("upstream boom");
        },
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "STT_FAILED");
      assert.equal(result.status, 502);
    }
  });

  it("treats blank STT output as empty transcript", async () => {
    const result = await transcribeAudioFile({
      file: fakeFile({}),
      apiKey: "sk-test",
      modelClient: {
        async transcribe() {
          return { text: "   " };
        },
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "EMPTY_TRANSCRIPT");
      assert.equal(result.status, 422);
    }
  });

  it("normalizes whitespace for blank detection", () => {
    assert.equal(normalizeTranscript("  a  b "), "a b");
    assert.equal(isBlankTranscript("\n\t"), true);
  });
});

describe("transcribe route privacy + auth wiring", () => {
  it("route requires auth, uses gpt-4o-mini-transcribe, and does not persist audio", () => {
    const route = readFileSync(join(__dirname, "../app/api/transcribe/route.ts"), "utf8");
    const lib = readFileSync(join(__dirname, "../lib/transcribe.ts"), "utf8");
    const middleware = readFileSync(join(__dirname, "../middleware.ts"), "utf8");

    assert.match(middleware, /\/api\/transcribe/);
    assert.match(route, /requireAuthenticatedPerson/);
    assert.match(route, /requireWorkspaceMembership/);
    assert.match(lib, /gpt-4o-mini-transcribe/);
    assert.doesNotMatch(route, /\b(db\.|drizzle|writeFileSync|@aws-sdk|S3Client)\b/);
    assert.doesNotMatch(lib, /\b(db\.|drizzle|writeFileSync|@aws-sdk|S3Client)\b/);
    assert.match(route, /No Neon write/);
    assert.doesNotMatch(route, /\/api\/chat/);
    assert.doesNotMatch(route, /AthleteMemory|memory_items/);
  });
});
