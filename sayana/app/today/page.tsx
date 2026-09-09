"use client";

import { useEffect, useRef, useState } from "react";
import { Nav } from "@/components/Nav";
import { BulletList } from "@/components/BulletList";
import { KIND_PILL } from "@/domain/memory-kinds";
import type { MemoryKind } from "@/domain/types";

type BriefingItem = {
  id: string;
  kind: string;
  title: string;
  dueHint: string | null;
  personName: string | null;
  day: string;
};

type Today = {
  day: string;
  summary: string;
  dumpCount: number;
  steps: Array<{ id: string; title: string; status: string; dueHint: string | null }>;
  briefing: BriefingItem[];
  briefingTotal: number;
};

export default function TodayPage() {
  const [data, setData] = useState<Today | null>(null);
  const [doneNote, setDoneNote] = useState(false);
  const queueSize = useRef(0);

  async function load() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch(`/api/v1/today?tz=${encodeURIComponent(tz)}`);
    const next = (await res.json()) as Today;
    if (next.briefing?.length) {
      if (!queueSize.current) queueSize.current = next.briefing.length;
    } else {
      queueSize.current = 0;
      setDoneNote(false);
    }
    setData(next);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function setStatus(id: string, status: string) {
    await fetch(`/api/v1/steps/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function setBriefing(id: string, status: "approved" | "ignored") {
    await fetch(`/api/v1/briefing/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch(`/api/v1/today?tz=${encodeURIComponent(tz)}`);
    const next = (await res.json()) as Today;
    if (!next.briefing?.length) {
      queueSize.current = 0;
      setDoneNote(true);
    }
    setData(next);
  }

  const card = data?.briefing?.[0];
  const remaining = data?.briefing?.length || 0;
  const total = queueSize.current || remaining;
  const pos = Math.max(1, total - remaining + 1);
  const showBriefing = Boolean(card);

  return (
    <main className="shell">
      <Nav current="today" />
      <h1>Today</h1>
      {!data ? (
        <p className="quiet">loading…</p>
      ) : showBriefing && card ? (
        <section className="card briefing-card">
          <p className="quiet">
            Briefing · {pos} of {total}
          </p>
          <span className="pill">{KIND_PILL[card.kind as MemoryKind] || card.kind}</span>
          <p className="briefing-line">{card.title}</p>
          {card.dueHint ? <p className="quiet">{card.dueHint}</p> : null}
          <div className="briefing-actions">
            <button type="button" className="mic briefing-btn" onClick={() => setBriefing(card.id, "approved")}>
              approve
            </button>
            <button type="button" className="ghost-btn" onClick={() => setBriefing(card.id, "ignored")}>
              ignore
            </button>
          </div>
        </section>
      ) : (
        <>
          {doneNote ? <p className="quiet">That’s the lot.</p> : null}
          <section className="card">
            <h2>What you said</h2>
            <BulletList text={data.summary} empty="Nothing stored for this day yet. Whatsup?" />
            <p className="quiet">{data.dumpCount} dump{data.dumpCount === 1 ? "" : "s"} · full rants in History</p>
          </section>
          <section className="card">
            <h2>Next steps</h2>
            {data.steps.length === 0 ? (
              <p className="quiet">No work to-dos pulled out.</p>
            ) : (
              data.steps.map((s) => (
                <div className="step" key={s.id}>
                  <div style={{ flex: 1 }}>
                    <div>{s.title}</div>
                    {s.dueHint ? <div className="quiet">{s.dueHint}</div> : null}
                  </div>
                  <button type="button" data-on={s.status === "kept" ? "true" : "false"} onClick={() => setStatus(s.id, "kept")}>
                    keep
                  </button>
                  <button type="button" data-on={s.status === "done" ? "true" : "false"} onClick={() => setStatus(s.id, "done")}>
                    done
                  </button>
                  <button type="button" onClick={() => setStatus(s.id, "dropped")}>
                    drop
                  </button>
                </div>
              ))
            )}
            <p className="quiet" style={{ marginTop: 16 }}>
              <a href="/api/v1/ics">Download .ics</a>
            </p>
          </section>
        </>
      )}
    </main>
  );
}
