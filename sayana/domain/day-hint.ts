import { localDayKey } from "./time-hint";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function weekdayInZone(date: Date, timeZone: string): number {
  try {
    const w = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(w.slice(0, 3));
  } catch {
    return date.getDay();
  }
}

function shiftDays(date: Date, n: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Map "last Tuesday" / a weekday / YYYY-MM-DD onto local_day keys. */
export function dayHintsFromQuery(q: string, now = new Date(), timeZone = "UTC"): string[] {
  const text = q.trim().toLowerCase();
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return [iso[1]];

  const today = localDayKey(now, timeZone);
  if (/\btoday\b/.test(text)) return [today];
  if (/\byesterday\b/.test(text)) return [localDayKey(shiftDays(now, -1), timeZone)];

  const last = /\blast\b/.test(text);
  const todayWd = weekdayInZone(now, timeZone);
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (!text.includes(WEEKDAYS[i])) continue;
    let delta = (todayWd - i + 7) % 7;
    if (delta === 0) delta = last ? 7 : 0;
    else if (last && delta < 7) {
      /* already in the past this week */
    }
    return [localDayKey(shiftDays(now, -delta), timeZone)];
  }
  return [];
}
