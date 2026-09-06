"use client";

import { useRef, useState } from "react";
import { uploadRecordingForTranscription } from "@/lib/upload-transcription";
import {
  errorCopy,
  formatElapsed,
  VOICE_PROMPT,
  type VoiceRecordingErrorCode,
  type VoiceRecordingState,
} from "@/lib/voice-recording";
import { useVoiceRecorder, type CompletedRecording } from "@/hooks/useVoiceRecorder";

type VoiceHomeProps = {
  workspaceId: string;
};

type FlowOverlay = "none" | "transcribing" | "transcript_ready" | "flow_error";

/**
 * Voice-first athlete home.
 * Flow: idle → listening → stop → transcribing → transcript_ready
 * Transcript is shown for verification only; not sent into AthleteOS intelligence yet.
 *
 * Raw-audio lifecycle (client):
 * 1. Blob/object URL while recording / pending upload
 * 2. multipart upload to /api/transcribe
 * 3. on success: revoke URL + drop Blob/File
 * 4. on failure: keep local recording for one-tap retry
 */
export default function VoiceHome({ workspaceId }: VoiceHomeProps) {
  const [overlay, setOverlay] = useState<FlowOverlay>("none");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<VoiceRecordingErrorCode | null>(null);
  const [pendingRecording, setPendingRecording] = useState<CompletedRecording | null>(null);
  const uploadTokenRef = useRef(0);

  const {
    state: recorderState,
    elapsedMs,
    errorCode: recorderError,
    start,
    stop,
    cancel,
    retry,
    clearRecording,
  } = useVoiceRecorder({
    onRecordingComplete: (recording) => {
      setPendingRecording(recording);
      void runTranscribe(recording);
    },
  });

  async function runTranscribe(target: CompletedRecording) {
    const token = ++uploadTokenRef.current;
    setOverlay("transcribing");
    setFlowError(null);
    setTranscript(null);

    const result = await uploadRecordingForTranscription({
      file: target.file,
      workspaceId,
    });

    if (token !== uploadTokenRef.current) return;

    if (!result.ok) {
      setPendingRecording(target);
      setFlowError(
        result.code === "empty_transcript"
          ? "empty_transcript"
          : result.code === "auth_failed"
            ? "auth_failed"
            : result.code === "stt_failed"
              ? "stt_failed"
              : "upload_failed",
      );
      setOverlay("flow_error");
      return;
    }

    clearRecording();
    setPendingRecording(null);
    setTranscript(result.text);
    setOverlay("transcript_ready");
  }

  function recordAgain() {
    uploadTokenRef.current += 1;
    setTranscript(null);
    setFlowError(null);
    setPendingRecording(null);
    setOverlay("none");
    clearRecording();
    retry();
  }

  function retryUpload() {
    if (!pendingRecording) {
      recordAgain();
      return;
    }
    void runTranscribe(pendingRecording);
  }

  function beginTalk() {
    setOverlay("none");
    setTranscript(null);
    setFlowError(null);
    void start();
  }

  const phase: VoiceRecordingState =
    overlay === "transcribing"
      ? "transcribing"
      : overlay === "transcript_ready"
        ? "transcript_ready"
        : overlay === "flow_error"
          ? "error"
          : recorderState === "recorded"
            ? "transcribing"
            : recorderState;

  const displayError = flowError ?? recorderError;
  const showIdle = phase === "idle" || phase === "requesting_permission";
  const showRecorderError = phase === "error" && overlay !== "flow_error";

  return (
    <main className="voice-shell" data-voice-state={phase}>
      <div className="voice-stage">
        <span className="eyebrow">AthleteOS</span>

        {showIdle ? (
          <>
            <h1 className="voice-prompt">{VOICE_PROMPT}</h1>
            <button
              type="button"
              className="voice-mic"
              aria-label="Tap to talk"
              disabled={phase === "requesting_permission"}
              onClick={beginTalk}
            >
              <MicIcon />
            </button>
            <p className="voice-hint">
              {phase === "requesting_permission" ? "Allow microphone access…" : "Tap to talk"}
            </p>
          </>
        ) : null}

        {phase === "listening" ? (
          <>
            <p className="voice-status listening">Listening…</p>
            <p className="voice-timer" aria-live="polite">
              {formatElapsed(elapsedMs)}
            </p>
            <button type="button" className="voice-mic voice-mic-active" aria-label="Stop recording" onClick={stop}>
              <StopIcon />
            </button>
            <div className="voice-actions">
              <button type="button" className="secondary" onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={stop}>
                Stop
              </button>
            </div>
          </>
        ) : null}

        {phase === "transcribing" ? (
          <>
            <p className="voice-status listening" aria-live="polite">
              Transcribing…
            </p>
            <p className="voice-hint">Sending your recording securely</p>
            <div className="voice-mic voice-mic-active voice-mic-busy" aria-hidden="true">
              <MicIcon />
            </div>
          </>
        ) : null}

        {phase === "transcript_ready" && transcript ? (
          <>
            <p className="voice-status">Here&apos;s what we heard:</p>
            <p className="voice-transcript" data-testid="voice-transcript">
              {transcript}
            </p>
            <div className="voice-actions">
              <button type="button" className="secondary" onClick={recordAgain}>
                Record again
              </button>
            </div>
            <p className="voice-dev-note">
              Temporary preview — next pass sends this text into the existing chat pipeline.
            </p>
          </>
        ) : null}

        {phase === "error" ? (
          <>
            <p className="voice-status" role="alert">
              {errorCopy(displayError ?? "unknown")}
            </p>
            <div className="voice-actions">
              {overlay === "flow_error" && pendingRecording && displayError !== "empty_transcript" ? (
                <button type="button" className="primary" onClick={retryUpload}>
                  Try again
                </button>
              ) : (
                <button type="button" className="primary" onClick={recordAgain}>
                  Try again
                </button>
              )}
              {overlay === "flow_error" && pendingRecording ? (
                <button type="button" className="secondary" onClick={recordAgain}>
                  Record again
                </button>
              ) : showRecorderError ? (
                <button type="button" className="voice-mic" aria-label="Try again" onClick={recordAgain}>
                  <MicIcon />
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

function MicIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
