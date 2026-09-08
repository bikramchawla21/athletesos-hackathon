import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { processDump } from "@/server/process-dump";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const person = await requirePerson();
    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "audio required" }, { status: 400 });
    }
    const timeZone = String(form.get("timeZone") || "UTC");
    const result = await processDump({ personId: person.id, file, timeZone });
    return NextResponse.json({ ok: true, personId: person.id, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "dump failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
