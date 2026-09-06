import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateIntelligenceRates,
  analyzeInsightProvenance,
  computeRetentionDn,
  deriveUsageStatus,
  feedbackLabel,
  memoryAgeBucket,
} from "../lib/pilot-dashboard.mjs";
import { isFounderClerkUserId } from "../lib/founder-auth.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("pilot dashboard analytics", () => {
  it("computes cross-session provenance and 22-day memory age", () => {
    const insightAt = new Date("2026-09-28T12:00:00.000Z");
    const result = analyzeInsightProvenance({
      insightAt,
      evidence: [
        {
          conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          createdAt: new Date("2026-09-06T10:00:00.000Z"),
        },
        {
          conversationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          createdAt: new Date("2026-09-17T10:00:00.000Z"),
        },
        {
          conversationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          createdAt: new Date("2026-09-28T09:00:00.000Z"),
        },
      ],
    });
    assert.equal(result.available, true);
    assert.equal(result.supportingEvidenceCount, 3);
    assert.equal(result.supportingConversationCount, 3);
    assert.equal(result.crossSession, true);
    assert.equal(result.memoryReferenceAgeDays, 22);
    assert.equal(result.bucket, "15_30");
    assert.equal(memoryAgeBucket(insightAt, new Date("2026-09-06T10:00:00.000Z")), "15_30");
  });

  it("does not treat same-conversation evidence as cross-session", () => {
    const result = analyzeInsightProvenance({
      insightAt: new Date("2026-09-28T12:00:00.000Z"),
      evidence: [
        {
          conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          createdAt: new Date("2026-09-28T08:00:00.000Z"),
        },
        {
          conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          createdAt: new Date("2026-09-28T09:00:00.000Z"),
        },
      ],
    });
    assert.equal(result.crossSession, false);
    assert.equal(result.supportingConversationCount, 1);
    assert.equal(result.bucket, "same_day");
  });

  it("marks empty evidence unavailable (no fake provenance)", () => {
    const result = analyzeInsightProvenance({
      insightAt: new Date("2026-09-28T12:00:00.000Z"),
      evidence: [],
    });
    assert.equal(result.available, false);
    assert.equal(result.bucket, "unavailable");
  });

  it("aggregates feedback and novel historical rates", () => {
    const rates = aggregateIntelligenceRates([
      {
        provenance: analyzeInsightProvenance({
          insightAt: new Date("2026-09-28T12:00:00.000Z"),
          evidence: [
            {
              conversationId: "a",
              createdAt: new Date("2026-09-01T12:00:00.000Z"),
            },
            {
              conversationId: "b",
              createdAt: new Date("2026-09-28T12:00:00.000Z"),
            },
          ],
        }),
        feedback: "No",
      },
      {
        provenance: analyzeInsightProvenance({
          insightAt: new Date("2026-09-20T12:00:00.000Z"),
          evidence: [
            {
              conversationId: "c",
              createdAt: new Date("2026-09-20T10:00:00.000Z"),
            },
          ],
        }),
        feedback: "Yes",
      },
    ]);
    assert.equal(rates.feedbackNo, 1);
    assert.equal(rates.feedbackYes, 1);
    assert.equal(rates.crossSessionCount, 1);
    assert.ok(rates.novelInsightRate != null);
    assert.equal(feedbackLabel("disagree"), "No");
    assert.equal(feedbackLabel("partially_agree"), "Kind of");
  });

  it("computes Dn retention only for eligible cohort age", () => {
    const asOf = new Date("2026-09-20T12:00:00.000Z");
    const athletes = [
      {
        activationDate: new Date("2026-09-10T12:00:00.000Z"),
        completedDates: [
          new Date("2026-09-10T12:00:00.000Z"),
          new Date("2026-09-17T12:00:00.000Z"),
        ],
      },
      {
        activationDate: new Date("2026-09-18T12:00:00.000Z"),
        completedDates: [new Date("2026-09-18T12:00:00.000Z")],
      },
    ];
    const d7 = computeRetentionDn(athletes, 7, asOf);
    assert.equal(d7.eligible, 1);
    assert.equal(d7.retained, 1);
    const d14 = computeRetentionDn(athletes, 14, asOf);
    assert.equal(d14.eligible, 0);
    assert.equal(d14.rate, null);
  });

  it("derives transparent usage status", () => {
    const asOf = new Date("2026-09-20T12:00:00.000Z");
    assert.equal(deriveUsageStatus(new Date("2026-09-19T12:00:00.000Z"), asOf), "active");
    assert.equal(deriveUsageStatus(new Date("2026-09-15T12:00:00.000Z"), asOf), "at_risk");
    assert.equal(deriveUsageStatus(new Date("2026-09-01T12:00:00.000Z"), asOf), "inactive");
    assert.equal(deriveUsageStatus(null, asOf), "never");
  });
});

describe("founder authorization wiring", () => {
  it("allowlists FOUNDER_CLERK_USER_IDS only", () => {
    const prev = process.env.FOUNDER_CLERK_USER_IDS;
    process.env.FOUNDER_CLERK_USER_IDS = "user_founder_a, user_founder_b";
    assert.equal(isFounderClerkUserId("user_founder_a"), true);
    assert.equal(isFounderClerkUserId("user_athlete"), false);
    assert.equal(isFounderClerkUserId(null), false);
    process.env.FOUNDER_CLERK_USER_IDS = prev;
  });

  it("dashboard routes require founder and stay read-only", () => {
    const overview = readFileSync(join(root, "app/admin/pilot/page.tsx"), "utf8");
    const detail = readFileSync(
      join(root, "app/admin/pilot/[workspaceId]/page.tsx"),
      "utf8",
    );
    const evidence = readFileSync(
      join(root, "app/api/admin/pilot/evidence/route.ts"),
      "utf8",
    );
    const persist = readFileSync(
      join(root, "server/services/insights-persist-service.ts"),
      "utf8",
    );
    const service = readFileSync(
      join(root, "server/services/pilot-dashboard-service.ts"),
      "utf8",
    );
    const mw = readFileSync(join(root, "middleware.ts"), "utf8");

    assert.match(overview, /requireFounder/);
    assert.match(detail, /requireFounder/);
    assert.match(evidence, /requireFounder/);
    assert.match(mw, /\/admin\(\.\*\)/);
    assert.match(mw, /\/api\/admin\(\.\*\)/);
    assert.match(persist, /sourceType: "message"/);
    assert.match(persist, /historical_memory_message/);
    assert.doesNotMatch(service, /\.update\(/);
    assert.doesNotMatch(service, /\.insert\(/);
    assert.doesNotMatch(service, /\.delete\(/);
    assert.match(overview, /Does not mutate AthleteMemory/);
  });
});

describe("athlete isolation in dashboard queries", () => {
  it("scopes evidence API by workspaceId + pattern reflection join", () => {
    const evidence = readFileSync(
      join(root, "app/api/admin/pilot/evidence/route.ts"),
      "utf8",
    );
    assert.match(evidence, /eq\(reflections\.workspaceId, parsed\.workspaceId\)/);
    assert.match(evidence, /eq\(messages\.workspaceId, parsed\.workspaceId\)/);
  });
});
