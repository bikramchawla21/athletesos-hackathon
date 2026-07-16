import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { INSIGHT_INSTRUCTIONS } from "@/lib/prompts";

const bodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(5000),
    }),
  ).min(2).max(40),
});

const reportSchema = z.object({
  observations: z.array(z.string()).min(3).max(4),
  evidence: z.array(z.object({ label: z.string(), detail: z.string() })).min(3).max(5),
  pattern: z.string(),
  patternExplanation: z.string(),
  focusIntro: z.string(),
  priorities: z.array(z.string()).length(3),
  closing: z.string(),
});

const fallbackReport = {
  observations: [
    "You care deeply about improving, not simply collecting results.",
    "After difficult performances, you tend to search for something to fix immediately.",
    "You often respond to uncertainty by adding more effort.",
    "Your confidence appears to move more quickly than your underlying ability.",
  ],
  evidence: [
    { label: "Competition reflections", detail: "You described replaying close losses and looking for immediate technical changes." },
    { label: "Training response", detail: "You said disappointing results often make you increase your workload." },
    { label: "Pressure moments", detail: "You connected momentum shifts with hesitation and less committed decisions." },
  ],
  pattern: "Emotional recovery after momentum shifts",
  patternExplanation: "I don’t think your biggest challenge is technical right now. The strongest current pattern is that momentum shifts seem to change how freely you make decisions, and I think that is worth exploring together.",
  focusIntro: "For the next two weeks, let’s keep your technique stable and train the way we recover after pressure moments.",
  priorities: [
    "Build one repeatable reset between points.",
    "Practice committing to tactical choices immediately after setbacks.",
    "Reflect briefly after pressure sessions without trying to fix everything.",
  ],
  closing: "We’ll keep learning together, and if the pattern changes, our priorities will change too.",
};

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ report: fallbackReport, demoMode: true });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcript = body.messages
      .map((message) => `${message.role === "user" ? "Athlete" : "AthleteOS"}: ${message.content}`)
      .join("\n\n");

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      instructions: INSIGHT_INSTRUCTIONS,
      input: transcript,
      reasoning: { effort: "medium" },
      text: {
        format: {
          type: "json_schema",
          name: "athlete_insight_report",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              observations: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 4 },
              evidence: {
                type: "array",
                minItems: 3,
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: { label: { type: "string" }, detail: { type: "string" } },
                  required: ["label", "detail"]
                }
              },
              pattern: { type: "string" },
              patternExplanation: { type: "string" },
              focusIntro: { type: "string" },
              priorities: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
              closing: { type: "string" }
            },
            required: ["observations", "evidence", "pattern", "patternExplanation", "focusIntro", "priorities", "closing"]
          }
        }
      }
    });

    const report = reportSchema.parse(JSON.parse(response.output_text));
    return NextResponse.json({ report, demoMode: false });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ report: fallbackReport, demoMode: true });
  }
}
