import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  ERROR_CODES,
  formatZodIssues,
  logValidationFailure,
  validationErrorBody,
} from "@/lib/api-errors.mjs";
import { generateChatReply, generateReopeningMessage } from "@/lib/chat.mjs";
import { parseChatRequest } from "@/lib/request-contract.mjs";

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
    const body = parseChatRequest(json);

    if (body.mode === "reopen") {
      const result = await generateReopeningMessage({
        messages: body.messages,
        memory: body.memory,
        report: body.report ?? null,
      });
      return NextResponse.json(result.body, { status: result.status });
    }

    const result = await generateChatReply(body.messages, {
      memory: body.memory,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      const issues = error instanceof ZodError ? formatZodIssues(error) : [];
      logValidationFailure("/api/chat", "request_validation", issues, json);
      return NextResponse.json(
        validationErrorBody({
          code: ERROR_CODES.INVALID_CHAT_REQUEST,
          message: "The chat request did not match the expected schema.",
          issues,
          keys:
            json && typeof json === "object" && !Array.isArray(json)
              ? Object.keys(json as object)
              : [],
          phase: "request_validation",
        }),
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json(
      {
        error: "Unexpected chat error.",
        message: "Unexpected chat error.",
        code: ERROR_CODES.UNKNOWN,
      },
      { status: 500 },
    );
  }
}
