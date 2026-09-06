"use client";

import { useState } from "react";

type Snippet = {
  messageId: string;
  conversationId: string;
  createdAt: string;
  role: string;
  preview: string;
};

/**
 * Optional founder-only reveal of supporting message snippets.
 * Not expanded by default. Never dumps full conversation history.
 */
export function EvidenceReveal({
  workspaceId,
  patternId,
}: {
  workspaceId: string;
  patternId: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);

  async function load() {
    setOpen(true);
    if (snippets || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/pilot/evidence?workspaceId=${encodeURIComponent(workspaceId)}&patternId=${encodeURIComponent(patternId)}`,
        { credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        snippets?: Snippet[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Could not load evidence.");
        return;
      }
      setSnippets(data.snippets ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-evidence-reveal">
      {!open ? (
        <button type="button" className="secondary" onClick={() => void load()}>
          View supporting evidence
        </button>
      ) : (
        <div>
          <button type="button" className="secondary" onClick={() => setOpen(false)}>
            Hide evidence
          </button>
          {loading ? <p>Loading…</p> : null}
          {error ? <p className="admin-note">{error}</p> : null}
          {snippets ? (
            <ul>
              {snippets.map((s) => (
                <li key={s.messageId}>
                  <span className="admin-muted">
                    {new Date(s.createdAt).toLocaleString()} · {s.role}
                  </span>
                  <div>{s.preview}</div>
                </li>
              ))}
              {snippets.length === 0 ? (
                <li>No message-linked evidence rows.</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
