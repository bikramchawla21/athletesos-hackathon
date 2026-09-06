import { auth } from "@clerk/nextjs/server";
import { isFounderClerkUserId } from "@/lib/founder-auth.mjs";
import { AuthzError, AUTHZ_CODES } from "./errors";

/**
 * Server-only founder gate via FOUNDER_CLERK_USER_IDS.
 * Does not grant workspace membership privileges.
 */
export async function requireFounder(): Promise<{ clerkUserId: string }> {
  const session = await auth();
  const clerkUserId = session.userId;
  if (!clerkUserId) {
    throw new AuthzError("Sign in required.", AUTHZ_CODES.UNAUTHENTICATED, 401);
  }
  if (!isFounderClerkUserId(clerkUserId)) {
    throw new AuthzError(
      "Founder access required.",
      AUTHZ_CODES.FORBIDDEN_FOUNDER,
      403,
    );
  }
  return { clerkUserId };
}

export { isFounderClerkUserId, getFounderClerkUserIdsFromEnv as getFounderClerkUserIds } from "@/lib/founder-auth.mjs";
