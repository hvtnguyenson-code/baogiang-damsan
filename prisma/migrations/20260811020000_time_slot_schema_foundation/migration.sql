-- Local Phase 04A1: AcademicYear-owned canonical wall-clock time-slot revisions.
-- Slot boundaries are local school TIME(0) coordinates and intervals are half-open [start, end).

CREATE TYPE "TimeSlotSession" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

CREATE TABLE "time_slot_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "weekday" "AcademicWeekday" NOT NULL,
    "session" "TimeSlotSession" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "display_label" VARCHAR(50) NOT NULL,
    "start_time" TIME(0) WITHOUT TIME ZONE NOT NULL,
    "end_time" TIME(0) WITHOUT TIME ZONE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "allow_regular_teaching" BOOLEAN NOT NULL DEFAULT true,
    "allow_makeup_teaching" BOOLEAN NOT NULL DEFAULT false,
    "allow_self_study" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_slot_definitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "time_slot_definitions_ordinal_check" CHECK ("ordinal" > 0),
    CONSTRAINT "time_slot_definitions_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "time_slot_definitions_display_label_normalized_check"
        CHECK ("display_label" = btrim("display_label") AND "display_label" <> ''),
    CONSTRAINT "time_slot_definitions_time_range_check" CHECK ("start_time" < "end_time"),
    CONSTRAINT "time_slot_definitions_usage_check"
        CHECK ("allow_regular_teaching" OR "allow_makeup_teaching" OR "allow_self_study")
);

CREATE UNIQUE INDEX "time_slot_definitions_id_academic_year_id_key"
    ON "time_slot_definitions"("id", "academic_year_id");
CREATE UNIQUE INDEX "time_slot_definitions_logical_revision_key"
    ON "time_slot_definitions"("academic_year_id", "weekday", "session", "ordinal", "revision");
CREATE INDEX "time_slot_definitions_year_weekday_session_active_idx"
    ON "time_slot_definitions"("academic_year_id", "weekday", "session", "is_active");
CREATE UNIQUE INDEX "time_slot_definitions_one_active_revision_key"
    ON "time_slot_definitions"("academic_year_id", "weekday", "session", "ordinal")
    WHERE "is_active";
CREATE UNIQUE INDEX "time_slot_definitions_active_label_key"
    ON "time_slot_definitions"("academic_year_id", "weekday", "session", "display_label")
    WHERE "is_active";

ALTER TABLE "time_slot_definitions"
    ADD CONSTRAINT "time_slot_definitions_active_time_no_overlap"
    EXCLUDE USING gist (
        "academic_year_id" WITH =,
        "weekday" WITH =,
        int8range(
            extract(epoch FROM "start_time")::bigint,
            extract(epoch FROM "end_time")::bigint,
            '[)'
        ) WITH &&
    ) WHERE ("is_active");

ALTER TABLE "time_slot_definitions"
    ADD CONSTRAINT "time_slot_definitions_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
