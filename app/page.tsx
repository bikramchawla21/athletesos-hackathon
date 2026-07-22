import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/env";

export default function MarketingPage() {
  const clerkReady = isClerkConfigured();

  return (
    <main className="welcome-shell">
      <section className="welcome-card">
        <div className="topbar" style={{ marginBottom: "1.5rem" }}>
          <span>AthleteOS</span>
          {clerkReady ? (
            <Show when="signed-in">
              <UserButton />
            </Show>
          ) : null}
        </div>
        <span className="eyebrow">ATHLETEOS</span>
        <h1>
          The intelligence
          <br />
          that grows with you.
        </h1>
        <p>
          {clerkReady
            ? "Sign in to continue discovery conversations with durable memory across sessions."
            : "Running in local demo mode — add Clerk and Neon keys to .env.local for authenticated workspaces."}
        </p>
        <div
          className="composer-actions"
          style={{ marginTop: "1.5rem", justifyContent: "flex-start", flexWrap: "wrap" }}
        >
          {clerkReady ? (
            <Show
              when="signed-out"
              fallback={
                <Link
                  className="primary"
                  href="/app"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0.75rem 1.25rem",
                    textDecoration: "none",
                  }}
                >
                  Open AthleteOS
                </Link>
              }
            >
              <SignInButton mode="modal" forceRedirectUrl="/app">
                <button className="primary" type="button">
                  Sign in
                </button>
              </SignInButton>
              <Link
                className="secondary"
                href="/sign-up"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.75rem 1.25rem",
                  textDecoration: "none",
                }}
              >
                Create account
              </Link>
            </Show>
          ) : null}
          <Link
            className="primary"
            href="/demo"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0.75rem 1.25rem",
              textDecoration: "none",
            }}
          >
            Try anonymous demo
          </Link>
        </div>
      </section>
    </main>
  );
}
