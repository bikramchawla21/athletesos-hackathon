import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";

export async function POST(request: Request) {
  const person = await requirePerson();
  const body = (await request.json()) as { q?: string };
  const q = (body.q || "").trim();
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  const db = getSql();
  const days = await db`
    SELECT local_day, summary, dump_count
    FROM sayana_day_rollups
    WHERE person_id = ${person.id}
      AND (summary ILIKE ${"%" + q + "%"} OR local_day ILIKE ${"%" + q + "%"})
    ORDER BY local_day DESC
    LIMIT 20
  `;
  const steps = await db`
    SELECT title, local_day, status
    FROM sayana_next_steps
    WHERE person_id = ${person.id} AND title ILIKE ${"%" + q + "%"}
    ORDER BY created_at DESC
    LIMIT 20
  `;
  const people = await db`
    SELECT name, last_mentioned_at
    FROM sayana_people_mentions
    WHERE person_id = ${person.id} AND name ILIKE ${"%" + q + "%"}
    LIMIT 20
  `;
  return NextResponse.json({ days, steps, people });
}
