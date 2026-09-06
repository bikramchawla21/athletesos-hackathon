/** @typedef {import('./types').Message} Message */
/** @typedef {import('./types').ReflectionReport} ReflectionReport */
/** @typedef {import('./types').InsightsResponse} InsightsResponse */
/** @typedef {import('./types').InsufficientContextResponse} InsufficientContextResponse */
/** @typedef {import('./types').InsightsErrorBody} InsightsErrorBody */

import OpenAI from "openai";
import { z } from "zod";
import {
  spokenMaturityInstruction,
  spokenSynthesisForPatternMaturity,
} from "./pattern-threshold.mjs";

export const MIN_USER_TURNS = 3;
export const MIN_USER_CHARS = 120;

export const INSIGHT_INSTRUCTIONS = `
You are AthleteOS. Review the full discovery conversation and create a careful, collaborative reflection.

Return JSON only with these fields:
{
  "observations": ["3–4 concise, non-judgmental observations"],
  "evidenceIntro": "short conversational intro (observation language unless distinctOccurrences has 3+)",
  "evidence": [{"category": "short source label", "explanation": "specific conversational evidence"}],
  "evidenceNote": "soft note that this is not proof",
  "pattern": {
    "title": "one highest-leverage working theme or candidate phenomenon",
    "explanation": "two or three sentences using I think / we language and acknowledging uncertainty"
  },
  "sharedPriority": "the single shared priority if we worked on only one thing together",
  "focusIntro": "a short collaborative framing sentence beginning with For the next two weeks",
  "focusAreas": ["1–3 concrete focus areas phrased as things we will work on together"],
  "closing": "one sentence explaining that priorities can change as we keep learning",
  "distinctOccurrences": [
    {
      "episode": "short label for one distinct real-world episode/event",
      "whyDistinct": "why this is a separate real-world occurrence from the others (not just another phrasing)"
    }
  ]
}

Occurrence rules (critical — precision over recall):
- An OCCURRENCE is a distinct real-world episode/event where the phenomenon showed up — NOT a message, NOT a conversation/session.
- Three statements about the same match/practice in one conversation = ONE occurrence.
- The same single event discussed across multiple conversations = ONE occurrence.
- Three clearly separate historical events reported in one conversation (e.g. Monday practice, Wednesday practice, today’s match) MAY be three occurrences if distinction is explicit.
- If you cannot confidently establish distinct real-world episodes, return an empty distinctOccurrences array or only the episodes you are sure about. Never invent episode boundaries.
- Athlete-facing longitudinal pattern language is only appropriate when distinctOccurrences has at least 3 items. Otherwise frame as observation / candidate signal.

Requirements:
- Use only evidence present in the conversation transcript.
- Every evidence explanation must be traceable to something the athlete shared (paraphrase their words or moments).
- Never invent coach feedback, match results, wearable data, training logs, or events that are not in the transcript.
- Include 3–4 observations and 3–5 evidence items drawn from distinct athlete statements.
- If distinctOccurrences length < 3 (or ambiguous), frame findings as observations — never as lasting patterns, tendencies, or “you often…”.
- If the athlete corrected an earlier interpretation, honor the correction. Do not present the disputed interpretation as a finding.
- Do not diagnose medical or mental health conditions.
- Do not present certainty or numeric confidence percentages.
- Prefer “I think,” “we,” and “worth exploring together.”
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
- Includes distinctOccurrences (empty array when occurrence identity is ambiguous)
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
  distinctOccurrences: z
    .array(
      z.object({
        episode: z.string().min(1),
        whyDistinct: z.string().min(1),
      }),
    )
    .max(8)
    .default([]),
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
    distinctOccurrences: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          episode: { type: "string" },
          whyDistinct: { type: "string" },
        },
        required: ["episode", "whyDistinct"],
      },
    },
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
    "distinctOccurrences",
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
  evidenceNote: "This isn’t proof. It’s simply what stood out from today’s conversation.",
  pattern: {
    title: "Emotional recovery after momentum shifts",
    explanation:
      "I don’t think your biggest challenge is technical right now. From what you described today, momentum shifts seem to change how freely you make decisions, and I think that is worth exploring together.",
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
  distinctOccurrences: [
    {
      episode: "Today’s discovery conversation moments about momentum shifts",
      whyDistinct:
        "All cited moments came from one continuous reflection about the same ongoing theme in a single session — counted as one occurrence until separate real-world episodes are established.",
    },
  ],
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
 * Compact memory for insights (internal). Do not invent beyond transcript + this.
 * @param {import('./types').AthleteMemory | null | undefined} memory
 */
export function formatMemoryContextForInsights(memory) {
  if (!memory) return "";
  const lines = [
    "Validated athlete memory (internal). Prefer transcript; use memory only to ground patterns already supported by athlete statements.",
  ];
  const identityBits = [
    memory.identity?.name,
    memory.identity?.sport,
    memory.identity?.level,
  ].filter(Boolean);
  if (identityBits.length) lines.push(`Identity: ${identityBits.join(" · ")}`);
  const summarize = (label, items) => {
    if (!items?.length) return;
    lines.push(
      `${label}: ${items
        .slice(0, 4)
        .map((item) => item.statement)
        .join(" | ")}`,
    );
  };
  summarize("Goals", memory.goals);
  summarize("Challenges", memory.challenges);
  summarize("Motivations", memory.motivations);
  if (memory.athleteCorrections?.length) {
    lines.push(
      `Corrections (honor these): ${memory.athleteCorrections
        .slice(0, 4)
        .map((c) => `"${c.originalInterpretation}" → "${c.athleteCorrection}"`)
        .join(" | ")}`,
    );
  }
  if (memory.previousPriorities?.length) {
    lines.push(
      `Previous priorities: ${memory.previousPriorities
        .slice(0, 3)
        .map((p) => p.priority)
        .join(" | ")}`,
    );
  }
  return lines.join("\n");
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
     * @param {{ transcript: string, memoryContext?: string, repair: boolean }} args
     */
    async generateReport({ transcript, memoryContext = "", repair }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const base = repair
          ? `${INSIGHT_INSTRUCTIONS}\n\n${INSIGHT_REPAIR_INSTRUCTIONS}`
          : INSIGHT_INSTRUCTIONS;
        const instructions = memoryContext ? `${base}\n\n${memoryContext}` : base;
        const response = await client.responses.create(
          {
            model,
            instructions,
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
 * @param {{
 *   apiKey?: string,
 *   memory?: import('./types').AthleteMemory | null,
 *   modelClient?: { generateReport: Function },
 * }} [options]
 */
export async function generateInsights(messages, options = {}) {
  if (!hasSufficientContext(messages)) {
    return {
      ok: false,
      status: 422,
      body: {
        status: "insufficient_context",
        error: "Need a bit more of your story before I can share a careful reflection.",
        message: "Need a bit more of your story before I can share a careful reflection.",
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
  const memoryContext = formatMemoryContextForInsights(options.memory);

  try {
    let raw = await modelClient.generateReport({
      transcript,
      memoryContext,
      repair: false,
    });
    try {
      const report = parseModelJson(raw);
      return { ok: true, status: 200, body: { report, demoMode: false } };
    } catch (firstParseError) {
      if (!(firstParseError instanceof z.ZodError) && !(firstParseError instanceof SyntaxError)) {
        throw firstParseError;
      }
      raw = await modelClient.generateReport({
        transcript,
        memoryContext,
        repair: true,
      });
      try {
        const report = parseModelJson(raw);
        return { ok: true, status: 200, body: { report, demoMode: false } };
      } catch (secondParseError) {
        if (
          secondParseError instanceof z.ZodError ||
          secondParseError instanceof SyntaxError
        ) {
          return {
            ok: false,
            status: 502,
            body: {
              error: "AthleteOS couldn’t finish the reflection right now. Please try again.",
              message: "AthleteOS couldn’t finish the reflection right now. Please try again.",
              code: "INVALID_INSIGHTS_RESPONSE",
            },
          };
        }
        throw secondParseError;
      }
    }
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      status: 502,
      body: {
        error: "AthleteOS couldn’t finish the reflection right now. Please try again.",
        message: "AthleteOS couldn’t finish the reflection right now. Please try again.",
        code: "OPENAI_REQUEST_FAILED",
      },
    };
  }
}

export const SPOKEN_INSIGHT_INSTRUCTIONS = `
You turn a structured AthleteOS ReflectionReport into a short spoken closing for the athlete.

Speak as AthleteOS: calm, specific, high-performance, never motivational or therapeutic.
2–4 conversational sentences (~15–30 seconds spoken). Prefer shorter when enough.
Lead with the single most useful thing noticed. Connect to prior memory ONLY if the report/memory clearly supports recurrence across distinct sessions.
Respect evidence strength and the maturity instruction provided with the request:
- one distinct session → observation only ("Today…" / "From what you described today…"). Never call it a pattern.
- two distinct sessions → cautious recurrence only. Never call it an established pattern.
- three or more distinct sessions → emerging pattern language is allowed carefully.
If evidence is weak, say it is worth watching — do not invent a pattern.
No headings, bullets, IDs, confidence labels, JSON, or "Today here's what I noticed" report voice.
Return plain spoken prose only.
`;

/**
 * Deterministic fallback when OpenAI is unavailable.
 * @param {ReflectionReport} report
 * @param {number} [patternMaturity]
 */
export function getDemoSpokenInsightSynthesis(report, patternMaturity = 1) {
  return spokenSynthesisForPatternMaturity(report, patternMaturity);
}

/**
 * @param {ReflectionReport} report
 * @param {{
 *   apiKey?: string,
 *   memory?: import('./types').AthleteMemory | null,
 *   patternMaturity?: number,
 *   modelClient?: { generateSpoken?: Function },
 * }} [options]
 */
export async function generateSpokenInsightSynthesis(report, options = {}) {
  if (!report?.pattern?.title) {
    return {
      ok: false,
      status: 400,
      body: { error: "Missing report.", code: "INVALID_INSIGHTS_RESPONSE" },
    };
  }

  const patternMaturity = Number(options.patternMaturity) || 1;

  const apiKey = "apiKey" in options ? options.apiKey : process.env.OPENAI_API_KEY;
  if (!hasUsableApiKey(apiKey)) {
    return {
      ok: true,
      status: 200,
      body: {
        spokenSynthesis: spokenSynthesisForPatternMaturity(report, patternMaturity),
        demoMode: true,
      },
    };
  }

  const memoryContext = formatMemoryContextForInsights(options.memory);
  const maturityLine = spokenMaturityInstruction(patternMaturity);
  const payload = JSON.stringify(
    {
      pattern: report.pattern,
      observations: (report.observations || []).slice(0, 4),
      evidence: (report.evidence || []).slice(0, 4),
      sharedPriority: report.sharedPriority,
      closing: report.closing,
      patternMaturity,
    },
    null,
    2,
  );

  try {
    if (options.modelClient?.generateSpoken) {
      const spokenSynthesis = String(
        await options.modelClient.generateSpoken({
          report,
          memoryContext,
          payload,
          patternMaturity,
        }),
      ).trim();
      if (!spokenSynthesis) throw new Error("Empty spoken synthesis");
      return { ok: true, status: 200, body: { spokenSynthesis, demoMode: false } };
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4.1";
    const instructions = [SPOKEN_INSIGHT_INSTRUCTIONS, maturityLine, memoryContext]
      .filter(Boolean)
      .join("\n\n");
    const response = await client.responses.create({
      model,
      instructions,
      input: `Write the spoken closing now from this structured report:\n${payload}`,
      max_output_tokens: 220,
    });
    const spokenSynthesis = String(response.output_text || "").trim();
    if (!spokenSynthesis) throw new Error("Empty spoken synthesis");
    return { ok: true, status: 200, body: { spokenSynthesis, demoMode: false } };
  } catch (error) {
    console.error("[spoken-insight]", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: true,
      status: 200,
      body: {
        spokenSynthesis: spokenSynthesisForPatternMaturity(report, patternMaturity),
        demoMode: false,
        synthesisFallback: true,
      },
    };
  }
}
