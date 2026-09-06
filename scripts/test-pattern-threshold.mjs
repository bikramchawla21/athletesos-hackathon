import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATHLETE_FACING_PATTERN_STATUSES,
  PATTERN_MIN_DISTINCT_OCCURRENCES,
  countConfidentDistinctOccurrences,
  isAthleteFacingLongitudinalPattern,
  presentReportForPatternMaturity,
  resolveOccurrenceMaturity,
  resolvePatternPersistStatus,
  spokenSynthesisForPatternMaturity,
} from "../lib/pattern-threshold.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const sampleReport = {
  observations: ["a", "b", "c"],
  evidenceIntro: "Moments lined up into a pattern.",
  evidence: [
    { category: "A", explanation: "one" },
    { category: "B", explanation: "two" },
    { category: "C", explanation: "three" },
  ],
  evidenceNote: "This is a pattern worth exploring.",
  pattern: {
    title: "Second serve softens under score pressure",
    explanation: "You tend to get careful when avoiding the double fault matters most.",
  },
  sharedPriority: "Commit through second serve.",
  focusIntro: "For the next two weeks",
  focusAreas: ["Commit"],
  closing: "Priorities can change.",
};

describe("pattern threshold — distinct real-world occurrences", () => {
  it("requires three distinct occurrences (not sessions)", () => {
    assert.equal(PATTERN_MIN_DISTINCT_OCCURRENCES, 3);
    assert.equal(isAthleteFacingLongitudinalPattern(1), false);
    assert.equal(isAthleteFacingLongitudinalPattern(2), false);
    assert.equal(isAthleteFacingLongitudinalPattern(3), true);
    assert.deepEqual([...ATHLETE_FACING_PATTERN_STATUSES], ["emerging", "revised"]);
  });

  it("1: three statements describing one event → 1 occurrence → no pattern", () => {
    const report = {
      ...sampleReport,
      distinctOccurrences: [
        {
          episode: "Yesterday’s league match second-serve collapse",
          whyDistinct: "All three athlete statements paraphrase the same match.",
        },
        {
          episode: "Yesterday’s league match second-serve collapse",
          whyDistinct: "Duplicate label for the same match — must not double-count.",
        },
        {
          episode: "Yesterday’s league match (restated)",
          whyDistinct: "", // incomplete → ignored
        },
      ],
    };
    // Only first counts; third lacks whyDistinct; second is duplicate episode key after normalize...
    // Second has same episode string after trim/lower → deduped. Third ignored.
    // Wait: second episode is identical so count=1. Third empty why → ignored.
    const n = countConfidentDistinctOccurrences(report);
    assert.equal(n, 1);
    assert.equal(resolvePatternPersistStatus(n), "proposed");
  });

  it("2: same event across three conversations → still 1 occurrence → no pattern", () => {
    const report = {
      ...sampleReport,
      distinctOccurrences: [
        {
          episode: "The Sunday final vs. Jordan",
          whyDistinct: "Same match referenced again in a later conversation.",
        },
      ],
    };
    const n = resolveOccurrenceMaturity({ report });
    assert.equal(n, 1);
    assert.equal(resolvePatternPersistStatus(n), "proposed");
  });

  it("3: same phenomenon across three separate real-world events → pattern-eligible", () => {
    const report = {
      ...sampleReport,
      distinctOccurrences: [
        {
          episode: "Monday practice — double fault at 5–5",
          whyDistinct: "Distinct practice episode on Monday.",
        },
        {
          episode: "Wednesday practice — arm locked on second serve",
          whyDistinct: "Separate mid-week practice, different date/context.",
        },
        {
          episode: "Saturday match — soft second serve under break point",
          whyDistinct: "Competition episode, not the same practice sessions.",
        },
      ],
    };
    const n = resolveOccurrenceMaturity({ report });
    assert.equal(n, 3);
    assert.equal(resolvePatternPersistStatus(n), "emerging");
  });

  it("4: three separate historical events in one conversation → pattern-eligible", () => {
    const report = {
      ...sampleReport,
      distinctOccurrences: [
        {
          episode: "Monday practice",
          whyDistinct: "Athlete explicitly named Monday practice as its own episode.",
        },
        {
          episode: "Wednesday practice",
          whyDistinct: "Athlete explicitly named Wednesday practice separately.",
        },
        {
          episode: "Today’s match",
          whyDistinct: "Athlete named today’s match as a third separate episode.",
        },
      ],
    };
    assert.equal(countConfidentDistinctOccurrences(report), 3);
    assert.equal(resolvePatternPersistStatus(3), "emerging");
  });

  it("5: two occurrences across any conversations → no pattern", () => {
    const report = {
      ...sampleReport,
      distinctOccurrences: [
        {
          episode: "Session 1 match",
          whyDistinct: "First real-world episode.",
        },
        {
          episode: "Session 8 practice",
          whyDistinct: "Second real-world episode weeks later.",
        },
      ],
    };
    const n = resolveOccurrenceMaturity({ report });
    assert.equal(n, 2);
    assert.equal(resolvePatternPersistStatus(n), "proposed");
    const spoken = spokenSynthesisForPatternMaturity(sampleReport, 2);
    assert.match(spoken, /two separate|still early/i);
    assert.doesNotMatch(spoken, /becoming a pattern/i);
  });

  it("6: ambiguous occurrence count → no athlete-facing pattern", () => {
    assert.equal(countConfidentDistinctOccurrences({}), 0);
    assert.equal(countConfidentDistinctOccurrences({ distinctOccurrences: [] }), 0);
    assert.equal(
      countConfidentDistinctOccurrences({
        distinctOccurrences: [{ episode: "maybe something", whyDistinct: "" }],
      }),
      0,
    );
    assert.equal(resolvePatternPersistStatus(0), "proposed");
    const presented = presentReportForPatternMaturity(sampleReport, 0);
    assert.match(presented.pattern.explanation, /observation|candidate/i);
    assert.doesNotMatch(presented.pattern.explanation, /\byou tend to\b/i);
  });

  it("athlete-facing synthesis cannot use longitudinal language below threshold", () => {
    const presented = presentReportForPatternMaturity(sampleReport, 1);
    assert.match(presented.pattern.explanation, /observation|today/i);
    assert.doesNotMatch(presented.pattern.explanation, /\byou tend to\b/i);
    const spoken = spokenSynthesisForPatternMaturity(presented, 1);
    assert.match(spoken, /today|noticed/i);
    assert.doesNotMatch(spoken, /becoming a pattern|you tend to|keeps happening/i);
  });
});

describe("pattern threshold wiring", () => {
  it("persist path uses occurrence maturity; memory only loads emerging/revised", () => {
    const persist = readFileSync(
      join(__dirname, "../server/services/insights-persist-service.ts"),
      "utf8",
    );
    const memory = readFileSync(
      join(__dirname, "../server/services/memory-service.ts"),
      "utf8",
    );
    const insights = readFileSync(join(__dirname, "../lib/insights.mjs"), "utf8");
    assert.match(persist, /resolveOccurrenceMaturity/);
    assert.match(persist, /resolvePatternPersistStatus/);
    assert.match(persist, /presentReportForPatternMaturity/);
    assert.match(persist, /occurrenceCount/);
    assert.doesNotMatch(persist, /resolveSessionPatternMaturity/);
    assert.match(memory, /\["emerging", "revised"\]/);
    assert.doesNotMatch(memory, /PATTERN_MIN_DISTINCT_CONVERSATIONS/);
    assert.doesNotMatch(memory, /distinctConversations/);
    assert.doesNotMatch(memory, /inArray\(patterns\.status, \["emerging", "supported"/);
    assert.match(insights, /distinctOccurrences/);
    assert.match(insights, /distinct real-world/);
    assert.doesNotMatch(insights, /three distinct discovery sessions/i);
  });
});
