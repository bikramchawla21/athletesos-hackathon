import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/server/authz/http";
import { requireAuthenticatedPerson } from "@/server/authz";
import {
  createAthleteWorkspace,
  listActiveWorkspacesForPerson,
  listMembershipsWithRoles,
} from "@/server/services/workspace-service";

const createSchema = z.object({
  sport: z.string().trim().max(120).nullable().optional(),
  level: z.string().trim().max(120).nullable().optional(),
});

export async function GET() {
  try {
    const { person } = await requireAuthenticatedPerson();
    const memberships = await listMembershipsWithRoles(person.id);
    return NextResponse.json({
      memberships: memberships.map((m) => ({
        workspaceId: m.workspace.id,
        role: m.membership.role,
        sport: m.workspace.sport,
        level: m.workspace.level,
        status: m.workspace.status,
      })),
      athleteWorkspaces: memberships
        .filter((m) => m.membership.role === "athlete")
        .map((m) => ({
          id: m.workspace.id,
          sport: m.workspace.sport,
          level: m.workspace.level,
        })),
      coachWorkspaces: memberships
        .filter((m) => m.membership.role === "coach")
        .map((m) => ({
          id: m.workspace.id,
          sport: m.workspace.sport,
          level: m.workspace.level,
        })),
    });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    console.error(error);
    return NextResponse.json(
      { error: "Unexpected workspace error.", code: "unknown" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { person } = await requireAuthenticatedPerson();
    const existingAthlete = await listActiveWorkspacesForPerson(person.id, "athlete");
    if (existingAthlete[0]) {
      return NextResponse.json({ workspace: existingAthlete[0] });
    }

    const json = await request.json();
    const body = createSchema.parse(json);
    const workspace = await createAthleteWorkspace({
      person,
      sport: body.sport ?? null,
      level: body.level ?? null,
    });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    const authz = authzErrorResponse(error);
    if (authz) return authz;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid workspace request.", code: "validation" },
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Unexpected workspace error.", code: "unknown" },
      { status: 500 },
    );
  }
}
