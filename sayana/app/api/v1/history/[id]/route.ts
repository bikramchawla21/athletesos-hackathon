import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const person = await requirePerson();
  const { id } = await context.params;
  const db = getSql();
  const rows = await db`
    SELECT
      sess.id,
      sess.local_day,
      sess.recorded_at,
      sess.dump_lane,
      sess.transcript,
      sess.summary,
      COALESCE(st.total_word_count, 0) AS total_word_count,
      COALESCE(st.total_curse_count, 0) AS total_curse_count
    FROM sayana_sessions sess
    LEFT JOIN sayana_session_stats st ON st.session_id = sess.id
    WHERE sess.person_id = ${person.id} AND sess.id = ${id}
    LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : undefined) as
    | {
        id?: unknown;
        local_day?: unknown;
        recorded_at?: unknown;
        dump_lane?: unknown;
        transcript?: unknown;
        summary?: unknown;
        total_word_count?: unknown;
        total_curse_count?: unknown;
      }
    | undefined;
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: String(row.id),
    day: String(row.local_day),
    recordedAt: row.recorded_at ? String(row.recorded_at) : "",
    lane: String(row.dump_lane || "work"),
    transcript: String(row.transcript || ""),
    summary: String(row.summary || ""),
    wordCount: Number(row.total_word_count || 0),
    curseCount: Number(row.total_curse_count || 0),
  });
}
