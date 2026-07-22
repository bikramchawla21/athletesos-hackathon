"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptInviteClient({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ invitedEmail: string; status: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/invites/${token}`);
      const data = await response.json();
      if (response.ok) {
        setPreview(data.invitation);
      } else {
        setError(data.error || "Invalid invitation.");
      }
    })();
  }, [token]);

  async function accept() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not accept invitation.");
        return;
      }
      router.replace(`/app/coach/w/${data.workspaceId}/onboarding`);
    } catch {
      setError("Network issue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="welcome-shell">
      <section className="welcome-card">
        <span className="eyebrow">ATHLETEOS</span>
        <h1>Coach invitation</h1>
        {preview && (
          <p>
            Invited as coach for <strong>{preview.invitedEmail}</strong> ({preview.status}).
          </p>
        )}
        {error && (
          <div className="inline-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        <button className="primary" type="button" onClick={() => void accept()} disabled={loading}>
          {loading ? "Joining…" : "Accept invitation"}
        </button>
      </section>
    </main>
  );
}
