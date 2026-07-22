import { notFound, redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { isDatabaseConfigured } from "@/db/client";
import { requireWorkspaceRole } from "@/server/authz";
import {
  getLatestConversation,
  listMessages,
  startConversation,
  toClientMessages,
} from "@/server/services/conversation-service";
import { loadAthleteMemory } from "@/server/services/memory-service";
import { loadActiveReflectionReport } from "@/server/services/insights-persist-service";
import WorkspaceDiscoveryApp from "@/components/WorkspaceDiscoveryApp";
import InviteCoachPanel from "@/components/InviteCoachPanel";
import AthleteCollaborationPanel from "@/components/AthleteCollaborationPanel";
import type { AppStage } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

function inferStage(args: {
  messageCount: number;
  hasReport: boolean;
}): AppStage {
  if (args.hasReport) return "observations";
  if (args.messageCount > 1) return "conversation";
  return "welcome";
}

export default async function WorkspacePage({ params }: PageProps) {
  if (!isDatabaseConfigured()) {
    redirect("/demo?reason=database");
  }

  const { workspaceId } = await params;

  let access;
  try {
    access = await requireWorkspaceRole(workspaceId, ["athlete"]);
  } catch {
    // Coaches use a different surface
    try {
      await requireWorkspaceRole(workspaceId, ["coach"]);
      redirect(`/app/coach/w/${workspaceId}`);
    } catch {
      notFound();
    }
  }

  let conversation = await getLatestConversation(workspaceId, "athlete_discovery");
  if (!conversation) {
    const started = await startConversation({
      workspaceId,
      personId: access.person.id,
      kind: "athlete_discovery",
      visibility: "athlete_private",
      withOpeningMessage: true,
    });
    conversation = started.conversation;
  }

  const dbMessages = await listMessages(conversation.id);
  const memory = await loadAthleteMemory(workspaceId);
  const report = await loadActiveReflectionReport(workspaceId);
  const clientMessages = toClientMessages(dbMessages);
  const stage = inferStage({
    messageCount: clientMessages.length,
    hasReport: Boolean(report) && conversation.status === "completed",
  });

  return (
    <>
      <div style={{ position: "fixed", top: 12, right: 16, zIndex: 40 }}>
        <UserButton />
      </div>
      <WorkspaceDiscoveryApp
        workspaceId={workspaceId}
        conversationId={conversation.id}
        initialStage={stage}
        initialMessages={clientMessages}
        initialMemory={memory}
        initialReport={report}
      />
      <div className="team-shell">
        <InviteCoachPanel workspaceId={workspaceId} />
        <AthleteCollaborationPanel workspaceId={workspaceId} />
      </div>
    </>
  );
}
