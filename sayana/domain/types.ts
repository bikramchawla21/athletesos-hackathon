export type SessionMode = "listen" | "next_steps";
export type LanguageMix = "en" | "hi" | "hinglish";
export type TimeHint = "late_night" | "morning" | "afternoon" | "evening";
export type StepStatus = "proposed" | "kept" | "dropped" | "done";
export type ModeWhy = "words" | "voice" | "clock" | "mixed";

export type CurseCounts = Record<string, number>;

export type SessionStats = {
  totalWordCount: number;
  totalCurseCount: number;
  wordCounts: Record<string, number>;
  curseCounts: CurseCounts;
};

export type ExtractedStep = {
  title: string;
  dueHint?: string | null;
  personName?: string | null;
  overdueHint?: string | null;
};

export type ExtractedPerson = {
  name: string;
};

export type ExtractedLoop = {
  title: string;
  personName?: string | null;
};

export type MemoryKind = "commitment" | "decision" | "idea" | "person" | "question";
export type BriefingStatus = "pending" | "approved" | "ignored";

export type ExtractedKind = {
  title: string;
  dueHint?: string | null;
  personName?: string | null;
};

export type DumpExtract = {
  summary: string;
  summaryBullets: string[];
  languageMix: LanguageMix;
  overwhelmed: boolean;
  steps: ExtractedStep[];
  people: ExtractedPerson[];
  openLoops: ExtractedLoop[];
  commitments: ExtractedKind[];
  decisions: ExtractedKind[];
  ideas: ExtractedKind[];
  questions: ExtractedKind[];
};

export type ModeDecision = {
  mode: SessionMode;
  confidence: number;
  why: ModeWhy;
  overwhelmed: boolean;
  timeHint: TimeHint;
};

export type DayRollupView = {
  day: string;
  summary: string;
  dumpCount: number;
  totalWordCount: number;
  totalCurseCount: number;
  curseCounts: CurseCounts;
  topWords: { word: string; count: number }[];
  steps: Array<{
    id: string;
    title: string;
    status: StepStatus;
    dueHint?: string | null;
  }>;
};
