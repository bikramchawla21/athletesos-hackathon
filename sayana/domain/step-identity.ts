const SKIP = /\b(i|i'm|im|me|my|have|to|got|gotta|gonna|need|must|should|going|will|please|just|some|the|a|an|and|or|of|for|on|in|do|doing|make|making|send|sending|work|working|on)\b/g;

export function digitsIn(title: string): string | null {
  const m = title.match(/\d+(?:\.\d+)?/);
  return m ? m[0] : null;
}

export function stepIdentity(title: string): string {
  const t = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\bcold\s*calls?\b/.test(t) || /\bcoldcalls?\b/.test(t)) return "cold_calls";
  if (/\bcold\s*e?-?mails?\b/.test(t) || /\bcold\s*mails?\b/.test(t)) return "cold_emails";
  if (/\bwork\s*outs?\b/.test(t) || /\bworkouts?\b/.test(t) || /\bgym\b/.test(t) || /\bexercise\b/.test(t)) {
    return "workout";
  }
  if (/\bgurgaon\b/.test(t) && /\b(real\s*estate|deal|deals|property)\b/.test(t)) {
    return "real_estate_gurgaon";
  }
  if (/\breal\s*estate\b/.test(t) || /\bdeals?\b/.test(t) && /\bproperty\b/.test(t)) return "real_estate";
  if (/\bgrocer/.test(t)) return "groceries";
  if (/\bcall\b/.test(t) && /\bmom|mummy|mama|mother\b/.test(t)) return "call_mom";

  return t
    .replace(/\b\d+\b/g, "")
    .replace(SKIP, " ")
    .replace(/\s+/g, " ")
    .trim() || t;
}

export function preferStepTitle(existing: string, incoming: string): string {
  const a = digitsIn(existing);
  const b = digitsIn(incoming);
  if (b && !a) return incoming;
  if (a && !b) return existing;
  if (incoming.length > existing.length + 8) return incoming;
  return existing;
}

export function bulletsFromText(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];
  const parts = raw.includes("\n")
    ? raw.split(/\n+/)
    : raw.split(/(?<=[.?!])\s+(?=[A-Z\u0900-\u097FI])/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    let line = part.replace(/^[-•*\d.)\s]+/, "").trim();
    if (!line) continue;
    if (!/[.?!…]$/.test(line) && line.length < 80) {
      /* keep */
    }
    const key = line.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

export function mergeBulletLists(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const line of bulletsFromText(list.join("\n"))) {
      const key = line.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/g, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return out;
}

export function bulletsToSummary(bullets: string[]): string {
  return bullets.join("\n");
}

export function takeFive(bullets: string[]): string[] {
  return mergeBulletLists([bullets]).slice(0, 5);
}
