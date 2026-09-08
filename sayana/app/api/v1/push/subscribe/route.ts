import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  const person = await requirePerson();
  const body = (await request.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "subscription required" }, { status: 400 });
  }
  const db = getSql();
  await db`
    INSERT INTO sayana_push_subs (id, person_id, endpoint, p256dh, auth)
    VALUES (${randomUUID()}, ${person.id}, ${body.endpoint}, ${body.keys.p256dh}, ${body.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE SET person_id = excluded.person_id, p256dh = excluded.p256dh, auth = excluded.auth
  `;
  return NextResponse.json({ ok: true });
}
