"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingForm() {
  const router = useRouter();
  const [sport, setSport] = useState("");
  const [level, setLevel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport: sport.trim() || null,
          level: level.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.workspace?.id) {
        setError(data.message || data.error || "Could not create workspace.");
        return;
      }
      router.replace(`/app/w/${data.workspace.id}`);
    } catch {
      setError("Network issue. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="composer" style={{ marginTop: "1.5rem" }}>
      <label>
        Sport (optional)
        <input
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          placeholder="e.g. tennis"
          disabled={loading}
        />
      </label>
      <label>
        Level (optional)
        <input
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          placeholder="e.g. collegiate"
          disabled={loading}
        />
      </label>
      {error && (
        <div className="inline-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      <button className="primary" type="submit" disabled={loading}>
        {loading ? "Creating…" : "Continue"}
      </button>
    </form>
  );
}
