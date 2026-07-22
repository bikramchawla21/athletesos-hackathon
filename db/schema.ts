import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const workspaceStatusEnum = pgEnum("workspace_status", ["active", "archived"]);
export const membershipRoleEnum = pgEnum("membership_role", ["athlete", "coach"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "revoked"]);
export const conversationStatusEnum = pgEnum("conversation_status", [
  "active",
  "completed",
  "archived",
]);
export const conversationKindEnum = pgEnum("conversation_kind", [
  "athlete_discovery",
  "coach_onboarding",
]);
export const visibilityLevelEnum = pgEnum("visibility_level", [
  "athlete_private",
  "coach_private",
  "workspace",
]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const observationStatusEnum = pgEnum("observation_status", [
  "active",
  "revised",
  "archived",
]);
export const observationSourceTypeEnum = pgEnum("observation_source_type", [
  "coach_onboarding",
  "coach_manual",
  "athlete_discovery",
  "system",
]);
export const observationContextEnum = pgEnum("observation_context", [
  "training",
  "match",
  "competition",
  "conversation",
  "other",
]);
export const memoryItemKindEnum = pgEnum("memory_item_kind", [
  "goal",
  "motivation",
  "challenge",
  "significant_experience",
  "correction",
  "open_question",
  "identity_background",
]);
export const memoryItemStatusEnum = pgEnum("memory_item_status", [
  "active",
  "revised",
  "archived",
]);
export const memoryConfidenceEnum = pgEnum("memory_confidence", [
  "tentative",
  "supported",
  "strong",
]);
export const patternStatusEnum = pgEnum("pattern_status", [
  "emerging",
  "supported",
  "revised",
  "rejected",
  "archived",
  "proposed",
  "confirmed",
]);
export const evidenceSourceTypeEnum = pgEnum("evidence_source_type", [
  "message",
  "observation",
  "memory_item",
]);
export const reflectionStatusEnum = pgEnum("reflection_status", ["active", "superseded"]);
export const priorityStatusEnum = pgEnum("priority_status", [
  "proposed",
  "athlete_reviewed",
  "coach_reviewed",
  "active",
  "revised",
  "completed",
  "replaced",
  "archived",
]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);
export const patternFeedbackResponseEnum = pgEnum("pattern_feedback_response", [
  "agree",
  "partially_agree",
  "disagree",
  "needs_more_context",
]);
export const priorityReviewDecisionEnum = pgEnum("priority_review_decision", [
  "approve",
  "revise",
  "delegate",
]);
export const modelOperationKindEnum = pgEnum("model_operation_kind", [
  "chat",
  "memory",
  "insights",
  "reopen",
  "coach_onboarding",
  "perspective",
  "shared_priority",
]);
export const modelOperationStatusEnum = pgEnum("model_operation_status", [
  "started",
  "succeeded",
  "failed",
]);
export const legacyImportStatusEnum = pgEnum("legacy_import_status", ["completed"]);
export const relationshipStageEnum = pgEnum("relationship_stage", [
  "first_conversation",
  "building_understanding",
  "training_together",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const people = pgTable(
  "people",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    displayName: text("display_name"),
    ...timestamps,
  },
  (table) => [uniqueIndex("people_clerk_user_id_uidx").on(table.clerkUserId)],
);

export const athleteWorkspaces = pgTable(
  "athlete_workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerPersonId: uuid("owner_person_id")
      .notNull()
      .references(() => people.id),
    sport: text("sport"),
    level: text("level"),
    status: workspaceStatusEnum("status").notNull().default("active"),
    relationshipStage: relationshipStageEnum("relationship_stage")
      .notNull()
      .default("first_conversation"),
    sessionCount: integer("session_count").notNull().default(0),
    understandingCoverage: jsonb("understanding_coverage")
      .$type<{
        story: number;
        goals: number;
        motivation: number;
        competitiveMindset: number;
        trainingContext: number;
        recoveryContext: number;
        supportEnvironment: number;
      }>()
      .notNull()
      .default({
        story: 0,
        goals: 0,
        motivation: 0,
        competitiveMindset: 0,
        trainingContext: 0,
        recoveryContext: 0,
        supportEnvironment: 0,
      }),
    ...timestamps,
  },
  (table) => [
    index("athlete_workspaces_owner_idx").on(table.ownerPersonId),
    index("athlete_workspaces_status_idx").on(table.status),
  ],
);

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    role: membershipRoleEnum("role").notNull().default("athlete"),
    status: membershipStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_memberships_workspace_person_uidx").on(
      table.workspaceId,
      table.personId,
    ),
    index("workspace_memberships_person_idx").on(table.personId),
  ],
);

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    invitedEmail: text("invited_email").notNull(),
    role: membershipRoleEnum("role").notNull().default("coach"),
    invitedByPersonId: uuid("invited_by_person_id")
      .notNull()
      .references(() => people.id),
    tokenHash: text("token_hash").notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedByPersonId: uuid("accepted_by_person_id").references(() => people.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_invitations_workspace_idx").on(table.workspaceId),
    uniqueIndex("workspace_invitations_token_hash_uidx").on(table.tokenHash),
    index("workspace_invitations_email_idx").on(table.invitedEmail),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id),
    kind: conversationKindEnum("kind").notNull().default("athlete_discovery"),
    visibility: visibilityLevelEnum("visibility").notNull().default("athlete_private"),
    status: conversationStatusEnum("status").notNull().default("active"),
    title: text("title"),
    ...timestamps,
  },
  (table) => [
    index("conversations_workspace_idx").on(table.workspaceId),
    index("conversations_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    clientMessageId: text("client_message_id"),
    seq: bigint("seq", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_seq_idx").on(table.conversationId, table.seq),
    uniqueIndex("messages_conversation_client_message_uidx")
      .on(table.conversationId, table.clientMessageId)
      .where(sql`${table.clientMessageId} is not null`),
  ],
);

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    sourceMessageId: uuid("source_message_id").references(() => messages.id),
    authorPersonId: uuid("author_person_id")
      .notNull()
      .references(() => people.id),
    authorRole: membershipRoleEnum("author_role").notNull(),
    sourceType: observationSourceTypeEnum("source_type").notNull().default("system"),
    context: observationContextEnum("context").notNull().default("other"),
    category: text("category").notNull(),
    statement: text("statement").notNull(),
    confidence: memoryConfidenceEnum("confidence").notNull().default("tentative"),
    visibility: visibilityLevelEnum("visibility").notNull().default("workspace"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    status: observationStatusEnum("status").notNull().default("active"),
    revisionOfId: uuid("revision_of_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("observations_workspace_idx").on(table.workspaceId),
    index("observations_workspace_visibility_idx").on(table.workspaceId, table.visibility),
  ],
);

export const memoryItems = pgTable(
  "memory_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    kind: memoryItemKindEnum("kind").notNull(),
    statement: text("statement").notNull(),
    confidence: memoryConfidenceEnum("confidence").notNull().default("tentative"),
    status: memoryItemStatusEnum("status").notNull().default("active"),
    visibility: visibilityLevelEnum("visibility").notNull().default("athlete_private"),
    revisionOfId: uuid("revision_of_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("memory_items_workspace_kind_idx").on(table.workspaceId, table.kind),
    index("memory_items_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const memoryItemSources = pgTable(
  "memory_item_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memoryItemId: uuid("memory_item_id")
      .notNull()
      .references(() => memoryItems.id),
    messageId: uuid("message_id").references(() => messages.id),
    observationId: uuid("observation_id").references(() => observations.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("memory_item_sources_item_idx").on(table.memoryItemId)],
);

export const patterns = pgTable(
  "patterns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    statement: text("statement").notNull(),
    explanation: text("explanation").notNull(),
    status: patternStatusEnum("status").notNull().default("emerging"),
    visibility: visibilityLevelEnum("visibility").notNull().default("workspace"),
    revisionOfId: uuid("revision_of_id"),
    ...timestamps,
  },
  (table) => [index("patterns_workspace_idx").on(table.workspaceId)],
);

export const patternEvidence = pgTable(
  "pattern_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => patterns.id),
    sourceType: evidenceSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pattern_evidence_pattern_idx").on(table.patternId)],
);

export const patternFeedback = pgTable(
  "pattern_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => patterns.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    role: membershipRoleEnum("role").notNull(),
    response: patternFeedbackResponseEnum("response").notNull(),
    note: text("note"),
    sourceMessageId: uuid("source_message_id").references(() => messages.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pattern_feedback_pattern_idx").on(table.patternId),
    uniqueIndex("pattern_feedback_pattern_person_uidx").on(table.patternId, table.personId),
  ],
);

export const reflections = pgTable(
  "reflections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    observations: jsonb("observations").$type<string[]>().notNull().default([]),
    evidenceIntro: text("evidence_intro").notNull(),
    evidence: jsonb("evidence")
      .$type<{ category: string; explanation: string }[]>()
      .notNull()
      .default([]),
    evidenceNote: text("evidence_note").notNull(),
    patternId: uuid("pattern_id").references(() => patterns.id),
    sharedPriorityText: text("shared_priority_text").notNull(),
    focusIntro: text("focus_intro").notNull(),
    closing: text("closing").notNull(),
    visibility: visibilityLevelEnum("visibility").notNull().default("athlete_private"),
    status: reflectionStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reflections_workspace_idx").on(table.workspaceId),
    index("reflections_conversation_idx").on(table.conversationId),
  ],
);

export const priorities = pgTable(
  "priorities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    reflectionId: uuid("reflection_id").references(() => reflections.id),
    statement: text("statement").notNull(),
    whyNow: text("why_now"),
    athleteFocus: text("athlete_focus"),
    coachFocus: text("coach_focus"),
    reviewCondition: text("review_condition"),
    reviewAt: timestamp("review_at", { withTimezone: true }),
    visibility: visibilityLevelEnum("visibility").notNull().default("workspace"),
    status: priorityStatusEnum("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("priorities_workspace_idx").on(table.workspaceId),
    uniqueIndex("priorities_one_active_per_workspace_uidx")
      .on(table.workspaceId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const priorityEvidence = pgTable(
  "priority_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    priorityId: uuid("priority_id")
      .notNull()
      .references(() => priorities.id),
    sourceType: evidenceSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("priority_evidence_priority_idx").on(table.priorityId)],
);

export const priorityReviews = pgTable(
  "priority_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    priorityId: uuid("priority_id")
      .notNull()
      .references(() => priorities.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    role: membershipRoleEnum("role").notNull(),
    decision: priorityReviewDecisionEnum("decision").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("priority_reviews_priority_person_uidx").on(table.priorityId, table.personId),
  ],
);

export const focusAreas = pgTable(
  "focus_areas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    priorityId: uuid("priority_id")
      .notNull()
      .references(() => priorities.id),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("focus_areas_priority_position_uidx").on(table.priorityId, table.position),
  ],
);

export const perspectiveComparisons = pgTable(
  "perspective_comparisons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    alignedSignals: jsonb("aligned_signals")
      .$type<
        {
          statement: string;
          athleteEvidenceIds: string[];
          coachEvidenceIds: string[];
        }[]
      >()
      .notNull()
      .default([]),
    differingPerspectives: jsonb("differing_perspectives")
      .$type<
        {
          topic: string;
          athletePerspective: string;
          coachPerspective: string;
          evidenceIds: string[];
          openQuestion: string;
        }[]
      >()
      .notNull()
      .default([]),
    newPatternCandidates: jsonb("new_pattern_candidates")
      .$type<{ statement: string; explanation: string; evidenceIds: string[] }[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("perspective_comparisons_workspace_idx").on(table.workspaceId)],
);

export const timelineEvents = pgTable(
  "timeline_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    personId: uuid("person_id").references(() => people.id),
    kind: text("kind").notNull(),
    visibility: visibilityLevelEnum("visibility").notNull().default("workspace"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("timeline_events_workspace_idx").on(table.workspaceId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipientPersonId: uuid("recipient_person_id")
      .notNull()
      .references(() => people.id),
    workspaceId: uuid("workspace_id").references(() => athleteWorkspaces.id),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_recipient_idx").on(table.recipientPersonId),
    index("notifications_workspace_idx").on(table.workspaceId),
  ],
);

export const modelOperations = pgTable(
  "model_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    kind: modelOperationKindEnum("kind").notNull(),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    entityIds: jsonb("entity_ids").$type<Record<string, unknown>>().notNull().default({}),
    status: modelOperationStatusEnum("status").notNull().default("started"),
    errorCode: text("error_code"),
    demoMode: boolean("demo_mode").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("model_operations_workspace_idx").on(table.workspaceId)],
);

export const legacyImports = pgTable(
  "legacy_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => athleteWorkspaces.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    contentHash: text("content_hash").notNull(),
    status: legacyImportStatusEnum("status").notNull().default("completed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("legacy_imports_workspace_hash_uidx").on(table.workspaceId, table.contentHash),
  ],
);

export type Person = typeof people.$inferSelect;
export type AthleteWorkspace = typeof athleteWorkspaces.$inferSelect;
export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type DbMessage = typeof messages.$inferSelect;
export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
export type DbObservation = typeof observations.$inferSelect;
