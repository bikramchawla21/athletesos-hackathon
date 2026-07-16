import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateChatReply, getDemoChatReply } from "../lib/chat.mjs";
import { CRISIS_REPLY, detectCrisis } from "../lib/safety.mjs";
import { canSendMessage, shouldApplyInsightsResult } from "../lib/ui-guards.mjs";

const opening = {
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
        { role: "user", content: "I want to kill myself after this tournament." },
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

describe("chat demo and honest failures", () => {
  it("returns demoMode replies when no API key is configured", async () => {
    const messages = [
      opening,
      {
        role: "user",
        content: "I have played tennis since I was eight, but lately I feel lost.",
      },
    ];
    const result = await generateChatReply(messages, { apiKey: "" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.demoMode, true);
    assert.match(result.body.reply.toLowerCase(), /tennis|lost/);
    assert.equal(result.body.reply, getDemoChatReply(messages));
  });

  it("rejects empty user content", async () => {
    const result = await generateChatReply(
      [opening, { role: "user", content: "   " }],
      { apiKey: "" },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "validation");
  });

  it("returns upstream after empty then failed repair when key is configured", async () => {
    let calls = 0;
    const result = await generateChatReply(
      [opening, { role: "user", content: "Training is going well but I freeze in matches." }],
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
    assert.equal(result.body.code, "upstream");
  });

  it("returns upstream when the provider throws", async () => {
    const result = await generateChatReply(
      [opening, { role: "user", content: "I am a runner returning after injury." }],
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
    assert.equal(result.body.code, "upstream");
  });
});
