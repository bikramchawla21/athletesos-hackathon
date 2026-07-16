export type Role = "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

export type InsightReport = {
  observations: string[];
  evidence: Array<{ label: string; detail: string }>;
  pattern: string;
  patternExplanation: string;
  focusIntro: string;
  priorities: string[];
  closing: string;
};
