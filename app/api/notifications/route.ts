import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { requireAuthenticatedPerson, requireWorkspaceMembership } from "@/server/authz";
import { canViewVisibility } from "@/server/authz/permissions";
import { getDb } from "@/db/client";
import { timelineEvents } from "@/db/schema";
import {
  listNotificationsForPerson,
  markNotificationRead,
} from "@/server/services/notification-service";

export async function GET(request: Request) {
  try {
    const { person } = await requireAuthenticatedPerson();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (workspaceId) {
      const access = await requireWorkspaceMembership(workspaceId);
      const db = getDb();
      const rows = await db
        .select()
        .from(timelineEvents)
        .where(eq(timelineEvents.workspaceId, workspaceId))
        .orderBy(desc(timelineEvents.createdAt))
        .limit(50);

      const visible = rows.filter((row) =>
        canViewVisibility({
          role: access.membership.role,
          personId: access.person.id,
          visibility: row.visibility,
          authorPersonId: row.personId,
        }),
      );

      return NextResponse.json({
        timeline: visible.map((e) => ({
          id: e.id,
          kind: e.kind,
          visibility: e.visibility,
          payload: e.payload,
          createdAt: e.createdAt.toISOString(),
        })),
      });
    }

    const notes = await listNotificationsForPerson(person.id);
    return NextResponse.json({
      notifications: notes.map((n) => ({
        id: n.id,
        kind: n.kind,
        workspaceId: n.workspaceId,
        payload: n.payload,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load notifications.", code: "unknown" },
      { status: 500 },
    );
  }
}

const readSchema = z.object({
  notificationId: z.string().uuid(),
});

export async function PATCH(request: Request) {
  try {
    const { person } = await requireAuthenticatedPerson();
    const body = readSchema.parse(await request.json());
    await markNotificationRead({
      notificationId: body.notificationId,
      personId: person.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: "Failed to update notification.", code: "unknown" },
      { status: 400 },
    );
  }
}
