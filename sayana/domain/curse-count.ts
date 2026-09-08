import type { SessionStats } from "./types";
import { contentWordHistogram, tokenize } from "./tokenize";
import { getPreparedLexicon, STANDALONE_ABBREV } from "./curse-lexicon";

function sumCounts(map: Record<string, number>): number {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

/**
 * Count distinct curse types (longest match). motherfucker does not increment fuck.
 * madhchod / मादरचोद collapse to madarchod. mc/bc only as standalone tokens.
 */
export function countSpeech(text: string): SessionStats {
  const tokens = tokenize(text);
  const curseCounts: Record<string, number> = {};
  const used = new Array(tokens.length).fill(false);
  const prepared = getPreparedLexicon();

  const lower = tokens;

  for (const phrase of prepared.phrases) {
    const parts = phrase.alias.split(/\s+/);
    for (let i = 0; i <= lower.length - parts.length; i++) {
      if (used.slice(i, i + parts.length).some(Boolean)) continue;
      let ok = true;
      for (let j = 0; j < parts.length; j++) {
        if (lower[i + j] !== parts[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        curseCounts[phrase.id] = (curseCounts[phrase.id] ?? 0) + 1;
        for (let j = 0; j < parts.length; j++) used[i + j] = true;
      }
    }
  }

  const singlesByLen = [...prepared.singles.keys()].sort((a, b) => b.length - a.length);

  for (let i = 0; i < lower.length; i++) {
    if (used[i]) continue;
    const tok = lower[i];
    if (STANDALONE_ABBREV[tok]) {
      const id = STANDALONE_ABBREV[tok];
      curseCounts[id] = (curseCounts[id] ?? 0) + 1;
      used[i] = true;
      continue;
    }
    let hit: string | undefined;
    for (const alias of singlesByLen) {
      if (tok === alias) {
        hit = prepared.singles.get(alias);
        break;
      }
    }
    if (hit) {
      curseCounts[hit] = (curseCounts[hit] ?? 0) + 1;
      used[i] = true;
    }
  }

  return {
    totalWordCount: tokens.length,
    curseCounts,
    totalCurseCount: sumCounts(curseCounts),
    wordCounts: contentWordHistogram(tokens),
  };
}

export function mergeStats(parts: SessionStats[]): SessionStats {
  const wordCounts: Record<string, number> = {};
  const curseCounts: Record<string, number> = {};
  let totalWordCount = 0;
  for (const p of parts) {
    totalWordCount += p.totalWordCount;
    for (const [k, v] of Object.entries(p.wordCounts)) wordCounts[k] = (wordCounts[k] ?? 0) + v;
    for (const [k, v] of Object.entries(p.curseCounts)) curseCounts[k] = (curseCounts[k] ?? 0) + v;
  }
  return {
    totalWordCount,
    wordCounts,
    curseCounts,
    totalCurseCount: sumCounts(curseCounts),
  };
}
