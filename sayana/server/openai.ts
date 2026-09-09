import OpenAI from "openai";
import { z } from "zod";
import { COMPANION_SYSTEM, EXTRACT_SYSTEM, ENGLISH_REWRITE_SYSTEM } from "@/domain/prompts";
import { bulletsFromText, bulletsToSummary, takeFive } from "@/domain/step-identity";
import { hasArabicScript } from "@/domain/script";
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
  lane: z.enum(["life", "work"]).optional().default("work"),
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
    prompt:
      "Indian English, Hindi, Hinglish. Write Hindi in Devanagari or Latin letters. Do not transcribe as Urdu. Never use Arabic script.",
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
  if (text && hasArabicScript(text)) {
    const retry = await openai.responses.create({
      model,
      instructions: `${COMPANION_SYSTEM}\n\nYour last draft used Arabic/Urdu script. Rewrite in Hindi/Hinglish Latin or Devanagari, or English. No Arabic script.`,
      input: transcript.slice(0, 8000),
      max_output_tokens: 180,
    });
    const fixed = retry.output_text?.trim();
    if (fixed && !hasArabicScript(fixed)) return fixed;
    return overwhelmed ? "Main yahan hoon. Bol, I’m listening." : "I’m here. Aur Bata.";
  }
  return text || "I’m here. Aur Bata.";
}

export async function extractDump(transcript: string): Promise<DumpExtract> {
  const openai = client();
  const fallback: DumpExtract = {
    summary: hasArabicScript(transcript) ? "I dumped a bit." : transcript.slice(0, 400) || "I dumped a bit.",
    summaryBullets:
      transcript && !hasArabicScript(transcript)
        ? takeFive([`I said: ${transcript.slice(0, 180)}`])
        : transcript
          ? ["I talked through a dump in Hindi."]
          : [],
    languageMix: guessMix(transcript),
    lane: "work",
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
    let extract: DumpExtract = {
      ...parsed,
      lane: parsed.lane ?? "work",
      commitments: parsed.commitments ?? [],
      decisions: parsed.decisions ?? [],
      ideas: parsed.ideas ?? [],
      questions: parsed.questions ?? [],
      summaryBullets: takeFive(
        parsed.summaryBullets && parsed.summaryBullets.length
          ? parsed.summaryBullets.map((b) => b.trim()).filter(Boolean)
          : bulletsFromText(parsed.summary || ""),
      ),
      summary: "",
    };
    extract.summary = bulletsToSummary(extract.summaryBullets) || parsed.summary || fallback.summary;
    if (hasArabicScript(JSON.stringify(extract))) {
      extract = await rewriteExtractEnglish(openai, extract, model) ?? extract;
    }
    if (hasArabicScript(extract.summary) || extract.summaryBullets.some(hasArabicScript)) {
      extract.summaryBullets = takeFive(["I talked through a dump in Hindi."]);
      extract.summary = bulletsToSummary(extract.summaryBullets);
    }
    return extract;
  } catch {
    return fallback;
  }
}

function guessMix(text: string): LanguageMix {
  const hasDeva = /[\u0900-\u097F]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  if (hasDeva && hasLatin) return "hinglish";
  if (hasDeva) return "hi";
  if (hasArabicScript(text)) return "hi";
  return "en";
}

async function rewriteExtractEnglish(
  openai: OpenAI,
  extract: DumpExtract,
  model: string,
): Promise<DumpExtract | null> {
  try {
    const out = await openai.responses.create({
      model,
      instructions: ENGLISH_REWRITE_SYSTEM,
      input: JSON.stringify({
        summaryBullets: extract.summaryBullets,
        steps: extract.steps,
        people: extract.people,
        openLoops: extract.openLoops,
        commitments: extract.commitments,
        decisions: extract.decisions,
        ideas: extract.ideas,
        questions: extract.questions,
      }),
      max_output_tokens: 1600,
    });
    const raw = (out.output_text?.trim() || "").replace(/^```json\n?|```$/g, "").trim();
    const parsed = extractSchema.partial().parse(JSON.parse(raw));
    const bullets = takeFive(
      (parsed.summaryBullets || extract.summaryBullets).map((b) => b.trim()).filter(Boolean),
    );
    return {
      ...extract,
      ...parsed,
      languageMix: extract.languageMix,
      lane: parsed.lane ?? extract.lane,
      overwhelmed: parsed.overwhelmed ?? extract.overwhelmed,
      summaryBullets: bullets,
      summary: bulletsToSummary(bullets),
      steps: parsed.steps ?? extract.steps,
      people: parsed.people ?? extract.people,
      openLoops: parsed.openLoops ?? extract.openLoops,
      commitments: parsed.commitments ?? extract.commitments,
      decisions: parsed.decisions ?? extract.decisions,
      ideas: parsed.ideas ?? extract.ideas,
      questions: parsed.questions ?? extract.questions,
    };
  } catch {
    return null;
  }
}
