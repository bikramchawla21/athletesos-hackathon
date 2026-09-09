"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { BulletList } from "@/components/BulletList";

type Recap = {
  range: string;
  dumpCount: number;
  totalWordCount: number;
  totalCurseCount: number;
  curseCounts: Record<string, number>;
  topWords: { word: string; count: number }[];
  summary: string;
};

export default function RecapPage() {
  const [range, setRange] = useState<"week" | "month">("week");
  const [data, setData] = useState<Recap | null>(null);
  const [picked, setPicked] = useState({ words: true, curses: true, dumps: true });

  useEffect(() => {
    fetch(`/api/v1/recap?range=${range}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [range]);

  const curseList = useMemo(
    () =>
      Object.entries(data?.curseCounts || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
    [data],
  );

  async function share() {
    const text = [
      "Sayana recap",
      picked.dumps ? `${data?.dumpCount ?? 0} dumps` : "",
      picked.words ? `top: ${(data?.topWords || []).slice(0, 5).map((w) => w.word).join(", ")}` : "",
      picked.curses
        ? `curses ${data?.totalCurseCount ?? 0} — ${curseList.map(([k, v]) => `${k} ${v}`).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (navigator.share) {
      await navigator.share({ text, title: "Sayana" });
      return;
    }
    await navigator.clipboard.writeText(text);
    alert("Copied. Paste into Instagram.");
  }

  return (
    <main className="shell">
      <Nav current="recap" />
      <h1>{range === "week" ? "This week" : "This month"}</h1>
      <p className="quiet">
        <button type="button" className="mic" style={{ width: "auto", height: "auto", padding: "8px 16px", marginTop: 0 }} onClick={() => setRange(range === "week" ? "month" : "week")}>
          {range === "week" ? "see month" : "see week"}
        </button>
      </p>
      {!data ? (
        <p className="quiet">loading…</p>
      ) : (
        <>
          <div className="share-card" id="share-card">
            <div>
              <p className="muted">Sayana</p>
              <h1>Whatsup?</h1>
              <p className="muted">Aur Bata</p>
            </div>
            <div>
              {picked.dumps ? <p>{data.dumpCount} dumps · {data.totalWordCount} words</p> : null}
              {picked.words ? (
                <p className="muted">{data.topWords.slice(0, 6).map((w) => w.word).join(" · ") || "no words yet"}</p>
              ) : null}
              {picked.curses ? (
                <p>
                  {data.totalCurseCount} curses
                  {curseList.length ? ` — ${curseList.map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}
                </p>
              ) : null}
            </div>
          </div>
          <section className="card">
            <h2>On the story card</h2>
            <label className="quiet">
              <input type="checkbox" checked={picked.dumps} onChange={(e) => setPicked({ ...picked, dumps: e.target.checked })} /> dumps
            </label>
            <br />
            <label className="quiet">
              <input type="checkbox" checked={picked.words} onChange={(e) => setPicked({ ...picked, words: e.target.checked })} /> top words
            </label>
            <br />
            <label className="quiet">
              <input type="checkbox" checked={picked.curses} onChange={(e) => setPicked({ ...picked, curses: e.target.checked })} /> curse split
            </label>
            <p>
              <button type="button" className="mic" style={{ width: "auto", height: "auto", padding: "10px 18px" }} onClick={() => share()}>
                share
              </button>
            </p>
            <p className="quiet">Rant audio and names stay off the card unless you type a quote yourself.</p>
          </section>
          <section className="card">
            <h2>Per type + total</h2>
            <div className="stat-row">
              <span>total curses</span>
              <strong>{data.totalCurseCount}</strong>
            </div>
            {curseList.map(([k, v]) => (
              <div className="stat-row" key={k}>
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>What mattered</h2>
            <BulletList text={data.summary} empty="Nothing stored this span yet." />
            <p className="quiet">Full rants live in History.</p>
          </section>
        </>
      )}
    </main>
  );
}
