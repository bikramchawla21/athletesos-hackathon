import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";
import { stepsToIcs } from "@/domain/ics";
import { localDayKey } from "@/domain/time-hint";

export async function GET(request: Request) {
  const person = await requirePerson();
  const tz = new URL(request.url).searchParams.get("tz") || "UTC";
  const day = new URL(request.url).searchParams.get("day") || localDayKey(new Date(), tz);
  const db = getSql();
  const steps = await db`
    SELECT title, local_day FROM sayana_next_steps
    WHERE person_id = ${person.id} AND local_day = ${day} AND status IN ('kept', 'proposed')
  `;
  const ics = stepsToIcs(
    steps.map((s) => ({ title: String(s.title), day: String(s.local_day) })),
  );
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="sayana-${day}.ics"`,
    },
  });
}
