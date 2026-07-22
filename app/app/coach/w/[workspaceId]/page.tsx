import { notFound, redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { isDatabaseConfigured } from "@/db/client";
import { requireWorkspaceRole } from "@/server/authz";
import {
  getLatestConversation,
  listMessages,
} from "@/server/services/conversation-service";
import CoachWorkspace from "@/components/CoachWorkspace";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ workspaceId: string }> };

export default async function CoachWorkspacePage({ params }: PageProps) {
  if (!isDatabaseConfigured()) redirect("/demo?reason=database");
  const { workspaceId } = await params;

  try {
    await requireWorkspaceRole(workspaceId, ["coach"]);
  } catch {
    notFound();
  }

  const onboarding = await getLatestConversation(workspaceId, "coach_onboarding");
  if (onboarding && onboarding.status === "active") {
    const msgs = await listMessages(onboarding.id);
    const userTurns = msgs.filter((m) => m.role === "user").length;
    if (userTurns < 6) {
      redirect(`/app/coach/w/${workspaceId}/onboarding`);
    }
  }

  return (
    <>
      <div style={{ position: "fixed", top: 12, right: 16, zIndex: 40 }}>
        <UserButton />
      </div>
      <CoachWorkspace workspaceId={workspaceId} />
    </>
  );
}
