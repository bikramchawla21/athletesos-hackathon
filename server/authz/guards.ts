/**
 * Pure authz helpers tested without Clerk/DB.
 */
export function assertSameWorkspace(
  entityWorkspaceId: string,
  requestedWorkspaceId: string,
): { ok: true } | { ok: false; code: "FORBIDDEN_WORKSPACE" } {
  if (entityWorkspaceId !== requestedWorkspaceId) {
    return { ok: false, code: "FORBIDDEN_WORKSPACE" };
  }
  return { ok: true };
}

export function membershipAllowsAccess(args: {
  membershipStatus: string;
  workspaceStatus: string;
  membershipPersonId: string;
  authenticatedPersonId: string;
}): boolean {
  return (
    args.membershipStatus === "active" &&
    args.workspaceStatus === "active" &&
    args.membershipPersonId === args.authenticatedPersonId
  );
}

export function roleAllowed(
  role: string,
  allowed: Array<"athlete" | "coach">,
): boolean {
  return allowed.includes(role as "athlete" | "coach");
}
