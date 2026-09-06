import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { requireAuthenticatedPerson, requireWorkspaceMembership } from "@/server/authz";
import {
  SPEECH_CONTENT_TYPE,
  synthesizeSpeechAudio,
  validateSpeechText,
} from "@/lib/speech";

export const runtime = "nodejs";

const bodySchema = z.object({
  text: z.string(),
  workspaceId: z.string().uuid().optional(),
});

/**
 * POST /api/speech
 * JSON: { text, workspaceId? }
 *
 * Returns ephemeral MP3 audio. Does not persist audio or mutate memory/messages.
 *
 * Lifecycle: request text → in-memory OpenAI TTS → Response body → discarded.
 */
export async function POST(request: Request) {
  try {
    await requireAuthenticatedPerson();

    const json = await request.json();
    const body = bodySchema.parse(json);

    if (body.workspaceId) {
      await requireWorkspaceMembership(body.workspaceId);
    }

    const validated = validateSpeechText(body.text);
    if (!("ok" in validated)) {
      return NextResponse.json(
        { error: validated.error, message: validated.error, code: validated.code },
        { status: validated.status },
      );
    }

    console.info("[speech] request", {
      chars: validated.text.length,
      hasWorkspace: Boolean(body.workspaceId),
    });

    const result = await synthesizeSpeechAudio({ text: validated.text });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: result.error, code: result.code },
        { status: result.status },
      );
    }

    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        "Content-Type": SPEECH_CONTENT_TYPE,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Length": String(result.byteLength),
      },
    });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid speech request.", code: "validation" },
        { status: 400 },
      );
    }
    console.error("[speech] unexpected", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        error: "Couldn't generate speech. Try again.",
        code: "TTS_FAILED",
      },
      { status: 502 },
    );
  }
}
