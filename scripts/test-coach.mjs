import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes } from "node:crypto";

function hashInviteToken(rawToken) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function canPerformAction(role, action) {
  const athlete = new Set([
    "invite_coach",
    "revoke_invite",
    "remove_coach",
    "reset_workspace",
    "athlete_discovery_chat",
    "read_athlete_private",
    "read_workspace_shared",
    "pattern_feedback",
    "propose_shared_priority",
    "review_shared_priority",
    "legacy_import",
  ]);
  const coach = new Set([
    "coach_onboarding_chat",
    "read_workspace_shared",
    "add_coach_observation",
    "pattern_feedback",
    "propose_shared_priority",
    "review_shared_priority",
  ]);
  if (role === "athlete") return athlete.has(action);
  if (role === "coach") return coach.has(action);
  return false;
}

function canViewVisibility({ role, personId, visibility, authorPersonId }) {
  if (visibility === "workspace") return true;
  if (visibility === "athlete_private") return role === "athlete";
  if (visibility === "coach_private") {
    return role === "coach" && authorPersonId === personId;
  }
  return false;
}

function bothApproveActivates(athleteDecision, coachDecision) {
  return athleteDecision === "approve" && coachDecision === "approve";
}

test("invite token hash is unguessable and stable", () => {
  const raw = randomBytes(32).toString("base64url");
  const a = hashInviteToken(raw);
  const b = hashInviteToken(raw);
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.notEqual(a, hashInviteToken(raw + "x"));
});

test("coach cannot invite, reset, or read athlete-private", () => {
  assert.equal(canPerformAction("coach", "invite_coach"), false);
  assert.equal(canPerformAction("coach", "reset_workspace"), false);
  assert.equal(canPerformAction("coach", "athlete_discovery_chat"), false);
  assert.equal(canPerformAction("coach", "add_coach_observation"), true);
  assert.equal(canPerformAction("athlete", "add_coach_observation"), false);
});

test("visibility separates private coach notes from athlete", () => {
  assert.equal(
    canViewVisibility({
      role: "athlete",
      personId: "a1",
      visibility: "coach_private",
      authorPersonId: "c1",
    }),
    false,
  );
  assert.equal(
    canViewVisibility({
      role: "coach",
      personId: "c1",
      visibility: "coach_private",
      authorPersonId: "c1",
    }),
    true,
  );
  assert.equal(
    canViewVisibility({
      role: "coach",
      personId: "c1",
      visibility: "athlete_private",
      authorPersonId: "a1",
    }),
    false,
  );
  assert.equal(
    canViewVisibility({
      role: "athlete",
      personId: "a1",
      visibility: "workspace",
      authorPersonId: "c1",
    }),
    true,
  );
});

test("shared priority activates only when both approve", () => {
  assert.equal(bothApproveActivates("approve", "approve"), true);
  assert.equal(bothApproveActivates("approve", "delegate"), false);
  assert.equal(bothApproveActivates("approve", "revise"), false);
  assert.equal(bothApproveActivates("revise", "approve"), false);
});
