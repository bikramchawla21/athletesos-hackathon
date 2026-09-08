import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";
import { getSql } from "@/db/client";
import { mergeStats } from "@/domain/curse-count";
import { topWords } from "@/domain/tokenize";
import type { CurseCounts, SessionStats } from "@/domain/types";

export async function GET(request: Request) {
  const person = await requirePerson();
  const range = new URL(request.url).searchParams.get("range") === "month" ? "month" : "week";
  const days = range === "month" ? 31 : 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const db = getSql();
  const rows = await db`
    SELECT dump_count, total_word_count, total_curse_count, curse_counts, word_counts, local_day, summary
    FROM sayana_day_rollups
    WHERE person_id = ${person.id} AND updated_at >= ${since}
    ORDER BY local_day DESC
  `;
  const merged = mergeStats(
    rows.map(
      (r): SessionStats => ({
        totalWordCount: Number(r.total_word_count) || 0,
        totalCurseCount: Number(r.total_curse_count) || 0,
        wordCounts: (r.word_counts as Record<string, number>) || {},
        curseCounts: (r.curse_counts as CurseCounts) || {},
      }),
    ),
  );
  const dumpCount = rows.reduce((n, r) => n + Number(r.dump_count || 0), 0);
  return NextResponse.json({
    range,
    dumpCount,
    totalWordCount: merged.totalWordCount,
    totalCurseCount: merged.totalCurseCount,
    curseCounts: merged.curseCounts,
    topWords: topWords(merged.wordCounts, 16),
    days: rows.map((r) => ({
      day: String(r.local_day),
      summary: String(r.summary || ""),
      dumps: Number(r.dump_count || 0),
    })),
  });
}
