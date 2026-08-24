CREATE TYPE "ReportingStatementLifecycleState" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "ReportingStatementCommandType" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT');
CREATE TYPE "ReportingStatementHistoryEvent" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED');

CREATE TABLE "reporting_statement_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "statement_profile" VARCHAR(100) NOT NULL,
    "submitter_user_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "from_civil_date" DATE NOT NULL,
    "to_civil_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reporting_statement_series_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reporting_statement_series_logical_key" UNIQUE ("statement_profile", "submitter_user_id", "academic_year_id", "from_civil_date", "to_civil_date"),
    CONSTRAINT "reporting_statement_series_profile_check" CHECK ("statement_profile" = btrim("statement_profile") AND "statement_profile" <> ''),
    CONSTRAINT "reporting_statement_series_date_range_check" CHECK ("from_civil_date" <= "to_civil_date")
);

CREATE TABLE "reporting_statement_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "series_id" UUID NOT NULL,
    "predecessor_revision_id" UUID,
    "supersedes_revision_id" UUID,
    "snapshot_profile" VARCHAR(100) NOT NULL,
    "serializer_version" VARCHAR(100) NOT NULL,
    "canonical_snapshot_json" TEXT NOT NULL,
    "semantic_hash" CHAR(64) NOT NULL,
    "as_of_instant" TIMESTAMPTZ(3) NOT NULL,
    "submitter_display_name_snapshot" VARCHAR(150),
    "submitter_staff_code_snapshot" VARCHAR(50),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reporting_statement_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reporting_statement_revisions_id_series_id_key" UNIQUE ("id", "series_id"),
    CONSTRAINT "reporting_statement_revisions_predecessor_revision_id_key" UNIQUE ("predecessor_revision_id"),
    CONSTRAINT "reporting_statement_revision_text_check" CHECK (
      "snapshot_profile" = btrim("snapshot_profile") AND "snapshot_profile" <> ''
      AND "serializer_version" = btrim("serializer_version") AND "serializer_version" <> ''
    ),
    CONSTRAINT "reporting_statement_revision_semantic_hash_check" CHECK ("semantic_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "reporting_statement_revision_no_self_predecessor_check" CHECK ("predecessor_revision_id" IS NULL OR "predecessor_revision_id" <> "id"),
    CONSTRAINT "reporting_statement_revision_no_self_supersedes_check" CHECK ("supersedes_revision_id" IS NULL OR "supersedes_revision_id" <> "id")
);

CREATE TABLE "reporting_statement_revision_states" (
    "revision_id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "lifecycle_state" "ReportingStatementLifecycleState" NOT NULL,
    "lifecycle_token" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reporting_statement_revision_states_pkey" PRIMARY KEY ("revision_id"),
    CONSTRAINT "reporting_statement_revision_states_revision_id_series_id_key" UNIQUE ("revision_id", "series_id")
);

CREATE TABLE "reporting_statement_revision_subjects" (
    "revision_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reporting_statement_revision_subjects_pkey" PRIMARY KEY ("revision_id", "subject_id")
);

CREATE TABLE "reporting_statement_commands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "command_type" "ReportingStatementCommandType" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "request_key" VARCHAR(200) NOT NULL,
    "request_fingerprint" VARCHAR(128) NOT NULL,
    "series_id" UUID NOT NULL,
    "target_revision_id" UUID,
    "result_revision_id" UUID NOT NULL,
    "result_lifecycle_state" "ReportingStatementLifecycleState" NOT NULL,
    "result_lifecycle_token" UUID NOT NULL,
    "submission_as_of_instant" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reporting_statement_commands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reporting_statement_commands_id_series_id_key" UNIQUE ("id", "series_id"),
    CONSTRAINT "reporting_statement_commands_actor_type_request_key" UNIQUE ("actor_user_id", "command_type", "request_key"),
    CONSTRAINT "reporting_statement_command_identity_text_check" CHECK (
      "request_key" = btrim("request_key") AND "request_key" <> ''
      AND "request_fingerprint" = btrim("request_fingerprint") AND "request_fingerprint" <> ''
    ),
    CONSTRAINT "reporting_statement_command_shape_check" CHECK (
      ("command_type" = 'SUBMIT' AND "target_revision_id" IS NULL AND "submission_as_of_instant" IS NOT NULL AND "result_lifecycle_state" = 'SUBMITTED')
      OR ("command_type" = 'APPROVE' AND "target_revision_id" IS NOT NULL AND "target_revision_id" = "result_revision_id" AND "submission_as_of_instant" IS NULL AND "result_lifecycle_state" = 'APPROVED')
      OR ("command_type" = 'REJECT' AND "target_revision_id" IS NOT NULL AND "target_revision_id" = "result_revision_id" AND "submission_as_of_instant" IS NULL AND "result_lifecycle_state" = 'REJECTED')
    )
);

CREATE TABLE "reporting_statement_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "series_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "event_type" "ReportingStatementHistoryEvent" NOT NULL,
    "state_before" "ReportingStatementLifecycleState",
    "state_after" "ReportingStatementLifecycleState" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_display_name_snapshot" VARCHAR(150),
    "actor_staff_code_snapshot" VARCHAR(50),
    "command_id" UUID NOT NULL,
    "caused_by_revision_id" UUID,
    "lifecycle_token_before" UUID,
    "lifecycle_token_after" UUID NOT NULL,
    "submission_as_of_instant" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reporting_statement_histories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reporting_statement_history_shape_check" CHECK (
      ("event_type" = 'SUBMITTED' AND "state_before" IS NULL AND "state_after" = 'SUBMITTED' AND "lifecycle_token_before" IS NULL AND "lifecycle_token_after" IS NOT NULL AND "submission_as_of_instant" IS NOT NULL AND "caused_by_revision_id" IS NULL)
      OR ("event_type" = 'APPROVED' AND "state_before" = 'SUBMITTED' AND "state_after" = 'APPROVED' AND "lifecycle_token_before" IS NOT NULL AND "lifecycle_token_after" IS NOT NULL AND "submission_as_of_instant" IS NULL AND "caused_by_revision_id" IS NULL)
      OR ("event_type" = 'REJECTED' AND "state_before" = 'SUBMITTED' AND "state_after" = 'REJECTED' AND "lifecycle_token_before" IS NOT NULL AND "lifecycle_token_after" IS NOT NULL AND "submission_as_of_instant" IS NULL AND "caused_by_revision_id" IS NULL)
      OR ("event_type" = 'SUPERSEDED' AND "state_before" = 'APPROVED' AND "state_after" = 'SUPERSEDED' AND "lifecycle_token_before" IS NOT NULL AND "lifecycle_token_after" IS NOT NULL AND "submission_as_of_instant" IS NULL AND "caused_by_revision_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "reporting_statement_one_submitted_per_series" ON "reporting_statement_revision_states"("series_id") WHERE "lifecycle_state" = 'SUBMITTED';
CREATE UNIQUE INDEX "reporting_statement_one_approved_per_series" ON "reporting_statement_revision_states"("series_id") WHERE "lifecycle_state" = 'APPROVED';
CREATE INDEX "reporting_statement_revision_states_series_id_idx" ON "reporting_statement_revision_states"("series_id");
CREATE INDEX "reporting_statement_commands_series_id_idx" ON "reporting_statement_commands"("series_id");
CREATE INDEX "reporting_statement_histories_series_created_at_idx" ON "reporting_statement_histories"("series_id", "created_at");
CREATE INDEX "reporting_statement_histories_revision_id_idx" ON "reporting_statement_histories"("revision_id");

ALTER TABLE "reporting_statement_series" ADD CONSTRAINT "reporting_statement_series_submitter_fkey" FOREIGN KEY ("submitter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_series" ADD CONSTRAINT "reporting_statement_series_academic_year_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_revisions" ADD CONSTRAINT "reporting_statement_revision_series_fkey" FOREIGN KEY ("series_id") REFERENCES "reporting_statement_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_revisions" ADD CONSTRAINT "reporting_statement_revision_predecessor_fkey" FOREIGN KEY ("predecessor_revision_id", "series_id") REFERENCES "reporting_statement_revisions"("id", "series_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_revisions" ADD CONSTRAINT "reporting_statement_revision_supersedes_fkey" FOREIGN KEY ("supersedes_revision_id", "series_id") REFERENCES "reporting_statement_revisions"("id", "series_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_revision_states" ADD CONSTRAINT "reporting_statement_revision_state_revision_fkey" FOREIGN KEY ("revision_id", "series_id") REFERENCES "reporting_statement_revisions"("id", "series_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_revision_subjects" ADD CONSTRAINT "reporting_statement_revision_subject_revision_fkey" FOREIGN KEY ("revision_id") REFERENCES "reporting_statement_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_revision_subjects" ADD CONSTRAINT "reporting_statement_revision_subject_subject_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_commands" ADD CONSTRAINT "reporting_statement_command_actor_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_commands" ADD CONSTRAINT "reporting_statement_command_series_fkey" FOREIGN KEY ("series_id") REFERENCES "reporting_statement_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_commands" ADD CONSTRAINT "reporting_statement_command_target_revision_fkey" FOREIGN KEY ("target_revision_id", "series_id") REFERENCES "reporting_statement_revisions"("id", "series_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_commands" ADD CONSTRAINT "reporting_statement_command_result_revision_fkey" FOREIGN KEY ("result_revision_id", "series_id") REFERENCES "reporting_statement_revisions"("id", "series_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_histories" ADD CONSTRAINT "reporting_statement_history_series_fkey" FOREIGN KEY ("series_id") REFERENCES "reporting_statement_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_histories" ADD CONSTRAINT "reporting_statement_history_revision_fkey" FOREIGN KEY ("revision_id", "series_id") REFERENCES "reporting_statement_revisions"("id", "series_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_histories" ADD CONSTRAINT "reporting_statement_history_actor_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_histories" ADD CONSTRAINT "reporting_statement_history_command_fkey" FOREIGN KEY ("command_id", "series_id") REFERENCES "reporting_statement_commands"("id", "series_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reporting_statement_histories" ADD CONSTRAINT "reporting_statement_history_caused_by_revision_fkey" FOREIGN KEY ("caused_by_revision_id", "series_id") REFERENCES "reporting_statement_revisions"("id", "series_id") ON DELETE RESTRICT ON UPDATE CASCADE;
