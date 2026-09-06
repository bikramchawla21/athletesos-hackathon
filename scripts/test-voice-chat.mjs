import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VOICE_CHAT_CLIENT,
  ensureActiveConversation,
  sendVoiceChatTurn,
  requestVoiceMemoryCheckpoint,
} from "../lib/voice-chat.ts";
import {
  VOICE_PWA_INSTRUCTIONS,
  VOICE_PWA_MAX_OUTPUT_TOKENS,
  generateChatReply,
} from "../lib/chat.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("voice_pwa chat client mode", () => {
  it("default generateChatReply path still works without client flag", async () => {
    const result = await generateChatReply(
      [
        { id: "u1", role: "user", content: "My second serve got passive at 4-4." },
      ],
      {
        apiKey: "sk-test",
        modelClient: {
          async generateReply() {
            return "When does that passivity show up first — preparation or contact?";
          },
        },
      },
    );
    assert.equal(result.ok, true);
    assert.match(VOICE_PWA_INSTRUCTIONS, /VOICE PWA MODE/);
    assert.ok(VOICE_PWA_MAX_OUTPUT_TOKENS <= 160);
    assert.doesNotMatch(
      (await import("../lib/chat.mjs")).DISCOVERY_INSTRUCTIONS,
      /VOICE PWA MODE/,
    );
  });

  it("forwards client: voice_pwa into generateChatReply options for workspace turns", async () => {
    let received = false;
    const result = await generateChatReply(
      [{ id: "u1", role: "user", content: "Second serve got soft in the tiebreak." }],
      {
        apiKey: "sk-test",
        client: "voice_pwa",
        modelClient: {
          async generateReply(args) {
            received = true;
            assert.equal(args.repair, false);
            return "What specifically went soft — toss, legs, or decision?";
          },
        },
      },
    );
    assert.equal(result.ok, true);
    assert.equal(received, true);
    assert.match(VOICE_PWA_INSTRUCTIONS, /athlete should talk more/i);
  });
});

describe("sendVoiceChatTurn", () => {
  it("posts transcript to /api/chat with voice_pwa client and stable clientMessageId", async () => {
    const result = await sendVoiceChatTurn({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      conversationId: "22222222-2222-2222-2222-222222222222",
      content: "Practice felt pretty good today.",
      clientMessageId: "msg-voice-1",
      fetchImpl: async (url, init) => {
        assert.equal(url, "/api/chat");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.client, VOICE_CHAT_CLIENT);
        assert.equal(body.content, "Practice felt pretty good today.");
        assert.equal(body.clientMessageId, "msg-voice-1");
        assert.equal(body.workspaceId, "11111111-1111-1111-1111-111111111111");
        assert.equal(body.conversationId, "22222222-2222-2222-2222-222222222222");
        return new Response(JSON.stringify({ reply: "What made the good parts feel solid?", messageId: "a1" }), {
          status: 200,
        });
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reply, "What made the good parts feel solid?");
      assert.equal(result.conversationId, "22222222-2222-2222-2222-222222222222");
    }
  });

  it("preserves conversationId on chat failure for retry without re-recording", async () => {
    const result = await sendVoiceChatTurn({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      conversationId: "22222222-2222-2222-2222-222222222222",
      content: "Kept for retry",
      clientMessageId: "msg-voice-retry",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "upstream" }), { status: 502 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "chat_failed");
      assert.equal(result.conversationId, "22222222-2222-2222-2222-222222222222");
    }
  });
});

describe("ensureActiveConversation", () => {
  it("reuses an existing conversationId without creating a new one", async () => {
    let called = false;
    const result = await ensureActiveConversation({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      conversationId: "22222222-2222-2222-2222-222222222222",
      fetchImpl: async () => {
        called = true;
        return new Response("{}", { status: 500 });
      },
    });
    assert.equal(called, false);
    assert.deepEqual(result, {
      ok: true,
      conversationId: "22222222-2222-2222-2222-222222222222",
    });
  });

  it("creates a conversation when none is provided", async () => {
    const result = await ensureActiveConversation({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      fetchImpl: async (url, init) => {
        assert.equal(url, "/api/conversations");
        assert.equal(init?.method, "POST");
        return new Response(
          JSON.stringify({ conversation: { id: "33333333-3333-3333-3333-333333333333" } }),
          { status: 201 },
        );
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.conversationId, "33333333-3333-3333-3333-333333333333");
    }
  });
});

describe("voice memory checkpoint helper", () => {
  it("posts workspace memory checkpoint with conversationId", async () => {
    const ok = await requestVoiceMemoryCheckpoint({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      conversationId: "22222222-2222-2222-2222-222222222222",
      reason: "checkpoint",
      fetchImpl: async (url, init) => {
        assert.equal(url, "/api/memory");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.reason, "checkpoint");
        assert.equal(body.workspaceId, "11111111-1111-1111-1111-111111111111");
        assert.equal(body.conversationId, "22222222-2222-2222-2222-222222222222");
        return new Response(JSON.stringify({ memory: { goals: [] } }), { status: 200 });
      },
    });
    assert.equal(ok, true);
  });
});

describe("voice chat wiring + authz invariants", () => {
  it("VoiceHome auto-sends transcript into /api/chat and reuses conversationId", () => {
    const home = readFileSync(join(__dirname, "../components/VoiceHome.tsx"), "utf8");
    const page = readFileSync(join(__dirname, "../app/app/w/[workspaceId]/page.tsx"), "utf8");
    const route = readFileSync(join(__dirname, "../app/api/chat/route.ts"), "utf8");
    assert.match(home, /sendVoiceChatTurn/);
    assert.match(home, /requestVoiceMemoryCheckpoint/);
    assert.match(home, /thinking/);
    assert.match(home, /speaking/);
    assert.match(home, /ready_again/);
    assert.match(home, /clientMessageId/);
    assert.match(home, /pendingChat/);
    assert.match(home, /fetchSpeechAudio/);
    assert.match(page, /conversationId=\{conversation\.id\}/);
    assert.match(page, /getLatestConversation/);
    assert.match(route, /voice_pwa/);
    assert.match(route, /assertEntityWorkspace/);
    assert.match(route, /loadAthleteMemory|buildDiscoveryContext/);
  });

  it("workspace chat still loads AthleteMemory via buildDiscoveryContext", () => {
    const builders = readFileSync(
      join(__dirname, "../server/services/context-builders.ts"),
      "utf8",
    );
    assert.match(builders, /loadAthleteMemory\(workspaceId\)/);
    assert.match(builders, /buildDiscoveryContext/);
  });

  it("appendMessage dedupes on clientMessageId for retry safety", () => {
    const service = readFileSync(
      join(__dirname, "../server/services/conversation-service.ts"),
      "utf8",
    );
    assert.match(service, /deduping on \(conversationId, clientMessageId\)/);
    assert.match(service, /if \(existing\[0\]\) return existing\[0\]/);
  });
});
