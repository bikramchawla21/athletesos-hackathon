import type { DumpExtract, ExtractedKind, MemoryKind } from "./types";

export const MEMORY_KINDS: MemoryKind[] = [
  "commitment",
  "decision",
  "idea",
  "person",
  "question",
];

export const KIND_LABEL: Record<MemoryKind, string> = {
  commitment: "Commitments",
  decision: "Decisions",
  idea: "Ideas",
  person: "People",
  question: "Questions",
};

export const KIND_PILL: Record<MemoryKind, string> = {
  commitment: "Commitment",
  decision: "Decision",
  idea: "Idea",
  person: "Person",
  question: "Question",
};

export const BRIEFING_KIND_ORDER: MemoryKind[] = [
  "commitment",
  "decision",
  "question",
  "idea",
  "person",
];

export type MemoryDraft = {
  kind: MemoryKind;
  title: string;
  dueHint?: string | null;
  personName?: string | null;
};

function cleanKind(item: ExtractedKind): ExtractedKind | null {
  const title = item.title.trim();
  if (!title) return null;
  return {
    title,
    dueHint: item.dueHint ?? null,
    personName: item.personName ?? null,
  };
}

/** Extra briefing rows. Life dumps do not enter the briefing queue. */
export function memoryDraftsFromExtract(extract: DumpExtract): MemoryDraft[] {
  if (extract.lane === "life") return [];
  const out: MemoryDraft[] = [];
  const seen = new Set<string>();

  const push = (kind: MemoryKind, item: ExtractedKind) => {
    const cleaned = cleanKind(item);
    if (!cleaned) return;
    const key = `${kind}:${cleaned.title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, ...cleaned });
  };

  const commitments = extract.commitments.length
    ? extract.commitments
    : extract.steps.map((s) => ({
        title: s.title,
        dueHint: s.dueHint,
        personName: s.personName,
      }));
  for (const item of commitments) push("commitment", item);
  for (const item of extract.decisions) push("decision", item);
  for (const item of extract.ideas) push("idea", item);
  for (const person of extract.people) push("person", { title: person.name });
  for (const item of extract.questions) push("question", item);
  return out;
}
