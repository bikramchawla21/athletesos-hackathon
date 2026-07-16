"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { canSendMessage, shouldApplyInsightsResult } from "@/lib/ui-guards.mjs";
import type { Message, ReflectionReport } from "@/lib/types";

type Stage =
  | "welcome"
  | "conversation"
  | "generating"
  | "observations"
  | "evidence"
  | "pattern"
  | "focus"
  | "complete";

type PendingRetry =
  | { kind: "chat"; messages: Message[] }
  | { kind: "insights"; messages: Message[] }
  | null;

const openingMessage: Message = {
  role: "assistant",
  content:
    "Hi.\nI’m AthleteOS.\n\nI’m looking forward to getting to know you.\n\nThe better I understand your journey, the better we’ll think through your performance together.\n\nWhenever you’re ready, I’m listening.",
};

const CLIENT_TIMEOUT_MS = 30_000;

export default function DiscoveryApp() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [messages, setMessages] = useState<Message[]>([openingMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReflectionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<PendingRetry>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const insightsAbortRef = useRef<AbortController | null>(null);
  const insightsRequestIdRef = useRef(0);
  const stageRef = useRef<Stage>("welcome");

  const athleteTurns = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages],
  );

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    if (stage === "conversation") {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, stage, error]);

  function abortInFlight() {
    chatAbortRef.current?.abort();
    insightsAbortRef.current?.abort();
    chatAbortRef.current = null;
    insightsAbortRef.current = null;
    insightsRequestIdRef.current += 1;
  }

  function resetAll() {
    abortInFlight();
    setStage("welcome");
    setMessages([openingMessage]);
    setInput("");
    setLoading(false);
    setReport(null);
    setError(null);
    setDemoMode(false);
    setPendingRetry(null);
  }

  async function requestChatReply(transcript: Message[]) {
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    setLoading(true);
    setError(null);
    setPendingRetry(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: transcript }),
        signal: controller.signal,
      });
      const data = await response.json();

      if (!response.ok || !data.reply?.trim()) {
        setPendingRetry({ kind: "chat", messages: transcript });
        setError(data.error || "AthleteOS couldn’t continue the conversation. Please try again.");
        return;
      }

      if (data.demoMode) setDemoMode(true);
      setMessages((current) => [...current, { role: "assistant", content: data.reply.trim() }]);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      setPendingRetry({ kind: "chat", messages: transcript });
      setError("Network issue. Please try again.");
    } finally {
      clearTimeout(timer);
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
      }
      setLoading(false);
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!canSendMessage(input, loading, stage)) return;

    const content = input.trim();
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    await requestChatReply(nextMessages);
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
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: transcript }),
        signal: controller.signal,
      });
      const data = await response.json();

      if (!shouldApplyInsightsResult(insightsRequestIdRef.current, requestId, stageRef.current)) {
        return;
      }

      if (response.status === 422 || data.code === "insufficient_context") {
        setPendingRetry({ kind: "insights", messages: transcript });
        setError(
          data.error ||
            "Need a bit more of your story before I can share a careful reflection.",
        );
        setStage("conversation");
        return;
      }

      if (!response.ok || !data.report) {
        setPendingRetry({ kind: "insights", messages: transcript });
        setError(data.error || "AthleteOS couldn’t finish the reflection right now.");
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

  function retryLast() {
    if (!pendingRetry || loading || stage === "generating") return;
    if (pendingRetry.kind === "chat") {
      void requestChatReply(pendingRetry.messages);
      return;
    }
    void finishConversation(pendingRetry.messages);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
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
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
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
      <main className="welcome-shell" aria-live="polite" aria-busy="true">
        <section className="welcome-card generating-card">
          <span className="eyebrow">ATHLETEOS</span>
          <p className="generating-copy">Thinking through everything you’ve shared…</p>
          <button className="secondary" type="button" onClick={resetAll}>
            Start over
          </button>
        </section>
      </main>
    );
  }

  if (!report) {
    return null;
  }

  if (stage === "observations") {
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

  if (stage === "evidence") {
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

  if (stage === "pattern") {
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

  if (stage === "focus") {
    return (
      <ReflectionScreen
        eyebrow="Our priority"
        title="If we worked on only one thing together…"
        button="Let’s begin"
        onNext={() => setStage("complete")}
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
    <main className="welcome-shell">
      <section className="welcome-card">
        <span className="eyebrow">ATHLETEOS</span>
        <h1>We’ll keep learning together.</h1>
        <p className="intro-copy">
          Whenever you’re ready, we can begin again with a fresh conversation.
        </p>
        <button className="primary" type="button" onClick={resetAll}>
          Start over
        </button>
      </section>
    </main>
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
