import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateInsights } from "@/lib/insights.mjs";
import { insightsRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = insightsRequestSchema.parse(json);
    const result = await generateInsights(body.messages);

    if (result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid insights request.", code: "validation" },
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Unexpected insights error.", code: "unknown" },
      { status: 500 },
    );
  }
}
