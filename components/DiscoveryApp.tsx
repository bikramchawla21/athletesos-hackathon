"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeAthleteMemory,
  normalizeConversationMessages,
} from "@/lib/request-contract.mjs";
import {
  looksLikeAthleteCorrection,
  nextRelationshipStage,
  shouldSyncMemoryCheckpoint,
} from "@/lib/memory-guards.mjs";
import { createEmptyAthleteMemory } from "@/lib/memory.mjs";
import { OPENING_MESSAGE_ID, createMessageId } from "@/lib/message-id.mjs";
import {
  PERSISTED_STATE_VERSION,
  STORAGE_KEY,
  clearAthleteOsStorage,
  loadPersistedState,
  savePersistedState,
} from "@/lib/persistence.mjs";
import { canSendMessage, shouldApplyChatResult, shouldApplyInsightsResult, shouldClearChatLoading } from "@/lib/ui-guards.mjs";
import { relationshipMarkerCopy } from "@/lib/chat.mjs";
import type { AppStage, AthleteMemory, Message, ReflectionReport } from "@/lib/types";

type PendingRetry =
  | { kind: "chat"; messages: Message[]; userMessage?: Message }
  | { kind: "insights"; messages: Message[] }
  | { kind: "reopen" }
  | null;

export type DiscoveryAppProps = {
  mode?: "anonymous" | "workspace";
  workspaceId?: string;
  conversationId?: string;
  initialStage?: AppStage;
  initialMessages?: Message[];
  initialMemory?: AthleteMemory;
  initialReport?: ReflectionReport | null;
};

const openingMessage: Message = {
  id: OPENING_MESSAGE_ID,
  role: "assistant",
  content:
    "Hi.\nI’m AthleteOS.\n\nI’m looking forward to getting to know you.\n\nThe better I understand your journey, the better we’ll think through your performance together.\n\nWhenever you’re ready, I’m listening.",
};

const CLIENT_TIMEOUT_MS = 30_000;
const PERSIST_DEBOUNCE_MS = 300;

export default function DiscoveryApp({
  mode = "anonymous",
  workspaceId,
  conversationId: initialConversationId,
  initialStage = "welcome",
  initialMessages,
  initialMemory,
  initialReport = null,
}: DiscoveryAppProps) {
  const isWorkspace = mode === "workspace" && Boolean(workspaceId);
  const [hydrated, setHydrated] = useState(!isWorkspace);
  const [stage, setStage] = useState<AppStage>(isWorkspace ? initialStage : "welcome");
  const [messages, setMessages] = useState<Message[]>(
    () => initialMessages?.length ? initialMessages : [openingMessage],
  );
  const [memory, setMemory] = useState<AthleteMemory>(
    () => initialMemory ?? createEmptyAthleteMemory(),
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReflectionReport | null>(initialReport);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<PendingRetry>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmWorkspaceReset, setConfirmWorkspaceReset] = useState(false);
  const [legacyPrompt, setLegacyPrompt] = useState<unknown | null>(null);
  const [importingLegacy, setImportingLegacy] = useState(false);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const insightsAbortRef = useRef<AbortController | null>(null);
  const memoryAbortRef = useRef<AbortController | null>(null);
  const insightsRequestIdRef = useRef(0);
  const chatRequestIdRef = useRef(0);
  const persistGenerationRef = useRef(0);
  const stageRef = useRef<AppStage>(isWorkspace ? initialStage : "welcome");
  const memoryRef = useRef(memory);
  const lastSyncedUserTurnCountRef = useRef(
    initialMessages?.filter((m) => m.role === "user").length ?? 0,
  );
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const athleteTurns = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages],
  );

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);

  useEffect(() => {
    if (isWorkspace) {
      queueMicrotask(() => {
        const snapshot = loadPersistedState();
        if (snapshot) {
          setLegacyPrompt({
            version: snapshot.version,
            savedAt: snapshot.savedAt,
            stage: snapshot.stage,
            messages: snapshot.messages,
            memory: snapshot.memory,
            report: snapshot.report,
            demoMode: snapshot.demoMode,
          });
        }
        setHydrated(true);
      });
      return;
    }

    // Anonymous demo: hydrate from localStorage after mount (SSR-safe).
    const snapshot = loadPersistedState();
    queueMicrotask(() => {
      if (snapshot) {
        const restoredStage =
          snapshot.stage === "generating" ? "conversation" : snapshot.stage;
        setStage(restoredStage);
        setMessages(snapshot.messages.length > 0 ? snapshot.messages : [openingMessage]);
        setMemory(snapshot.memory);
        setReport(snapshot.report);
        setDemoMode(snapshot.demoMode);
        lastSyncedUserTurnCountRef.current = snapshot.messages.filter(
          (m) => m.role === "user",
        ).length;
      }
      setHydrated(true);
    });
  }, [isWorkspace]);

  useEffect(() => {
    if (!hydrated || isWorkspace) return;
    const generation = persistGenerationRef.current;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      if (persistGenerationRef.current !== generation) return;
      savePersistedState({
        version: PERSISTED_STATE_VERSION,
        savedAt: new Date().toISOString(),
        stage,
        messages,
        memory,
        report,
        demoMode,
      });
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [hydrated, isWorkspace, stage, messages, memory, report, demoMode]);

  useEffect(() => {
    if (stage === "conversation") {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, stage, error]);

  function abortInFlight() {
    chatAbortRef.current?.abort();
    insightsAbortRef.current?.abort();
    memoryAbortRef.current?.abort();
    chatAbortRef.current = null;
    insightsAbortRef.current = null;
    memoryAbortRef.current = null;
    insightsRequestIdRef.current += 1;
    chatRequestIdRef.current += 1;
  }

  function resetAnonymous() {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    persistGenerationRef.current += 1;
    abortInFlight();
    clearAthleteOsStorage();
    const empty = createEmptyAthleteMemory();
    lastSyncedUserTurnCountRef.current = 0;
    setConfirmReset(false);
    setStage("welcome");
    setMessages([openingMessage]);
    setMemory(empty);
    setInput("");
    setLoading(false);
    setReport(null);
    setError(null);
    setDemoMode(false);
    setPendingRetry(null);
  }

  async function startNewConversation() {
    if (!isWorkspace || !workspaceId) {
      resetAnonymous();
      return;
    }
    abortInFlight();
    setConfirmReset(false);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await response.json();
      if (!response.ok || !data.conversation?.id) {
        setError(data.message || data.error || "Could not start a new conversation.");
        return;
      }
      setActiveConversationId(data.conversation.id);
      setMessages(data.messages?.length ? data.messages : [openingMessage]);
      setMemory(data.memory ?? memoryRef.current);
      setReport(null);
      setStage("welcome");
      setInput("");
      setPendingRetry(null);
      lastSyncedUserTurnCountRef.current = 0;
    } catch {
      setError("Network issue. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resetWorkspace() {
    if (!isWorkspace || !workspaceId) return;
    abortInFlight();
    setConfirmWorkspaceReset(false);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/reset`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || data.error || "Could not reset workspace.");
        return;
      }
      await startNewConversation();
    } catch {
      setError("Network issue. Please try again.");
      setLoading(false);
    }
  }

  function requestStartOver() {
    setConfirmReset(true);
  }

  function resolvedMemory(candidate: AthleteMemory = memoryRef.current): AthleteMemory {
    const result = normalizeAthleteMemory(candidate, { allowEmptyFallback: true });
    if (!result.ok) return createEmptyAthleteMemory();
    if (result.migrationFailed) {
      console.warn("Athlete memory repaired/reset before request", result.warnings?.slice(0, 6));
    }
    return result.memory;
  }

  function buildChatPayload(
    transcript: Message[],
    extra: Record<string, unknown> = {},
    userMessage?: Message,
  ) {
    if (isWorkspace && workspaceId && activeConversationId) {
      return {
        workspaceId,
        conversationId: activeConversationId,
        clientMessageId: userMessage?.id,
        content: userMessage?.content,
        ...extra,
      };
    }
    return {
      messages: normalizeConversationMessages(transcript),
      memory: resolvedMemory(),
      ...extra,
    };
  }

  function buildInsightsPayload(transcript: Message[], memoryForInsights: AthleteMemory) {
    if (isWorkspace && workspaceId && activeConversationId) {
      return {
        workspaceId,
        conversationId: activeConversationId,
      };
    }
    return {
      messages: normalizeConversationMessages(transcript),
      memory: resolvedMemory(memoryForInsights),
    };
  }

  async function importLegacy() {
    if (!isWorkspace || !workspaceId || !legacyPrompt) return;
    setImportingLegacy(true);
    setError(null);
    try {
      const response = await fetch("/api/legacy-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, payload: legacyPrompt }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || data.error || "Import failed.");
        return;
      }
      clearAthleteOsStorage();
      setLegacyPrompt(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      if (data.conversationId) {
        window.location.reload();
      }
    } catch {
      setError("Network issue during import.");
    } finally {
      setImportingLegacy(false);
    }
  }

  function dismissLegacy() {
    setLegacyPrompt(null);
  }

  async function updateMemory(
    reason: "checkpoint" | "pre_insights" | "correction" | "session_complete",
    transcript: Message[] = messages,
    currentReport: ReflectionReport | null = report,
    baseMemory: AthleteMemory = memoryRef.current,
  ): Promise<AthleteMemory | null> {
    memoryAbortRef.current?.abort();
    const controller = new AbortController();
    memoryAbortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
      const response = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isWorkspace && workspaceId && activeConversationId
            ? {
                workspaceId,
                conversationId: activeConversationId,
                report: currentReport,
                reason,
              }
            : {
                memory: resolvedMemory(baseMemory),
                messages: normalizeConversationMessages(transcript),
                report: currentReport,
                reason,
              },
        ),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data.memory) {
        return null;
      }
      if (data.demoMode) setDemoMode(true);
      const parsed = normalizeAthleteMemory(data.memory, { allowEmptyFallback: true });
      if (!parsed.ok) {
        console.warn("Dropped invalid memory payload from /api/memory", parsed.issues);
        return null;
      }
      const nextMemory = parsed.memory;
      setMemory(nextMemory);
      memoryRef.current = nextMemory;
      lastSyncedUserTurnCountRef.current = transcript.filter((m) => m.role === "user").length;
      return nextMemory;
    } catch (err) {
      if ((err as Error).name === "AbortError") return null;
      return null;
    } finally {
      clearTimeout(timer);
      if (memoryAbortRef.current === controller) {
        memoryAbortRef.current = null;
      }
    }
  }

  async function requestChatReply(transcript: Message[], userMessage?: Message) {
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const requestId = ++chatRequestIdRef.current;
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    setLoading(true);
    setError(null);
    setPendingRetry(null);

    const latestUser =
      userMessage ?? [...transcript].reverse().find((m) => m.role === "user");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildChatPayload(transcript, {}, latestUser)),
        signal: controller.signal,
      });
      const data = await response.json();

      if (!shouldApplyChatResult(chatRequestIdRef.current, requestId)) {
        return;
      }

      if (!response.ok || !data.reply?.trim()) {
        setPendingRetry({ kind: "chat", messages: transcript, userMessage: latestUser });
        setError(
          data.message ||
            data.error ||
            "AthleteOS couldn’t continue the conversation. Please try again.",
        );
        return;
      }

      if (data.demoMode) setDemoMode(true);
      const withAssistant: Message[] = [
        ...transcript,
        {
          id: data.messageId || createMessageId(),
          role: "assistant",
          content: data.reply.trim(),
        },
      ];
      setMessages(withAssistant);

      const userTurns = withAssistant.filter((m) => m.role === "user").length;
      const correction = latestUser ? looksLikeAthleteCorrection(latestUser.content) : false;
      if (correction) {
        void updateMemory("correction", withAssistant);
      } else if (shouldSyncMemoryCheckpoint(userTurns, lastSyncedUserTurnCountRef.current)) {
        void updateMemory("checkpoint", withAssistant);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      if (!shouldApplyChatResult(chatRequestIdRef.current, requestId)) {
        return;
      }
      setPendingRetry({ kind: "chat", messages: transcript, userMessage: latestUser });
      setError("Network issue. Please try again.");
    } finally {
      clearTimeout(timer);
      if (shouldClearChatLoading(chatAbortRef.current, controller)) {
        chatAbortRef.current = null;
        if (shouldApplyChatResult(chatRequestIdRef.current, requestId)) {
          setLoading(false);
        }
      }
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!canSendMessage(input, loading, stage)) return;

    const content = input.trim();
    const userMessage: Message = { id: createMessageId(), role: "user", content };
    const nextMessages: Message[] = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    await requestChatReply(nextMessages, userMessage);
  }

  async function finishConversation(transcript: Message[] = messages) {
    if (loading || stage === "generating") return;
    if (transcript.filter((m) => m.role === "user").length < 3) return;

    insightsAbortRef.current?.abort();
    const controller = new AbortController();
    insightsAbortRef.current = controller;
    const requestId = ++insightsRequestIdRef.current;
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    setError(null);
    setPendingRetry(null);
    setStage("generating");

    try {
      const nextMemory = isWorkspace
        ? (await updateMemory("pre_insights", transcript, null)) ?? memoryRef.current
        : (await updateMemory("pre_insights", transcript, null)) ?? memoryRef.current;

      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildInsightsPayload(transcript, nextMemory)),
        signal: controller.signal,
      });
      const data = await response.json();

      if (!shouldApplyInsightsResult(insightsRequestIdRef.current, requestId, stageRef.current)) {
        return;
      }

      if (response.status === 422 || data.code === "insufficient_context") {
        setPendingRetry({ kind: "insights", messages: transcript });
        setError(
          data.message ||
            data.error ||
            "Need a bit more of your story before I can share a careful reflection.",
        );
        setStage("conversation");
        return;
      }

      if (!response.ok || !data.report) {
        setPendingRetry({ kind: "insights", messages: transcript });
        setError(
          data.message ||
            data.error ||
            "AthleteOS couldn’t finish the reflection right now.",
        );
        setStage("conversation");
        return;
      }

      if (data.demoMode) setDemoMode(true);
      setReport(data.report as ReflectionReport);
      setStage("observations");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      if (!shouldApplyInsightsResult(insightsRequestIdRef.current, requestId, stageRef.current)) {
        return;
      }
      setPendingRetry({ kind: "insights", messages: transcript });
      setError("Network issue. Please try again.");
      setStage("conversation");
    } finally {
      clearTimeout(timer);
      if (insightsAbortRef.current === controller) {
        insightsAbortRef.current = null;
      }
    }
  }

  async function completeSession() {
    if (!report) {
      setStage("complete");
      return;
    }
    const sessionCount = memoryRef.current.sessionCount + 1;
    const relationshipStage = nextRelationshipStage(
      memoryRef.current.relationshipStage,
      sessionCount,
    );
    const baseMemory: AthleteMemory = {
      ...memoryRef.current,
      sessionCount,
      relationshipStage,
      updatedAt: new Date().toISOString(),
    };
    setMemory(baseMemory);
    memoryRef.current = baseMemory;
    setStage("complete");
    void updateMemory("session_complete", messages, report, baseMemory);
  }

  async function continueConversation() {
    if (loading) return;

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const requestId = ++chatRequestIdRef.current;
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    setStage("conversation");
    setLoading(true);
    setError(null);
    setPendingRetry(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildChatPayload(messages, {
            mode: "reopen",
            report,
          }),
        ),
        signal: controller.signal,
      });
      const data = await response.json();

      if (!shouldApplyChatResult(chatRequestIdRef.current, requestId)) {
        return;
      }

      if (!response.ok || !data.reply?.trim()) {
        setPendingRetry({ kind: "reopen" });
        setError(
          data.message ||
            data.error ||
            "AthleteOS couldn’t continue the conversation. Please try again.",
        );
        return;
      }

      if (data.demoMode) setDemoMode(true);
      setMessages((current) => [
        ...current,
        {
          id: data.messageId || createMessageId(),
          role: "assistant",
          content: data.reply.trim(),
        },
      ]);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (!shouldApplyChatResult(chatRequestIdRef.current, requestId)) {
        return;
      }
      setPendingRetry({ kind: "reopen" });
      setError("Network issue. Please try again.");
    } finally {
      clearTimeout(timer);
      if (shouldClearChatLoading(chatAbortRef.current, controller)) {
        chatAbortRef.current = null;
        if (shouldApplyChatResult(chatRequestIdRef.current, requestId)) {
          setLoading(false);
        }
      }
    }
  }

  function retryLast() {
    if (!pendingRetry || loading || stage === "generating") return;
    if (pendingRetry.kind === "chat") {
      void requestChatReply(pendingRetry.messages, pendingRetry.userMessage);
      return;
    }
    if (pendingRetry.kind === "reopen") {
      void continueConversation();
      return;
    }
    void finishConversation(pendingRetry.messages);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // On touch/coarse pointers, Enter inserts a newline (soft keyboards).
    // Desktop keeps Enter-to-send; Shift+Enter always inserts a newline.
    if (event.key !== "Enter" || event.shiftKey) return;
    const coarse =
      typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (coarse) return;
    event.preventDefault();
    void sendMessage();
  }

  if (!hydrated) {
    return (
      <main className="welcome-shell" aria-busy="true">
        <section className="welcome-card">
          <span className="eyebrow">ATHLETEOS</span>
          <p className="generating-copy">Loading…</p>
        </section>
      </main>
    );
  }

  if (legacyPrompt && isWorkspace) {
    return (
      <main className="welcome-shell">
        <section className="welcome-card">
          <span className="eyebrow">ATHLETEOS</span>
          <h1>Import previous conversation?</h1>
          <p>
            We found an AthleteOS conversation saved in this browser. Import it into your
            workspace, or continue without it.
          </p>
          {error && (
            <div className="inline-error" role="alert">
              <p>{error}</p>
            </div>
          )}
          <div className="complete-actions">
            <button
              className="primary"
              type="button"
              onClick={() => void importLegacy()}
              disabled={importingLegacy}
            >
              {importingLegacy ? "Importing…" : "Import previous AthleteOS conversation"}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={dismissLegacy}
              disabled={importingLegacy}
            >
              Continue without importing
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (stage === "welcome") {
    return (
      <main className="welcome-shell">
        <section className="welcome-card">
          <span className="eyebrow">ATHLETEOS</span>
          <h1>
            Hi.
            <br />
            I’m AthleteOS.
          </h1>
          <p>I’m looking forward to getting to know you.</p>
          <p>
            The better I understand your journey, the better we’ll think through your performance
            together.
          </p>
          <p className="listening">Whenever you’re ready, I’m listening.</p>
          <button className="primary" type="button" onClick={() => setStage("conversation")}>
            Begin our conversation
          </button>
        </section>
      </main>
    );
  }

  if (stage === "conversation") {
    return (
      <main className="conversation-shell">
        <header className="topbar">
          <span>AthleteOS</span>
          <small>{demoMode ? "Discovery · Demo mode" : "Discovery conversation"}</small>
        </header>
        <section className="thread" aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <span>{message.role === "assistant" ? "AthleteOS" : "You"}</span>
              <p>{message.content}</p>
            </article>
          ))}
          {loading && <div className="reflecting">Thinking through what you shared…</div>}
          {error && (
            <div className="inline-error" role="alert">
              <p>{error}</p>
              <div className="error-actions">
                {pendingRetry && (
                  <button className="primary" type="button" onClick={retryLast} disabled={loading}>
                    Retry
                  </button>
                )}
                <button className="secondary" type="button" onClick={() => setError(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
          <div ref={threadEndRef} />
        </section>
        <form className="composer" onSubmit={sendMessage}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder="Tell me what’s on your mind…"
            rows={2}
            aria-label="Message AthleteOS"
            disabled={loading}
          />
          <div className="composer-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => void finishConversation()}
              disabled={athleteTurns < 3 || loading}
            >
              Share what you’ve noticed
            </button>
            <button
              className="primary"
              type="submit"
              disabled={!canSendMessage(input, loading, stage)}
            >
              Send
            </button>
          </div>
          {athleteTurns < 3 && (
            <small>Share a little more before we reflect together.</small>
          )}
        </form>
      </main>
    );
  }

  if (stage === "generating") {
    return (
      <>
        <main className="welcome-shell" aria-live="polite" aria-busy="true">
          <section className="welcome-card generating-card">
            <span className="eyebrow">ATHLETEOS</span>
            <p className="generating-copy">Thinking through everything you’ve shared…</p>
            <button className="secondary" type="button" onClick={requestStartOver}>
              Start over
            </button>
          </section>
        </main>
        {confirmReset && (
          <StartOverDialog
            workspaceMode={isWorkspace}
            onKeep={() => setConfirmReset(false)}
            onNewConversation={() => void startNewConversation()}
            onResetWorkspace={() => setConfirmWorkspaceReset(true)}
            onClearAnonymous={resetAnonymous}
          />
        )}
        {confirmWorkspaceReset && (
          <WorkspaceResetDialog
            onCancel={() => setConfirmWorkspaceReset(false)}
            onConfirm={() => void resetWorkspace()}
          />
        )}
      </>
    );
  }

  if (!report && stage !== "complete") {
    return null;
  }

  if (stage === "observations" && report) {
    return (
      <ReflectionScreen
        eyebrow="Today"
        title="Today, here’s what I noticed."
        button="Tell me more"
        onNext={() => setStage("evidence")}
      >
        <div className="observation-list">
          {report.observations.map((item) => (
            <p key={item}>✓ {item}</p>
          ))}
        </div>
      </ReflectionScreen>
    );
  }

  if (stage === "evidence" && report) {
    return (
      <ReflectionScreen
        eyebrow="The pattern"
        title="Here’s what led me to that thought."
        button="What pattern do you see?"
        onNext={() => setStage("pattern")}
      >
        <p className="intro-copy">{report.evidenceIntro}</p>
        <div className="evidence-grid">
          {report.evidence.map((item) => (
            <article key={`${item.category}-${item.explanation}`}>
              <strong>{item.category}</strong>
              <p>{item.explanation}</p>
            </article>
          ))}
        </div>
        <p className="soft-note">{report.evidenceNote}</p>
      </ReflectionScreen>
    );
  }

  if (stage === "pattern" && report) {
    return (
      <ReflectionScreen
        eyebrow="Our working hypothesis"
        title="The strongest pattern I see."
        button="What should we focus on?"
        onNext={() => setStage("focus")}
      >
        <h2 className="pattern-title">{report.pattern.title}</h2>
        <p className="pattern-copy">{report.pattern.explanation}</p>
      </ReflectionScreen>
    );
  }

  if (stage === "focus" && report) {
    return (
      <ReflectionScreen
        eyebrow="Our priority"
        title="If we worked on only one thing together…"
        button="Let’s begin"
        onNext={() => void completeSession()}
      >
        <p className="intro-copy">{report.focusIntro}</p>
        <p className="shared-priority">{report.sharedPriority}</p>
        <p className="soft-note everything-else">Everything else can wait.</p>
        <ol className="priority-list">
          {report.focusAreas.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p className="soft-note">{report.closing}</p>
      </ReflectionScreen>
    );
  }

  return (
    <>
      <main className="welcome-shell">
        <section className="welcome-card complete-card">
          <span className="eyebrow">ATHLETEOS</span>
          <h1 className="complete-title">Thank you for trusting me with your story today.</h1>
          <p className="relationship-marker">{relationshipMarkerCopy(memory.sessionCount)}</p>
          <div className="complete-actions">
            <button
              className="primary"
              type="button"
              onClick={() => void continueConversation()}
              disabled={loading}
            >
              Continue our conversation
            </button>
            <button
              className="secondary"
              type="button"
              onClick={requestStartOver}
              disabled={loading}
            >
              {isWorkspace ? "New conversation" : "Start over"}
            </button>
            {isWorkspace && (
              <button
                className="secondary"
                type="button"
                onClick={() => setConfirmWorkspaceReset(true)}
                disabled={loading}
              >
                Reset athlete workspace
              </button>
            )}
          </div>
        </section>
      </main>
      {confirmReset && (
        <StartOverDialog
          workspaceMode={isWorkspace}
          onKeep={() => setConfirmReset(false)}
          onNewConversation={() => void startNewConversation()}
          onResetWorkspace={() => setConfirmWorkspaceReset(true)}
          onClearAnonymous={resetAnonymous}
        />
      )}
      {confirmWorkspaceReset && (
        <WorkspaceResetDialog
          onCancel={() => setConfirmWorkspaceReset(false)}
          onConfirm={() => void resetWorkspace()}
        />
      )}
    </>
  );
}

function StartOverDialog({
  workspaceMode,
  onKeep,
  onNewConversation,
  onResetWorkspace,
  onClearAnonymous,
}: {
  workspaceMode: boolean;
  onKeep: () => void;
  onNewConversation: () => void;
  onResetWorkspace: () => void;
  onClearAnonymous: () => void;
}) {
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="start-over-title">
      <div className="confirm-card">
        <p id="start-over-title" className="confirm-copy">
          {workspaceMode
            ? "Start a new discovery conversation? Your saved memory and past reflections stay in this workspace."
            : "Start over and clear everything AthleteOS has learned from this conversation?"}
        </p>
        <div className="confirm-actions">
          <button className="primary" type="button" onClick={onKeep}>
            Keep my conversation
          </button>
          {workspaceMode ? (
            <>
              <button className="secondary" type="button" onClick={onNewConversation}>
                Start new conversation
              </button>
              <button className="secondary" type="button" onClick={onResetWorkspace}>
                Reset athlete workspace…
              </button>
            </>
          ) : (
            <button className="secondary" type="button" onClick={onClearAnonymous}>
              Clear and start over
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceResetDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-ws-title">
      <div className="confirm-card">
        <p id="reset-ws-title" className="confirm-copy">
          Reset this athlete workspace? Conversations, memory, patterns, and priorities will be
          cleared. Your account stays signed in.
        </p>
        <div className="confirm-actions">
          <button className="primary" type="button" onClick={onCancel}>
            Keep my workspace
          </button>
          <button className="secondary" type="button" onClick={onConfirm}>
            Reset workspace
          </button>
        </div>
      </div>
    </div>
  );
}

function ReflectionScreen({
  eyebrow,
  title,
  children,
  button,
  onNext,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  button: string;
  onNext: () => void;
}) {
  return (
    <main className="reflection-shell">
      <section className="reflection-card">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {children}
        <button className="primary" type="button" onClick={onNext}>
          {button}
        </button>
      </section>
    </main>
  );
}
