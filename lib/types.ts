export type Role = "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

export type EvidenceItem = {
  category: string;
  explanation: string;
};

export type WorkingPattern = {
  title: string;
  explanation: string;
};

export type ReflectionReport = {
  observations: string[];
  evidenceIntro: string;
  evidence: EvidenceItem[];
  evidenceNote: string;
  pattern: WorkingPattern;
  sharedPriority: string;
  focusIntro: string;
  focusAreas: string[];
  closing: string;
};

export type InsightsResponse = {
  report: ReflectionReport;
  demoMode: boolean;
};

export type InsufficientContextResponse = {
  status: "insufficient_context";
  error: string;
  code: "insufficient_context";
};

export type InsightsErrorBody = {
  error: string;
  code: "validation" | "upstream" | "unknown";
};
