import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const person = await requirePerson();
  const { id } = await context.params;
  const body = (await request.json()) as { status?: string };
  const status = body.status;
  if (!status || !["approved", "ignored"].includes(status)) {
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  }
  const db = getSql();
  const rows = await db`
    UPDATE sayana_memory_items
    SET briefing_status = ${status}, updated_at = now()
    WHERE id = ${id} AND person_id = ${person.id}
    RETURNING id, briefing_status
  `;
  const row = (Array.isArray(rows) ? rows[0] : undefined) as
    | { id?: unknown; briefing_status?: unknown }
    | undefined;
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: row.id, status: row.briefing_status });
}
