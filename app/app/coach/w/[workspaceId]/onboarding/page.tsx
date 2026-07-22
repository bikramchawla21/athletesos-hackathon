import { notFound, redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { isDatabaseConfigured } from "@/db/client";
import { requireWorkspaceRole } from "@/server/authz";
import {
  getLatestConversation,
  listMessages,
  startConversation,
  toClientMessages,
  markConversationCompleted,
} from "@/server/services/conversation-service";
import CoachOnboardingApp from "@/components/CoachOnboardingApp";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ workspaceId: string }> };

export default async function CoachOnboardingPage({ params }: PageProps) {
  if (!isDatabaseConfigured()) redirect("/demo?reason=database");
  const { workspaceId } = await params;

  let access;
  try {
    access = await requireWorkspaceRole(workspaceId, ["coach"]);
  } catch {
    notFound();
  }

  let conversation = await getLatestConversation(workspaceId, "coach_onboarding");
  if (!conversation) {
    const started = await startConversation({
      workspaceId,
      personId: access.person.id,
      kind: "coach_onboarding",
      visibility: "coach_private",
      withOpeningMessage: true,
    });
    conversation = started.conversation;
  }

  const rows = await listMessages(conversation.id);
  const userTurns = rows.filter((m) => m.role === "user").length;
  if (userTurns >= 6 && conversation.status === "active") {
    await markConversationCompleted(conversation.id);
    redirect(`/app/coach/w/${workspaceId}`);
  }

  return (
    <>
      <div style={{ position: "fixed", top: 12, right: 16, zIndex: 40 }}>
        <UserButton />
      </div>
      <CoachOnboardingApp
        workspaceId={workspaceId}
        conversationId={conversation.id}
        initialMessages={toClientMessages(rows)}
      />
    </>
  );
}
