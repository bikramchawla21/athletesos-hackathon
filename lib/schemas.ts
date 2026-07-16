import { z } from "zod";

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(5000),
});

export const insightsRequestSchema = z.object({
  messages: z.array(messageSchema).min(2).max(40),
});

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
});

export {
  parseReflectionReport,
  reflectionReportJsonSchema,
  reflectionReportSchema,
} from "./insights.mjs";
