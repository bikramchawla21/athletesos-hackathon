/** @typedef {import('./types').Message} Message */

import OpenAI from "openai";
import { hasUsableApiKey } from "./insights.mjs";
import { CRISIS_REPLY, detectCrisis } from "./safety.mjs";

export const CHAT_TIMEOUT_MS = 25_000;

export const DISCOVERY_INSTRUCTIONS = `
You are AthleteOS, a thoughtful training partner conducting a discovery conversation with an athlete.

Your purpose is to understand the athlete before offering guidance. You are not a therapist, doctor, evaluator, or authority. You are warm, curious, concise, and grounded.

Conversation rules:
- Respond directly to what the athlete just shared.
- Reflect one meaningful detail before asking a follow-up.
- Ask only one question at a time.
- Follow threads that reveal goals, motivations, pressure responses, habits, learning style, support system, competition experiences, recovery, and current constraints.
- Do not run a fixed questionnaire.
- Do not ask for information the athlete has already provided.
- Occasionally check your understanding with language such as “Can I check that I’m understanding you correctly?” or “Did I understand that correctly?”
- Prefer stories over ratings, but use a rating only when it adds clarity.
- Avoid diagnosis, certainty, jargon, long lectures, and generic coaching advice.
- Never claim a pattern from fewer than three distinct signals.
- Keep each reply under 110 words.
- End most replies with one natural, curiosity-provoking question.
- If the athlete corrects you, acknowledge the correction and update your understanding.
- If the athlete seems in crisis or asks for emergency help, do not counsel them. Remind them you are not a crisis service and urge appropriate human help.
`;

export const CHAT_REPAIR_INSTRUCTIONS = `
Return only a plain assistant reply (no JSON, no markdown fences).
Keep it under 110 words.
Reflect one meaningful detail, ask exactly one follow-up question, and stay collaborative.
`;

/**
 * @param {Message[]} messages
 */
export function getDemoChatReply(messages) {
  const latest = [...messages].reverse().find((m) => m.role === "user");
  const text = latest?.content?.trim() || "";
  const lower = text.toLowerCase();

  if (lower.includes("tennis") || lower.includes("lost")) {
    return `It sounds like tennis has been part of your life for a long time, and something about lately has left you feeling unsure. I want to understand that more carefully. When you say you feel lost, what does that feel like day to day?`;
  }
  if (lower.includes("freeze") || lower.includes("match")) {
    return `I’m hearing that training can feel solid, while important matches bring a freeze response. That distinction matters. When the freeze shows up, what usually happens in the moments just before it?`;
  }
  if (lower.includes("runner") || lower.includes("injury") || lower.includes("scared")) {
    return `It makes sense that returning after injury would come with caution about pushing too hard. I want to stay with that carefully. What feels most frightening about increasing effort right now?`;
  }
  const snippet = text.slice(0, 80);
  return `Thank you for sharing that${snippet ? ` about “${snippet}${text.length > 80 ? "…" : ""}”` : ""}. I want to understand it more clearly. What feels most important about that for you right now?`;
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
     * @param {{ messages: Message[], repair?: boolean }} args
     */
    async generateReply({ messages, repair = false }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await client.responses.create(
          {
            model,
            instructions: repair
              ? `${DISCOVERY_INSTRUCTIONS}\n\n${CHAT_REPAIR_INSTRUCTIONS}`
              : DISCOVERY_INSTRUCTIONS,
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
  };
}

/**
 * @param {Message[]} messages
 * @param {{ apiKey?: string, modelClient?: { generateReply: Function } }} [options]
 */
export async function generateChatReply(messages, options = {}) {
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  if (!latestUser?.content?.trim()) {
    return {
      ok: false,
      status: 400,
      body: { error: "Message cannot be empty.", code: "validation" },
    };
  }

  if (detectCrisis(latestUser.content)) {
    return {
      ok: true,
      status: 200,
      body: { reply: CRISIS_REPLY, demoMode: false, safety: true },
    };
  }

  const apiKey = "apiKey" in options ? options.apiKey : process.env.OPENAI_API_KEY;
  if (!hasUsableApiKey(apiKey)) {
    return {
      ok: true,
      status: 200,
      body: { reply: getDemoChatReply(messages), demoMode: true },
    };
  }

  const modelClient = options.modelClient ?? createOpenAIChatClient(apiKey);

  try {
    let reply = await modelClient.generateReply({ messages, repair: false });
    if (!String(reply || "").trim()) {
      reply = await modelClient.generateReply({ messages, repair: true });
    }
    const text = String(reply || "").trim();
    if (!text) {
      return {
        ok: false,
        status: 502,
        body: {
          error: "AthleteOS couldn’t continue the conversation right now. Please try again.",
          code: "upstream",
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
        code: "upstream",
      },
    };
  }
}
