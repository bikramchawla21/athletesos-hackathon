import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/env";

const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
  "/admin(.*)",
  "/invite(.*)",
  "/api/workspaces(.*)",
  "/api/conversations(.*)",
  "/api/legacy-import(.*)",
  "/api/invites(.*)",
  "/api/patterns(.*)",
  "/api/notifications(.*)",
  "/api/transcribe(.*)",
  "/api/speech(.*)",
  "/api/admin(.*)",
]);

const clerkHandler = clerkMiddleware(
  async (auth, request) => {
    if (isProtectedRoute(request)) {
      await auth.protect();
    }
  },
  {
    // Required for Clerk production on *.vercel.app (provider domain → /__clerk).
    frontendApiProxy: { enabled: true },
  },
);

export default function middleware(request: NextRequest, event: unknown) {
  if (!isClerkConfigured()) {
    // Local demo without Clerk: only anonymous /demo works; protect /app with redirect.
    if (isProtectedRoute(request)) {
      const url = request.nextUrl.clone();
      url.pathname = "/demo";
      url.searchParams.set("reason", "auth");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (clerkHandler as any)(request, event);
}

export const config = {
  matcher: [
    // Must include /__clerk even for *.js — otherwise clerk.browser.js 404s and SignIn is blank.
    "/__clerk/(.*)",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
