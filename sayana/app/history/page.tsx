"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";

type SessionRow = {
  id: string;
  day: string;
  recordedAt: string;
  lane: string;
  wordCount?: number;
  curseCount?: number;
  preview?: string;
  transcript?: string;
};

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [open, setOpen] = useState<SessionRow | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SessionRow[] | null>(null);

  async function load() {
    const res = await fetch("/api/v1/history");
    const data = (await res.json()) as { sessions: SessionRow[] };
    setSessions(data.sessions || []);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function openOne(id: string) {
    const res = await fetch(`/api/v1/history/${id}`);
    if (!res.ok) return;
    setOpen((await res.json()) as SessionRow);
  }

  async function ask() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch("/api/v1/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q, tz }),
    });
    const data = (await res.json()) as { sessions?: SessionRow[] };
    setHits(data.sessions || []);
    setOpen(null);
  }

  const list = hits ?? sessions;

  return (
    <main className="shell">
      <Nav current="history" />
      <h1>History</h1>
      <p className="quiet">Every rant, life and work. Ask what you said last Tuesday.</p>
      <section className="card">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="what did I say last Tuesday…"
          onKeyDown={(e) => {
            if (e.key === "Enter") ask().catch(() => {});
          }}
        />
        <p>
          <button
            type="button"
            className="mic"
            style={{ width: "auto", height: "auto", padding: "8px 16px", marginTop: 10 }}
            onClick={() => ask().catch(() => {})}
          >
            ask
          </button>
          {hits ? (
            <button type="button" className="ghost-btn" style={{ marginLeft: 8 }} onClick={() => setHits(null)}>
              all dumps
            </button>
          ) : null}
        </p>
      </section>
      {open ? (
        <section className="card">
          <p className="quiet">
            {open.day} · {open.lane}
            <button type="button" className="ghost-btn" style={{ marginLeft: 8 }} onClick={() => setOpen(null)}>
              close
            </button>
          </p>
          <p className="transcript">{open.transcript}</p>
        </section>
      ) : null}
      {list.map((row) => (
        <button type="button" className="card history-row" key={row.id} onClick={() => openOne(row.id)}>
          <strong>
            {row.day} · {row.lane}
          </strong>
          <p className="quiet">{row.preview || row.transcript?.slice(0, 140) || "empty"}</p>
        </button>
      ))}
      {list.length === 0 ? <p className="quiet">Nothing stored yet. Whatsup?</p> : null}
    </main>
  );
}
