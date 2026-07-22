"use client";

import DiscoveryApp from "@/components/DiscoveryApp";
import type { AppStage, AthleteMemory, Message, ReflectionReport } from "@/lib/types";

export default function WorkspaceDiscoveryApp(props: {
  workspaceId: string;
  conversationId: string;
  initialStage: AppStage;
  initialMessages: Message[];
  initialMemory: AthleteMemory;
  initialReport: ReflectionReport | null;
}) {
  return (
    <DiscoveryApp
      mode="workspace"
      workspaceId={props.workspaceId}
      conversationId={props.conversationId}
      initialStage={props.initialStage}
      initialMessages={props.initialMessages}
      initialMemory={props.initialMemory}
      initialReport={props.initialReport}
    />
  );
}
