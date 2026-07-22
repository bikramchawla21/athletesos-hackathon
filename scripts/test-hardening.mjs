import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_REPAIR_INSTRUCTIONS,
  DISCOVERY_INSTRUCTIONS,
  formatMemoryContextForChat,
  generateChatReply,
  generateReopeningMessage,
  getDemoChatReply,
  pickDemoFallbackQuestion,
  relationshipMarkerCopy,
} from "../lib/chat.mjs";
import {
  normalizeAthleteMemory,
  normalizeChatMessages,
  parseChatRequest,
  parseInsightsRequest,
} from "../lib/chat-request.mjs";
import { createEmptyAthleteMemory } from "../lib/memory.mjs";
import { fallbackReport } from "../lib/insights.mjs";
import { CRISIS_REPLY, detectCrisis } from "../lib/safety.mjs";
import {
  canSendMessage,
  shouldApplyChatResult,
  shouldApplyInsightsResult,
  shouldClearChatLoading,
} from "../lib/ui-guards.mjs";

const opening = {
  id: "opening",
  role: "assistant",
  content: "Whenever you’re ready, I’m listening.",
};

describe("empty and whitespace guards", () => {
  it("blocks empty and whitespace-only sends", () => {
    assert.equal(canSendMessage("", false, "conversation"), false);
    assert.equal(canSendMessage("   \n\t  ", false, "conversation"), false);
    assert.equal(canSendMessage("hello", false, "conversation"), true);
    assert.equal(canSendMessage("hello", true, "conversation"), false);
    assert.equal(canSendMessage("hello", false, "generating"), false);
  });
});

describe("stale insights results", () => {
  it("ignores results after reset or stage change", () => {
    assert.equal(shouldApplyInsightsResult(2, 2, "generating"), true);
    assert.equal(shouldApplyInsightsResult(3, 2, "generating"), false);
    assert.equal(shouldApplyInsightsResult(2, 2, "conversation"), false);
    assert.equal(shouldApplyInsightsResult(2, 2, "welcome"), false);
  });
});

describe("chat request-id and loading guards", () => {
  it("applies only the active chat request id", () => {
    assert.equal(shouldApplyChatResult(3, 2), false);
    assert.equal(shouldApplyChatResult(3, 3), true);
  });

  it("clears loading only for the active controller", () => {
    const active = {};
    const stale = {};
    assert.equal(shouldClearChatLoading(active, active), true);
    assert.equal(shouldClearChatLoading(active, stale), false);
    assert.equal(shouldClearChatLoading(null, stale), false);
  });
});

describe("demo reply variation", () => {
  it("returns different questions for different unmatched prompts", () => {
    const a = pickDemoFallbackQuestion("I want to develop better serve consistency this season.");
    const b = pickDemoFallbackQuestion("My travel schedule is exhausting between tournaments.");
    assert.notEqual(a, b);
    assert.ok(a.includes("?"));
    assert.ok(b.includes("?"));
  });

  it("does not reuse the old single default for Wimbledon-style goals", async () => {
    const result = await generateChatReply(
      [
        opening,
        { id: "u1", role: "user", content: "I want to win Wimbledon." },
      ],
      { apiKey: "" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.demoMode, true);
    assert.notEqual(
      result.body.reply,
      "What should we examine first: the decision, the execution, or the recovery?",
    );
    assert.ok(result.body.reply.includes("?"));
  });

  it("keeps demo replies deterministic for the same input", () => {
    const messages = [
      opening,
      { id: "u1", role: "user", content: "Travel between events leaves me drained." },
    ];
    assert.equal(getDemoChatReply(messages), getDemoChatReply(messages));
  });
});

describe("crisis safety", () => {
  it("detects crisis-related language", () => {
    assert.equal(detectCrisis("I want to kill myself"), true);
    assert.equal(detectCrisis("I feel lost after matches"), false);
  });

  it("returns the safe crisis reply without calling the model", async () => {
    let called = false;
    const result = await generateChatReply(
      [
        opening,
        { id: "u1", role: "user", content: "I want to kill myself after this tournament." },
      ],
      {
        apiKey: "test-key-not-replace_me",
        modelClient: {
          async generateReply() {
            called = true;
            return "should not run";
          },
        },
      },
    );

    assert.equal(called, false);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.reply, CRISIS_REPLY);
    assert.equal(result.body.safety, true);
    assert.match(result.body.reply, /not a therapist/i);
    assert.match(result.body.reply, /emergency/i);
  });
});

describe("discovery prompt question-only default", () => {
  it("requires question-only ordinary replies and bans reflection openers", () => {
    assert.match(DISCOVERY_INSTRUCTIONS, /ONE concise follow-up question only/i);
    assert.match(DISCOVERY_INSTRUCTIONS, /Usually under 20 words/);
    assert.match(DISCOVERY_INSTRUCTIONS, /It sounds like/);
    assert.match(DISCOVERY_INSTRUCTIONS, /You mentioned/);
    assert.match(DISCOVERY_INSTRUCTIONS, /I notice/);
    assert.match(DISCOVERY_INSTRUCTIONS, /deliberate pattern check/);
    assert.match(CHAT_REPAIR_INSTRUCTIONS, /ONE precise question only/);
    assert.doesNotMatch(DISCOVERY_INSTRUCTIONS, /Reflect and ask \(default\)/);
  });
});

describe("chat demo and honest failures", () => {
  it("returns demoMode replies when no API key is configured", async () => {
    const messages = [
      opening,
      {
        id: "u1",
        role: "user",
        content: "I have played tennis since I was eight, but lately I feel lost.",
      },
    ];
    const result = await generateChatReply(messages, { apiKey: "" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.demoMode, true);
    assert.match(result.body.reply.toLowerCase(), /unclear|direction|level|compete/);
    assert.ok(result.body.reply.split(/\s+/).length <= 20);
    assert.equal((result.body.reply.match(/\?/g) || []).length, 1);
    assert.equal(result.body.reply, getDemoChatReply(messages));
  });

  it("demo replies are question-only across discovery test prompts", () => {
    const prompts = [
      "I lose confidence after making a few mistakes.",
      "I train harder after every loss.",
      "I freeze in important matches.",
      "My coach thinks I am good enough, but I don’t believe it.",
      "My forehand breaks down under pressure.",
      "I get really frustrated after losses and usually train harder the next day.",
      "I don’t know why I keep losing close matches.",
    ];
    const replies = prompts.map((content) =>
      getDemoChatReply([opening, { id: "u", role: "user", content }]),
    );
    const unique = new Set(replies);
    assert.equal(unique.size, prompts.length);
    const banned =
      /thank you for sharing|that sounds difficult|it sounds like|you mentioned|i notice|you tend to|i’m asking because|before i ask|understood\.|that connects with/;
    for (const reply of replies) {
      assert.ok(reply.split(/\s+/).length <= 20, reply);
      assert.equal((reply.match(/\?/g) || []).length, 1, reply);
      assert.doesNotMatch(reply.toLowerCase(), banned);
      assert.match(reply.trim(), /\?$/);
    }
  });

  it("vulnerable messages stay question-only without acknowledgment", () => {
    const reply = getDemoChatReply([
      opening,
      {
        id: "u1",
        role: "user",
        content: "After that match I broke down and couldn’t stop crying.",
      },
    ]);
    assert.ok(reply.split(/\s+/).length <= 20);
    assert.equal((reply.match(/\?/g) || []).length, 1);
    assert.doesNotMatch(reply.toLowerCase(), /understood|thank you|that clearly affected|i hear you/);
  });

  it("correction replies ask for accuracy without defending", () => {
    const reply = getDemoChatReply([
      opening,
      { id: "u1", role: "user", content: "Actually, that’s not right — I meant decision quality." },
    ]);
    assert.match(reply, /\?/);
    assert.ok(reply.split(/\s+/).length <= 20);
    assert.doesNotMatch(reply.toLowerCase(), /but i still think|you're wrong|thank you for correcting/);
  });

  it("freeze replies stay question-only even with memory present", async () => {
    const memory = createEmptyAthleteMemory();
    memory.identity.sport = "tennis";
    const messages = [
      opening,
      { id: "u1", role: "user", content: "I freeze in important matches." },
    ];
    const result = await generateChatReply(messages, { apiKey: "", memory });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.body.reply.toLowerCase(), /freeze|indecisive|tight|committed/);
    assert.doesNotMatch(result.body.reply.toLowerCase(), /earlier you mentioned|i notice/);
    assert.equal((result.body.reply.match(/\?/g) || []).length, 1);
  });

  it("formats memory context with hidden coverage and never invents", () => {
    const memory = createEmptyAthleteMemory();
    memory.identity.sport = "tennis";
    memory.understandingCoverage.story = 40;
    memory.athleteCorrections = [
      {
        originalInterpretation: "technical flaw",
        athleteCorrection: "decision quality under pressure",
        sourceMessageId: "u3",
      },
    ];
    const context = formatMemoryContextForChat(memory);
    assert.match(context, /INTERNAL/);
    assert.match(context, /story=40/);
    assert.match(context, /decision quality under pressure/);
    assert.match(context, /never show numbers/i);
  });

  it("passes memory through to the model client", async () => {
    let seenMemory = null;
    const memory = createEmptyAthleteMemory();
    memory.identity.sport = "running";
    const result = await generateChatReply(
      [opening, { id: "u1", role: "user", content: "Training feels fine." }],
      {
        apiKey: "test-key-not-replace_me",
        memory,
        modelClient: {
          async generateReply({ memory: mem }) {
            seenMemory = mem;
            return "Can I check that I’m understanding you correctly? Training feels fine, but something still feels off. What is it?";
          },
        },
      },
    );
    assert.equal(result.ok, true);
    assert.equal(seenMemory?.identity?.sport, "running");
  });

  it("rejects empty user content", async () => {
    const result = await generateChatReply(
      [opening, { id: "u1", role: "user", content: "   " }],
      { apiKey: "" },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "INVALID_CHAT_REQUEST");
  });

  it("returns upstream after empty then failed repair when key is configured", async () => {
    let calls = 0;
    const result = await generateChatReply(
      [
        opening,
        { id: "u1", role: "user", content: "Training is going well but I freeze in matches." },
      ],
      {
        apiKey: "test-key-not-replace_me",
        modelClient: {
          async generateReply() {
            calls += 1;
            return "   ";
          },
        },
      },
    );
    assert.equal(calls, 2);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 502);
    assert.equal(result.body.code, "OPENAI_REQUEST_FAILED");
  });

  it("returns upstream when the provider throws", async () => {
    const result = await generateChatReply(
      [opening, { id: "u1", role: "user", content: "I am a runner returning after injury." }],
      {
        apiKey: "test-key-not-replace_me",
        modelClient: {
          async generateReply() {
            throw new Error("provider down");
          },
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 502);
    assert.equal(result.body.code, "OPENAI_REQUEST_FAILED");
  });
});

describe("session completion and reopen", () => {
  it("uses first vs continuing relationship markers", () => {
    assert.equal(
      relationshipMarkerCopy(1),
      "Today — We began understanding your journey.",
    );
    assert.equal(
      relationshipMarkerCopy(2),
      "Continuing — Learning what consistently helps you perform.",
    );
  });

  it("demo reopen uses latest priority without hard-coding the example pattern", async () => {
    const memory = createEmptyAthleteMemory();
    const report = {
      ...fallbackReport,
      sharedPriority: "Train how we recover after momentum shifts, while keeping technique stable.",
    };
    const result = await generateReopeningMessage({
      apiKey: "",
      memory,
      report,
      messages: [opening],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.demoMode, true);
    assert.match(result.body.reply, /recover after momentum shifts/i);
    assert.match(result.body.reply, /\?/);
    assert.doesNotMatch(result.body.reply, /Hi\.\nI’m AthleteOS/);
  });

  it("reopen does not require a new user turn", async () => {
    const result = await generateReopeningMessage({
      apiKey: "",
      memory: createEmptyAthleteMemory(),
      report: fallbackReport,
      messages: [opening],
    });
    assert.equal(result.ok, true);
  });

  it("keyed reopen failures return upstream without silent demo", async () => {
    const result = await generateReopeningMessage({
      apiKey: "test-key-not-replace_me",
      memory: createEmptyAthleteMemory(),
      report: fallbackReport,
      messages: [opening],
      modelClient: {
        async generateReopen() {
          throw new Error("provider down");
        },
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 502);
    assert.equal(result.body.code, "OPENAI_REQUEST_FAILED");
  });
});

describe("contract request validation", () => {
  it("normalizes messages without ids and trims to 40", () => {
    const raw = Array.from({ length: 45 }, (_, i) => ({
      role: i % 2 === 0 ? "assistant" : "user",
      content: `m${i}`,
    }));
    const normalized = normalizeChatMessages(raw);
    assert.equal(normalized.length, 40);
    assert.ok(normalized.every((m) => typeof m.id === "string" && m.id.length > 0));
  });

  it("repairs invalid memory items instead of discarding whole memory", () => {
    const empty = createEmptyAthleteMemory();
    const result = normalizeAthleteMemory({
      ...empty,
      goals: [
        { statement: "Keep racing", sourceMessageIds: ["u1"], confidence: "supported" },
        { statement: "broken", sourceMessageIds: [], confidence: "supported" },
      ],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.memory.goals.length, 1);
    assert.equal(result.memory.goals[0].statement, "Keep racing");
    assert.ok(result.warnings.some((w) => w.includes("goals[1]")));
  });

  it("invalid memory items do not block chat request parse", () => {
    const parsed = parseChatRequest({
      messages: [
        { id: "a1", role: "assistant", content: "What sport do you play?" },
        { role: "user", content: "I'm a runner." },
      ],
      memory: {
        ...createEmptyAthleteMemory(),
        goals: [{ statement: "broken", sourceMessageIds: [], confidence: "supported" }],
      },
    });
    assert.equal(parsed.messages.length, 2);
    assert.ok(parsed.messages[1].id);
    assert.ok(parsed.memory);
    assert.equal(parsed.memory.goals.length, 0);
    assert.equal(parsed.mode, "chat");
  });

  it("generateChatReply succeeds after normalizing invalid memory items", async () => {
    const parsed = parseChatRequest({
      messages: [
        opening,
        { id: "u1", role: "user", content: "I am a runner returning after injury." },
      ],
      memory: {
        ...createEmptyAthleteMemory(),
        goals: [{ statement: "broken", sourceMessageIds: [], confidence: "supported" }],
      },
    });
    const result = await generateChatReply(parsed.messages, {
      apiKey: "",
      memory: parsed.memory,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.body.reply.includes("?"));
  });

  it("parseInsightsRequest accepts missing ids and memory", () => {
    const parsed = parseInsightsRequest({
      messages: [
        { role: "assistant", content: "What sport?" },
        { role: "user", content: "I run." },
      ],
    });
    assert.equal(parsed.messages.length, 2);
    assert.ok(parsed.messages.every((m) => m.id));
    assert.ok(parsed.memory);
  });

  it("rejects unrecoverable memory objects that were explicitly sent", () => {
    assert.throws(() =>
      parseChatRequest({
        messages: [{ id: "u1", role: "user", content: "hello there athlete" }],
        memory: "not-an-object",
      }),
    );
  });
});
