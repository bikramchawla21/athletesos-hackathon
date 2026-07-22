CREATE TYPE "public"."conversation_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."evidence_source_type" AS ENUM('message', 'observation', 'memory_item');--> statement-breakpoint
CREATE TYPE "public"."legacy_import_status" AS ENUM('completed');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('athlete', 'coach');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."memory_confidence" AS ENUM('tentative', 'supported', 'strong');--> statement-breakpoint
CREATE TYPE "public"."memory_item_kind" AS ENUM('goal', 'motivation', 'challenge', 'significant_experience', 'correction', 'open_question', 'identity_background');--> statement-breakpoint
CREATE TYPE "public"."memory_item_status" AS ENUM('active', 'revised', 'archived');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."model_operation_kind" AS ENUM('chat', 'memory', 'insights', 'reopen');--> statement-breakpoint
CREATE TYPE "public"."model_operation_status" AS ENUM('started', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."observation_status" AS ENUM('active', 'revised', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pattern_status" AS ENUM('emerging', 'supported', 'revised', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."priority_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."reflection_status" AS ENUM('active', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."relationship_stage" AS ENUM('first_conversation', 'building_understanding', 'training_together');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "athlete_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"sport" text,
	"level" text,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"relationship_stage" "relationship_stage" DEFAULT 'first_conversation' NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"understanding_coverage" jsonb DEFAULT '{"story":0,"goals":0,"motivation":0,"competitiveMindset":0,"trainingContext":0,"recoveryContext":0,"supportEnvironment":0}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "focus_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"priority_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"status" "legacy_import_status" DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_item_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_item_id" uuid NOT NULL,
	"message_id" uuid,
	"observation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "memory_item_kind" NOT NULL,
	"statement" text NOT NULL,
	"confidence" "memory_confidence" DEFAULT 'tentative' NOT NULL,
	"status" "memory_item_status" DEFAULT 'active' NOT NULL,
	"revision_of_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"client_message_id" text,
	"seq" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "model_operation_kind" NOT NULL,
	"conversation_id" uuid,
	"entity_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "model_operation_status" DEFAULT 'started' NOT NULL,
	"error_code" text,
	"demo_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"source_message_id" uuid,
	"category" text NOT NULL,
	"statement" text NOT NULL,
	"confidence" "memory_confidence" DEFAULT 'tentative' NOT NULL,
	"status" "observation_status" DEFAULT 'active' NOT NULL,
	"revision_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pattern_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"source_type" "evidence_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pattern_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"source_message_id" uuid,
	"original_interpretation" text NOT NULL,
	"athlete_correction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"explanation" text NOT NULL,
	"status" "pattern_status" DEFAULT 'emerging' NOT NULL,
	"revision_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "priorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reflection_id" uuid,
	"statement" text NOT NULL,
	"status" "priority_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "priority_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"priority_id" uuid NOT NULL,
	"source_type" "evidence_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reflections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"observations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_intro" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_note" text NOT NULL,
	"pattern_id" uuid,
	"shared_priority_text" text NOT NULL,
	"focus_intro" text NOT NULL,
	"closing" text NOT NULL,
	"status" "reflection_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"person_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'athlete' NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "athlete_workspaces" ADD CONSTRAINT "athlete_workspaces_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_areas" ADD CONSTRAINT "focus_areas_priority_id_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_imports" ADD CONSTRAINT "legacy_imports_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_imports" ADD CONSTRAINT "legacy_imports_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_item_sources" ADD CONSTRAINT "memory_item_sources_memory_item_id_memory_items_id_fk" FOREIGN KEY ("memory_item_id") REFERENCES "public"."memory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_item_sources" ADD CONSTRAINT "memory_item_sources_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_item_sources" ADD CONSTRAINT "memory_item_sources_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_operations" ADD CONSTRAINT "model_operations_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_operations" ADD CONSTRAINT "model_operations_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_operations" ADD CONSTRAINT "model_operations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_evidence" ADD CONSTRAINT "pattern_evidence_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_feedback" ADD CONSTRAINT "pattern_feedback_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_feedback" ADD CONSTRAINT "pattern_feedback_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_reflection_id_reflections_id_fk" FOREIGN KEY ("reflection_id") REFERENCES "public"."reflections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_evidence" ADD CONSTRAINT "priority_evidence_priority_id_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_athlete_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athlete_workspaces_owner_idx" ON "athlete_workspaces" USING btree ("owner_person_id");--> statement-breakpoint
CREATE INDEX "athlete_workspaces_status_idx" ON "athlete_workspaces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversations_workspace_idx" ON "conversations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "conversations_workspace_status_idx" ON "conversations" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "focus_areas_priority_position_uidx" ON "focus_areas" USING btree ("priority_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_imports_workspace_hash_uidx" ON "legacy_imports" USING btree ("workspace_id","content_hash");--> statement-breakpoint
CREATE INDEX "memory_item_sources_item_idx" ON "memory_item_sources" USING btree ("memory_item_id");--> statement-breakpoint
CREATE INDEX "memory_items_workspace_kind_idx" ON "memory_items" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "memory_items_workspace_status_idx" ON "memory_items" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "messages_conversation_seq_idx" ON "messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_client_message_uidx" ON "messages" USING btree ("conversation_id","client_message_id") WHERE "messages"."client_message_id" is not null;--> statement-breakpoint
CREATE INDEX "model_operations_workspace_idx" ON "model_operations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "observations_workspace_idx" ON "observations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pattern_evidence_pattern_idx" ON "pattern_evidence" USING btree ("pattern_id");--> statement-breakpoint
CREATE INDEX "pattern_feedback_pattern_idx" ON "pattern_feedback" USING btree ("pattern_id");--> statement-breakpoint
CREATE INDEX "patterns_workspace_idx" ON "patterns" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_clerk_user_id_uidx" ON "people" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "priorities_workspace_idx" ON "priorities" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "priorities_one_active_per_workspace_uidx" ON "priorities" USING btree ("workspace_id") WHERE "priorities"."status" = 'active';--> statement-breakpoint
CREATE INDEX "priority_evidence_priority_idx" ON "priority_evidence" USING btree ("priority_id");--> statement-breakpoint
CREATE INDEX "reflections_workspace_idx" ON "reflections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "reflections_conversation_idx" ON "reflections" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "timeline_events_workspace_idx" ON "timeline_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_memberships_workspace_person_uidx" ON "workspace_memberships" USING btree ("workspace_id","person_id");--> statement-breakpoint
CREATE INDEX "workspace_memberships_person_idx" ON "workspace_memberships" USING btree ("person_id");