"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { BulletList } from "@/components/BulletList";
import { KIND_LABEL, MEMORY_KINDS } from "@/domain/memory-kinds";
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
  totalWordCount: number;
  totalCurseCount: number;
  curseCounts: Record<string, number>;
  topWords: { word: string; count: number }[];
  steps: Array<{ id: string; title: string; status: string; dueHint: string | null }>;
  briefing: BriefingItem[];
};

export default function TodayPage() {
  const [data, setData] = useState<Today | null>(null);

  async function load() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch(`/api/v1/today?tz=${encodeURIComponent(tz)}`);
    setData((await res.json()) as Today);
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
    await load();
  }

  const briefing = data?.briefing || [];

  return (
    <main className="shell">
      <Nav current="today" />
      <h1>Today</h1>
      <p className="quiet">One summary. One list. Even if you dumped more than once.</p>
      {!data ? (
        <p className="quiet">loading…</p>
      ) : (
        <>
          {briefing.length > 0 ? (
            <section className="card">
              <h2>Morning briefing</h2>
              <p className="quiet">
                Approve to keep it in memory. Ignore to let it go. The list below does not change.
              </p>
              {MEMORY_KINDS.map((kind) => {
                const items = briefing.filter((item) => item.kind === kind);
                if (!items.length) return null;
                return (
                  <div className="kind-group" key={kind}>
                    <h3 className="kind-label">{KIND_LABEL[kind as MemoryKind]}</h3>
                    {items.map((item) => (
                      <div className="step" key={item.id}>
                        <div style={{ flex: 1 }}>
                          <div>{item.title}</div>
                          {item.dueHint ? <div className="quiet">{item.dueHint}</div> : null}
                        </div>
                        <button type="button" onClick={() => setBriefing(item.id, "approved")}>
                          approve
                        </button>
                        <button type="button" onClick={() => setBriefing(item.id, "ignored")}>
                          ignore
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
          ) : null}
          <section className="card">
            <h2>What you said</h2>
            <BulletList text={data.summary} empty="Nothing stored for this day yet. Whatsup?" />
            <p className="quiet">
              {data.dumpCount} dump{data.dumpCount === 1 ? "" : "s"}
            </p>
          </section>
          <section className="card">
            <h2>Next steps</h2>
            {data.steps.length === 0 ? (
              <p className="quiet">No logistics pulled out yet.</p>
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
              <a href="/api/v1/ics">Download .ics</a> — Apple/Google Calendar without mixing rants.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
