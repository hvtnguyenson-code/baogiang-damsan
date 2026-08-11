-- Local Phase 04A2: AcademicYear-owned timetable version history and normal lesson rows.
-- Effective boundaries are inclusive civil DATE values; lifecycle audit instants use TIMESTAMPTZ(3).

CREATE UNIQUE INDEX "academic_calendar_versions_id_academic_year_id_key"
    ON "academic_calendar_versions"("id", "academic_year_id");
CREATE UNIQUE INDEX "time_slot_definitions_id_academic_year_id_weekday_key"
    ON "time_slot_definitions"("id", "academic_year_id", "weekday");
CREATE UNIQUE INDEX "teaching_assignments_provenance_key"
    ON "teaching_assignments"("id", "academic_year_id", "school_class_id", "subject_id", "teacher_user_id");

CREATE TYPE "TimetableVersionStatus" AS ENUM (
    'DRAFT', 'VALIDATED', 'APPROVED', 'ACTIVE', 'SUPERSEDED'
);

CREATE TABLE "timetable_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "TimetableVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "calendar_version_id" UUID,
    "effective_academic_week_id" UUID,
    "effective_from" DATE,
    "effective_until" DATE,
    "content_checksum" VARCHAR(128),
    "note" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "validated_by_user_id" UUID,
    "validated_at" TIMESTAMPTZ(3),
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "activated_by_user_id" UUID,
    "activated_at" TIMESTAMPTZ(3),
    "superseded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetable_versions_version_number_check" CHECK ("version_number" > 0),
    CONSTRAINT "timetable_versions_target_triplet_check" CHECK (
        (
            "calendar_version_id" IS NULL
            AND "effective_academic_week_id" IS NULL
            AND "effective_from" IS NULL
        )
        OR
        (
            "calendar_version_id" IS NOT NULL
            AND "effective_academic_week_id" IS NOT NULL
            AND "effective_from" IS NOT NULL
        )
    ),
    CONSTRAINT "timetable_versions_effective_range_check" CHECK (
        "effective_until" IS NULL
        OR ("effective_from" IS NOT NULL AND "effective_until" >= "effective_from")
    ),
    CONSTRAINT "timetable_versions_content_checksum_normalized_check" CHECK (
        "content_checksum" IS NULL
        OR ("content_checksum" = btrim("content_checksum") AND "content_checksum" <> '')
    ),
    CONSTRAINT "timetable_versions_validation_actor_pair_check" CHECK (
        ("validated_by_user_id" IS NULL) = ("validated_at" IS NULL)
    ),
    CONSTRAINT "timetable_versions_approval_actor_pair_check" CHECK (
        ("approved_by_user_id" IS NULL) = ("approved_at" IS NULL)
    ),
    CONSTRAINT "timetable_versions_activation_actor_pair_check" CHECK (
        ("activated_by_user_id" IS NULL) = ("activated_at" IS NULL)
    ),
    CONSTRAINT "timetable_versions_lifecycle_shape_check" CHECK (
        (
            "status" = 'DRAFT'
            AND "validated_by_user_id" IS NULL
            AND "validated_at" IS NULL
            AND "approved_by_user_id" IS NULL
            AND "approved_at" IS NULL
            AND "activated_by_user_id" IS NULL
            AND "activated_at" IS NULL
            AND "superseded_at" IS NULL
        )
        OR
        (
            "status" = 'VALIDATED'
            AND "calendar_version_id" IS NOT NULL
            AND "validated_by_user_id" IS NOT NULL
            AND "validated_at" IS NOT NULL
            AND "approved_by_user_id" IS NULL
            AND "approved_at" IS NULL
            AND "activated_by_user_id" IS NULL
            AND "activated_at" IS NULL
            AND "superseded_at" IS NULL
        )
        OR
        (
            "status" = 'APPROVED'
            AND "calendar_version_id" IS NOT NULL
            AND "validated_by_user_id" IS NOT NULL
            AND "validated_at" IS NOT NULL
            AND "approved_by_user_id" IS NOT NULL
            AND "approved_at" IS NOT NULL
            AND "activated_by_user_id" IS NULL
            AND "activated_at" IS NULL
            AND "superseded_at" IS NULL
        )
        OR
        (
            "status" = 'ACTIVE'
            AND "calendar_version_id" IS NOT NULL
            AND "validated_by_user_id" IS NOT NULL
            AND "validated_at" IS NOT NULL
            AND "approved_by_user_id" IS NOT NULL
            AND "approved_at" IS NOT NULL
            AND "activated_by_user_id" IS NOT NULL
            AND "activated_at" IS NOT NULL
            AND "superseded_at" IS NULL
            AND "effective_until" IS NULL
        )
        OR
        (
            "status" = 'SUPERSEDED'
            AND "calendar_version_id" IS NOT NULL
            AND "validated_by_user_id" IS NOT NULL
            AND "validated_at" IS NOT NULL
            AND "approved_by_user_id" IS NOT NULL
            AND "approved_at" IS NOT NULL
            AND "activated_by_user_id" IS NOT NULL
            AND "activated_at" IS NOT NULL
            AND "superseded_at" IS NOT NULL
            AND "effective_until" IS NOT NULL
        )
    )
);

CREATE TABLE "timetable_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "timetable_version_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "weekday" "AcademicWeekday" NOT NULL,
    "time_slot_definition_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teaching_assignment_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "timetable_versions_id_academic_year_id_key"
    ON "timetable_versions"("id", "academic_year_id");
CREATE UNIQUE INDEX "timetable_versions_academic_year_id_version_number_key"
    ON "timetable_versions"("academic_year_id", "version_number");
CREATE UNIQUE INDEX "timetable_versions_one_active_per_year_key"
    ON "timetable_versions"("academic_year_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "timetable_versions_academic_year_id_status_idx"
    ON "timetable_versions"("academic_year_id", "status");
CREATE INDEX "timetable_versions_calendar_version_id_effective_week_id_idx"
    ON "timetable_versions"("calendar_version_id", "effective_academic_week_id");
CREATE INDEX "timetable_versions_content_checksum_idx"
    ON "timetable_versions"("content_checksum");

CREATE UNIQUE INDEX "timetable_entries_class_exact_slot_key"
    ON "timetable_entries"("timetable_version_id", "weekday", "time_slot_definition_id", "school_class_id");
CREATE UNIQUE INDEX "timetable_entries_teacher_exact_slot_key"
    ON "timetable_entries"("timetable_version_id", "weekday", "time_slot_definition_id", "teacher_user_id");
CREATE INDEX "timetable_entries_version_class_idx"
    ON "timetable_entries"("timetable_version_id", "school_class_id");
CREATE INDEX "timetable_entries_version_teacher_idx"
    ON "timetable_entries"("timetable_version_id", "teacher_user_id");
CREATE INDEX "timetable_entries_version_subject_idx"
    ON "timetable_entries"("timetable_version_id", "subject_id");
CREATE INDEX "timetable_entries_version_assignment_idx"
    ON "timetable_entries"("timetable_version_id", "teaching_assignment_id");
CREATE INDEX "timetable_entries_year_weekday_slot_idx"
    ON "timetable_entries"("academic_year_id", "weekday", "time_slot_definition_id");

ALTER TABLE "timetable_versions"
    ADD CONSTRAINT "timetable_versions_effective_history_no_overlap"
    EXCLUDE USING gist (
        "academic_year_id" WITH =,
        daterange("effective_from", "effective_until", '[]') WITH &&
    ) WHERE ("status" IN ('ACTIVE', 'SUPERSEDED'));

ALTER TABLE "timetable_versions"
    ADD CONSTRAINT "timetable_versions_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_versions"
    ADD CONSTRAINT "timetable_versions_calendar_version_year_fkey"
    FOREIGN KEY ("calendar_version_id", "academic_year_id")
    REFERENCES "academic_calendar_versions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_versions"
    ADD CONSTRAINT "timetable_versions_effective_week_calendar_fkey"
    FOREIGN KEY ("effective_academic_week_id", "calendar_version_id")
    REFERENCES "academic_weeks"("id", "calendar_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_versions"
    ADD CONSTRAINT "timetable_versions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_versions"
    ADD CONSTRAINT "timetable_versions_validated_by_user_id_fkey"
    FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_versions"
    ADD CONSTRAINT "timetable_versions_approved_by_user_id_fkey"
    FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_versions"
    ADD CONSTRAINT "timetable_versions_activated_by_user_id_fkey"
    FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_entries"
    ADD CONSTRAINT "timetable_entries_version_year_fkey"
    FOREIGN KEY ("timetable_version_id", "academic_year_id")
    REFERENCES "timetable_versions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_entries"
    ADD CONSTRAINT "timetable_entries_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_entries"
    ADD CONSTRAINT "timetable_entries_time_slot_year_weekday_fkey"
    FOREIGN KEY ("time_slot_definition_id", "academic_year_id", "weekday")
    REFERENCES "time_slot_definitions"("id", "academic_year_id", "weekday") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_entries"
    ADD CONSTRAINT "timetable_entries_school_class_year_fkey"
    FOREIGN KEY ("school_class_id", "academic_year_id")
    REFERENCES "classes"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_entries"
    ADD CONSTRAINT "timetable_entries_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_entries"
    ADD CONSTRAINT "timetable_entries_assignment_provenance_fkey"
    FOREIGN KEY ("teaching_assignment_id", "academic_year_id", "school_class_id", "subject_id", "teacher_user_id")
    REFERENCES "teaching_assignments"("id", "academic_year_id", "school_class_id", "subject_id", "teacher_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_entries"
    ADD CONSTRAINT "timetable_entries_teacher_user_id_fkey"
    FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
