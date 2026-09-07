-- Pass: workspace-level real-world occurrence ledger for longitudinal pattern eligibility.
-- Episodes are distinct real-world events (not conversations/messages).

CREATE TABLE IF NOT EXISTS "occurrence_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"phenomenon_key" text NOT NULL,
	"episode" text NOT NULL,
	"episode_key" text NOT NULL,
	"why_distinct" text NOT NULL,
	"conversation_id" uuid,
	"pattern_id" uuid,
	"reflection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "occurrence_ledger" ADD CONSTRAINT "occurrence_ledger_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "occurrence_ledger" ADD CONSTRAINT "occurrence_ledger_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "occurrence_ledger" ADD CONSTRAINT "occurrence_ledger_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "occurrence_ledger" ADD CONSTRAINT "occurrence_ledger_reflection_id_reflections_id_fk" FOREIGN KEY ("reflection_id") REFERENCES "public"."reflections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "occurrence_ledger_workspace_phenomenon_episode_uidx" ON "occurrence_ledger" USING btree ("workspace_id","phenomenon_key","episode_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "occurrence_ledger_workspace_phenomenon_idx" ON "occurrence_ledger" USING btree ("workspace_id","phenomenon_key");
