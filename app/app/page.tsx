import { redirect } from "next/navigation";
import { requireAuthenticatedPerson } from "@/server/authz";
import {
  getPrimaryAthleteWorkspace,
  getPrimaryCoachWorkspace,
} from "@/server/services/workspace-service";
import { isDatabaseConfigured } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function AppIndexPage() {
  if (!isDatabaseConfigured()) {
    redirect("/demo?reason=database");
  }

  const { person } = await requireAuthenticatedPerson();
  const athleteWorkspace = await getPrimaryAthleteWorkspace(person.id);
  if (athleteWorkspace) {
    redirect(`/app/w/${athleteWorkspace.id}`);
  }

  const coachWorkspace = await getPrimaryCoachWorkspace(person.id);
  if (coachWorkspace) {
    redirect(`/app/coach/w/${coachWorkspace.id}`);
  }

  redirect("/app/onboarding");
}
