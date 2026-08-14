-- LOCAL-FC-05C1: immutable operational-overlay history for exactly three aggregate families.
-- Civil business dates use DATE; lifecycle and eligibility instants use TIMESTAMPTZ(3).

CREATE TYPE "OperationalOverlayStatus" AS ENUM ('ACTIVE', 'REVERSED');
CREATE TYPE "CalendarExceptionScope" AS ENUM ('SCHOOL_WIDE', 'GRADE', 'CLASS');
CREATE TYPE "CalendarExceptionTimeSelector" AS ENUM ('WHOLE_DAY', 'SESSION', 'EXACT_SLOTS');
CREATE TYPE "OperationalLessonDispositionType" AS ENUM (
    'AUTHORIZED_CANCELLATION',
    'ABSENCE_NO_REPLACEMENT',
    'SAME_SUBJECT_SUBSTITUTION',
    'DIFFERENT_SUBJECT_SUPERVISION'
);

-- Narrow upstream provenance keys. These add no mutable business meaning.
CREATE UNIQUE INDEX "staff_subjects_eligibility_provenance_key"
    ON "staff_subjects"("id", "user_id", "subject_id");
CREATE UNIQUE INDEX "timetable_versions_operational_source_key"
    ON "timetable_versions"("id", "academic_year_id", "calendar_version_id");
CREATE UNIQUE INDEX "timetable_entries_operational_source_key"
    ON "timetable_entries"(
        "id", "timetable_version_id", "academic_year_id", "time_slot_definition_id",
        "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
    );
CREATE UNIQUE INDEX "ppct_class_associations_overlay_provenance_key"
    ON "ppct_class_associations"(
        "id", "academic_year_id", "school_class_id", "subject_id", "ppct_plan_id", "ppct_version_id"
    );

CREATE TABLE "calendar_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "academic_calendar_version_id" UUID NOT NULL,
    "civil_date" DATE NOT NULL,
    "scope" "CalendarExceptionScope" NOT NULL,
    "grade_level" INTEGER,
    "school_class_id" UUID,
    "time_selector" "CalendarExceptionTimeSelector" NOT NULL,
    "session" "TimeSlotSession",
    "note" VARCHAR(500),
    "status" "OperationalOverlayStatus" NOT NULL DEFAULT 'ACTIVE',
    "create_request_key" VARCHAR(200) NOT NULL,
    "create_request_fingerprint" VARCHAR(128) NOT NULL,
    "reversed_by_user_id" UUID,
    "reversed_at" TIMESTAMPTZ(3),
    "reversal_reason" VARCHAR(500),
    "reverse_request_key" VARCHAR(200),
    "reverse_request_fingerprint" VARCHAR(128),
    "replaces_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_exceptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_exceptions_scope_shape_check" CHECK (
        ("scope" = 'SCHOOL_WIDE' AND "grade_level" IS NULL AND "school_class_id" IS NULL)
        OR ("scope" = 'GRADE' AND "grade_level" BETWEEN 10 AND 12 AND "school_class_id" IS NULL)
        OR ("scope" = 'CLASS' AND "grade_level" IS NULL AND "school_class_id" IS NOT NULL)
    ),
    CONSTRAINT "calendar_exceptions_time_selector_shape_check" CHECK (
        ("time_selector" = 'WHOLE_DAY' AND "session" IS NULL)
        OR ("time_selector" = 'SESSION' AND "session" IS NOT NULL)
        OR ("time_selector" = 'EXACT_SLOTS' AND "session" IS NULL)
    ),
    CONSTRAINT "calendar_exceptions_lifecycle_shape_check" CHECK (
        ("status" = 'ACTIVE' AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL
            AND "reversal_reason" IS NULL AND "reverse_request_key" IS NULL
            AND "reverse_request_fingerprint" IS NULL)
        OR
        ("status" = 'REVERSED' AND "reversed_by_user_id" IS NOT NULL AND "reversed_at" IS NOT NULL
            AND "reversal_reason" IS NOT NULL AND "reverse_request_key" IS NOT NULL
            AND "reverse_request_fingerprint" IS NOT NULL)
    ),
    CONSTRAINT "calendar_exceptions_request_identity_check" CHECK (
        "create_request_key" = btrim("create_request_key") AND "create_request_key" <> ''
        AND "create_request_fingerprint" = btrim("create_request_fingerprint") AND "create_request_fingerprint" <> ''
        AND ("reverse_request_key" IS NULL OR ("reverse_request_key" = btrim("reverse_request_key") AND "reverse_request_key" <> ''))
        AND ("reverse_request_fingerprint" IS NULL OR ("reverse_request_fingerprint" = btrim("reverse_request_fingerprint") AND "reverse_request_fingerprint" <> ''))
    ),
    CONSTRAINT "calendar_exceptions_bounded_text_check" CHECK (
        ("note" IS NULL OR ("note" = btrim("note") AND "note" <> ''))
        AND ("reversal_reason" IS NULL OR ("reversal_reason" = btrim("reversal_reason") AND "reversal_reason" <> ''))
    ),
    CONSTRAINT "calendar_exceptions_no_self_replacement_check" CHECK ("replaces_id" IS NULL OR "replaces_id" <> "id")
);

CREATE TABLE "calendar_exception_time_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "calendar_exception_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "parent_time_selector" "CalendarExceptionTimeSelector" NOT NULL DEFAULT 'EXACT_SLOTS',
    "time_slot_definition_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_exception_time_slots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_exception_time_slots_exact_selector_check"
        CHECK ("parent_time_selector" = 'EXACT_SLOTS')
);

CREATE TABLE "operational_lesson_dispositions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "timetable_version_id" UUID NOT NULL,
    "timetable_entry_id" UUID NOT NULL,
    "source_civil_date" DATE NOT NULL,
    "academic_calendar_version_id" UUID NOT NULL,
    "time_slot_definition_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teaching_assignment_id" UUID NOT NULL,
    "responsible_teacher_user_id" UUID NOT NULL,
    "disposition_type" "OperationalLessonDispositionType" NOT NULL,
    "assigned_teacher_user_id" UUID,
    "eligibility_checked_at" TIMESTAMPTZ(3),
    "eligibility_was_active" BOOLEAN,
    "eligibility_was_teaching_staff" BOOLEAN,
    "eligibility_same_subject" BOOLEAN,
    "eligibility_staff_subject_id" UUID,
    "note" VARCHAR(500),
    "status" "OperationalOverlayStatus" NOT NULL DEFAULT 'ACTIVE',
    "create_request_key" VARCHAR(200) NOT NULL,
    "create_request_fingerprint" VARCHAR(128) NOT NULL,
    "reversed_by_user_id" UUID,
    "reversed_at" TIMESTAMPTZ(3),
    "reversal_reason" VARCHAR(500),
    "reverse_request_key" VARCHAR(200),
    "reverse_request_fingerprint" VARCHAR(128),
    "replaces_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_lesson_dispositions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operational_lesson_dispositions_type_shape_check" CHECK (
        ("disposition_type" IN ('AUTHORIZED_CANCELLATION', 'ABSENCE_NO_REPLACEMENT')
            AND "assigned_teacher_user_id" IS NULL AND "eligibility_checked_at" IS NULL
            AND "eligibility_was_active" IS NULL AND "eligibility_was_teaching_staff" IS NULL
            AND "eligibility_same_subject" IS NULL AND "eligibility_staff_subject_id" IS NULL)
        OR
        ("disposition_type" = 'SAME_SUBJECT_SUBSTITUTION'
            AND "assigned_teacher_user_id" IS NOT NULL AND "eligibility_checked_at" IS NOT NULL
            AND "eligibility_was_active" IS TRUE AND "eligibility_was_teaching_staff" IS TRUE
            AND "eligibility_same_subject" IS TRUE AND "eligibility_staff_subject_id" IS NOT NULL)
        OR
        ("disposition_type" = 'DIFFERENT_SUBJECT_SUPERVISION'
            AND "assigned_teacher_user_id" IS NOT NULL AND "eligibility_checked_at" IS NOT NULL
            AND "eligibility_was_active" IS TRUE AND "eligibility_was_teaching_staff" IS TRUE
            AND "eligibility_same_subject" IS FALSE AND "eligibility_staff_subject_id" IS NULL)
    ),
    CONSTRAINT "operational_lesson_dispositions_lifecycle_shape_check" CHECK (
        ("status" = 'ACTIVE' AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL
            AND "reversal_reason" IS NULL AND "reverse_request_key" IS NULL
            AND "reverse_request_fingerprint" IS NULL)
        OR
        ("status" = 'REVERSED' AND "reversed_by_user_id" IS NOT NULL AND "reversed_at" IS NOT NULL
            AND "reversal_reason" IS NOT NULL AND "reverse_request_key" IS NOT NULL
            AND "reverse_request_fingerprint" IS NOT NULL)
    ),
    CONSTRAINT "operational_lesson_dispositions_request_identity_check" CHECK (
        "create_request_key" = btrim("create_request_key") AND "create_request_key" <> ''
        AND "create_request_fingerprint" = btrim("create_request_fingerprint") AND "create_request_fingerprint" <> ''
        AND ("reverse_request_key" IS NULL OR ("reverse_request_key" = btrim("reverse_request_key") AND "reverse_request_key" <> ''))
        AND ("reverse_request_fingerprint" IS NULL OR ("reverse_request_fingerprint" = btrim("reverse_request_fingerprint") AND "reverse_request_fingerprint" <> ''))
    ),
    CONSTRAINT "operational_lesson_dispositions_bounded_text_check" CHECK (
        ("note" IS NULL OR ("note" = btrim("note") AND "note" <> ''))
        AND ("reversal_reason" IS NULL OR ("reversal_reason" = btrim("reversal_reason") AND "reversal_reason" <> ''))
    ),
    CONSTRAINT "operational_lesson_dispositions_no_self_replacement_check" CHECK ("replaces_id" IS NULL OR "replaces_id" <> "id")
);

CREATE TABLE "makeup_teaching_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "original_timetable_version_id" UUID NOT NULL,
    "original_timetable_entry_id" UUID NOT NULL,
    "original_civil_date" DATE NOT NULL,
    "original_academic_calendar_version_id" UUID NOT NULL,
    "original_time_slot_definition_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "original_teaching_assignment_id" UUID NOT NULL,
    "responsible_teacher_user_id" UUID NOT NULL,
    "ppct_class_association_id" UUID NOT NULL,
    "ppct_plan_id" UUID NOT NULL,
    "ppct_version_id" UUID NOT NULL,
    "ppct_item_id" UUID NOT NULL,
    "source_disposition_id" UUID,
    "target_civil_date" DATE NOT NULL,
    "target_academic_calendar_version_id" UUID NOT NULL,
    "target_time_slot_definition_id" UUID NOT NULL,
    "scheduled_teacher_user_id" UUID NOT NULL,
    "eligibility_checked_at" TIMESTAMPTZ(3) NOT NULL,
    "eligibility_was_active" BOOLEAN NOT NULL,
    "eligibility_was_teaching_staff" BOOLEAN NOT NULL,
    "eligibility_same_subject" BOOLEAN NOT NULL,
    "eligibility_staff_subject_id" UUID NOT NULL,
    "note" VARCHAR(500),
    "status" "OperationalOverlayStatus" NOT NULL DEFAULT 'ACTIVE',
    "create_request_key" VARCHAR(200) NOT NULL,
    "create_request_fingerprint" VARCHAR(128) NOT NULL,
    "reversed_by_user_id" UUID,
    "reversed_at" TIMESTAMPTZ(3),
    "reversal_reason" VARCHAR(500),
    "reverse_request_key" VARCHAR(200),
    "reverse_request_fingerprint" VARCHAR(128),
    "replaces_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "makeup_teaching_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "makeup_teaching_schedules_eligibility_shape_check" CHECK (
        "eligibility_was_active" IS TRUE
        AND "eligibility_was_teaching_staff" IS TRUE
        AND "eligibility_same_subject" IS TRUE
    ),
    CONSTRAINT "makeup_teaching_schedules_lifecycle_shape_check" CHECK (
        ("status" = 'ACTIVE' AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL
            AND "reversal_reason" IS NULL AND "reverse_request_key" IS NULL
            AND "reverse_request_fingerprint" IS NULL)
        OR
        ("status" = 'REVERSED' AND "reversed_by_user_id" IS NOT NULL AND "reversed_at" IS NOT NULL
            AND "reversal_reason" IS NOT NULL AND "reverse_request_key" IS NOT NULL
            AND "reverse_request_fingerprint" IS NOT NULL)
    ),
    CONSTRAINT "makeup_teaching_schedules_request_identity_check" CHECK (
        "create_request_key" = btrim("create_request_key") AND "create_request_key" <> ''
        AND "create_request_fingerprint" = btrim("create_request_fingerprint") AND "create_request_fingerprint" <> ''
        AND ("reverse_request_key" IS NULL OR ("reverse_request_key" = btrim("reverse_request_key") AND "reverse_request_key" <> ''))
        AND ("reverse_request_fingerprint" IS NULL OR ("reverse_request_fingerprint" = btrim("reverse_request_fingerprint") AND "reverse_request_fingerprint" <> ''))
    ),
    CONSTRAINT "makeup_teaching_schedules_bounded_text_check" CHECK (
        ("note" IS NULL OR ("note" = btrim("note") AND "note" <> ''))
        AND ("reversal_reason" IS NULL OR ("reversal_reason" = btrim("reversal_reason") AND "reversal_reason" <> ''))
    ),
    CONSTRAINT "makeup_teaching_schedules_no_self_replacement_check" CHECK ("replaces_id" IS NULL OR "replaces_id" <> "id")
);

CREATE UNIQUE INDEX "calendar_exceptions_create_request_key_key" ON "calendar_exceptions"("create_request_key");
CREATE UNIQUE INDEX "calendar_exceptions_reverse_request_key_key" ON "calendar_exceptions"("reverse_request_key");
CREATE UNIQUE INDEX "calendar_exceptions_replaces_id_key" ON "calendar_exceptions"("replaces_id");
CREATE UNIQUE INDEX "calendar_exceptions_exact_slot_parent_key" ON "calendar_exceptions"("id", "academic_year_id", "time_selector");
CREATE INDEX "calendar_exceptions_year_date_status_idx" ON "calendar_exceptions"("academic_year_id", "civil_date", "status");
CREATE INDEX "calendar_exceptions_calendar_date_idx" ON "calendar_exceptions"("academic_calendar_version_id", "civil_date");

CREATE UNIQUE INDEX "calendar_exception_time_slots_exception_slot_key"
    ON "calendar_exception_time_slots"("calendar_exception_id", "time_slot_definition_id");
CREATE INDEX "calendar_exception_time_slots_year_slot_idx"
    ON "calendar_exception_time_slots"("academic_year_id", "time_slot_definition_id");

CREATE UNIQUE INDEX "operational_lesson_dispositions_create_request_key_key" ON "operational_lesson_dispositions"("create_request_key");
CREATE UNIQUE INDEX "operational_lesson_dispositions_reverse_request_key_key" ON "operational_lesson_dispositions"("reverse_request_key");
CREATE UNIQUE INDEX "operational_lesson_dispositions_replaces_id_key" ON "operational_lesson_dispositions"("replaces_id");
CREATE UNIQUE INDEX "operational_lesson_dispositions_one_active_source_key"
    ON "operational_lesson_dispositions"("timetable_entry_id", "source_civil_date")
    WHERE "status" = 'ACTIVE';
CREATE INDEX "operational_lesson_dispositions_source_status_idx"
    ON "operational_lesson_dispositions"("timetable_entry_id", "source_civil_date", "status");
CREATE INDEX "operational_lesson_dispositions_year_date_idx"
    ON "operational_lesson_dispositions"("academic_year_id", "source_civil_date");

CREATE UNIQUE INDEX "makeup_teaching_schedules_create_request_key_key" ON "makeup_teaching_schedules"("create_request_key");
CREATE UNIQUE INDEX "makeup_teaching_schedules_reverse_request_key_key" ON "makeup_teaching_schedules"("reverse_request_key");
CREATE UNIQUE INDEX "makeup_teaching_schedules_replaces_id_key" ON "makeup_teaching_schedules"("replaces_id");
CREATE UNIQUE INDEX "makeup_teaching_schedules_one_active_obligation_key"
    ON "makeup_teaching_schedules"("ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id")
    WHERE "status" = 'ACTIVE';
CREATE INDEX "makeup_teaching_schedules_obligation_status_idx"
    ON "makeup_teaching_schedules"("ppct_class_association_id", "ppct_version_id", "ppct_item_id", "status");
CREATE INDEX "makeup_teaching_schedules_target_idx"
    ON "makeup_teaching_schedules"("academic_year_id", "target_civil_date", "target_time_slot_definition_id");

ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_calendar_version_year_fkey"
    FOREIGN KEY ("academic_calendar_version_id", "academic_year_id") REFERENCES "academic_calendar_versions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_school_class_year_fkey"
    FOREIGN KEY ("school_class_id", "academic_year_id") REFERENCES "classes"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_reversed_by_user_id_fkey"
    FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_replaces_id_fkey"
    FOREIGN KEY ("replaces_id") REFERENCES "calendar_exceptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calendar_exception_time_slots" ADD CONSTRAINT "calendar_exception_time_slots_parent_exact_selector_fkey"
    FOREIGN KEY ("calendar_exception_id", "academic_year_id", "parent_time_selector")
    REFERENCES "calendar_exceptions"("id", "academic_year_id", "time_selector") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_exception_time_slots" ADD CONSTRAINT "calendar_exception_time_slots_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_exception_time_slots" ADD CONSTRAINT "calendar_exception_time_slots_time_slot_year_fkey"
    FOREIGN KEY ("time_slot_definition_id", "academic_year_id") REFERENCES "time_slot_definitions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_lesson_dispositions" ADD CONSTRAINT "operational_lesson_dispositions_timetable_version_source_fkey"
    FOREIGN KEY ("timetable_version_id", "academic_year_id", "academic_calendar_version_id")
    REFERENCES "timetable_versions"("id", "academic_year_id", "calendar_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_lesson_dispositions" ADD CONSTRAINT "operational_lesson_dispositions_timetable_entry_source_fkey"
    FOREIGN KEY ("timetable_entry_id", "timetable_version_id", "academic_year_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id")
    REFERENCES "timetable_entries"("id", "timetable_version_id", "academic_year_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_lesson_dispositions" ADD CONSTRAINT "operational_lesson_dispositions_calendar_version_year_fkey"
    FOREIGN KEY ("academic_calendar_version_id", "academic_year_id") REFERENCES "academic_calendar_versions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_lesson_dispositions" ADD CONSTRAINT "operational_lesson_dispositions_assigned_teacher_user_id_fkey"
    FOREIGN KEY ("assigned_teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_lesson_dispositions" ADD CONSTRAINT "operational_lesson_dispositions_eligibility_staff_subject_fkey"
    FOREIGN KEY ("eligibility_staff_subject_id", "assigned_teacher_user_id", "subject_id")
    REFERENCES "staff_subjects"("id", "user_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_lesson_dispositions" ADD CONSTRAINT "operational_lesson_dispositions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_lesson_dispositions" ADD CONSTRAINT "operational_lesson_dispositions_reversed_by_user_id_fkey"
    FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_lesson_dispositions" ADD CONSTRAINT "operational_lesson_dispositions_replaces_id_fkey"
    FOREIGN KEY ("replaces_id") REFERENCES "operational_lesson_dispositions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_original_timetable_version_fkey"
    FOREIGN KEY ("original_timetable_version_id", "academic_year_id", "original_academic_calendar_version_id")
    REFERENCES "timetable_versions"("id", "academic_year_id", "calendar_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_original_timetable_entry_fkey"
    FOREIGN KEY ("original_timetable_entry_id", "original_timetable_version_id", "academic_year_id", "original_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id")
    REFERENCES "timetable_entries"("id", "timetable_version_id", "academic_year_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_original_calendar_version_year_fkey"
    FOREIGN KEY ("original_academic_calendar_version_id", "academic_year_id") REFERENCES "academic_calendar_versions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_ppct_association_provenance_fkey"
    FOREIGN KEY ("ppct_class_association_id", "academic_year_id", "school_class_id", "subject_id", "ppct_plan_id", "ppct_version_id")
    REFERENCES "ppct_class_associations"("id", "academic_year_id", "school_class_id", "subject_id", "ppct_plan_id", "ppct_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_ppct_item_revision_fkey"
    FOREIGN KEY ("ppct_version_id", "ppct_item_id", "ppct_plan_id")
    REFERENCES "ppct_item_revisions"("ppct_version_id", "ppct_item_id", "ppct_plan_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_source_disposition_id_fkey"
    FOREIGN KEY ("source_disposition_id") REFERENCES "operational_lesson_dispositions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_target_calendar_version_year_fkey"
    FOREIGN KEY ("target_academic_calendar_version_id", "academic_year_id") REFERENCES "academic_calendar_versions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_target_time_slot_year_fkey"
    FOREIGN KEY ("target_time_slot_definition_id", "academic_year_id") REFERENCES "time_slot_definitions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_scheduled_teacher_user_id_fkey"
    FOREIGN KEY ("scheduled_teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_eligibility_staff_subject_fkey"
    FOREIGN KEY ("eligibility_staff_subject_id", "scheduled_teacher_user_id", "subject_id")
    REFERENCES "staff_subjects"("id", "user_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_reversed_by_user_id_fkey"
    FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "makeup_teaching_schedules" ADD CONSTRAINT "makeup_teaching_schedules_replaces_id_fkey"
    FOREIGN KEY ("replaces_id") REFERENCES "makeup_teaching_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
