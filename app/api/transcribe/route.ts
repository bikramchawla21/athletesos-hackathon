import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { requireAuthenticatedPerson, requireWorkspaceMembership } from "@/server/authz";
import { isUploadFile, transcribeAudioFile } from "@/lib/transcribe";

export const runtime = "nodejs";

/**
 * POST /api/transcribe
 * multipart/form-data:
 *   - file | audio: recorded Blob/File
 *   - workspaceId?: uuid (optional; when present, membership is verified)
 *
 * Response: { text: string }
 *
 * Raw-audio lifecycle: request body → in-memory File → OpenAI STT → discarded with the
 * request. No Neon write, no blob store, no disk persistence of audio.
 */
export async function POST(request: Request) {
  try {
    await requireAuthenticatedPerson();

    const form = await request.formData();
    const workspaceIdRaw = form.get("workspaceId");
    if (typeof workspaceIdRaw === "string" && workspaceIdRaw.trim()) {
      const workspaceId = z.string().uuid().parse(workspaceIdRaw.trim());
      await requireWorkspaceMembership(workspaceId);
    }

    const fileEntry = form.get("file") ?? form.get("audio");
    const file = isUploadFile(fileEntry) ? fileEntry : null;

    console.info("[transcribe] request", {
      mime: file?.type || null,
      size: file?.size ?? 0,
      hasWorkspace: Boolean(workspaceIdRaw),
    });

    const result = await transcribeAudioFile({ file });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: result.error, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json({ text: result.text });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid workspace.", code: "validation" },
        { status: 400 },
      );
    }
    console.error("[transcribe] unexpected", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        error: "Couldn't transcribe that. Try again.",
        code: "STT_FAILED",
      },
      { status: 502 },
    );
  }
}
