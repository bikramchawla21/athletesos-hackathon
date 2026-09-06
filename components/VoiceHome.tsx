"use client";

import { errorCopy, formatElapsed, VOICE_PROMPT } from "@/lib/voice-recording";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

type VoiceHomeProps = {
  /** Reserved for next Agent pass (STT → chat). */
  workspaceId: string;
};

/**
 * Voice-first athlete home.
 * Exposes completed recording via useVoiceRecorder().recording.file for the next STT pass.
 */
export default function VoiceHome({ workspaceId }: VoiceHomeProps) {
  const {
    state,
    elapsedMs,
    errorCode,
    recording,
    start,
    stop,
    cancel,
    retry,
    clearRecording,
  } = useVoiceRecorder();

  // Keep workspaceId referenced so the next pass can wire STT without prop churn.
  void workspaceId;

  return (
    <main className="voice-shell" data-voice-state={state}>
      <div className="voice-stage">
        <span className="eyebrow">AthleteOS</span>

        {state === "idle" || state === "requesting_permission" ? (
          <>
            <h1 className="voice-prompt">{VOICE_PROMPT}</h1>
            <button
              type="button"
              className="voice-mic"
              aria-label="Tap to talk"
              disabled={state === "requesting_permission"}
              onClick={() => void start()}
            >
              <MicIcon />
            </button>
            <p className="voice-hint">
              {state === "requesting_permission" ? "Allow microphone access…" : "Tap to talk"}
            </p>
          </>
        ) : null}

        {state === "listening" ? (
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

        {state === "recorded" && recording ? (
          <>
            <p className="voice-status">Got it.</p>
            <p className="voice-hint">
              {formatElapsed(recording.durationMs)} · temporary local recording
            </p>
            <audio className="voice-playback" controls src={recording.objectUrl} preload="metadata" />
            <div className="voice-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  clearRecording();
                  retry();
                }}
              >
                Record again
              </button>
              <button
                type="button"
                className="primary"
                disabled
                title="Transcription arrives in the next pilot pass"
              >
                Continue
              </button>
            </div>
            <p className="voice-dev-note">
              Next pass will upload <code>recording.file</code> for transcription.
            </p>
          </>
        ) : null}

        {state === "error" ? (
          <>
            <p className="voice-status" role="alert">
              {errorCopy(errorCode ?? "unknown")}
            </p>
            <button type="button" className="voice-mic" aria-label="Try again" onClick={retry}>
              <MicIcon />
            </button>
            <div className="voice-actions">
              <button type="button" className="primary" onClick={retry}>
                Try again
              </button>
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
