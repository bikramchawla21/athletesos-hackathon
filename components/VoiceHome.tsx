"use client";

import { useEffect, useRef, useState } from "react";
import { createMessageId } from "@/lib/message-id.mjs";
import {
  looksLikeAthleteCorrection,
  shouldSyncMemoryCheckpoint,
} from "@/lib/memory-guards.mjs";
import { fetchSpeechAudio } from "@/lib/fetch-speech";
import {
  looksLikeAnythingElsePrompt,
  shouldFinalizeVoiceSession,
} from "@/lib/session-end.mjs";
import { uploadRecordingForTranscription } from "@/lib/upload-transcription";
import {
  ensureActiveConversation,
  requestVoiceInsights,
  requestVoiceMemoryCheckpoint,
  sendVoiceChatTurn,
  submitVoiceInsightFamiliarity,
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
  | "finalizing"
  | "speaking_insight"
  | "finished"
  | "flow_error";

type PendingChat = {
  transcript: string;
  clientMessageId: string;
};

/**
 * Voice-first athlete home.
 * Flow: talk turns → optional natural end / Done → finalize insights → speak synthesis → feedback → finished
 */
export default function VoiceHome({
  workspaceId,
  conversationId: initialConversationId,
  initialUserTurnCount = 0,
}: VoiceHomeProps) {
  const [overlay, setOverlay] = useState<FlowOverlay>("none");
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [spokenInsight, setSpokenInsight] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<VoiceRecordingErrorCode | null>(null);
  const [pendingRecording, setPendingRecording] = useState<CompletedRecording | null>(null);
  const [pendingChat, setPendingChat] = useState<PendingChat | null>(null);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [speechFailed, setSpeechFailed] = useState(false);
  const [insightSpeechFailed, setInsightSpeechFailed] = useState(false);
  const [patternId, setPatternId] = useState<string | null>(null);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const askedAnythingElseRef = useRef(false);
  const [sessionFinished, setSessionFinished] = useState(false);

  const uploadTokenRef = useRef(0);
  const chatInFlightRef = useRef(false);
  const speechInFlightRef = useRef(false);
  const finalizeInFlightRef = useRef(false);
  const userTurnCountRef = useRef(initialUserTurnCount);
  const lastSyncedUserTurnCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const insightAudioModeRef = useRef(false);

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
    setInsightSpeechFailed(false);
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
      if (looksLikeAnythingElsePrompt(chat.reply)) {
        askedAnythingElseRef.current = true;
      }

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

      const shouldEnd = shouldFinalizeVoiceSession({
        userTurnCount: userTurns,
        athleteText: turn.transcript,
        askedAnythingElse: askedAnythingElseRef.current,
      });

      if (shouldEnd) {
        await runFinalization(ensured.conversationId, token);
        return;
      }

      await runSpeech(chat.reply, token, "turn");
    } finally {
      chatInFlightRef.current = false;
    }
  }

  async function runFinalization(activeConversationId: string, token = ++uploadTokenRef.current) {
    if (finalizeInFlightRef.current) return;
    finalizeInFlightRef.current = true;
    setOverlay("finalizing");
    setFlowError(null);
    setNeedsTapToPlay(false);
    setInsightSpeechFailed(false);
    cleanupPlayback();

    try {
      void requestVoiceMemoryCheckpoint({
        workspaceId,
        conversationId: activeConversationId,
        reason: "pre_insights",
      });

      const insights = await requestVoiceInsights({
        workspaceId,
        conversationId: activeConversationId,
      });

      if (token !== uploadTokenRef.current) return;

      if (!insights.ok) {
        setFlowError(
          insights.code === "auth_failed"
            ? "auth_failed"
            : insights.code === "insufficient_context"
              ? "insufficient_context"
              : "insights_failed",
        );
        setOverlay("flow_error");
        return;
      }

      setPatternId(insights.patternId);
      setSessionFinished(true);
      void requestVoiceMemoryCheckpoint({
        workspaceId,
        conversationId: activeConversationId,
        reason: "session_complete",
      });

      const synthesis =
        insights.spokenSynthesis ||
        "Thanks for talking today. We’ll keep building on what showed up.";
      setSpokenInsight(synthesis);
      await runSpeech(synthesis, token, "insight");
    } finally {
      finalizeInFlightRef.current = false;
    }
  }

  async function runSpeech(
    text: string,
    token = uploadTokenRef.current,
    mode: "turn" | "insight" = "turn",
  ) {
    if (!text.trim()) {
      if (mode === "insight") setOverlay("finished");
      else setOverlay("ready_again");
      return;
    }
    if (speechInFlightRef.current) return;
    speechInFlightRef.current = true;
    insightAudioModeRef.current = mode === "insight";
    setOverlay(mode === "insight" ? "speaking_insight" : "speaking");
    setNeedsTapToPlay(false);
    if (mode === "insight") setInsightSpeechFailed(false);
    else setSpeechFailed(false);
    cleanupPlayback();

    try {
      const speech = await fetchSpeechAudio({ text, workspaceId });
      if (token !== uploadTokenRef.current) return;

      if (!speech.ok) {
        if (mode === "insight") {
          setInsightSpeechFailed(true);
          setOverlay("finished");
        } else {
          setSpeechFailed(true);
          setFlowError(speech.code === "auth_failed" ? "auth_failed" : "speech_failed");
          setOverlay("ready_again");
        }
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
        if (insightAudioModeRef.current) {
          setInsightSpeechFailed(false);
          setOverlay("finished");
        } else {
          setSpeechFailed(false);
          setOverlay("ready_again");
        }
      };
      audio.onerror = () => {
        cleanupPlayback();
        if (insightAudioModeRef.current) {
          setInsightSpeechFailed(true);
          setOverlay("finished");
        } else {
          setSpeechFailed(true);
          setFlowError("speech_failed");
          setOverlay("ready_again");
        }
      };

      try {
        await audio.play();
      } catch {
        setNeedsTapToPlay(true);
        setOverlay(mode === "insight" ? "finished" : "ready_again");
      }
    } finally {
      speechInFlightRef.current = false;
    }
  }

  function stopSpeaking() {
    const wasInsight = insightAudioModeRef.current;
    uploadTokenRef.current += 1;
    speechInFlightRef.current = false;
    cleanupPlayback();
    setNeedsTapToPlay(false);
    setSpeechFailed(false);
    setInsightSpeechFailed(false);
    setOverlay(wasInsight || sessionFinished ? "finished" : "ready_again");
  }

  function retryAudio() {
    if (sessionFinished && spokenInsight) {
      void runSpeech(spokenInsight, uploadTokenRef.current, "insight");
      return;
    }
    if (!assistantReply) return;
    setFlowError(null);
    void runSpeech(assistantReply, uploadTokenRef.current, "turn");
  }

  async function tapToHear() {
    const text = sessionFinished ? spokenInsight : assistantReply;
    if (!text) return;
    setNeedsTapToPlay(false);
    setOverlay(sessionFinished ? "speaking_insight" : "speaking");
    const audio = audioRef.current;
    if (audio) {
      try {
        await audio.play();
        return;
      } catch {
        // regenerate
      }
    }
    void runSpeech(text, uploadTokenRef.current, sessionFinished ? "insight" : "turn");
  }

  function markDone() {
    if (finalizeInFlightRef.current || overlay === "finalizing" || sessionFinished) return;
    if (userTurnCountRef.current < 1) return;
    void runFinalization(conversationId);
  }

  async function submitFamiliarity(answer: "yes" | "kind_of" | "no") {
    if (!patternId || feedbackSaved) {
      setFeedbackSaved(true);
      return;
    }
    await submitVoiceInsightFamiliarity({
      workspaceId,
      patternId,
      answer,
    });
    setFeedbackSaved(true);
  }

  function skipFeedback() {
    setFeedbackSaved(true);
  }

  function recordAgain() {
    uploadTokenRef.current += 1;
    chatInFlightRef.current = false;
    speechInFlightRef.current = false;
    finalizeInFlightRef.current = false;
    cleanupPlayback();
    setAssistantReply(null);
    setLastTranscript(null);
    setSpokenInsight(null);
    setFlowError(null);
    setPendingRecording(null);
    setPendingChat(null);
    setNeedsTapToPlay(false);
    setSpeechFailed(false);
    setInsightSpeechFailed(false);
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

  function retryFinalize() {
    setFlowError(null);
    void runFinalization(conversationId);
  }

  async function beginTalk() {
    if (
      overlay === "thinking" ||
      overlay === "transcribing" ||
      overlay === "speaking" ||
      overlay === "speaking_insight" ||
      overlay === "finalizing"
    ) {
      return;
    }

    uploadTokenRef.current += 1;
    chatInFlightRef.current = false;
    speechInFlightRef.current = false;
    finalizeInFlightRef.current = false;
    cleanupPlayback();
    setNeedsTapToPlay(false);
    setSpeechFailed(false);
    setInsightSpeechFailed(false);
    setFlowError(null);
    setPendingRecording(null);
    setPendingChat(null);
    setAssistantReply(null);
    setLastTranscript(null);

    if (sessionFinished || overlay === "finished") {
      const created = await ensureActiveConversation({
        workspaceId,
        forceNew: true,
      });
      if (!created.ok) {
        setFlowError(
          created.code === "auth_failed" ? "auth_failed" : "conversation_failed",
        );
        setOverlay("flow_error");
        return;
      }
      setConversationId(created.conversationId);
      userTurnCountRef.current = 0;
      lastSyncedUserTurnCountRef.current = 0;
      askedAnythingElseRef.current = false;
      setSessionFinished(false);
      setSpokenInsight(null);
      setPatternId(null);
      setFeedbackSaved(false);
    }

    setOverlay("none");
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
            : overlay === "finalizing"
              ? "finalizing"
              : overlay === "speaking_insight"
                ? "speaking_insight"
                : overlay === "finished"
                  ? "finished"
                  : overlay === "flow_error"
                    ? "error"
                    : recorderState === "recorded"
                      ? "transcribing"
                      : recorderState;

  const displayError = flowError ?? recorderError;
  const showIdle = phase === "idle" || phase === "requesting_permission";
  const showReadyAgain =
    phase === "ready_again" || (showIdle && Boolean(assistantReply) && !pendingChat && !sessionFinished);
  const canRetryChat =
    overlay === "flow_error" && Boolean(pendingChat) && !pendingRecording;
  const canRetryUpload =
    overlay === "flow_error" && Boolean(pendingRecording) && displayError !== "empty_transcript";
  const canRetryFinalize =
    overlay === "flow_error" &&
    (displayError === "insights_failed" || displayError === "insufficient_context");

  return (
    <main className="voice-shell" data-voice-state={phase} data-conversation-id={conversationId}>
      <div className="voice-stage">
        <span className="eyebrow">AthleteOS</span>

        {showIdle && !assistantReply && !sessionFinished ? (
          <>
            <h1 className="voice-prompt">{VOICE_PROMPT}</h1>
            <button
              type="button"
              className="voice-mic"
              aria-label="Tap to talk"
              disabled={phase === "requesting_permission"}
              onClick={() => void beginTalk()}
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
                  onClick={() => void beginTalk()}
                >
                  <MicIcon />
                </button>
                <p className="voice-hint">
                  {phase === "requesting_permission" ? "Allow microphone access…" : "Tap to talk"}
                </p>
                <button type="button" className="voice-done-link" onClick={markDone}>
                  Done
                </button>
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

        {phase === "speaking" || phase === "speaking_insight" ? (
          <>
            <p className="voice-status listening" aria-live="polite">
              AthleteOS is speaking…
            </p>
            <p className="voice-reply voice-reply-secondary" data-testid="voice-reply">
              {phase === "speaking_insight" ? spokenInsight : assistantReply}
            </p>
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

        {phase === "finalizing" ? (
          <>
            <p className="voice-status listening" aria-live="polite">
              Understanding…
            </p>
            <p className="voice-hint">Finishing today’s reflection</p>
            <div className="voice-mic voice-mic-active voice-mic-busy" aria-hidden="true">
              <MicIcon />
            </div>
          </>
        ) : null}

        {phase === "finished" ? (
          <>
            <p className="voice-status">Done for today.</p>
            {spokenInsight ? (
              <p className="voice-reply" data-testid="voice-insight">
                {spokenInsight}
              </p>
            ) : null}
            {needsTapToPlay ? (
              <div className="voice-actions">
                <button type="button" className="primary" onClick={() => void tapToHear()}>
                  Tap to hear AthleteOS
                </button>
              </div>
            ) : null}
            {insightSpeechFailed && !needsTapToPlay ? (
              <div className="voice-actions">
                <button type="button" className="primary" onClick={retryAudio}>
                  Retry audio
                </button>
              </div>
            ) : null}
            {patternId && !feedbackSaved ? (
              <div className="voice-feedback">
                <p className="voice-hint">Did you already know this?</p>
                <div className="voice-actions">
                  <button type="button" className="secondary" onClick={() => void submitFamiliarity("yes")}>
                    Yes
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void submitFamiliarity("kind_of")}
                  >
                    Kind of
                  </button>
                  <button type="button" className="secondary" onClick={() => void submitFamiliarity("no")}>
                    No
                  </button>
                </div>
                <button type="button" className="voice-done-link" onClick={skipFeedback}>
                  Skip
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="voice-mic"
                  aria-label="Talk about another day"
                  onClick={() => void beginTalk()}
                >
                  <MicIcon />
                </button>
                <p className="voice-hint">Talk about how your day went.</p>
              </>
            )}
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
              {canRetryFinalize ? (
                <button type="button" className="primary" onClick={retryFinalize}>
                  Retry finishing
                </button>
              ) : canRetryChat ? (
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
              {canRetryFinalize ? (
                <button type="button" className="secondary" onClick={() => void beginTalk()}>
                  Keep talking
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
