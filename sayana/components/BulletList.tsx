"use client";

export function BulletList({ text, empty }: { text: string; empty: string }) {
  const items = text
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (items.length === 0) return <p className="quiet">{empty}</p>;
  if (items.length === 1 && items[0].length > 140) {
    const extra = items[0].split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 2);
    if (extra.length > 1) {
      return (
        <ul className="bullets">
          {extra.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      );
    }
  }
  return (
    <ul className="bullets">
      {items.map((b) => (
        <li key={b}>{b}</li>
      ))}
    </ul>
  );
}
