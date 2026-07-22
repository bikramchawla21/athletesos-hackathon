"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Obs = {
  id: string;
  statement: string;
  visibility: string;
  authorRole: string;
  category: string;
  context: string;
};

type Snapshot = {
  priority: { id: string; statement: string; status: string; whyNow?: string | null } | null;
  pattern: { id: string; statement: string; explanation: string; status: string } | null;
  reviews?: { role: string; decision: string }[];
};

export default function CoachWorkspace({ workspaceId }: { workspaceId: string }) {
  const [observations, setObservations] = useState<Obs[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [comparison, setComparison] = useState<{
    alignedSignals: { statement: string }[];
    differingPerspectives: {
      topic: string;
      athletePerspective: string;
      coachPerspective: string;
      openQuestion: string;
    }[];
  } | null>(null);
  const [statement, setStatement] = useState("");
  const [context, setContext] = useState("training");
  const [visibility, setVisibility] = useState<"workspace" | "coach_private">("workspace");
  const [category, setCategory] = useState("tactical");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const [obsRes, priRes] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}/observations`),
      fetch(`/api/workspaces/${workspaceId}/shared-priority`),
    ]);
    const obsData = await obsRes.json();
    const priData = await priRes.json();
    if (obsRes.ok) setObservations(obsData.observations ?? []);
    if (priRes.ok) {
      setSnapshot({
        priority: priData.snapshot?.priority ?? null,
        pattern: priData.snapshot?.pattern ?? null,
        reviews: priData.snapshot?.reviews ?? [],
      });
    }
  }, [workspaceId]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  async function addObservation(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement,
          context,
          visibility,
          category,
          sourceType: "coach_manual",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not save observation.");
        return;
      }
      setStatement("");
      setMessage(
        visibility === "coach_private"
          ? "Private coach note saved. It will not appear in athlete-visible AI output."
          : "Shared observation saved for the athlete workspace.",
      );
      await refresh();
    } catch {
      setError("Network issue.");
    } finally {
      setLoading(false);
    }
  }

  async function runComparison() {
    setLoading(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/perspective`, {
        method: "POST",
      });
      const data = await response.json();
      if (response.ok) setComparison(data.comparison);
    } finally {
      setLoading(false);
    }
  }

  async function patternFeedback(response: string) {
    if (!snapshot?.pattern?.id) return;
    await fetch(`/api/patterns/${snapshot.pattern.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, response }),
    });
    setMessage("Pattern feedback recorded.");
  }

  async function proposePriority() {
    const statementText =
      snapshot?.priority?.statement ||
      comparison?.alignedSignals?.[0]?.statement ||
      "Shared performance priority";
    const response = await fetch(`/api/workspaces/${workspaceId}/shared-priority`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statement: statementText,
        whyNow: "Based on shared athlete and coach evidence.",
        patternId: snapshot?.pattern?.id ?? null,
      }),
    });
    if (response.ok) {
      setMessage("Shared priority proposed — both must approve to activate.");
      await refresh();
    }
  }

  async function reviewPriority(decision: "approve" | "revise") {
    if (!snapshot?.priority?.id) return;
    const response = await fetch(`/api/workspaces/${workspaceId}/shared-priority`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "review",
        priorityId: snapshot.priority.id,
        decision,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      setMessage(
        data.activated
          ? "Priority activated — both approved."
          : `Review recorded (${data.status}).`,
      );
      await refresh();
    }
  }

  return (
    <main className="conversation-shell">
      <header className="topbar">
        <span>AthleteOS · Coach</span>
        <small>Authorized snapshot</small>
      </header>
      <section className="thread coach-thread">
        <h1>Athlete snapshot</h1>
        <article className="message assistant">
          <span>Shared priority</span>
          <p>{snapshot?.priority?.statement || "No shared priority yet."}</p>
          {snapshot?.priority?.status && <small>Status: {snapshot.priority.status}</small>}
        </article>
        <article className="message assistant">
          <span>Shared pattern</span>
          <p>{snapshot?.pattern?.statement || "No shared pattern yet."}</p>
          {snapshot?.pattern?.explanation && <p>{snapshot.pattern.explanation}</p>}
        </article>

        <h2>Add observation</h2>
        <p className="soft-note">
          Private coach notes are not shown to the athlete and must not enter athlete-visible AI
          output.
        </p>
        <form className="composer welcome-composer" onSubmit={(e) => void addObservation(e)}>
          <textarea
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            rows={3}
            placeholder="What did you observe?"
            required
          />
          <label>
            Context
            <select value={context} onChange={(e) => setContext(e.target.value)}>
              <option value="training">Training</option>
              <option value="match">Match</option>
              <option value="competition">Competition</option>
              <option value="conversation">Conversation</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Category
            <input value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label>
            Visibility
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "workspace" | "coach_private")}
            >
              <option value="workspace">Shared with athlete</option>
              <option value="coach_private">Private coach note</option>
            </select>
          </label>
          <button className="primary" type="submit" disabled={loading || !statement.trim()}>
            Save observation
          </button>
        </form>

        {message && (
          <div className="inline-error" role="status">
            <p>{message}</p>
          </div>
        )}
        {error && (
          <div className="inline-error" role="alert">
            <p>{error}</p>
          </div>
        )}

        <h2>Recent observations you can see</h2>
        {observations.map((o) => (
          <article key={o.id} className="message assistant">
            <span>
              {o.authorRole} · {o.visibility} · {o.category}
            </span>
            <p>{o.statement}</p>
          </article>
        ))}

        <div className="complete-actions">
          <button className="secondary" type="button" onClick={() => void runComparison()} disabled={loading}>
            Compare perspectives
          </button>
          {snapshot?.pattern && (
            <>
              <button className="secondary" type="button" onClick={() => void patternFeedback("agree")}>
                Agree with pattern
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void patternFeedback("partially_agree")}
              >
                Partially agree
              </button>
              <button className="secondary" type="button" onClick={() => void patternFeedback("disagree")}>
                Disagree
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void patternFeedback("needs_more_context")}
              >
                Needs more context
              </button>
            </>
          )}
          <button className="primary" type="button" onClick={() => void proposePriority()}>
            Propose shared priority
          </button>
          {snapshot?.priority && snapshot.priority.status !== "active" && (
            <>
              <button className="primary" type="button" onClick={() => void reviewPriority("approve")}>
                Approve priority
              </button>
              <button className="secondary" type="button" onClick={() => void reviewPriority("revise")}>
                Request revision
              </button>
            </>
          )}
        </div>

        {comparison && (
          <>
            <h2>Aligned signals</h2>
            {comparison.alignedSignals.map((s) => (
              <p key={s.statement}>• {s.statement}</p>
            ))}
            <h2>Differing perspectives</h2>
            {comparison.differingPerspectives.map((d) => (
              <article key={d.topic} className="message assistant">
                <span>{d.topic}</span>
                <p>Athlete: {d.athletePerspective}</p>
                <p>Coach: {d.coachPerspective}</p>
                <p className="soft-note">{d.openQuestion}</p>
              </article>
            ))}
          </>
        )}
      </section>
    </main>
  );
}
