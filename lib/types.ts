export type Role = "user" | "assistant";

export type Message = {
  id: string;
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
  message?: string;
  code:
    | "validation"
    | "upstream"
    | "unknown"
    | "INVALID_CHAT_REQUEST"
    | "INVALID_INSIGHTS_REQUEST"
    | "INVALID_MEMORY_REQUEST"
    | "INVALID_CHAT_RESPONSE"
    | "INVALID_INSIGHTS_RESPONSE"
    | "INVALID_MEMORY_RESPONSE"
    | "MEMORY_MIGRATION_FAILED"
    | "OPENAI_REQUEST_FAILED"
    | "insufficient_context";
  issues?: { path: string; message: string }[];
};

export type RelationshipStage =
  | "first_conversation"
  | "building_understanding"
  | "training_together";

export type MemoryConfidence = "tentative" | "supported" | "strong";

export type PatternStatus = "emerging" | "supported" | "revised" | "rejected";

export type MemoryItem = {
  statement: string;
  sourceMessageIds: string[];
  confidence: MemoryConfidence;
};

export type PatternMemory = {
  statement: string;
  supportingMessageIds: string[];
  status: PatternStatus;
};

export type CorrectionMemory = {
  originalInterpretation: string;
  athleteCorrection: string;
  sourceMessageId: string;
};

export type PriorityMemory = {
  priority: string;
  focusAreas: string[];
  createdAt: string;
};

export type UnderstandingCoverage = {
  story: number;
  goals: number;
  motivation: number;
  competitiveMindset: number;
  trainingContext: number;
  recoveryContext: number;
  supportEnvironment: number;
};

export type AthleteMemory = {
  version: number;
  createdAt: string;
  updatedAt: string;
  relationshipStage: RelationshipStage;
  identity: {
    name?: string;
    sport?: string;
    level?: string;
    background: string[];
  };
  goals: MemoryItem[];
  motivations: MemoryItem[];
  challenges: MemoryItem[];
  significantExperiences: MemoryItem[];
  observedPatterns: PatternMemory[];
  athleteCorrections: CorrectionMemory[];
  previousPriorities: PriorityMemory[];
  openQuestions: string[];
  understandingCoverage: UnderstandingCoverage;
  sessionCount: number;
};

export type MemoryUpdateReason =
  | "checkpoint"
  | "pre_insights"
  | "correction"
  | "session_complete";

export type MemoryResponse = {
  memory: AthleteMemory;
  demoMode: boolean;
};

export type AppStage =
  | "welcome"
  | "conversation"
  | "generating"
  | "observations"
  | "evidence"
  | "pattern"
  | "focus"
  | "complete";

export type PersistedAppState = {
  version: number;
  savedAt: string;
  stage: AppStage;
  messages: Message[];
  memory: AthleteMemory;
  report: ReflectionReport | null;
  demoMode: boolean;
};
