import type { WorkspaceAccess } from "./index";
import { AUTHZ_CODES, AuthzError } from "./errors";

export type WorkspaceAction =
  | "invite_coach"
  | "revoke_invite"
  | "remove_coach"
  | "reset_workspace"
  | "athlete_discovery_chat"
  | "coach_onboarding_chat"
  | "read_athlete_private"
  | "read_coach_private"
  | "read_workspace_shared"
  | "add_coach_observation"
  | "pattern_feedback"
  | "propose_shared_priority"
  | "review_shared_priority"
  | "legacy_import";

const ATHLETE_ACTIONS = new Set<WorkspaceAction>([
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

const COACH_ACTIONS = new Set<WorkspaceAction>([
  "coach_onboarding_chat",
  "read_workspace_shared",
  "add_coach_observation",
  "pattern_feedback",
  "propose_shared_priority",
  "review_shared_priority",
]);

export function canPerformAction(
  role: "athlete" | "coach",
  action: WorkspaceAction,
): boolean {
  if (role === "athlete") return ATHLETE_ACTIONS.has(action);
  if (role === "coach") return COACH_ACTIONS.has(action);
  return false;
}

export function assertCanPerform(
  access: WorkspaceAccess,
  action: WorkspaceAction,
): void {
  if (!canPerformAction(access.membership.role, action)) {
    throw new AuthzError(
      "Insufficient workspace role for this action.",
      AUTHZ_CODES.FORBIDDEN_ROLE,
      403,
    );
  }
}

export type VisibilityLevel = "athlete_private" | "coach_private" | "workspace";

/**
 * Can the viewer see a row with the given visibility?
 * Coach-private notes are only visible to their author.
 */
export function canViewVisibility(args: {
  role: "athlete" | "coach";
  personId: string;
  visibility: VisibilityLevel;
  authorPersonId?: string | null;
}): boolean {
  if (args.visibility === "workspace") return true;
  if (args.visibility === "athlete_private") return args.role === "athlete";
  if (args.visibility === "coach_private") {
    return (
      args.role === "coach" &&
      Boolean(args.authorPersonId) &&
      args.authorPersonId === args.personId
    );
  }
  return false;
}

export function visibilityForAudience(
  role: "athlete" | "coach",
): VisibilityLevel[] {
  if (role === "athlete") return ["athlete_private", "workspace"];
  return ["workspace"];
}
