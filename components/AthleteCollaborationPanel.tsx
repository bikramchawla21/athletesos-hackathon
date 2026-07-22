"use client";

import { useCallback, useEffect, useState } from "react";

export default function AthleteCollaborationPanel({ workspaceId }: { workspaceId: string }) {
  const [observations, setObservations] = useState<
    { id: string; statement: string; authorRole: string; visibility: string }[]
  >([]);
  const [priority, setPriority] = useState<{
    id: string;
    statement: string;
    status: string;
  } | null>(null);
  const [pattern, setPattern] = useState<{ id: string; statement: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [obsRes, priRes] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}/observations`),
      fetch(`/api/workspaces/${workspaceId}/shared-priority`),
    ]);
    const obsData = await obsRes.json();
    const priData = await priRes.json();
    if (obsRes.ok) {
      setObservations(
        (obsData.observations ?? []).filter(
          (o: { visibility: string }) => o.visibility === "workspace",
        ),
      );
    }
    if (priRes.ok) {
      setPriority(priData.snapshot?.priority ?? null);
      setPattern(priData.snapshot?.pattern ?? null);
    }
  }, [workspaceId]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  async function feedback(response: string) {
    if (!pattern?.id) return;
    await fetch(`/api/patterns/${pattern.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, response }),
    });
    setMessage("Pattern feedback saved.");
  }

  async function approvePriority() {
    if (!priority?.id) return;
    const response = await fetch(`/api/workspaces/${workspaceId}/shared-priority`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "review",
        priorityId: priority.id,
        decision: "approve",
      }),
    });
    const data = await response.json();
    if (response.ok) {
      setMessage(data.activated ? "Shared priority activated." : `Status: ${data.status}`);
      await refresh();
    }
  }

  return (
    <section className="team-panel">
      <h2>Shared with coach</h2>
      <p className="soft-note">Only workspace-shared coach observations appear here — never private coach notes.</p>
      <ul className="team-list">
        {observations.length === 0 && <li>No shared coach observations yet.</li>}
        {observations.map((o) => (
          <li key={o.id}>
            <span>
              {o.authorRole}: {o.statement}
            </span>
          </li>
        ))}
      </ul>
      {pattern && (
        <div className="complete-actions">
          <p>Pattern: {pattern.statement}</p>
          <button className="secondary" type="button" onClick={() => void feedback("agree")}>
            Agree
          </button>
          <button className="secondary" type="button" onClick={() => void feedback("partially_agree")}>
            Partially agree
          </button>
          <button className="secondary" type="button" onClick={() => void feedback("disagree")}>
            Disagree
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => void feedback("needs_more_context")}
          >
            Needs more context
          </button>
        </div>
      )}
      {priority && priority.status !== "active" && (
        <div className="complete-actions">
          <p>
            Proposed priority ({priority.status}): {priority.statement}
          </p>
          <button className="primary" type="button" onClick={() => void approvePriority()}>
            Approve shared priority
          </button>
        </div>
      )}
      {message && (
        <div className="inline-error" role="status">
          <p>{message}</p>
        </div>
      )}
    </section>
  );
}
