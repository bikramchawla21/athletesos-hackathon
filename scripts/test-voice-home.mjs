import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VOICE_PROMPT,
  MAX_RECORDING_MS,
  errorCopy,
  formatElapsed,
  pickSupportedMimeType,
  recordingToFile,
} from "../lib/voice-recording.ts";
import { uploadRecordingForTranscription } from "../lib/upload-transcription.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("voice recording helpers", () => {
  it("locks the primary athlete prompt copy", () => {
    assert.equal(VOICE_PROMPT, "Talk about how your day went.");
  });

  it("caps recording at three minutes", () => {
    assert.equal(MAX_RECORDING_MS, 180_000);
  });

  it("formats elapsed time as mm:ss", () => {
    assert.equal(formatElapsed(0), "00:00");
    assert.equal(formatElapsed(37_000), "00:37");
    assert.equal(formatElapsed(125_000), "02:05");
  });

  it("picks iOS-friendly mime before webm when both supported", () => {
    assert.equal(
      pickSupportedMimeType((mime) => mime === "audio/mp4" || mime.startsWith("audio/webm")),
      "audio/mp4",
    );
    assert.equal(
      pickSupportedMimeType((mime) => mime === "audio/webm"),
      "audio/webm",
    );
    assert.equal(
      pickSupportedMimeType(() => false),
      null,
    );
  });

  it("builds a File suitable for multipart STT upload", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    const file = recordingToFile(blob, "audio/webm", new Date("2026-01-02T03:04:05.000Z"));
    assert.equal(file.type, "audio/webm");
    assert.match(file.name, /\.webm$/);
    assert.ok(file.size > 0);
  });

  it("maps permission and upload errors to athlete-facing copy", () => {
    assert.match(errorCopy("permission_denied"), /Microphone access is needed/);
    assert.match(errorCopy("upload_failed"), /Couldn't send that/);
    assert.match(errorCopy("empty_transcript"), /didn’t quite catch that|didn't quite catch that/);
  });
});

describe("uploadRecordingForTranscription", () => {
  it("posts multipart file and returns transcript text", async () => {
    const file = new File([new Uint8Array([9, 9])], "a.webm", { type: "audio/webm" });
    const result = await uploadRecordingForTranscription({
      file,
      workspaceId: "11111111-1111-1111-1111-111111111111",
      fetchImpl: async (url, init) => {
        assert.equal(url, "/api/transcribe");
        assert.equal(init?.method, "POST");
        assert.ok(init?.body instanceof FormData);
        const body = init.body;
        assert.ok(body.get("file") instanceof File);
        assert.equal(body.get("workspaceId"), "11111111-1111-1111-1111-111111111111");
        return new Response(JSON.stringify({ text: "Practice was good today." }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    assert.deepEqual(result, { ok: true, text: "Practice was good today." });
  });

  it("maps empty transcript responses for retry UX", async () => {
    const file = new File([new Uint8Array([9])], "a.webm", { type: "audio/webm" });
    const result = await uploadRecordingForTranscription({
      file,
      fetchImpl: async () =>
        new Response(JSON.stringify({ code: "EMPTY_TRANSCRIPT", error: "We didn’t quite catch that. Try again." }), {
          status: 422,
        }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "empty_transcript");
  });

  it("keeps upload failure distinct so local audio can be retried", async () => {
    const file = new File([new Uint8Array([9])], "a.webm", { type: "audio/webm" });
    const result = await uploadRecordingForTranscription({
      file,
      fetchImpl: async () => {
        throw new TypeError("network down");
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "upload_failed");
  });
});

describe("voice home wiring", () => {
  it("athlete workspace defaults to VoiceHome with locked prompt and chat handoff", () => {
    const page = readFileSync(join(__dirname, "../app/app/w/[workspaceId]/page.tsx"), "utf8");
    const home = readFileSync(join(__dirname, "../components/VoiceHome.tsx"), "utf8");
    assert.match(page, /VoiceHome/);
    assert.match(page, /view === "classic"/);
    assert.match(page, /conversationId=\{conversation\.id\}/);
    assert.match(home, /VOICE_PROMPT/);
    assert.match(home, /useVoiceRecorder/);
    assert.match(home, /transcribing/);
    assert.match(home, /thinking/);
    assert.match(home, /response_ready/);
    assert.match(home, /uploadRecordingForTranscription/);
    assert.match(home, /sendVoiceChatTurn/);
    assert.doesNotMatch(home, /\/api\/speech/);
  });

  it("recorder hook uses getUserMedia and MediaRecorder only", () => {
    const source = readFileSync(join(__dirname, "../hooks/useVoiceRecorder.ts"), "utf8");
    assert.match(source, /getUserMedia/);
    assert.match(source, /MediaRecorder/);
    assert.match(source, /MAX_RECORDING_MS/);
    assert.match(source, /revokeObjectURL/);
    assert.doesNotMatch(source, /openai/i);
    assert.doesNotMatch(source, /\/api\/chat/);
  });

  it("successful transcription path clears temporary audio; chat failures keep pending transcript", () => {
    const home = readFileSync(join(__dirname, "../components/VoiceHome.tsx"), "utf8");
    assert.match(home, /clearRecording\(\)/);
    assert.match(home, /setPendingRecording\(target\)/);
    assert.match(home, /setPendingChat/);
    assert.match(home, /retryChat/);
    assert.match(home, /retryUpload/);
  });
});
