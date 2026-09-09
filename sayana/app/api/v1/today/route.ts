import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";
import { localDayKey } from "@/domain/time-hint";
import { topWords } from "@/domain/tokenize";
import { takeFive, bulletsFromText } from "@/domain/step-identity";
import { BRIEFING_KIND_ORDER } from "@/domain/memory-kinds";
import type { CurseCounts, MemoryKind } from "@/domain/types";

export async function GET(request: Request) {
  const person = await requirePerson();
  const url = new URL(request.url);
  const timeZone = url.searchParams.get("tz") || "UTC";
  const day = url.searchParams.get("day") || localDayKey(new Date(), timeZone);
  const db = getSql();

  await db`
    UPDATE sayana_memory_items
    SET briefing_status = 'ignored', updated_at = now()
    WHERE person_id = ${person.id}
      AND briefing_status = 'pending'
      AND created_at < now() - interval '12 hours'
  `;

  const rollup = await db`
    SELECT summary, dump_count, total_word_count, total_curse_count, curse_counts, word_counts
    FROM sayana_day_rollups
    WHERE person_id = ${person.id} AND local_day = ${day}
    LIMIT 1
  `;
  const steps = await db`
    SELECT id, title, status, due_hint, person_name
    FROM sayana_next_steps
    WHERE person_id = ${person.id} AND local_day = ${day}
      AND status <> 'dropped'
    ORDER BY created_at ASC
  `;
  const briefingRows = await db`
    SELECT id, kind, title, due_hint, person_name, local_day, created_at
    FROM sayana_memory_items
    WHERE person_id = ${person.id} AND briefing_status = 'pending'
    ORDER BY created_at ASC
  `;
  const r = (Array.isArray(rollup) ? rollup[0] : undefined) as
    | {
        summary?: unknown;
        dump_count?: unknown;
        total_word_count?: unknown;
        total_curse_count?: unknown;
        curse_counts?: unknown;
        word_counts?: unknown;
      }
    | undefined;
  const wordCounts = (r?.word_counts as Record<string, number>) || {};
  const curseCounts = (r?.curse_counts as CurseCounts) || {};
  const stepRows = (Array.isArray(steps) ? steps : []) as Array<{
    id: unknown;
    title: unknown;
    status: unknown;
    due_hint: unknown;
    person_name: unknown;
  }>;
  const briefingList = (Array.isArray(briefingRows) ? briefingRows : []) as Array<{
    id: unknown;
    kind: unknown;
    title: unknown;
    due_hint: unknown;
    person_name: unknown;
    local_day: unknown;
  }>;
  const kindRank = (kind: string) => {
    const i = BRIEFING_KIND_ORDER.indexOf(kind as MemoryKind);
    return i < 0 ? 99 : i;
  };
  const queued = [...briefingList]
    .sort((a, b) => kindRank(String(a.kind)) - kindRank(String(b.kind)))
    .slice(0, 5);

  return NextResponse.json({
    day,
    personId: person.id,
    summary: takeFive(bulletsFromText(String(r?.summary || ""))).join("\n"),
    dumpCount: Number(r?.dump_count || 0),
    totalWordCount: Number(r?.total_word_count || 0),
    totalCurseCount: Number(r?.total_curse_count || 0),
    curseCounts,
    topWords: topWords(wordCounts, 12),
    steps: stepRows.slice(0, 5).map((s) => ({
      id: String(s.id),
      title: String(s.title),
      status: String(s.status),
      dueHint: s.due_hint ? String(s.due_hint) : null,
      personName: s.person_name ? String(s.person_name) : null,
    })),
    briefing: queued.map((item) => ({
      id: String(item.id),
      kind: String(item.kind),
      title: String(item.title),
      dueHint: item.due_hint ? String(item.due_hint) : null,
      personName: item.person_name ? String(item.person_name) : null,
      day: String(item.local_day),
    })),
    briefingTotal: queued.length,
  });
}
