/** @typedef {import('./types').Message} Message */
/** @typedef {import('./types').ReflectionReport} ReflectionReport */
/** @typedef {import('./types').InsightsResponse} InsightsResponse */
/** @typedef {import('./types').InsufficientContextResponse} InsufficientContextResponse */
/** @typedef {import('./types').InsightsErrorBody} InsightsErrorBody */

import OpenAI from "openai";
import { z } from "zod";

export const MIN_USER_TURNS = 3;
export const MIN_USER_CHARS = 120;

export const INSIGHT_INSTRUCTIONS = `
You are AthleteOS. Review the full discovery conversation and create a careful, collaborative reflection.

Return JSON only with these fields:
{
  "observations": ["3–4 concise, non-judgmental observations"],
  "evidenceIntro": "short conversational intro explaining that separate moments began forming a pattern",
  "evidence": [{"category": "short source label", "explanation": "specific conversational evidence"}],
  "evidenceNote": "soft note that this is not proof, only a pattern worth exploring",
  "pattern": {
    "title": "one highest-leverage working pattern",
    "explanation": "two or three sentences using I think / we language and acknowledging uncertainty"
  },
  "sharedPriority": "the single shared priority if we worked on only one thing together",
  "focusIntro": "a short collaborative framing sentence beginning with For the next two weeks",
  "focusAreas": ["1–3 concrete focus areas phrased as things we will work on together"],
  "closing": "one sentence explaining that priorities can change as we keep learning"
}

Requirements:
- Use only evidence present in the conversation transcript.
- Every evidence explanation must be traceable to something the athlete shared (paraphrase their words or moments).
- Never invent coach feedback, match results, wearable data, training logs, or events that are not in the transcript.
- Include 3–4 observations and 3–5 evidence items drawn from distinct athlete statements.
- A working pattern requires at least three distinct signals from the transcript. If evidence is thin, say the hypothesis is preliminary—do not invent extra signals.
- If the athlete corrected an earlier interpretation, honor the correction. Do not present the disputed interpretation as a finding.
- Do not diagnose medical or mental health conditions.
- Do not present certainty. Prefer “I think,” “we,” and “worth exploring together.”
- Make the athlete feel recognized, not evaluated.
- Keep every field concise.
`;

export const INSIGHT_REPAIR_INSTRUCTIONS = `
The previous JSON did not match the required schema or used unsupported claims.

Return corrected JSON that:
- Matches the ReflectionReport schema exactly
- Uses only evidence from the athlete transcript provided
- Does not invent coach feedback, matches, wearables, or unstated events
- Honors any athlete corrections
- Uses tentative, collaborative language
- Does not diagnose
`;

export const reflectionReportSchema = z.object({
  observations: z.array(z.string().min(1)).min(3).max(4),
  evidenceIntro: z.string().min(1),
  evidence: z
    .array(
      z.object({
        category: z.string().min(1),
        explanation: z.string().min(1),
      }),
    )
    .min(3)
    .max(5),
  evidenceNote: z.string().min(1),
  pattern: z.object({
    title: z.string().min(1),
    explanation: z.string().min(1),
  }),
  sharedPriority: z.string().min(1),
  focusIntro: z.string().min(1),
  focusAreas: z.array(z.string().min(1)).min(1).max(3),
  closing: z.string().min(1),
});

export const reflectionReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    observations: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 4,
    },
    evidenceIntro: { type: "string" },
    evidence: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["category", "explanation"],
      },
    },
    evidenceNote: { type: "string" },
    pattern: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        explanation: { type: "string" },
      },
      required: ["title", "explanation"],
    },
    sharedPriority: { type: "string" },
    focusIntro: { type: "string" },
    focusAreas: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 3,
    },
    closing: { type: "string" },
  },
  required: [
    "observations",
    "evidenceIntro",
    "evidence",
    "evidenceNote",
    "pattern",
    "sharedPriority",
    "focusIntro",
    "focusAreas",
    "closing",
  ],
};

/** Demo reflection used only when no API key is configured. */
export const fallbackReport = reflectionReportSchema.parse({
  observations: [
    "You care deeply about improving, not simply collecting results.",
    "After difficult performances, you tend to search for something to fix immediately.",
    "You often respond to uncertainty by adding more effort.",
    "Your confidence appears to move more quickly than your underlying ability.",
  ],
  evidenceIntro:
    "I’ve been connecting different moments from our conversation. None of them tells the whole story alone, but together they started forming a pattern worth exploring with you.",
  evidence: [
    {
      category: "Competition reflections",
      explanation:
        "You described replaying close losses and looking for immediate technical changes.",
    },
    {
      category: "Training response",
      explanation: "You said disappointing results often make you increase your workload.",
    },
    {
      category: "Pressure moments",
      explanation:
        "You connected momentum shifts with hesitation and less committed decisions.",
    },
  ],
  evidenceNote: "This isn’t proof. It’s simply the pattern I keep seeing across your journey.",
  pattern: {
    title: "Emotional recovery after momentum shifts",
    explanation:
      "I don’t think your biggest challenge is technical right now. The strongest current pattern is that momentum shifts seem to change how freely you make decisions, and I think that is worth exploring together.",
  },
  sharedPriority: "Train how we recover after momentum shifts, while keeping technique stable.",
  focusIntro:
    "For the next two weeks, let’s keep your technique stable and train the way we recover after pressure moments.",
  focusAreas: [
    "Build one repeatable reset between points.",
    "Practice committing to tactical choices immediately after setbacks.",
    "Reflect briefly after pressure sessions without trying to fix everything.",
  ],
  closing: "We’ll keep learning together, and if the pattern changes, our priorities will change too.",
});

/**
 * @param {string | undefined} apiKey
 */
export function hasUsableApiKey(apiKey = process.env.OPENAI_API_KEY) {
  if (!apiKey) return false;
  const trimmed = apiKey.trim();
  return trimmed.length > 0 && trimmed !== "replace_me";
}

/**
 * @param {Message[]} messages
 */
export function hasSufficientContext(messages) {
  const userMessages = messages.filter((m) => m.role === "user" && m.content.trim().length > 0);
  if (userMessages.length < MIN_USER_TURNS) return false;
  const userChars = userMessages.reduce((sum, m) => sum + m.content.trim().length, 0);
  return userChars >= MIN_USER_CHARS;
}

/**
 * @param {Message[]} messages
 */
export function formatTranscript(messages) {
  return messages
    .map((message) => `${message.role === "user" ? "Athlete" : "AthleteOS"}: ${message.content}`)
    .join("\n\n");
}

/**
 * @param {unknown} data
 * @returns {ReflectionReport}
 */
export function parseReflectionReport(data) {
  return reflectionReportSchema.parse(data);
}

export const INSIGHT_TIMEOUT_MS = 25_000;

/**
 * @param {string} apiKey
 * @param {{ timeoutMs?: number }} [options]
 */
export function createOpenAIInsightsClient(apiKey, options = {}) {
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4.1";
  const timeoutMs = options.timeoutMs ?? INSIGHT_TIMEOUT_MS;

  return {
    /**
     * @param {{ transcript: string, repair: boolean }} args
     */
    async generateReport({ transcript, repair }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await client.responses.create(
          {
            model,
            instructions: repair
              ? `${INSIGHT_INSTRUCTIONS}\n\n${INSIGHT_REPAIR_INSTRUCTIONS}`
              : INSIGHT_INSTRUCTIONS,
            input: transcript,
            text: {
              format: {
                type: "json_schema",
                name: "athlete_reflection_report",
                strict: true,
                schema: reflectionReportJsonSchema,
              },
            },
          },
          { signal: controller.signal },
        );

        const text = response.output_text?.trim();
        if (!text) {
          throw new Error("Empty model output");
        }
        return JSON.parse(text);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * @param {unknown} raw
 * @returns {ReflectionReport}
 */
function parseModelJson(raw) {
  if (typeof raw === "string") {
    return parseReflectionReport(JSON.parse(raw));
  }
  return parseReflectionReport(raw);
}

/**
 * @param {Message[]} messages
 * @param {{ apiKey?: string, modelClient?: { generateReport: Function } }} [options]
 */
export async function generateInsights(messages, options = {}) {
  if (!hasSufficientContext(messages)) {
    return {
      ok: false,
      status: 422,
      body: {
        status: "insufficient_context",
        error: "Need a bit more of your story before I can share a careful reflection.",
        code: "insufficient_context",
      },
    };
  }

  const apiKey = "apiKey" in options ? options.apiKey : process.env.OPENAI_API_KEY;
  if (!hasUsableApiKey(apiKey)) {
    return {
      ok: true,
      status: 200,
      body: { report: fallbackReport, demoMode: true },
    };
  }

  const modelClient = options.modelClient ?? createOpenAIInsightsClient(apiKey);
  const transcript = formatTranscript(messages);

  try {
    let raw = await modelClient.generateReport({ transcript, repair: false });
    try {
      const report = parseModelJson(raw);
      return { ok: true, status: 200, body: { report, demoMode: false } };
    } catch (firstParseError) {
      if (!(firstParseError instanceof z.ZodError) && !(firstParseError instanceof SyntaxError)) {
        throw firstParseError;
      }
      raw = await modelClient.generateReport({ transcript, repair: true });
      const report = parseModelJson(raw);
      return { ok: true, status: 200, body: { report, demoMode: false } };
    }
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      status: 502,
      body: {
        error: "AthleteOS couldn’t finish the reflection right now. Please try again.",
        code: "upstream",
      },
    };
  }
}
