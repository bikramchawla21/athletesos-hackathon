import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="welcome-shell">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/app" />
    </main>
  );
}
