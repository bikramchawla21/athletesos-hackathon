import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";
import { dayHintsFromQuery } from "@/domain/day-hint";

export async function POST(request: Request) {
  const person = await requirePerson();
  const body = (await request.json()) as { q?: string; tz?: string };
  const q = (body.q || "").trim();
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  const timeZone = body.tz || "UTC";
  const days = dayHintsFromQuery(q, new Date(), timeZone);
  const db = getSql();
  const like = `%${q}%`;

  const sessions = days.length
    ? await db`
        SELECT id, local_day, recorded_at, dump_lane, transcript
        FROM sayana_sessions
        WHERE person_id = ${person.id} AND local_day = ${days[0]}
        ORDER BY recorded_at DESC
        LIMIT 12
      `
    : await db`
        SELECT id, local_day, recorded_at, dump_lane, transcript
        FROM sayana_sessions
        WHERE person_id = ${person.id} AND transcript ILIKE ${like}
        ORDER BY recorded_at DESC
        LIMIT 12
      `;

  const list = (Array.isArray(sessions) ? sessions : []) as Array<{
    id?: unknown;
    local_day?: unknown;
    recorded_at?: unknown;
    dump_lane?: unknown;
    transcript?: unknown;
  }>;

  return NextResponse.json({
    q,
    days,
    sessions: list.map((row) => {
      const transcript = String(row.transcript || "");
      return {
        id: String(row.id),
        day: String(row.local_day),
        recordedAt: row.recorded_at ? String(row.recorded_at) : "",
        lane: String(row.dump_lane || "work"),
        transcript,
        preview: transcript.slice(0, 280),
      };
    }),
  });
}
