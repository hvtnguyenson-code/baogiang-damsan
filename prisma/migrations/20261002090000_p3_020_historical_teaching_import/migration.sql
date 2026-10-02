-- P3-020: retained provenance for confirmed pre-operational curricular evidence.
-- Canonical business truth remains curricular_teaching_executions; these tables retain import authority only.

CREATE TYPE "HistoricalTeachingImportKind" AS ENUM ('NORMAL', 'SUBSTITUTION', 'MAKEUP');

CREATE TABLE "historical_teaching_import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "profile_version" VARCHAR(50) NOT NULL DEFAULT 'HISTORICAL_TEACHING_V1',
    "source_sha256" VARCHAR(64) NOT NULL,
    "operational_start_policy_version_id" UUID NOT NULL,
    "operational_start_date" DATE NOT NULL,
    "request_key" VARCHAR(200) NOT NULL,
    "request_fingerprint" VARCHAR(64) NOT NULL,
    "confirmed_by_user_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_teaching_import_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "historical_teaching_import_batches_profile_check"
      CHECK ("profile_version" = 'HISTORICAL_TEACHING_V1'),
    CONSTRAINT "historical_teaching_import_batches_source_hash_check"
      CHECK ("source_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "historical_teaching_import_batches_request_check"
      CHECK (
        "request_key" = btrim("request_key") AND "request_key" <> ''
        AND "request_fingerprint" ~ '^[0-9a-f]{64}$'
      )
);

CREATE TABLE "historical_teaching_import_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "row_hash" VARCHAR(64) NOT NULL,
    "kind" "HistoricalTeachingImportKind" NOT NULL,
    "school_class_code" VARCHAR(50) NOT NULL,
    "subject_code" VARCHAR(50) NOT NULL,
    "source_civil_date" DATE NOT NULL,
    "source_session" "TimeSlotSession" NOT NULL,
    "source_ordinal" INTEGER NOT NULL,
    "actual_teacher_staff_code" VARCHAR(50) NOT NULL,
    "execution_civil_date" DATE NOT NULL,
    "execution_session" "TimeSlotSession" NOT NULL,
    "execution_ordinal" INTEGER NOT NULL,
    "note" VARCHAR(500),
    "curricular_teaching_execution_id" UUID NOT NULL,
    "operational_lesson_disposition_id" UUID,
    "makeup_teaching_schedule_id" UUID,
    "owns_operational_lesson_disposition" BOOLEAN NOT NULL DEFAULT false,
    "owns_makeup_teaching_schedule" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_teaching_import_rows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "historical_teaching_import_rows_row_number_check" CHECK ("row_number" >= 2),
    CONSTRAINT "historical_teaching_import_rows_ordinal_check" CHECK ("source_ordinal" > 0 AND "execution_ordinal" > 0),
    CONSTRAINT "historical_teaching_import_rows_hash_check" CHECK ("row_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "historical_teaching_import_rows_text_check" CHECK (
      "school_class_code" = btrim("school_class_code") AND "school_class_code" <> ''
      AND "subject_code" = btrim("subject_code") AND "subject_code" <> ''
      AND "actual_teacher_staff_code" = btrim("actual_teacher_staff_code") AND "actual_teacher_staff_code" <> ''
      AND ("note" IS NULL OR ("note" = btrim("note") AND "note" <> ''))
    ),
    CONSTRAINT "historical_teaching_import_rows_kind_shape_check" CHECK (
      ("kind" = 'NORMAL'
        AND "execution_civil_date" = "source_civil_date"
        AND "execution_session" = "source_session"
        AND "execution_ordinal" = "source_ordinal"
        AND "operational_lesson_disposition_id" IS NULL
        AND "makeup_teaching_schedule_id" IS NULL
        AND NOT "owns_operational_lesson_disposition"
        AND NOT "owns_makeup_teaching_schedule")
      OR
      ("kind" = 'SUBSTITUTION'
        AND "execution_civil_date" = "source_civil_date"
        AND "execution_session" = "source_session"
        AND "execution_ordinal" = "source_ordinal"
        AND "operational_lesson_disposition_id" IS NOT NULL
        AND "makeup_teaching_schedule_id" IS NULL
        AND NOT "owns_makeup_teaching_schedule")
      OR
      ("kind" = 'MAKEUP'
        AND "execution_civil_date" >= "source_civil_date"
        AND NOT (
          "execution_civil_date" = "source_civil_date"
          AND "execution_session" = "source_session"
          AND "execution_ordinal" = "source_ordinal"
        )
        AND "operational_lesson_disposition_id" IS NULL
        AND "makeup_teaching_schedule_id" IS NOT NULL
        AND NOT "owns_operational_lesson_disposition")
    ),
    CONSTRAINT "historical_teaching_import_rows_owned_provenance_check" CHECK (
      (NOT "owns_operational_lesson_disposition" OR "operational_lesson_disposition_id" IS NOT NULL)
      AND (NOT "owns_makeup_teaching_schedule" OR "makeup_teaching_schedule_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "historical_teaching_import_batches_request_key_key"
    ON "historical_teaching_import_batches"("request_key");
CREATE INDEX "historical_teaching_import_batches_year_confirmed_idx"
    ON "historical_teaching_import_batches"("academic_year_id", "confirmed_at");

CREATE UNIQUE INDEX "historical_teaching_import_rows_execution_id_key"
    ON "historical_teaching_import_rows"("curricular_teaching_execution_id");
CREATE UNIQUE INDEX "historical_teaching_import_rows_batch_row_key"
    ON "historical_teaching_import_rows"("batch_id", "row_number");
CREATE UNIQUE INDEX "historical_teaching_import_rows_batch_hash_key"
    ON "historical_teaching_import_rows"("batch_id", "row_hash");
CREATE INDEX "historical_teaching_import_rows_source_idx"
    ON "historical_teaching_import_rows"("source_civil_date", "school_class_code", "subject_code");

ALTER TABLE "historical_teaching_import_batches"
  ADD CONSTRAINT "historical_teaching_import_batches_academic_year_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "historical_teaching_import_batches"
  ADD CONSTRAINT "historical_teaching_import_batches_policy_version_fkey"
  FOREIGN KEY ("operational_start_policy_version_id") REFERENCES "business_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "historical_teaching_import_batches"
  ADD CONSTRAINT "historical_teaching_import_batches_confirmed_by_fkey"
  FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "historical_teaching_import_rows"
  ADD CONSTRAINT "historical_teaching_import_rows_batch_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "historical_teaching_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "historical_teaching_import_rows"
  ADD CONSTRAINT "historical_teaching_import_rows_execution_fkey"
  FOREIGN KEY ("curricular_teaching_execution_id") REFERENCES "curricular_teaching_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "historical_teaching_import_rows"
  ADD CONSTRAINT "historical_teaching_import_rows_disposition_fkey"
  FOREIGN KEY ("operational_lesson_disposition_id") REFERENCES "operational_lesson_dispositions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "historical_teaching_import_rows"
  ADD CONSTRAINT "historical_teaching_import_rows_makeup_schedule_fkey"
  FOREIGN KEY ("makeup_teaching_schedule_id") REFERENCES "makeup_teaching_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
