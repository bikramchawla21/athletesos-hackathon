import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  looksLikeAnythingElsePrompt,
  looksLikeSessionEndIntent,
  shouldFinalizeVoiceSession,
  MIN_USER_TURNS_BEFORE_SESSION_END,
} from "../lib/session-end.mjs";
import {
  getDemoSpokenInsightSynthesis,
  generateSpokenInsightSynthesis,
} from "../lib/insights.mjs";
import { requestVoiceInsights, submitVoiceInsightFamiliarity } from "../lib/voice-chat.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const sampleReport = {
  observations: ["Second serve got careful late."],
  evidenceIntro: "A few moments lined up.",
  evidence: [{ category: "Score pressure", explanation: "At 4-4 the serve slowed." }],
  evidenceNote: "Not proof.",
  pattern: {
    title: "Second serve softens when avoiding the double fault matters more",
    explanation: "I think the shift is more pressure response than pure technique.",
  },
  sharedPriority: "Practice committing through second serve under score pressure.",
  focusIntro: "For the next two weeks",
  focusAreas: ["Commit through contact"],
  closing: "Priorities can change as we learn.",
};

describe("session end detection", () => {
  it("recognizes clear end intents", () => {
    assert.equal(looksLikeSessionEndIntent("No."), true);
    assert.equal(looksLikeSessionEndIntent("That's it."), true);
    assert.equal(looksLikeSessionEndIntent("Nothing else"), true);
    assert.equal(looksLikeSessionEndIntent("I'm done"), true);
    assert.equal(looksLikeSessionEndIntent("No, that's it."), true);
  });

  it("does not treat ordinary short answers as session end", () => {
    assert.equal(looksLikeSessionEndIntent("Yeah"), false);
    assert.equal(looksLikeSessionEndIntent("Okay"), false);
    assert.equal(looksLikeSessionEndIntent("The toss felt late"), false);
    assert.equal(looksLikeSessionEndIntent("Maybe"), false);
  });

  it("detects Anything else from today prompts", () => {
    assert.equal(looksLikeAnythingElsePrompt("Anything else from today?"), true);
    assert.equal(looksLikeAnythingElsePrompt("What changed first?"), false);
  });

  it("requires enough turns and clear intent (Done is explicit)", () => {
    assert.equal(
      shouldFinalizeVoiceSession({
        userTurnCount: 2,
        athleteText: "That's it.",
      }),
      false,
    );
    assert.equal(
      shouldFinalizeVoiceSession({
        userTurnCount: MIN_USER_TURNS_BEFORE_SESSION_END,
        athleteText: "That's it.",
      }),
      true,
    );
    assert.equal(
      shouldFinalizeVoiceSession({
        userTurnCount: 2,
        athleteText: "Yeah",
        explicitDone: true,
      }),
      true,
    );
  });
});

describe("spoken insight synthesis", () => {
  it("demo synthesis is short and grounded in the report", () => {
    const text = getDemoSpokenInsightSynthesis(sampleReport);
    assert.match(text, /second serve/i);
    assert.ok(text.split(/\s+/).length < 80);
  });

  it("generateSpokenInsightSynthesis uses model client when provided", async () => {
    const result = await generateSpokenInsightSynthesis(sampleReport, {
      apiKey: "sk-test",
      modelClient: {
        async generateSpoken() {
          return "One thing worth watching: the second serve softens under score pressure.";
        },
      },
    });
    assert.equal(result.ok, true);
    assert.match(result.body.spokenSynthesis, /second serve/i);
  });
});

describe("voice insights client", () => {
  it("posts to /api/insights with voice_pwa and returns spokenSynthesis", async () => {
    const result = await requestVoiceInsights({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      conversationId: "22222222-2222-2222-2222-222222222222",
      fetchImpl: async (url, init) => {
        assert.equal(url, "/api/insights");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.client, "voice_pwa");
        return new Response(
          JSON.stringify({
            report: sampleReport,
            spokenSynthesis: "Worth watching: pressure response on second serve.",
            patternId: "33333333-3333-3333-3333-333333333333",
            reflectionId: "44444444-4444-4444-4444-444444444444",
            priorityId: "55555555-5555-5555-5555-555555555555",
          }),
          { status: 200 },
        );
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.spokenSynthesis || "", /pressure response/);
      assert.equal(result.patternId, "33333333-3333-3333-3333-333333333333");
    }
  });

  it("maps familiarity feedback onto existing pattern feedback API", async () => {
    const ok = await submitVoiceInsightFamiliarity({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      patternId: "33333333-3333-3333-3333-333333333333",
      answer: "no",
      fetchImpl: async (url, init) => {
        assert.match(String(url), /\/api\/patterns\/.+\/feedback/);
        const body = JSON.parse(String(init?.body));
        assert.equal(body.response, "disagree");
        assert.match(body.note, /Did you already know this/);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });
    assert.equal(ok, true);
  });
});

describe("voice session finalization wiring", () => {
  it("VoiceHome uses insights finalize, Done fallback, and does not TTS-retry insights", () => {
    const home = readFileSync(join(__dirname, "../components/VoiceHome.tsx"), "utf8");
    const route = readFileSync(join(__dirname, "../app/api/insights/route.ts"), "utf8");
    assert.match(home, /requestVoiceInsights/);
    assert.match(home, /finalizing/);
    assert.match(home, /speaking_insight/);
    assert.match(home, /finished/);
    assert.match(home, /markDone/);
    assert.match(home, /Did you already know this/);
    assert.match(home, /submitVoiceInsightFamiliarity/);
    assert.match(home, /forceNew:\s*true/);
    assert.match(home, /Retry finishing/);
    assert.match(home, /returnToCleanHome/);
    assert.match(route, /spokenSynthesis/);
    assert.match(route, /alreadyFinalized/);
    assert.match(route, /loadReflectionForConversation/);
    assert.match(route, /voice_pwa/);
    assert.match(route, /patternMaturity/);
  });
});
