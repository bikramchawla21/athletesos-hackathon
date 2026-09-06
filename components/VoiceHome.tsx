"use client";

import { useEffect, useRef, useState } from "react";
import { createMessageId } from "@/lib/message-id.mjs";
import {
  looksLikeAthleteCorrection,
  shouldSyncMemoryCheckpoint,
} from "@/lib/memory-guards.mjs";
import { fetchSpeechAudio } from "@/lib/fetch-speech";
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
  | "speaking"
  | "ready_again"
  | "flow_error";

type PendingChat = {
  transcript: string;
  clientMessageId: string;
};

/**
 * Voice-first athlete home.
 * Flow: idle → listening → transcribing → thinking → speaking → ready_again
 *
 * Chat text remains canonical. TTS is ephemeral output only.
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
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [speechFailed, setSpeechFailed] = useState(false);

  const uploadTokenRef = useRef(0);
  const chatInFlightRef = useRef(false);
  const speechInFlightRef = useRef(false);
  const userTurnCountRef = useRef(initialUserTurnCount);
  const lastSyncedUserTurnCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

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

  function cleanupPlayback() {
    try {
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      }
    } catch {
      // ignore
    }
    audioRef.current = null;
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {
        // ignore
      }
      objectUrlRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      cleanupPlayback();
    };
  }, []);

  async function runTranscribe(target: CompletedRecording) {
    const token = ++uploadTokenRef.current;
    cleanupPlayback();
    setNeedsTapToPlay(false);
    setSpeechFailed(false);
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

    // Mic tracks already released by recorder finalize before this upload.
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
    setNeedsTapToPlay(false);
    setSpeechFailed(false);

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
        setFlowError(chat.code === "auth_failed" ? "auth_failed" : "chat_failed");
        setOverlay("flow_error");
        return;
      }

      userTurnCountRef.current += 1;
      setPendingChat(null);
      setAssistantReply(chat.reply);

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

      await runSpeech(chat.reply, token);
    } finally {
      chatInFlightRef.current = false;
    }
  }

  async function runSpeech(text: string, token = uploadTokenRef.current) {
    if (!text.trim()) {
      setOverlay("ready_again");
      return;
    }
    if (speechInFlightRef.current) return;
    speechInFlightRef.current = true;
    setOverlay("speaking");
    setNeedsTapToPlay(false);
    setSpeechFailed(false);
    cleanupPlayback();

    try {
      const speech = await fetchSpeechAudio({ text, workspaceId });
      if (token !== uploadTokenRef.current) return;

      if (!speech.ok) {
        setSpeechFailed(true);
        setFlowError(speech.code === "auth_failed" ? "auth_failed" : "speech_failed");
        setOverlay("ready_again");
        return;
      }

      const url = URL.createObjectURL(speech.blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audio.preload = "auto";
      audioRef.current = audio;

      audio.onended = () => {
        cleanupPlayback();
        setNeedsTapToPlay(false);
        setSpeechFailed(false);
        setOverlay("ready_again");
      };
      audio.onerror = () => {
        cleanupPlayback();
        setSpeechFailed(true);
        setFlowError("speech_failed");
        setOverlay("ready_again");
      };

      try {
        await audio.play();
      } catch {
        // iOS / browser autoplay restriction after mic session.
        setNeedsTapToPlay(true);
        setOverlay("ready_again");
      }
    } finally {
      speechInFlightRef.current = false;
    }
  }

  function stopSpeaking() {
    uploadTokenRef.current += 1;
    speechInFlightRef.current = false;
    cleanupPlayback();
    setNeedsTapToPlay(false);
    setSpeechFailed(false);
    setOverlay("ready_again");
  }

  function retryAudio() {
    if (!assistantReply) return;
    setFlowError(null);
    void runSpeech(assistantReply);
  }

  async function tapToHear() {
    if (!assistantReply) return;
    setNeedsTapToPlay(false);
    setOverlay("speaking");
    const audio = audioRef.current;
    if (audio) {
      try {
        await audio.play();
        return;
      } catch {
        // fall through to regenerate
      }
    }
    void runSpeech(assistantReply);
  }

  function recordAgain() {
    uploadTokenRef.current += 1;
    chatInFlightRef.current = false;
    speechInFlightRef.current = false;
    cleanupPlayback();
    setAssistantReply(null);
    setLastTranscript(null);
    setFlowError(null);
    setPendingRecording(null);
    setPendingChat(null);
    setNeedsTapToPlay(false);
    setSpeechFailed(false);
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
    if (overlay === "thinking" || overlay === "transcribing" || overlay === "speaking") return;
    uploadTokenRef.current += 1;
    chatInFlightRef.current = false;
    speechInFlightRef.current = false;
    cleanupPlayback();
    setNeedsTapToPlay(false);
    setSpeechFailed(false);
    setOverlay("none");
    setFlowError(null);
    setPendingRecording(null);
    setPendingChat(null);
    void start();
  }

  const phase: VoiceRecordingState =
    overlay === "transcribing"
      ? "transcribing"
      : overlay === "thinking"
        ? "thinking"
        : overlay === "speaking"
          ? "speaking"
          : overlay === "ready_again"
            ? "ready_again"
            : overlay === "flow_error"
              ? "error"
              : recorderState === "recorded"
                ? "transcribing"
                : recorderState;

  const displayError = flowError ?? recorderError;
  const showIdle = phase === "idle" || phase === "requesting_permission";
  const showReadyAgain =
    phase === "ready_again" || (showIdle && Boolean(assistantReply) && !pendingChat);
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

        {showReadyAgain && assistantReply ? (
          <>
            <p className="voice-status">AthleteOS</p>
            <p className="voice-reply" data-testid="voice-reply">
              {assistantReply}
            </p>
            {lastTranscript ? (
              <p className="voice-dev-note">You said: {lastTranscript}</p>
            ) : null}
            {needsTapToPlay ? (
              <div className="voice-actions">
                <button type="button" className="primary" onClick={() => void tapToHear()}>
                  Tap to hear AthleteOS
                </button>
              </div>
            ) : null}
            {speechFailed && !needsTapToPlay ? (
              <div className="voice-actions">
                <button type="button" className="primary" onClick={retryAudio}>
                  Retry audio
                </button>
              </div>
            ) : null}
            {!needsTapToPlay ? (
              <>
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

        {phase === "speaking" ? (
          <>
            <p className="voice-status listening" aria-live="polite">
              AthleteOS is speaking…
            </p>
            {assistantReply ? (
              <p className="voice-reply voice-reply-secondary" data-testid="voice-reply">
                {assistantReply}
              </p>
            ) : null}
            <div className="voice-mic voice-mic-active voice-mic-busy" aria-hidden="true">
              <MicIcon />
            </div>
            <div className="voice-actions">
              <button type="button" className="secondary" onClick={stopSpeaking}>
                Stop
              </button>
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
