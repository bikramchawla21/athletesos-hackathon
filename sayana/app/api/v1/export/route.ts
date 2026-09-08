import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";

export async function GET() {
  const person = await requirePerson();
  const db = getSql();
  const sessions = await db`
    SELECT id, local_day, summary, recorded_at, overwhelmed, transcript
    FROM sayana_sessions WHERE person_id = ${person.id}
    ORDER BY recorded_at DESC LIMIT 200
  `;
  const steps = await db`
    SELECT id, local_day, title, status FROM sayana_next_steps
    WHERE person_id = ${person.id} ORDER BY created_at DESC LIMIT 500
  `;
  const stats = await db`
    SELECT session_id, total_word_count, total_curse_count, curse_counts
    FROM sayana_session_stats WHERE person_id = ${person.id}
  `;
  const memory = await db`
    SELECT id, local_day, kind, title, briefing_status
    FROM sayana_memory_items
    WHERE person_id = ${person.id}
    ORDER BY created_at DESC LIMIT 500
  `;
  const audio = await db`
    SELECT id, session_id, mime, byte_size, storage_key
    FROM sayana_audio_assets WHERE person_id = ${person.id}
  `;
  return NextResponse.json({
    personId: person.id,
    exportedAt: new Date().toISOString(),
    sessions,
    steps,
    stats,
    memory,
    audio,
  });
}
