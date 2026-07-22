"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createMessageId } from "@/lib/message-id.mjs";
import type { Message } from "@/lib/types";

const COACH_QUESTIONS = [
  "How long have you been coaching this athlete, and in what capacity?",
  "What is the primary development objective you are working on with them right now?",
  "What strengths do you consistently see in their performance?",
  "What recurring limitation most often shows up under pressure?",
  "What meaningful change have you noticed recently?",
  "Where might the athlete’s experience differ from what you observe?",
];

export default function CoachOnboardingApp({
  workspaceId,
  conversationId,
  initialMessages,
}: {
  workspaceId: string;
  conversationId: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const userTurns = useMemo(
    () => messages.filter((m) => m.role === "user").length,
    [messages],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!input.trim() || loading || done) return;
    const userMessage: Message = {
      id: createMessageId(),
      role: "user",
      content: input.trim(),
    };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      // Persist user turn + extract observation
      await fetch(`/api/workspaces/${workspaceId}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: userMessage.content,
          category: "onboarding",
          context: "conversation",
          visibility: "workspace",
          sourceType: "coach_onboarding",
        }),
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          conversationId,
          clientMessageId: userMessage.id,
          content: userMessage.content,
        }),
      });
      const data = await response.json();

      const nextTurn = userTurns + 1;
      let reply = data.reply?.trim();
      if (!response.ok || !reply) {
        // Deterministic fallback questions for onboarding
        reply =
          nextTurn < COACH_QUESTIONS.length
            ? COACH_QUESTIONS[nextTurn]!
            : "Thank you. That gives a clear coaching picture to compare with the athlete’s shared evidence.";
      }

      setMessages((current) => [
        ...current,
        { id: data.messageId || createMessageId(), role: "assistant", content: reply },
      ]);

      if (nextTurn >= COACH_QUESTIONS.length) {
        setDone(true);
        window.location.href = `/app/coach/w/${workspaceId}`;
      }
    } catch {
      setError("Network issue. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="conversation-shell">
      <header className="topbar">
        <span>AthleteOS</span>
        <small>Coach onboarding</small>
      </header>
      <section className="thread">
        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <span>{message.role === "assistant" ? "AthleteOS" : "You"}</span>
            <p>{message.content}</p>
          </article>
        ))}
        {loading && <div className="reflecting">Listening…</div>}
        {error && (
          <div className="inline-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        <div ref={endRef} />
      </section>
      <form className="composer" onSubmit={(e) => void send(e)}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="Concise coaching observation…"
          disabled={loading || done}
        />
        <div className="composer-actions">
          <button className="primary" type="submit" disabled={loading || !input.trim() || done}>
            Send
          </button>
        </div>
      </form>
    </main>
  );
}
