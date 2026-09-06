#!/usr/bin/env node
/**
 * Mark a workspace as an intentional pilot cohort member.
 * Usage: node --experimental-strip-types scripts/mark-pilot-workspace.mjs <workspaceUuid>
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const workspaceId = process.argv[2];
if (!workspaceId || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
  console.error("Usage: mark-pilot-workspace.mjs <workspace-uuid>");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const { markWorkspaceAsPilot } = await import("../server/services/pilot-events-service.ts");
await markWorkspaceAsPilot(workspaceId);
console.info(`Marked workspace ${workspaceId} as pilot (pilot_marked_at set if previously null).`);
