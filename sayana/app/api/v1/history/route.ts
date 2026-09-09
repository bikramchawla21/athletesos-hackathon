import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";

export async function GET() {
  const person = await requirePerson();
  const db = getSql();
  const rows = await db`
    SELECT
      sess.id,
      sess.local_day,
      sess.recorded_at,
      sess.dump_lane,
      sess.transcript,
      COALESCE(st.total_word_count, 0) AS total_word_count,
      COALESCE(st.total_curse_count, 0) AS total_curse_count
    FROM sayana_sessions sess
    LEFT JOIN sayana_session_stats st ON st.session_id = sess.id
    WHERE sess.person_id = ${person.id}
    ORDER BY sess.recorded_at DESC
    LIMIT 80
  `;
  const list = (Array.isArray(rows) ? rows : []) as Array<{
    id?: unknown;
    local_day?: unknown;
    recorded_at?: unknown;
    dump_lane?: unknown;
    transcript?: unknown;
    total_word_count?: unknown;
    total_curse_count?: unknown;
  }>;
  return NextResponse.json({
    sessions: list.map((row) => {
      const transcript = String(row.transcript || "");
      return {
        id: String(row.id),
        day: String(row.local_day),
        recordedAt: row.recorded_at ? String(row.recorded_at) : "",
        lane: String(row.dump_lane || "work"),
        wordCount: Number(row.total_word_count || 0),
        curseCount: Number(row.total_curse_count || 0),
        preview: transcript.slice(0, 140),
      };
    }),
  });
}
