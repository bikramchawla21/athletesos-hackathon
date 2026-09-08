import OpenAI from "openai";
import { z } from "zod";
import { COMPANION_SYSTEM, EXTRACT_SYSTEM } from "@/domain/prompts";
import { bulletsFromText, bulletsToSummary } from "@/domain/step-identity";
import type { DumpExtract, LanguageMix } from "@/domain/types";

const kindItem = z.object({
  title: z.string(),
  dueHint: z.string().nullable().optional(),
  personName: z.string().nullable().optional(),
});

const extractSchema = z.object({
  summary: z.string().optional(),
  summaryBullets: z.array(z.string()).optional(),
  languageMix: z.enum(["en", "hi", "hinglish"]),
  overwhelmed: z.boolean(),
  steps: z.array(
    z.object({
      title: z.string(),
      dueHint: z.string().nullable().optional(),
      personName: z.string().nullable().optional(),
      overdueHint: z.string().nullable().optional(),
    }),
  ),
  people: z.array(z.object({ name: z.string() })),
  openLoops: z.array(
    z.object({
      title: z.string(),
      personName: z.string().nullable().optional(),
    }),
  ),
  commitments: z.array(kindItem).optional().default([]),
  decisions: z.array(kindItem).optional().default([]),
  ideas: z.array(kindItem).optional().default([]),
  questions: z.array(kindItem).optional().default([]),
});

function client() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

export async function transcribeAudio(file: File): Promise<string> {
  const openai = client();
  if (!openai) return "";
  const result = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    language: undefined,
  });
  return result.text?.trim() ?? "";
}

export async function companionReply(transcript: string, overwhelmed: boolean): Promise<string> {
  const openai = client();
  if (!openai) {
    return overwhelmed
      ? "Main yahan hoon. Bol, I’m listening."
      : "Okay. I’m with you — we’ll sort the rest on Today when you’re ready.";
  }
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const out = await openai.responses.create({
    model,
    instructions: COMPANION_SYSTEM,
    input: transcript.slice(0, 8000),
    max_output_tokens: 180,
  });
  const text = out.output_text?.trim();
  return text || "I’m here. Aur Bata.";
}

export async function extractDump(transcript: string): Promise<DumpExtract> {
  const openai = client();
  const fallback: DumpExtract = {
    summary: transcript.slice(0, 400) || "I dumped a bit.",
    summaryBullets: transcript ? [`I said: ${transcript.slice(0, 180)}`] : [],
    languageMix: guessMix(transcript),
    overwhelmed: false,
    steps: [],
    people: [],
    openLoops: [],
    commitments: [],
    decisions: [],
    ideas: [],
    questions: [],
  };
  if (!openai) return fallback;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const out = await openai.responses.create({
    model,
    instructions: EXTRACT_SYSTEM,
    input: transcript.slice(0, 12000),
    max_output_tokens: 2000,
  });
  const raw = out.output_text?.trim() || "";
  const json = raw.replace(/^```json\n?|```$/g, "").trim();
  try {
    const parsed = extractSchema.parse(JSON.parse(json));
    const bullets =
      parsed.summaryBullets && parsed.summaryBullets.length
        ? parsed.summaryBullets.map((b) => b.trim()).filter(Boolean)
        : bulletsFromText(parsed.summary || "");
    return {
      ...parsed,
      commitments: parsed.commitments ?? [],
      decisions: parsed.decisions ?? [],
      ideas: parsed.ideas ?? [],
      questions: parsed.questions ?? [],
      summaryBullets: bullets,
      summary: bulletsToSummary(bullets) || parsed.summary || fallback.summary,
    };
  } catch {
    return fallback;
  }
}

function guessMix(text: string): LanguageMix {
  const hasDeva = /[\u0900-\u097F]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  if (hasDeva && hasLatin) return "hinglish";
  if (hasDeva) return "hi";
  return "en";
}
