import { redirect } from "next/navigation";
import { requireAuthenticatedPerson } from "@/server/authz";
import { getPrimaryAthleteWorkspace } from "@/server/services/workspace-service";
import { isDatabaseConfigured } from "@/db/client";
import OnboardingForm from "@/components/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  if (!isDatabaseConfigured()) {
    redirect("/demo?reason=database");
  }

  const { person } = await requireAuthenticatedPerson();
  const workspace = await getPrimaryAthleteWorkspace(person.id);
  if (workspace) {
    redirect(`/app/w/${workspace.id}`);
  }

  return (
    <main className="welcome-shell">
      <section className="welcome-card">
        <span className="eyebrow">ATHLETEOS</span>
        <h1>Set up your workspace</h1>
        <p>A few optional details help AthleteOS start with better context.</p>
        <OnboardingForm />
      </section>
    </main>
  );
}
