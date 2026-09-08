import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const person = await requirePerson();
  const { id } = await context.params;
  const body = (await request.json()) as { status?: string };
  const status = body.status;
  if (!status || !["proposed", "kept", "dropped", "done"].includes(status)) {
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  }
  const db = getSql();
  const rows = await db`
    UPDATE sayana_next_steps
    SET status = ${status}, updated_at = now()
    WHERE id = ${id} AND person_id = ${person.id}
    RETURNING id, status
  `;
  if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: rows[0].id, status: rows[0].status });
}
