import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="welcome-shell">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/app" />
    </main>
  );
}
