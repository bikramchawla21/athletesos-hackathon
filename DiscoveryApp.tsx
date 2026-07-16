"use client";

import { FormEvent, useMemo, useState } from "react";
import type { InsightReport, Message } from "@/lib/types";

type Stage = "welcome" | "conversation" | "observations" | "evidence" | "pattern" | "focus";

const openingMessage: Message = {
  role: "assistant",
  content:
    "Hi, I’m AthleteOS. I’m looking forward to getting to know you. The better I understand your journey, the better we’ll think through your performance together. Whenever you’re ready, I’m listening.",
};

export default function DiscoveryApp() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [messages, setMessages] = useState<Message[]>([openingMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<InsightReport | null>(null);
  const athleteTurns = useMemo(() => messages.filter((m) => m.role === "user").length, [messages]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not continue conversation");
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "I lost the thread for a moment. Could you say that one more time?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function finishConversation() {
    setLoading(true);
    try {
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await response.json();
      setReport(data.report);
      setStage("observations");
    } finally {
      setLoading(false);
    }
  }

  if (stage === "welcome") {
    return (
      <main className="welcome-shell">
        <section className="welcome-card">
          <span className="eyebrow">ATHLETEOS</span>
          <h1>Hi, I’m AthleteOS.</h1>
          <p>I’m looking forward to getting to know you.</p>
          <p>The better I understand your journey, the better we’ll think through your performance together.</p>
          <p className="listening">Whenever you’re ready, I’m listening.</p>
          <button className="primary" onClick={() => setStage("conversation")}>Begin our conversation</button>
        </section>
      </main>
    );
  }

  if (stage === "conversation") {
    return (
      <main className="conversation-shell">
        <header className="topbar"><span>AthleteOS</span><small>Discovery conversation</small></header>
        <section className="thread" aria-live="polite">
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <span>{message.role === "assistant" ? "AthleteOS" : "You"}</span>
              <p>{message.content}</p>
            </article>
          ))}
          {loading && <div className="reflecting">Thinking through what you shared…</div>}
        </section>
        <form className="composer" onSubmit={sendMessage}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Tell me what’s on your mind…"
            rows={2}
          />
          <div className="composer-actions">
            <button className="secondary" type="button" onClick={finishConversation} disabled={athleteTurns < 3 || loading}>
              Share what you’ve noticed
            </button>
            <button className="primary" type="submit" disabled={!input.trim() || loading}>Send</button>
          </div>
          {athleteTurns < 3 && <small>Share a little more before we reflect together.</small>}
        </form>
      </main>
    );
  }

  if (!report) return null;

  if (stage === "observations") {
    return <ReflectionScreen eyebrow="Today" title="Today, here’s what I noticed." button="Tell me more" onNext={() => setStage("evidence")}>
      <div className="observation-list">{report.observations.map((item) => <p key={item}>✓ {item}</p>)}</div>
    </ReflectionScreen>;
  }

  if (stage === "evidence") {
    return <ReflectionScreen eyebrow="The pattern" title="Here’s what led me to that thought." button="What pattern do you see?" onNext={() => setStage("pattern")}>
      <p className="intro-copy">I’ve been connecting different moments from our conversation. None of them tells the whole story alone, but together they started forming a pattern worth exploring with you.</p>
      <div className="evidence-grid">{report.evidence.map((item) => <article key={item.label}><strong>{item.label}</strong><p>{item.detail}</p></article>)}</div>
      <p className="soft-note">This isn’t proof. It’s simply the pattern I keep seeing across your journey.</p>
    </ReflectionScreen>;
  }

  if (stage === "pattern") {
    return <ReflectionScreen eyebrow="Our working hypothesis" title="The strongest pattern I see." button="What should we focus on?" onNext={() => setStage("focus")}>
      <h2 className="pattern-title">{report.pattern}</h2>
      <p className="pattern-copy">{report.patternExplanation}</p>
    </ReflectionScreen>;
  }

  return <ReflectionScreen eyebrow="Our priority" title="If we worked on only one thing together…" button="Let’s begin" onNext={() => setStage("conversation")}>
    <p className="intro-copy">{report.focusIntro}</p>
    <ol className="priority-list">{report.priorities.map((item) => <li key={item}>{item}</li>)}</ol>
    <p className="soft-note">{report.closing}</p>
  </ReflectionScreen>;
}

function ReflectionScreen({ eyebrow, title, children, button, onNext }: { eyebrow: string; title: string; children: React.ReactNode; button: string; onNext: () => void }) {
  return (
    <main className="reflection-shell">
      <section className="reflection-card">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {children}
        <button className="primary" onClick={onNext}>{button}</button>
      </section>
    </main>
  );
}
