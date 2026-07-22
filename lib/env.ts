/** True when Clerk publishable + secret keys look configured. */
export function isClerkConfigured(): boolean {
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const secret = process.env.CLERK_SECRET_KEY?.trim() ?? "";
  return Boolean(publishable) && Boolean(secret) && !publishable.includes("replace_me");
}

export function isDatabaseConfiguredEnv(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
