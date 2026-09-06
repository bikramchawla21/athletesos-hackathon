import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PILOT_EVENT_NAMES,
  isPilotEventName,
  sanitizePilotEventProps,
  recordPilotEvent,
} from "../lib/pilot-events.ts";
import {
  databaseUrlLooksSensitive,
  getAthleteOsEnv,
  isWorkspaceResetAllowed,
} from "../lib/env-safety.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("pilot event sanitization", () => {
  it("keeps metrics and strips transcript-like keys", () => {
    const props = sanitizePilotEventProps({
      latencyMs: 1200,
      code: "stt_failed",
      transcript: "secret athlete words",
      text: "nope",
      reply: "assistant",
      ok: true,
    });
    assert.equal(props.latencyMs, 1200);
    assert.equal(props.code, "stt_failed");
    assert.equal(props.ok, true);
    assert.equal(props.transcript, undefined);
    assert.equal(props.text, undefined);
  });

  it("accepts known event names only", () => {
    assert.equal(isPilotEventName("session_started"), true);
    assert.equal(isPilotEventName("hack"), false);
    assert.ok(PILOT_EVENT_NAMES.includes("insight_feedback"));
  });
});

describe("recordPilotEvent client", () => {
  it("posts sanitized payload to /api/pilot-events", async () => {
    /** @type {unknown} */
    let posted = null;
    recordPilotEvent({
      name: "tts_failed",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      conversationId: "22222222-2222-4222-8222-222222222222",
      props: { code: "network", transcript: "should strip" },
      fetchImpl: async (_url, init) => {
        posted = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(posted);
    assert.equal(/** @type {any} */ (posted).name, "tts_failed");
    assert.equal(/** @type {any} */ (posted).props.transcript, undefined);
    assert.equal(/** @type {any} */ (posted).props.code, "network");
  });
});

describe("env safety", () => {
  it("treats Neon URLs as sensitive unless explicitly allowed", () => {
    const prev = process.env.ATHLETEOS_ENV;
    const allowProd = process.env.ATHLETEOS_ALLOW_PROD_MIGRATE;
    const allowNeon = process.env.ATHLETEOS_ALLOW_NEON_MIGRATE;
    process.env.ATHLETEOS_ENV = "development";
    delete process.env.ATHLETEOS_ALLOW_PROD_MIGRATE;
    delete process.env.ATHLETEOS_ALLOW_NEON_MIGRATE;
    assert.equal(getAthleteOsEnv(), "development");
    assert.equal(databaseUrlLooksSensitive("postgresql://x.neon.tech/db"), true);
    process.env.ATHLETEOS_ALLOW_NEON_MIGRATE = "1";
    assert.equal(databaseUrlLooksSensitive("postgresql://x.neon.tech/db"), false);
    process.env.ATHLETEOS_ENV = "production";
    delete process.env.ATHLETEOS_ALLOW_NEON_MIGRATE;
    assert.equal(databaseUrlLooksSensitive("postgresql://x.neon.tech/db"), true);
    process.env.ATHLETEOS_ALLOW_PROD_MIGRATE = "1";
    assert.equal(databaseUrlLooksSensitive("postgresql://x.neon.tech/db"), false);
    process.env.ATHLETEOS_ENV = prev;
    if (allowProd === undefined) delete process.env.ATHLETEOS_ALLOW_PROD_MIGRATE;
    else process.env.ATHLETEOS_ALLOW_PROD_MIGRATE = allowProd;
    if (allowNeon === undefined) delete process.env.ATHLETEOS_ALLOW_NEON_MIGRATE;
    else process.env.ATHLETEOS_ALLOW_NEON_MIGRATE = allowNeon;
  });

  it("blocks workspace reset in production without allow flag", () => {
    const prev = process.env.ATHLETEOS_ENV;
    const allow = process.env.ALLOW_PILOT_WORKSPACE_RESET;
    process.env.ATHLETEOS_ENV = "production";
    delete process.env.ALLOW_PILOT_WORKSPACE_RESET;
    assert.equal(isWorkspaceResetAllowed(), false);
    process.env.ALLOW_PILOT_WORKSPACE_RESET = "1";
    assert.equal(isWorkspaceResetAllowed(), true);
    process.env.ATHLETEOS_ENV = prev;
    if (allow === undefined) delete process.env.ALLOW_PILOT_WORKSPACE_RESET;
    else process.env.ALLOW_PILOT_WORKSPACE_RESET = allow;
  });
});

describe("pilot wiring", () => {
  it("VoiceHome records pilot events and recovers assistant reply", () => {
    const home = readFileSync(resolve(root, "components/VoiceHome.tsx"), "utf8");
    assert.match(home, /recordPilotEvent/);
    assert.match(home, /session_recovered/);
    assert.match(home, /initialAssistantReply/);
    assert.match(home, /transcription_failed/);
    assert.match(home, /session_completed/);
    const page = readFileSync(resolve(root, "app/app/w/[workspaceId]/page.tsx"), "utf8");
    assert.match(page, /initialAssistantReply/);
    const route = readFileSync(resolve(root, "app/api/pilot-events/route.ts"), "utf8");
    assert.match(route, /insertPilotEvent/);
    const migration = readFileSync(resolve(root, "drizzle/0002_pilot_hardening.sql"), "utf8");
    assert.match(migration, /pilot_events/);
    assert.match(migration, /pilot_marked_at/);
    const reset = readFileSync(
      resolve(root, "app/api/workspaces/[workspaceId]/reset/route.ts"),
      "utf8",
    );
    assert.match(reset, /PILOT_RESET_BLOCKED|RESET_DISABLED/);
    const migratePkg = readFileSync(resolve(root, "package.json"), "utf8");
    assert.match(migratePkg, /db-migrate-guard/);
  });
});
