import type { TimeHint } from "./types";

export function timeHintFromHour(hour: number): TimeHint {
  if (hour >= 0 && hour < 5) return "late_night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function localDayKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function hourInZone(date: Date, timeZone: string): number {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date);
    return Number.parseInt(hour, 10);
  } catch {
    return date.getHours();
  }
}
