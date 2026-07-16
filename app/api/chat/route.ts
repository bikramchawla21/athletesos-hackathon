import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateChatReply } from "@/lib/chat.mjs";
import { chatRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = chatRequestSchema.parse(json);
    const result = await generateChatReply(body.messages);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid chat request.", code: "validation" },
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Unexpected chat error.", code: "unknown" },
      { status: 500 },
    );
  }
}
