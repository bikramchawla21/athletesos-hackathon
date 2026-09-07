import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractConfidentOccurrences,
  formatOccurrenceLedgerForInsights,
  mergeOccurrenceEpisodes,
  normalizeEpisodeKey,
  normalizePhenomenonKey,
  resolvePhenomenonKeyFromReport,
} from "../lib/occurrence-ledger.mjs";

describe("occurrence ledger helpers", () => {
  it("normalizes phenomenon keys to stable snake_case", () => {
    assert.equal(
      normalizePhenomenonKey("Protective When Ahead!!"),
      "protective_when_ahead",
    );
    assert.equal(normalizePhenomenonKey("  late__timing  "), "late_timing");
  });

  it("resolves phenomenonKey from report or pattern title", () => {
    assert.equal(
      resolvePhenomenonKeyFromReport({
        phenomenonKey: "Protective When Ahead",
        pattern: { title: "Other" },
      }),
      "protective_when_ahead",
    );
    assert.equal(
      resolvePhenomenonKeyFromReport({
        pattern: { title: "Late timing after rushed warm-up" },
      }),
      "late_timing_after_rushed_warm_up",
    );
  });

  it("merges prior ledger with incoming without double-counting", () => {
    const prior = [
      {
        episode: "Monday practice",
        episodeKey: "monday_practice",
        whyDistinct: "first",
      },
    ];
    const incoming = extractConfidentOccurrences({
      distinctOccurrences: [
        {
          episode: "Monday practice",
          whyDistinct: "same episode restated",
        },
        {
          episode: "Wednesday match",
          whyDistinct: "new competition episode",
        },
      ],
    });
    const merged = mergeOccurrenceEpisodes(prior, incoming);
    assert.equal(merged.length, 2);
    assert.equal(
      normalizeEpisodeKey("Monday practice"),
      normalizeEpisodeKey(merged[0].episode),
    );
  });

  it("formats ledger context for insights prompts", () => {
    const text = formatOccurrenceLedgerForInsights([
      {
        phenomenonKey: "protective_when_ahead",
        episode: "Monday practice",
        whyDistinct: "practice",
      },
      {
        phenomenonKey: "protective_when_ahead",
        episode: "Wednesday practice",
        whyDistinct: "practice 2",
      },
    ]);
    assert.match(text, /protective_when_ahead \(2\)/);
    assert.match(text, /Reuse phenomenonKey/i);
    assert.match(text, /Do not fabricate/i);
  });
});
