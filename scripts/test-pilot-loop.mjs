import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldFinalizeVoiceSession } from "../lib/session-end.mjs";
import {
  sendVoiceChatTurn,
  requestVoiceInsights,
  submitVoiceInsightFamiliarity,
  ensureActiveConversation,
} from "../lib/voice-chat.ts";
import { fetchSpeechAudio } from "../lib/fetch-speech.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Happy-path integration (mocked OpenAI/network):
 * transcript turn → chat persist → TTS → second turn → finalize → feedback → new conversation.
 */
describe("pilot voice loop (mocked)", () => {
  it("completes chat → speech → finalize → feedback without duplicate finalize semantics", async () => {
    const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const conversationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const calls = [];

    const fetchImpl = async (url, init) => {
      const path = String(url);
      const method = init?.method || "GET";
      calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null });

      if (path === "/api/conversations" && method === "POST") {
        return new Response(
          JSON.stringify({ conversation: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } }),
          { status: 200 },
        );
      }
      if (path === "/api/chat") {
        return new Response(
          JSON.stringify({
            reply: "What stood out most?",
            conversationId,
          }),
          { status: 200 },
        );
      }
      if (path === "/api/speech") {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        });
      }
      if (path === "/api/insights") {
        const already = calls.filter((c) => c.path === "/api/insights").length > 1;
        return new Response(
          JSON.stringify({
            report: { pattern: { title: "Pressure on second serve" } },
            spokenSynthesis: "Worth watching the second serve under pressure.",
            patternId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            reflectionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            alreadyFinalized: already,
          }),
          { status: 200 },
        );
      }
      if (path.includes("/api/patterns/") && path.endsWith("/feedback")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
    };

    const turn1 = await sendVoiceChatTurn({
      workspaceId,
      conversationId,
      content: "Practice was fine. Second serve got tentative.",
      clientMessageId: "client-msg-1",
      fetchImpl,
    });
    assert.equal(turn1.ok, true);

    const speech = await fetchSpeechAudio({
      text: turn1.ok ? turn1.reply : "",
      workspaceId,
      fetchImpl,
    });
    assert.equal(speech.ok, true);

    const turn2 = await sendVoiceChatTurn({
      workspaceId,
      conversationId,
      content: "No, that's it.",
      clientMessageId: "client-msg-2",
      fetchImpl,
    });
    assert.equal(turn2.ok, true);
    assert.equal(
      shouldFinalizeVoiceSession({
        userTurnCount: 3,
        athleteText: "No, that's it.",
      }),
      true,
    );

    const insights1 = await requestVoiceInsights({
      workspaceId,
      conversationId,
      fetchImpl,
    });
    assert.equal(insights1.ok, true);
    if (insights1.ok) {
      assert.match(insights1.spokenSynthesis || "", /second serve/i);
    }

    const insights2 = await requestVoiceInsights({
      workspaceId,
      conversationId,
      fetchImpl,
    });
    assert.equal(insights2.ok, true);
    if (insights2.ok) {
      assert.equal(insights2.alreadyFinalized, true);
    }

    const feedback = await submitVoiceInsightFamiliarity({
      workspaceId,
      patternId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      answer: "no",
      fetchImpl,
    });
    assert.equal(feedback, true);

    const next = await ensureActiveConversation({
      workspaceId,
      forceNew: true,
      fetchImpl,
    });
    assert.equal(next.ok, true);
    if (next.ok) {
      assert.notEqual(next.conversationId, conversationId);
    }

    assert.ok(calls.some((c) => c.path === "/api/chat"));
    assert.ok(calls.some((c) => c.path === "/api/speech"));
    assert.equal(calls.filter((c) => c.path === "/api/insights").length, 2);
  });

  it("isolation + durability invariants remain wired", () => {
    const isolation = readFileSync(resolve(root, "scripts/test-memory-isolation.mjs"), "utf8");
    assert.match(isolation, /Athlete B|workspace|isolation/i);
    const authz = readFileSync(resolve(root, "scripts/test-authz.mjs"), "utf8");
    assert.match(authz, /FORBIDDEN|assertSameWorkspace|membership/);
    const home = readFileSync(resolve(root, "components/VoiceHome.tsx"), "utf8");
    assert.match(home, /Talk about how your day went/);
    assert.match(home, /forceNew:\s*true/);
    assert.match(home, /alreadyFinalized|requestVoiceInsights/);
  });
});
