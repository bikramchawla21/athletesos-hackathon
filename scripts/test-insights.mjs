import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  generateInsights,
  hasSufficientContext,
  INSIGHT_INSTRUCTIONS,
  parseReflectionReport,
} from "../lib/insights.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const shortTranscript = [
  { role: "assistant", content: "Whenever you’re ready, I’m listening." },
  { role: "user", content: "I play tennis." },
];

const richTranscript = [
  {
    role: "assistant",
    content: "I’m looking forward to getting to know you. Whenever you’re ready, I’m listening.",
  },
  {
    role: "user",
    content:
      "I’ve played tennis since I was eight. Lately after close losses I feel lost and start questioning my technique immediately.",
  },
  {
    role: "assistant",
    content:
      "It sounds like close losses pull you straight into fixing your technique. When that happens, what do you usually do next in training?",
  },
  {
    role: "user",
    content:
      "I usually add more practice the next day. Extra serving, extra drills — I try to work harder instead of slowing down.",
  },
  {
    role: "assistant",
    content:
      "So disappointment often turns into more volume. How does that show up during important points in a match?",
  },
  {
    role: "user",
    content:
      "When momentum shifts against me I freeze a bit. I hesitate on decisions even when my body feels ready. Then after the match I replay everything and look for something technical to fix.",
  },
];

const correctionTranscript = [
  { role: "assistant", content: "Whenever you’re ready, I’m listening." },
  {
    role: "user",
    content:
      "Matches feel harder lately. After I drop the first set I stop trusting my shots and start overthinking every ball.",
  },
  {
    role: "assistant",
    content:
      "It sounds like the main issue might be a technical breakdown after you lose the opening set. Is your forehand the shot that usually falls apart?",
  },
  {
    role: "user",
    content:
      "That’s not right — my technique is actually fine. What changes is my confidence and how quickly I recover emotionally after momentum swings. I get tight between points.",
  },
  {
    role: "assistant",
    content:
      "Thanks for correcting me. So it’s less about the stroke and more about how you reset after momentum shifts. What does that tightness feel like between points?",
  },
  {
    role: "user",
    content:
      "My mind races. I rush the next point instead of breathing. In practice I’m free, but after a rough game I clutch and play safe.",
  },
];

const correctionAwareReport = {
  observations: [
    "You notice a clear difference between how freely you play in practice and how tightly you respond after momentum swings.",
    "After dropping the first set, your attention shifts toward overthinking rather than stroke mechanics.",
    "You corrected the idea that technique is the core issue and pointed instead to emotional recovery between points.",
    "Rushing the next point after a rough game is a recurring response you recognize.",
  ],
  evidenceIntro:
    "Looking across what you shared, a few separate moments started pointing in the same direction.",
  evidence: [
    {
      category: "Match reflections",
      explanation:
        "You said that after dropping the first set you stop trusting your shots and start overthinking every ball.",
    },
    {
      category: "Athlete correction",
      explanation:
        "You corrected AthleteOS and said your technique is fine; what changes is confidence and emotional recovery after momentum swings.",
    },
    {
      category: "Between-point habits",
      explanation:
        "You described your mind racing and rushing the next point instead of breathing after a rough game.",
    },
  ],
  evidenceNote: "This isn’t proof. It’s simply the pattern I keep seeing across your journey.",
  pattern: {
    title: "Emotional recovery after momentum shifts",
    explanation:
      "I don’t think the strongest pattern is technical right now. I think it’s how quickly tension builds between points after momentum changes, and I may be wrong — but it seems worth exploring together.",
  },
  sharedPriority: "Practice a simple between-point reset after momentum swings.",
  focusIntro:
    "For the next two weeks, let’s leave technique alone and train how we recover between points.",
  focusAreas: [
    "Use one breath-and-commit reset after difficult points.",
    "Notice rushing without judging it during matches.",
    "Keep practice free and transfer that freedom into the next point after setbacks.",
  ],
  closing: "We’ll keep learning together, and if the patterns change, our priorities will change too.",
};

describe("insights context gate", () => {
  it("rejects a short transcript", () => {
    assert.equal(hasSufficientContext(shortTranscript), false);
  });

  it("accepts a rich transcript with a repeated pattern", () => {
    assert.equal(hasSufficientContext(richTranscript), true);
  });

  it("accepts a correction transcript with enough athlete signal", () => {
    assert.equal(hasSufficientContext(correctionTranscript), true);
  });
});

describe("generateInsights", () => {
  it("returns insufficient_context for a short transcript without inventing a pattern", async () => {
    const result = await generateInsights(shortTranscript, { apiKey: "" });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 422);
    assert.equal(result.body.code, "insufficient_context");
    assert.equal("report" in result.body, false);
  });

  it("returns a Zod-valid demo report for a rich transcript when no API key is set", async () => {
    const result = await generateInsights(richTranscript, { apiKey: "" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.demoMode, true);
    const report = parseReflectionReport(result.body.report);
    assert.ok(report.observations.length >= 3);
    assert.ok(report.evidence.length >= 3);
    assert.ok(report.pattern.title.length > 0);
  });

  it("honors a correction-aware mock report and omits the disputed technical diagnosis", async () => {
    const result = await generateInsights(correctionTranscript, {
      apiKey: "test-key-not-replace_me",
      modelClient: {
        async generateReport() {
          return correctionAwareReport;
        },
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.demoMode, false);
    const report = result.body.report;
    const blob = JSON.stringify(report).toLowerCase();
    assert.match(blob, /momentum|emotional|confidence|recover/);
    assert.doesNotMatch(blob, /forehand is the core|technical breakdown is the main/);
    assert.ok(
      report.evidence.some((item) =>
        item.explanation.toLowerCase().includes("technique is fine"),
      ),
    );
  });

  it("retries once on invalid model JSON then returns upstream error if repair also fails", async () => {
    let calls = 0;
    const result = await generateInsights(richTranscript, {
      apiKey: "test-key-not-replace_me",
      modelClient: {
        async generateReport() {
          calls += 1;
          return { invalid: true };
        },
      },
    });

    assert.equal(calls, 2);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 502);
    assert.equal(result.body.code, "INVALID_INSIGHTS_RESPONSE");
  });
});

describe("insight prompt safeguards", () => {
  it("requires transcript-only evidence and honors corrections", () => {
    assert.match(INSIGHT_INSTRUCTIONS, /Never invent coach feedback/i);
    assert.match(INSIGHT_INSTRUCTIONS, /corrections?/i);
    assert.match(INSIGHT_INSTRUCTIONS, /three distinct signals/i);
    assert.match(INSIGHT_INSTRUCTIONS, /Do not diagnose/i);
  });

  it("keeps the live route file wired to generateInsights", () => {
    const routePath = join(__dirname, "../app/api/insights/route.ts");
    const source = readFileSync(routePath, "utf8");
    assert.match(source, /generateInsights/);
    assert.match(source, /parseInsightsRequest/);
  });
});
