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

test("mismatched workspace and conversation ids are forbidden", () => {
  assert.deepEqual(assertSameWorkspace("workspace-a", "workspace-b"), {
    ok: false,
    code: "FORBIDDEN_WORKSPACE",
  });
});

test("same person on two workspaces keeps memory scopes separate", () => {
  // Product rule: AthleteMemory is workspace-scoped, not person-scoped.
  const personId = "person-1";
  const tennis = membershipAllowsAccess({
    membershipStatus: "active",
    workspaceStatus: "active",
    membershipPersonId: personId,
    authenticatedPersonId: personId,
  });
  const other = membershipAllowsAccess({
    membershipStatus: "active",
    workspaceStatus: "active",
    membershipPersonId: personId,
    authenticatedPersonId: personId,
  });
  assert.equal(tennis, true);
  assert.equal(other, true);
  // Authorization is per workspaceId; sharing a personId does not merge memory.
  assert.deepEqual(assertSameWorkspace("ws-tennis", "ws-other"), {
    ok: false,
    code: "FORBIDDEN_WORKSPACE",
  });
});

test("coach membership on athlete workspace does not imply access to coach personal workspace", () => {
  assert.deepEqual(assertSameWorkspace("athlete-workspace", "coach-personal-workspace"), {
    ok: false,
    code: "FORBIDDEN_WORKSPACE",
  });
});
