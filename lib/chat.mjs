/** @typedef {import('./types').Message} Message */
/** @typedef {import('./types').AthleteMemory} AthleteMemory */

import OpenAI from "openai";
import { hasUsableApiKey } from "./insights.mjs";
import { looksLikeAthleteCorrection } from "./memory-guards.mjs";
import { CRISIS_REPLY, detectCrisis } from "./safety.mjs";

export const CHAT_TIMEOUT_MS = 25_000;

export const DISCOVERY_INSTRUCTIONS = `
You are AthleteOS, a perceptive, ambitious, concise training partner.

Your job is to discover the athlete through precise questions: goals, motivations, competitive mindset, training and recovery context, support environment, and performance patterns. You are not a therapist, wellness coach, doctor, evaluator, or authority.

DEFAULT RESPONSE (ordinary discovery turns):
Reply with ONE concise follow-up question only.
- No reflection, summary, paraphrase, or acknowledgment before the question.
- No praise, sympathy, or emotional validation.
- No explanation of your interpretation before the question.
- The response should usually contain only the question itself.
- Usually under 20 words.
- Ask only one primary question (one “?”).

Format:
[One precise follow-up question?]

Question quality:
1. Explore one missing piece of information.
2. Be specific to the athlete’s latest answer.
3. Move toward understanding a pattern, cause, decision, or consequence.
4. Prefer useful distinctions (e.g. decisions vs commitment vs body; leading vs trailing vs closing).
5. Avoid generic prompts: “Can you tell me more?”, “How does that make you feel?”, “Why do you think that happens?”, “What do you mean by that?”

Hard bans — do NOT:
- Repeat or paraphrase the athlete’s wording
- Summarize their answer
- Begin with “It sounds like”, “You mentioned”, “What I’m hearing”, “That suggests”, “It seems”, “I notice”, “You tend to”, “You named”, “You singled out”, “You respond to”
- Thank them for sharing or praise their honesty
- Add emotional validation
- Explain your interpretation before every question

RARE EXCEPTIONS — one short sentence before the question is allowed only when:
- Clarifying a contradiction or factual misunderstanding
- Responding to a safety-sensitive message
- Asking permission before a highly sensitive topic
- A deliberate pattern check after sufficient evidence (multiple distinct signals)

Allowed pattern-check example (rare, not ordinary turns):
“I want to test one possible pattern. Does your confidence fall mainly when you stop trusting your original decisions?”

Do not use pattern checks during ordinary question-by-question discovery.
Do not use Mode-style reflection (“reflect and ask”, “I’m asking because…”, “Before I ask another question…”) on ordinary turns.

Memory:
- Use validated memory or transcript silently to choose a better question.
- Do not force a memory reference into every response.
- Do not invent dates, events, coach feedback, or performance data.

Hidden understandingCoverage (0–100) is an internal routing signal only — never show numbers; do not questionnaire-fill every category.

Corrections (rare exception):
If the athlete corrects you, do not defend the prior interpretation. Ask one clarifying question about what is more accurate. Prefer question-only when possible.

Crisis / emergency: do not counsel; you are not a crisis service—urge appropriate human help (safety reply may be longer).

Other hard rules:
- No advice, drills, or plans yet.
- No fixed questionnaire; do not re-ask known facts.
- Do not sound clinical, diagnostic, cheerleading, or authoritarian.

Tone: direct, curious, calm, performance-oriented, concise.
`;

export const CHAT_REPAIR_INSTRUCTIONS = `
Return only a plain assistant reply (no JSON, no markdown fences).
Ordinary discovery: ONE precise question only — usually under 20 words.
No reflection, paraphrase, summary, acknowledgment, praise, or sympathy.
No banned openers (It sounds like / You mentioned / I notice / etc.).
`;

export const REOPEN_INSTRUCTIONS = `
You are AthleteOS. The athlete finished a reflection and chose to continue the conversation.

Write ONE short reopening message (2–3 sentences max):
- Naturally reference the most recent shared priority or working pattern from the provided memory/report.
- Invite them back into discovery with exactly one open question.
- Do not restart as if you just met them.
- Do not give a training plan or advice dump.
- Do not invent facts beyond validated memory and the report.
- Do not mention coverage scores, demo mode, or internal systems.
`;

/**
 * Relationship marker shown on the completion screen.
 * @param {number} sessionCount
 */
export function relationshipMarkerCopy(sessionCount) {
  if (Number(sessionCount) <= 1) {
    return "Today — We began understanding your journey.";
  }
  return "Continuing — Learning what consistently helps you perform.";
}

/**
 * @param {import('./types').AthleteMemory | null | undefined} memory
 * @param {import('./types').ReflectionReport | null | undefined} report
 */
export function getDemoReopeningMessage(memory, report) {
  const priority =
    report?.sharedPriority?.trim() ||
    memory?.previousPriorities?.[0]?.priority?.trim() ||
    "";
  const pattern = report?.pattern?.title?.trim() || "";

  if (priority) {
    const cleaned = priority.replace(/\.$/, "");
    return `We’ve identified ${cleaned} as something worth working on together. What has been on your mind since we reached that conclusion?`;
  }
  if (pattern) {
    return `We’ve been exploring “${pattern}” together. What has been on your mind since that reflection?`;
  }
  return `We’ve built some understanding together. What has been on your mind since we last reflected?`;
}

/**
 * Compact validated memory for the model. Coverage is internal routing only.
 * @param {AthleteMemory | null | undefined} memory
 * @returns {string}
 */
export function formatMemoryContextForChat(memory) {
  if (!memory) return "";

  const lines = ["Validated athlete memory (internal). Do not invent beyond this or the transcript."];

  const identityBits = [
    memory.identity?.name,
    memory.identity?.sport,
    memory.identity?.level,
  ].filter(Boolean);
  if (identityBits.length) lines.push(`Identity: ${identityBits.join(" · ")}`);
  if (memory.identity?.background?.length) {
    lines.push(`Background: ${memory.identity.background.slice(0, 4).join("; ")}`);
  }

  const summarizeItems = (label, items) => {
    if (!items?.length) return;
    lines.push(
      `${label}: ${items
        .slice(0, 4)
        .map((item) => `${item.statement} [${item.confidence}]`)
        .join(" | ")}`,
    );
  };

  summarizeItems("Goals", memory.goals);
  summarizeItems("Motivations", memory.motivations);
  summarizeItems("Challenges", memory.challenges);
  summarizeItems("Significant experiences", memory.significantExperiences);

  if (memory.observedPatterns?.length) {
    lines.push(
      `Patterns: ${memory.observedPatterns
        .slice(0, 4)
        .map((p) => `${p.statement} (${p.status})`)
        .join(" | ")}`,
    );
  }

  if (memory.athleteCorrections?.length) {
    lines.push(
      `Corrections (honor these): ${memory.athleteCorrections
        .slice(0, 4)
        .map((c) => `was "${c.originalInterpretation}" → athlete: "${c.athleteCorrection}"`)
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

  if (memory.openQuestions?.length) {
    lines.push(`Open questions: ${memory.openQuestions.slice(0, 4).join(" | ")}`);
  }

  const c = memory.understandingCoverage;
  if (c) {
    lines.push(
      `understandingCoverage 0–100 (INTERNAL routing only — never show numbers to athlete): story=${c.story} goals=${c.goals} motivation=${c.motivation} competitiveMindset=${c.competitiveMindset} trainingContext=${c.trainingContext} recoveryContext=${c.recoveryContext} supportEnvironment=${c.supportEnvironment}`,
    );
  }

  lines.push(`relationshipStage=${memory.relationshipStage}; sessionCount=${memory.sessionCount}`);
  return lines.join("\n");
}

/** Deterministic demo question bank for unmatched inputs (never invent athlete facts). */
export const DEMO_FALLBACK_QUESTIONS = [
  "What part of that goal feels most within your control right now?",
  "When do you feel closest to that standard in training?",
  "What usually gets in the way first: preparation, execution, or recovery?",
  "Which recent moment best shows what you’re aiming for?",
  "What would need to change for that to feel more realistic this month?",
  "Is the harder part clarity of the goal, or consistency under pressure?",
  "What do you already know works when things go well?",
  "Where does that ambition show up most clearly in your week?",
];

/**
 * Stable non-crypto hash so unmatched demo prompts get varied but repeatable questions.
 * @param {string} text
 * @returns {number}
 */
export function hashDemoPrompt(text) {
  let hash = 0;
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function pickDemoFallbackQuestion(text) {
  const index = hashDemoPrompt(text) % DEMO_FALLBACK_QUESTIONS.length;
  return DEMO_FALLBACK_QUESTIONS[index];
}

/**
 * @param {Message[]} messages
 * @param {AthleteMemory | null | undefined} [memory]
 */
export function getDemoChatReply(messages, memory) {
  const latest = [...messages].reverse().find((m) => m.role === "user");
  const text = latest?.content?.trim() || "";
  const lower = text.toLowerCase();

  if (looksLikeAthleteCorrection(text)) {
    return `What feels more accurate instead?`;
  }

  if (lower.includes("confidence") && lower.includes("mistake")) {
    return `What changes first after those mistakes: your decisions, commitment, or body language?`;
  }
  if (lower.includes("train harder") && lower.includes("every loss")) {
    return `What are you trying to correct during the next training session?`;
  }
  if (lower.includes("train harder") || (lower.includes("frustrated") && lower.includes("loss"))) {
    return `What do you change first after a loss: technique, workload, or strategy?`;
  }
  if (lower.includes("freeze")) {
    return `When you freeze, do you become indecisive, physically tight, or less committed to your shots?`;
  }
  if (
    lower.includes("coach") &&
    (lower.includes("believe") ||
      lower.includes("don't believe") ||
      lower.includes("don’t believe") ||
      lower.includes("good enough"))
  ) {
    return `When do you most reject that evidence: after losses, during practice, or on important points?`;
  }
  if (lower.includes("forehand")) {
    return `Under pressure, does the forehand fail in preparation, decision-making, or commitment through contact?`;
  }
  if (lower.includes("close match") || (lower.includes("losing") && lower.includes("close"))) {
    return `At what point in close matches do you usually stop following your original plan?`;
  }
  if (lower.includes("tennis") && lower.includes("lost")) {
    return `What feels most unclear right now: direction, level, or how you compete?`;
  }
  if (lower.includes("runner") || lower.includes("injury")) {
    return `Are you underloading from fear, or still unsure what load is safe?`;
  }
  if (
    lower.includes("hurt") ||
    lower.includes("devastat") ||
    lower.includes("broke down") ||
    lower.includes("couldn't stop crying") ||
    lower.includes("couldn’t stop crying")
  ) {
    return `What changed in your game after that?`;
  }
  if (lower.includes("wimbledon") || lower.includes("win") || lower.includes("champion")) {
    return `What part of that goal feels most within your control right now?`;
  }

  if (memory?.challenges?.length) {
    return `Which part of that still shows up most under pressure?`;
  }

  return pickDemoFallbackQuestion(text);
}

/**
 * @param {string} apiKey
 * @param {{ timeoutMs?: number }} [options]
 */
export function createOpenAIChatClient(apiKey, options = {}) {
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4.1";
  const timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_MS;

  return {
    /**
     * @param {{ messages: Message[], memory?: AthleteMemory | null, repair?: boolean }} args
     */
    async generateReply({ messages, memory = null, repair = false }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const memoryContext = formatMemoryContextForChat(memory);
        const baseInstructions = repair
          ? `${DISCOVERY_INSTRUCTIONS}\n\n${CHAT_REPAIR_INSTRUCTIONS}`
          : DISCOVERY_INSTRUCTIONS;
        const instructions = memoryContext
          ? `${baseInstructions}\n\n${memoryContext}`
          : baseInstructions;

        const response = await client.responses.create(
          {
            model,
            instructions,
            input: messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          },
          { signal: controller.signal },
        );
        const text = response.output_text?.trim();
        if (!text) {
          throw new Error("Empty model output");
        }
        return text;
      } finally {
        clearTimeout(timer);
      }
    },

    /**
     * @param {{ memory?: AthleteMemory | null, report?: import('./types').ReflectionReport | null, messages?: Message[] }} args
     */
    async generateReopen({ memory = null, report = null, messages = [] }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const memoryContext = formatMemoryContextForChat(memory);
        const priority = report?.sharedPriority || memory?.previousPriorities?.[0]?.priority || "";
        const pattern = report?.pattern?.title || "";
        const input = [
          memoryContext || "No structured memory yet.",
          report
            ? `Latest reflection priority: ${report.sharedPriority}\nPattern: ${report.pattern.title}\nFocus areas: ${report.focusAreas.join("; ")}`
            : `Latest priority: ${priority || "unknown"}\nPattern: ${pattern || "unknown"}`,
          `Recent transcript excerpt:\n${messages
            .slice(-6)
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n\n")}`,
          "Write the reopening message now.",
        ].join("\n\n");

        const response = await client.responses.create(
          {
            model,
            instructions: REOPEN_INSTRUCTIONS,
            input,
          },
          { signal: controller.signal },
        );
        const text = response.output_text?.trim();
        if (!text) throw new Error("Empty model output");
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * @param {{
 *   messages?: Message[],
 *   memory?: AthleteMemory | null,
 *   report?: import('./types').ReflectionReport | null,
 *   apiKey?: string,
 *   modelClient?: { generateReopen?: Function, generateReply?: Function },
 * }} [options]
 */
export async function generateReopeningMessage(options = {}) {
  const memory = options.memory ?? null;
  const report = options.report ?? null;
  const messages = options.messages ?? [];
  const apiKey = "apiKey" in options ? options.apiKey : process.env.OPENAI_API_KEY;

  if (!hasUsableApiKey(apiKey)) {
    return {
      ok: true,
      status: 200,
      body: { reply: getDemoReopeningMessage(memory, report), demoMode: true },
    };
  }

  const modelClient = options.modelClient ?? createOpenAIChatClient(apiKey);

  try {
    let reply = await modelClient.generateReopen({ memory, report, messages });
    if (!String(reply || "").trim() && modelClient.generateReply) {
      // one soft retry via reopen again if empty
      reply = await modelClient.generateReopen({ memory, report, messages });
    }
    const text = String(reply || "").trim();
    if (!text) {
      return {
        ok: false,
        status: 502,
        body: {
          error: "AthleteOS couldn’t continue the conversation right now. Please try again.",
          code: "OPENAI_REQUEST_FAILED",
        },
      };
    }
    return {
      ok: true,
      status: 200,
      body: { reply: text, demoMode: false },
    };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      status: 502,
      body: {
        error: "AthleteOS couldn’t continue the conversation right now. Please try again.",
        code: "OPENAI_REQUEST_FAILED",
      },
    };
  }
}

/**
 * @param {Message[]} messages
 * @param {{ apiKey?: string, memory?: AthleteMemory | null, modelClient?: { generateReply: Function } }} [options]
 */
export async function generateChatReply(messages, options = {}) {
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  if (!latestUser?.content?.trim()) {
    return {
      ok: false,
      status: 400,
      body: { error: "Message cannot be empty.", code: "INVALID_CHAT_REQUEST" },
    };
  }

  if (detectCrisis(latestUser.content)) {
    return {
      ok: true,
      status: 200,
      body: { reply: CRISIS_REPLY, demoMode: false, safety: true },
    };
  }

  const memory = options.memory ?? null;
  const apiKey = "apiKey" in options ? options.apiKey : process.env.OPENAI_API_KEY;
  if (!hasUsableApiKey(apiKey)) {
    return {
      ok: true,
      status: 200,
      body: { reply: getDemoChatReply(messages, memory), demoMode: true },
    };
  }

  const modelClient = options.modelClient ?? createOpenAIChatClient(apiKey);

  try {
    let reply = await modelClient.generateReply({ messages, memory, repair: false });
    if (!String(reply || "").trim()) {
      reply = await modelClient.generateReply({ messages, memory, repair: true });
    }
    const text = String(reply || "").trim();
    if (!text) {
      return {
        ok: false,
        status: 502,
        body: {
          error: "AthleteOS couldn’t continue the conversation right now. Please try again.",
          code: "OPENAI_REQUEST_FAILED",
        },
      };
    }
    return {
      ok: true,
      status: 200,
      body: { reply: text, demoMode: false },
    };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      status: 502,
      body: {
        error: "AthleteOS couldn’t continue the conversation right now. Please try again.",
        code: "OPENAI_REQUEST_FAILED",
      },
    };
  }
}
