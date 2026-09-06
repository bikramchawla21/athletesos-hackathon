"use client";

import { useRef, useState } from "react";
import { createMessageId } from "@/lib/message-id.mjs";
import {
  looksLikeAthleteCorrection,
  shouldSyncMemoryCheckpoint,
} from "@/lib/memory-guards.mjs";
import { uploadRecordingForTranscription } from "@/lib/upload-transcription";
import {
  ensureActiveConversation,
  requestVoiceMemoryCheckpoint,
  sendVoiceChatTurn,
} from "@/lib/voice-chat";
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
  conversationId: string;
  initialUserTurnCount?: number;
};

type FlowOverlay =
  | "none"
  | "transcribing"
  | "thinking"
  | "response_ready"
  | "flow_error";

type PendingChat = {
  transcript: string;
  clientMessageId: string;
};

/**
 * Voice-first athlete home.
 * Flow: idle → listening → transcribing → thinking → response_ready → ready again
 *
 * Transcript auto-enters existing /api/chat + AthleteMemory (same path as typed chat).
 * TTS is intentionally not implemented in this pass.
 */
export default function VoiceHome({
  workspaceId,
  conversationId: initialConversationId,
  initialUserTurnCount = 0,
}: VoiceHomeProps) {
  const [overlay, setOverlay] = useState<FlowOverlay>("none");
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<VoiceRecordingErrorCode | null>(null);
  const [pendingRecording, setPendingRecording] = useState<CompletedRecording | null>(null);
  const [pendingChat, setPendingChat] = useState<PendingChat | null>(null);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const uploadTokenRef = useRef(0);
  const chatInFlightRef = useRef(false);
  const userTurnCountRef = useRef(initialUserTurnCount);
  const lastSyncedUserTurnCountRef = useRef(0);

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
    setAssistantReply(null);

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
    const transcript = result.text;
    setLastTranscript(transcript);
    const clientMessageId = createMessageId();
    setPendingChat({ transcript, clientMessageId });
    await runChat({ transcript, clientMessageId });
  }

  async function runChat(turn: PendingChat) {
    if (chatInFlightRef.current) return;
    chatInFlightRef.current = true;
    const token = ++uploadTokenRef.current;
    setOverlay("thinking");
    setFlowError(null);

    try {
      const ensured = await ensureActiveConversation({
        workspaceId,
        conversationId,
      });
      if (token !== uploadTokenRef.current) return;
      if (!ensured.ok) {
        setPendingChat(turn);
        setFlowError(
          ensured.code === "auth_failed"
            ? "auth_failed"
            : ensured.code === "conversation_failed"
              ? "conversation_failed"
              : "chat_failed",
        );
        setOverlay("flow_error");
        return;
      }

      if (ensured.conversationId !== conversationId) {
        setConversationId(ensured.conversationId);
      }

      const chat = await sendVoiceChatTurn({
        workspaceId,
        conversationId: ensured.conversationId,
        content: turn.transcript,
        clientMessageId: turn.clientMessageId,
      });

      if (token !== uploadTokenRef.current) return;

      if (!chat.ok) {
        setPendingChat(turn);
        setFlowError(
          chat.code === "auth_failed" ? "auth_failed" : "chat_failed",
        );
        setOverlay("flow_error");
        return;
      }

      userTurnCountRef.current += 1;
      setPendingChat(null);
      setAssistantReply(chat.reply);
      setOverlay("response_ready");

      const userTurns = userTurnCountRef.current;
      const correction = looksLikeAthleteCorrection(turn.transcript);
      if (correction) {
        void requestVoiceMemoryCheckpoint({
          workspaceId,
          conversationId: ensured.conversationId,
          reason: "correction",
        });
        lastSyncedUserTurnCountRef.current = userTurns;
      } else if (shouldSyncMemoryCheckpoint(userTurns, lastSyncedUserTurnCountRef.current)) {
        void requestVoiceMemoryCheckpoint({
          workspaceId,
          conversationId: ensured.conversationId,
          reason: "checkpoint",
        });
        lastSyncedUserTurnCountRef.current = userTurns;
      }
    } finally {
      chatInFlightRef.current = false;
    }
  }

  function recordAgain() {
    uploadTokenRef.current += 1;
    chatInFlightRef.current = false;
    setAssistantReply(null);
    setLastTranscript(null);
    setFlowError(null);
    setPendingRecording(null);
    setPendingChat(null);
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

  function retryChat() {
    if (!pendingChat) {
      if (pendingRecording) {
        retryUpload();
        return;
      }
      recordAgain();
      return;
    }
    void runChat(pendingChat);
  }

  function beginTalk() {
    if (overlay === "thinking" || overlay === "transcribing") return;
    uploadTokenRef.current += 1;
    chatInFlightRef.current = false;
    setOverlay("none");
    setFlowError(null);
    setPendingRecording(null);
    setPendingChat(null);
    // Keep last assistant reply visible until new speech starts; cleared on next STT.
    void start();
  }

  const phase: VoiceRecordingState =
    overlay === "transcribing"
      ? "transcribing"
      : overlay === "thinking"
        ? "thinking"
        : overlay === "response_ready"
          ? "response_ready"
          : overlay === "flow_error"
            ? "error"
            : recorderState === "recorded"
              ? "transcribing"
              : recorderState;

  const displayError = flowError ?? recorderError;
  const showIdle = phase === "idle" || phase === "requesting_permission";
  const showReplySurface =
    Boolean(assistantReply) &&
    (phase === "response_ready" || showIdle);
  const canRetryChat =
    overlay === "flow_error" && Boolean(pendingChat) && !pendingRecording;
  const canRetryUpload =
    overlay === "flow_error" && Boolean(pendingRecording) && displayError !== "empty_transcript";

  return (
    <main className="voice-shell" data-voice-state={phase} data-conversation-id={conversationId}>
      <div className="voice-stage">
        <span className="eyebrow">AthleteOS</span>

        {showIdle && !assistantReply ? (
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

        {showReplySurface && assistantReply ? (
          <>
            <p className="voice-status">AthleteOS</p>
            <p className="voice-reply" data-testid="voice-reply">
              {assistantReply}
            </p>
            {lastTranscript ? (
              <p className="voice-dev-note">You said: {lastTranscript}</p>
            ) : null}
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

        {phase === "thinking" ? (
          <>
            <p className="voice-status listening" aria-live="polite">
              Thinking…
            </p>
            {lastTranscript ? (
              <p className="voice-dev-note">You said: {lastTranscript}</p>
            ) : null}
            <div className="voice-mic voice-mic-active voice-mic-busy" aria-hidden="true">
              <MicIcon />
            </div>
          </>
        ) : null}

        {phase === "error" ? (
          <>
            <p className="voice-status" role="alert">
              {errorCopy(displayError ?? "unknown")}
            </p>
            {pendingChat ? (
              <p className="voice-dev-note">Saved what you said so you can retry without re-recording.</p>
            ) : null}
            <div className="voice-actions">
              {canRetryChat ? (
                <button type="button" className="primary" onClick={retryChat}>
                  Try again
                </button>
              ) : canRetryUpload ? (
                <button type="button" className="primary" onClick={retryUpload}>
                  Try again
                </button>
              ) : (
                <button type="button" className="primary" onClick={recordAgain}>
                  Try again
                </button>
              )}
              {(pendingRecording || pendingChat) && displayError !== "empty_transcript" ? (
                <button type="button" className="secondary" onClick={recordAgain}>
                  Record again
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
