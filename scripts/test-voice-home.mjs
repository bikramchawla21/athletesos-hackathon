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

  it("picks a supported mime type when available", () => {
    assert.equal(
      pickSupportedMimeType((mime) => mime === "audio/webm"),
      "audio/webm",
    );
    assert.equal(
      pickSupportedMimeType(() => false),
      null,
    );
  });

  it("builds a File suitable for future multipart STT upload", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    const file = recordingToFile(blob, "audio/webm", new Date("2026-01-02T03:04:05.000Z"));
    assert.equal(file.type, "audio/webm");
    assert.match(file.name, /\.webm$/);
    assert.ok(file.size > 0);
  });

  it("maps permission errors to athlete-facing copy", () => {
    assert.match(errorCopy("permission_denied"), /Microphone access is needed/);
  });
});

describe("voice home wiring", () => {
  it("athlete workspace defaults to VoiceHome with locked prompt", () => {
    const page = readFileSync(join(__dirname, "../app/app/w/[workspaceId]/page.tsx"), "utf8");
    const home = readFileSync(join(__dirname, "../components/VoiceHome.tsx"), "utf8");
    assert.match(page, /VoiceHome/);
    assert.match(page, /view === "classic"/);
    assert.match(home, /VOICE_PROMPT/);
    assert.match(home, /useVoiceRecorder/);
    assert.doesNotMatch(home, /fetch\s*\(/);
    assert.doesNotMatch(home, /openai/i);
  });

  it("recorder hook uses getUserMedia and MediaRecorder only", () => {
    const source = readFileSync(join(__dirname, "../hooks/useVoiceRecorder.ts"), "utf8");
    assert.match(source, /getUserMedia/);
    assert.match(source, /MediaRecorder/);
    assert.match(source, /MAX_RECORDING_MS/);
    assert.match(source, /revokeObjectURL/);
    assert.doesNotMatch(source, /openai/i);
    assert.doesNotMatch(source, /fetch\s*\(/);
  });
});
