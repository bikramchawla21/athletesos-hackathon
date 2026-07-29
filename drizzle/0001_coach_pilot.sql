-- Phase 3: coach pilot — invitations, visibility, attribution, dual feedback, shared priority

CREATE TYPE "public"."conversation_kind" AS ENUM('athlete_discovery', 'coach_onboarding');
CREATE TYPE "public"."visibility_level" AS ENUM('athlete_private', 'coach_private', 'workspace');
CREATE TYPE "public"."observation_source_type" AS ENUM('coach_onboarding', 'coach_manual', 'athlete_discovery', 'system');
CREATE TYPE "public"."observation_context" AS ENUM('training', 'match', 'competition', 'conversation', 'other');
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE "public"."pattern_feedback_response" AS ENUM('agree', 'partially_agree', 'disagree', 'needs_more_context');
CREATE TYPE "public"."priority_review_decision" AS ENUM('approve', 'revise', 'delegate');

ALTER TYPE "public"."pattern_status" ADD VALUE IF NOT EXISTS 'proposed';
ALTER TYPE "public"."pattern_status" ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE "public"."model_operation_kind" ADD VALUE IF NOT EXISTS 'coach_onboarding';
ALTER TYPE "public"."model_operation_kind" ADD VALUE IF NOT EXISTS 'perspective';
ALTER TYPE "public"."model_operation_kind" ADD VALUE IF NOT EXISTS 'shared_priority';

-- Expand priority_status safely via column swap
-- (ALTER ... TYPE enum remap hits operator errors on Neon/serverless)
ALTER TYPE "public"."priority_status" RENAME TO "priority_status_old";
CREATE TYPE "public"."priority_status" AS ENUM(
  'proposed',
  'athlete_reviewed',
  'coach_reviewed',
  'active',
  'revised',
  'completed',
  'replaced',
  'archived'
);
ALTER TABLE "priorities" ADD COLUMN "status_new" "public"."priority_status";
UPDATE "priorities"
SET "status_new" = CASE "status"::text
  WHEN 'active' THEN 'active'::"public"."priority_status"
  WHEN 'completed' THEN 'completed'::"public"."priority_status"
  ELSE 'archived'::"public"."priority_status"
END;
ALTER TABLE "priorities" DROP COLUMN "status";
ALTER TABLE "priorities" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "priorities" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "priorities" ALTER COLUMN "status" SET DEFAULT 'proposed'::"public"."priority_status";
DROP TYPE "public"."priority_status_old";

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "kind" "public"."conversation_kind" DEFAULT 'athlete_discovery' NOT NULL,
  ADD COLUMN IF NOT EXISTS "visibility" "public"."visibility_level" DEFAULT 'athlete_private' NOT NULL;

ALTER TABLE "memory_items"
  ADD COLUMN IF NOT EXISTS "visibility" "public"."visibility_level" DEFAULT 'athlete_private' NOT NULL;

ALTER TABLE "patterns"
  ADD COLUMN IF NOT EXISTS "visibility" "public"."visibility_level" DEFAULT 'workspace' NOT NULL;

ALTER TABLE "reflections"
  ADD COLUMN IF NOT EXISTS "visibility" "public"."visibility_level" DEFAULT 'athlete_private' NOT NULL;

ALTER TABLE "priorities"
  ADD COLUMN IF NOT EXISTS "why_now" text,
  ADD COLUMN IF NOT EXISTS "athlete_focus" text,
  ADD COLUMN IF NOT EXISTS "coach_focus" text,
  ADD COLUMN IF NOT EXISTS "review_condition" text,
  ADD COLUMN IF NOT EXISTS "review_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "visibility" "public"."visibility_level" DEFAULT 'workspace' NOT NULL;

ALTER TABLE "timeline_events"
  ADD COLUMN IF NOT EXISTS "visibility" "public"."visibility_level" DEFAULT 'workspace' NOT NULL;

-- Observations: attribution + visibility (conversation optional)
ALTER TABLE "observations" ALTER COLUMN "conversation_id" DROP NOT NULL;
ALTER TABLE "observations"
  ADD COLUMN IF NOT EXISTS "author_person_id" uuid,
  ADD COLUMN IF NOT EXISTS "author_role" "public"."membership_role",
  ADD COLUMN IF NOT EXISTS "source_type" "public"."observation_source_type" DEFAULT 'system' NOT NULL,
  ADD COLUMN IF NOT EXISTS "context" "public"."observation_context" DEFAULT 'other' NOT NULL,
  ADD COLUMN IF NOT EXISTS "visibility" "public"."visibility_level" DEFAULT 'workspace' NOT NULL,
  ADD COLUMN IF NOT EXISTS "occurred_at" timestamp with time zone;

UPDATE "observations" o
SET
  "author_person_id" = w."owner_person_id",
  "author_role" = 'athlete'
FROM "athlete_workspaces" w
WHERE o."workspace_id" = w."id" AND o."author_person_id" IS NULL;

ALTER TABLE "observations" ALTER COLUMN "author_person_id" SET NOT NULL;
ALTER TABLE "observations" ALTER COLUMN "author_role" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "observations"
    ADD CONSTRAINT "observations_author_person_id_people_id_fk"
    FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "observations_workspace_visibility_idx"
  ON "observations" USING btree ("workspace_id","visibility");

-- Replace legacy pattern_feedback shape
ALTER TABLE "pattern_feedback" RENAME TO "pattern_feedback_legacy";

CREATE TABLE "pattern_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pattern_id" uuid NOT NULL,
  "person_id" uuid NOT NULL,
  "role" "public"."membership_role" NOT NULL,
  "response" "public"."pattern_feedback_response" NOT NULL,
  "note" text,
  "source_message_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pattern_feedback"
  ADD CONSTRAINT "pattern_feedback_pattern_id_patterns_id_fk"
  FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id")
  ON DELETE no action ON UPDATE no action;
ALTER TABLE "pattern_feedback"
  ADD CONSTRAINT "pattern_feedback_person_id_people_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."people"("id")
  ON DELETE no action ON UPDATE no action;
ALTER TABLE "pattern_feedback"
  ADD CONSTRAINT "pattern_feedback_source_message_id_messages_id_fk"
  FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id")
  ON DELETE no action ON UPDATE no action;

CREATE INDEX "pattern_feedback_pattern_idx" ON "pattern_feedback" USING btree ("pattern_id");
CREATE UNIQUE INDEX "pattern_feedback_pattern_person_uidx" ON "pattern_feedback" USING btree ("pattern_id","person_id");
DROP TABLE "pattern_feedback_legacy";

CREATE TABLE "workspace_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "invited_email" text NOT NULL,
  "role" "public"."membership_role" DEFAULT 'coach' NOT NULL,
  "invited_by_person_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "status" "public"."invitation_status" DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_by_person_id" uuid,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "workspace_invitations"
  ADD CONSTRAINT "workspace_invitations_workspace_id_athlete_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id")
  ON DELETE no action ON UPDATE no action;
ALTER TABLE "workspace_invitations"
  ADD CONSTRAINT "workspace_invitations_invited_by_person_id_people_id_fk"
  FOREIGN KEY ("invited_by_person_id") REFERENCES "public"."people"("id")
  ON DELETE no action ON UPDATE no action;
ALTER TABLE "workspace_invitations"
  ADD CONSTRAINT "workspace_invitations_accepted_by_person_id_people_id_fk"
  FOREIGN KEY ("accepted_by_person_id") REFERENCES "public"."people"("id")
  ON DELETE no action ON UPDATE no action;

CREATE INDEX "workspace_invitations_workspace_idx" ON "workspace_invitations" USING btree ("workspace_id");
CREATE UNIQUE INDEX "workspace_invitations_token_hash_uidx" ON "workspace_invitations" USING btree ("token_hash");
CREATE INDEX "workspace_invitations_email_idx" ON "workspace_invitations" USING btree ("invited_email");

CREATE TABLE "priority_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "priority_id" uuid NOT NULL,
  "person_id" uuid NOT NULL,
  "role" "public"."membership_role" NOT NULL,
  "decision" "public"."priority_review_decision" NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "priority_reviews"
  ADD CONSTRAINT "priority_reviews_priority_id_priorities_id_fk"
  FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id")
  ON DELETE no action ON UPDATE no action;
ALTER TABLE "priority_reviews"
  ADD CONSTRAINT "priority_reviews_person_id_people_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."people"("id")
  ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "priority_reviews_priority_person_uidx"
  ON "priority_reviews" USING btree ("priority_id","person_id");

CREATE TABLE "perspective_comparisons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "aligned_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "differing_perspectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "new_pattern_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "perspective_comparisons"
  ADD CONSTRAINT "perspective_comparisons_workspace_id_athlete_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id")
  ON DELETE no action ON UPDATE no action;
CREATE INDEX "perspective_comparisons_workspace_idx"
  ON "perspective_comparisons" USING btree ("workspace_id");

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_person_id" uuid NOT NULL,
  "workspace_id" uuid,
  "kind" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_recipient_person_id_people_id_fk"
  FOREIGN KEY ("recipient_person_id") REFERENCES "public"."people"("id")
  ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_workspace_id_athlete_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."athlete_workspaces"("id")
  ON DELETE no action ON UPDATE no action;
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_person_id");
CREATE INDEX "notifications_workspace_idx" ON "notifications" USING btree ("workspace_id");
