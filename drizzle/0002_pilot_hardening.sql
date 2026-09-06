-- Pass 7: pilot cohort flag + durable pilot analytics events (no transcript content)

ALTER TABLE "athlete_workspaces" ADD COLUMN IF NOT EXISTS "pilot_marked_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pilot_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"person_id" uuid,
	"conversation_id" uuid,
	"name" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"client_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pilot_events" ADD CONSTRAINT "pilot_events_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pilot_events" ADD CONSTRAINT "pilot_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pilot_events" ADD CONSTRAINT "pilot_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pilot_events_workspace_created_idx" ON "pilot_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pilot_events_name_created_idx" ON "pilot_events" USING btree ("name","created_at");
