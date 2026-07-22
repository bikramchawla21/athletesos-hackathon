"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type InviteRow = {
  id: string;
  invitedEmail: string;
  status: string;
  expiresAt: string;
};

type CoachRow = {
  personId: string;
  membershipId: string;
};

export default function InviteCoachPanel({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState<InviteRow[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/workspaces/${workspaceId}/invites`);
    const data = await response.json();
    if (response.ok) {
      setInvitations(data.invitations ?? []);
      setCoaches(data.coaches ?? []);
    }
  }, [workspaceId]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInviteUrl(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Invite failed.");
        return;
      }
      setInviteUrl(data.inviteUrl);
      setEmail("");
      await refresh();
    } catch {
      setError("Network issue.");
    } finally {
      setLoading(false);
    }
  }

  async function revoke(invitationId: string) {
    setLoading(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/invites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", invitationId }),
      });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(coachPersonId: string) {
    if (!window.confirm("Remove this coach from the workspace?")) return;
    setLoading(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/invites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_coach", coachPersonId }),
      });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="team-panel">
      <h2>Team</h2>
      <p className="soft-note">Invite one coach to this workspace. Share the invite link securely.</p>
      <form onSubmit={onInvite} className="composer welcome-composer">
        <label>
          Coach email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="coach@example.com"
            required
            disabled={loading}
          />
        </label>
        <button className="primary" type="submit" disabled={loading || !email.trim()}>
          Invite coach
        </button>
      </form>
      {error && (
        <div className="inline-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      {inviteUrl && (
        <div className="inline-error" role="status">
          <p>Copy this invite link (shown once):</p>
          <code style={{ wordBreak: "break-all", fontSize: 13 }}>{inviteUrl}</code>
        </div>
      )}
      <ul className="team-list">
        {invitations.map((inv) => (
          <li key={inv.id}>
            <span>
              {inv.invitedEmail} · {inv.status}
            </span>
            {inv.status === "pending" && (
              <button className="secondary" type="button" onClick={() => void revoke(inv.id)} disabled={loading}>
                Revoke
              </button>
            )}
          </li>
        ))}
        {coaches.map((c) => (
          <li key={c.membershipId}>
            <span>Active coach</span>
            <button
              className="secondary"
              type="button"
              onClick={() => void remove(c.personId)}
              disabled={loading}
            >
              Remove coach
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
