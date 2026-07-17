import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  ERROR_CODES,
  formatZodIssues,
  logValidationFailure,
  validationErrorBody,
} from "@/lib/api-errors.mjs";
import { generateMemoryUpdate } from "@/lib/memory.mjs";
import { parseMemoryRequest } from "@/lib/request-contract.mjs";

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
    const body = parseMemoryRequest(json);
    const result = await generateMemoryUpdate({
      memory: body.memory,
      messages: body.messages,
      report: body.report ?? null,
      reason: body.reason,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      const issues = error instanceof ZodError ? formatZodIssues(error) : [];
      logValidationFailure("/api/memory", "request_validation", issues, json);
      return NextResponse.json(
        validationErrorBody({
          code: ERROR_CODES.INVALID_MEMORY_REQUEST,
          message: "The memory request did not match the expected schema.",
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
        error: "Unexpected memory error.",
        message: "Unexpected memory error.",
        code: ERROR_CODES.UNKNOWN,
      },
      { status: 500 },
    );
  }
}
