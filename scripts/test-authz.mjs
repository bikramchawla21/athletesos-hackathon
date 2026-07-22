import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

function assertSameWorkspace(entityWorkspaceId, requestedWorkspaceId) {
  if (entityWorkspaceId !== requestedWorkspaceId) {
    return { ok: false, code: "FORBIDDEN_WORKSPACE" };
  }
  return { ok: true };
}

function membershipAllowsAccess(args) {
  return (
    args.membershipStatus === "active" &&
    args.workspaceStatus === "active" &&
    args.membershipPersonId === args.authenticatedPersonId
  );
}

function roleAllowed(role, allowed) {
  return allowed.includes(role);
}

function hashLegacyPayload(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

test("assertSameWorkspace rejects cross-workspace IDs", () => {
  assert.deepEqual(assertSameWorkspace("ws-a", "ws-b"), {
    ok: false,
    code: "FORBIDDEN_WORKSPACE",
  });
  assert.deepEqual(assertSameWorkspace("ws-a", "ws-a"), { ok: true });
});

test("membershipAllowsAccess requires active membership for the authenticated person", () => {
  assert.equal(
    membershipAllowsAccess({
      membershipStatus: "active",
      workspaceStatus: "active",
      membershipPersonId: "p1",
      authenticatedPersonId: "p1",
    }),
    true,
  );
  assert.equal(
    membershipAllowsAccess({
      membershipStatus: "revoked",
      workspaceStatus: "active",
      membershipPersonId: "p1",
      authenticatedPersonId: "p1",
    }),
    false,
  );
  assert.equal(
    membershipAllowsAccess({
      membershipStatus: "active",
      workspaceStatus: "active",
      membershipPersonId: "p1",
      authenticatedPersonId: "p2",
    }),
    false,
  );
});

test("roleAllowed gates athlete-only Phase 2 writes", () => {
  assert.equal(roleAllowed("athlete", ["athlete"]), true);
  assert.equal(roleAllowed("coach", ["athlete"]), false);
});

test("legacy content hash is stable for identical payloads", () => {
  const a = hashLegacyPayload({ messages: [{ id: "1", role: "user", content: "hi" }] });
  const b = hashLegacyPayload({ messages: [{ id: "1", role: "user", content: "hi" }] });
  const c = hashLegacyPayload({ messages: [{ id: "1", role: "user", content: "bye" }] });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});
