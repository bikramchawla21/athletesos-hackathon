import { randomUUID } from "crypto";
import { countSpeech, mergeStats } from "@/domain/curse-count";
import { decideMode } from "@/domain/mode";
import { hourInZone, localDayKey, timeHintFromHour } from "@/domain/time-hint";
import { topWords } from "@/domain/tokenize";
import { preferStepTitle, stepIdentity, bulletsFromText, bulletsToSummary, mergeBulletLists, takeFive } from "@/domain/step-identity";
import { memoryDraftsFromExtract } from "@/domain/memory-kinds";
import { getSql } from "@/db/client";
import { persistAudioBlob } from "@/server/audio-vault";
import { companionReply, extractDump, transcribeAudio } from "@/server/openai";
import type { CurseCounts } from "@/domain/types";

export async function processDump(opts: {
  personId: string;
  file: File;
  timeZone: string;
  recordedAt?: Date;
}) {
  const recordedAt = opts.recordedAt ?? new Date();
  const audioBytes = Buffer.from(await opts.file.arrayBuffer());
  const sttFile = new File([audioBytes], opts.file.name || "dump.webm", {
    type: opts.file.type || "audio/webm",
  });
  const transcript = await transcribeAudio(sttFile);
  const stats = countSpeech(transcript);
  const hour = hourInZone(recordedAt, opts.timeZone);
  const mode = decideMode({
    transcript,
    recordedAt,
    timeZone: opts.timeZone,
  });
  const [extract, reply] = await Promise.all([
    extractDump(transcript),
    companionReply(transcript, mode.overwhelmed),
  ]);
  const overwhelmed = mode.overwhelmed || extract.overwhelmed;
  const day = localDayKey(recordedAt, opts.timeZone);
  const sessionId = randomUUID();
  const db = getSql();

  await db`
    INSERT INTO sayana_sessions (
      id, person_id, mode, why, overwhelmed, time_hint, language_mix, dump_lane,
      summary, transcript, recorded_at, time_zone, local_day
    ) VALUES (
      ${sessionId}, ${opts.personId}, ${mode.mode}, ${mode.why}, ${overwhelmed},
      ${timeHintFromHour(hour)}, ${extract.languageMix}, ${extract.lane}, ${extract.summary}, ${transcript},
      ${recordedAt.toISOString()}, ${opts.timeZone}, ${day}
    )
  `;
  const assetId = randomUUID();
  await db`
    INSERT INTO sayana_audio_assets (id, person_id, session_id, mime, byte_size)
    VALUES (
      ${assetId}, ${opts.personId}, ${sessionId}, ${opts.file.type || "audio/webm"}, ${opts.file.size}
    )
  `;
  const storageKey = await persistAudioBlob({
    assetId,
    personId: opts.personId,
    bytes: audioBytes,
  });
  if (storageKey) {
    await db`
      UPDATE sayana_audio_assets SET storage_key = ${storageKey}
      WHERE id = ${assetId} AND person_id = ${opts.personId}
    `;
  }
  await db`
    INSERT INTO sayana_session_stats (
      session_id, person_id, total_word_count, total_curse_count, word_counts, curse_counts
    ) VALUES (
      ${sessionId}, ${opts.personId}, ${stats.totalWordCount}, ${stats.totalCurseCount},
      ${JSON.stringify(stats.wordCounts)}::jsonb, ${JSON.stringify(stats.curseCounts)}::jsonb
    )
  `;

  const existingSteps = await db`
    SELECT id, title FROM sayana_next_steps
    WHERE person_id = ${opts.personId} AND local_day = ${day}
      AND status <> 'dropped'
  `;
  const existingList = Array.isArray(existingSteps) ? existingSteps : [];
  const byKey = new Map<string, { id: string; title: string }>();
  for (const row of existingList) {
    byKey.set(stepIdentity(String(row.title)), { id: String(row.id), title: String(row.title) });
  }

  if (extract.lane !== "life") {
    for (const step of extract.steps.slice(0, 5)) {
    const title = step.title.trim();
    if (!title) continue;
    const key = stepIdentity(title);
    const hit = byKey.get(key);
    if (hit) {
      const better = preferStepTitle(hit.title, title);
      if (better !== hit.title) {
        await db`
          UPDATE sayana_next_steps SET title = ${better}, updated_at = now()
          WHERE id = ${hit.id} AND person_id = ${opts.personId}
        `;
        hit.title = better;
      }
      continue;
    }
    const id = randomUUID();
    await db`
      INSERT INTO sayana_next_steps (id, person_id, session_id, local_day, title, due_hint, person_name, status)
      VALUES (${id}, ${opts.personId}, ${sessionId}, ${day}, ${title}, ${step.dueHint ?? null}, ${step.personName ?? null}, 'proposed')
    `;
    byKey.set(key, { id, title });
    }
  }

  for (const person of extract.people) {
    const name = person.name.trim();
    if (!name) continue;
    await db`
      INSERT INTO sayana_people_mentions (id, person_id, name, last_mentioned_at)
      VALUES (${randomUUID()}, ${opts.personId}, ${name}, ${recordedAt.toISOString()})
      ON CONFLICT (person_id, name) DO UPDATE SET last_mentioned_at = excluded.last_mentioned_at
    `;
  }

  for (const loop of extract.openLoops) {
    const title = loop.title.trim();
    if (!title) continue;
    await db`
      INSERT INTO sayana_open_loops (id, person_id, title, person_name, last_seen_at)
      VALUES (${randomUUID()}, ${opts.personId}, ${title}, ${loop.personName ?? null}, ${recordedAt.toISOString()})
      ON CONFLICT (person_id, title) DO UPDATE SET last_seen_at = excluded.last_seen_at
    `;
  }

  const existingMemory = await db`
    SELECT kind, title FROM sayana_memory_items
    WHERE person_id = ${opts.personId} AND local_day = ${day}
      AND briefing_status <> 'ignored'
  `;
  const memoryKeys = new Set(
    ((Array.isArray(existingMemory) ? existingMemory : []) as Array<{ kind?: unknown; title?: unknown }>).map(
      (row) => `${String(row.kind)}:${String(row.title ?? "").trim().toLowerCase()}`,
    ),
  );
  for (const draft of memoryDraftsFromExtract(extract)) {
    const key = `${draft.kind}:${draft.title.toLowerCase()}`;
    if (memoryKeys.has(key)) continue;
    memoryKeys.add(key);
    await db`
      INSERT INTO sayana_memory_items (
        id, person_id, session_id, local_day, kind, title, due_hint, person_name, briefing_status
      ) VALUES (
        ${randomUUID()}, ${opts.personId}, ${sessionId}, ${day}, ${draft.kind}, ${draft.title},
        ${draft.dueHint ?? null}, ${draft.personName ?? null}, 'pending'
      )
    `;
  }

  await db`
    INSERT INTO sayana_events (id, person_id, kind, payload)
    VALUES (
      ${randomUUID()}, ${opts.personId}, 'dump_processed',
      ${JSON.stringify({ sessionId, day, overwhelmed })}::jsonb
    )
  `;

  await rebuildDay(opts.personId, day);

  const fireAt = new Date(recordedAt.getTime() + 90 * 60 * 1000);
  await db`
    INSERT INTO sayana_reminders (id, person_id, local_day, body, fire_at)
    VALUES (
      ${randomUUID()}, ${opts.personId}, ${day},
      ${"Sayana — your briefing is still waiting. Approve or ignore."},
      ${fireAt.toISOString()}
    )
  `;

  return {
    sessionId,
    transcript,
    reply,
    overwhelmed,
    summary: extract.summary,
    stats: {
      totalWordCount: stats.totalWordCount,
      totalCurseCount: stats.totalCurseCount,
      curseCounts: stats.curseCounts,
      topWords: topWords(stats.wordCounts, 8),
    },
    day,
  };
}

export async function rebuildDay(personId: string, day: string) {
  const db = getSql();
  const sessions = await db`
    SELECT id, summary FROM sayana_sessions
    WHERE person_id = ${personId} AND local_day = ${day}
    ORDER BY recorded_at ASC
  `;
  const statsRows = await db`
    SELECT s.total_word_count, s.total_curse_count, s.word_counts, s.curse_counts
    FROM sayana_session_stats s
    JOIN sayana_sessions sess ON sess.id = s.session_id
    WHERE s.person_id = ${personId} AND sess.local_day = ${day}
  `;
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const statsList = Array.isArray(statsRows) ? statsRows : [];
  const merged = mergeStats(
    statsList.map((r) => ({
      totalWordCount: Number(r.total_word_count) || 0,
      totalCurseCount: Number(r.total_curse_count) || 0,
      wordCounts: (r.word_counts as Record<string, number>) || {},
      curseCounts: (r.curse_counts as CurseCounts) || {},
    })),
  );
  const summary = bulletsToSummary(
    takeFive(mergeBulletLists(sessionList.map((s) => bulletsFromText(String((s as { summary?: unknown }).summary || ""))))),
  );
  await db`
    INSERT INTO sayana_day_rollups (
      person_id, local_day, summary, dump_count, total_word_count, total_curse_count, curse_counts, word_counts, updated_at
    ) VALUES (
      ${personId}, ${day}, ${summary}, ${sessionList.length}, ${merged.totalWordCount}, ${merged.totalCurseCount},
      ${JSON.stringify(merged.curseCounts)}::jsonb, ${JSON.stringify(merged.wordCounts)}::jsonb, now()
    )
    ON CONFLICT (person_id, local_day) DO UPDATE SET
      summary = excluded.summary,
      dump_count = excluded.dump_count,
      total_word_count = excluded.total_word_count,
      total_curse_count = excluded.total_curse_count,
      curse_counts = excluded.curse_counts,
      word_counts = excluded.word_counts,
      updated_at = now()
  `;
}
