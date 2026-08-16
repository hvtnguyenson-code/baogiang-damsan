-- LOCAL-FC-05F1: immutable Teaching Execution persistence foundation.
-- Original obligation and actual execution coordinates remain separate and relationally pinned.

CREATE TYPE "TeachingExecutionStatus" AS ENUM ('ACTIVE', 'REVERSED');
CREATE TYPE "CurricularTeachingExecutionKind" AS ENUM ('NORMAL', 'MAKEUP');

-- Narrow upstream provenance keys required by exact downstream foreign keys.
CREATE UNIQUE INDEX "ppct_item_revisions_execution_provenance_key"
    ON "ppct_item_revisions"("id", "ppct_version_id", "ppct_item_id", "ppct_plan_id");
CREATE UNIQUE INDEX "academic_week_segments_execution_provenance_key"
    ON "academic_week_segments"("id", "academic_week_id", "calendar_version_id");
CREATE UNIQUE INDEX "operational_lesson_dispositions_execution_source_key"
    ON "operational_lesson_dispositions"(
        "id", "academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date",
        "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id",
        "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type"
    );
CREATE UNIQUE INDEX "operational_lesson_dispositions_execution_teacher_key"
    ON "operational_lesson_dispositions"("id", "assigned_teacher_user_id");
CREATE UNIQUE INDEX "makeup_teaching_schedules_execution_source_key"
    ON "makeup_teaching_schedules"(
        "id", "academic_year_id", "original_timetable_version_id", "original_timetable_entry_id",
        "original_civil_date", "original_academic_calendar_version_id", "original_time_slot_definition_id",
        "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id",
        "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id",
        "target_civil_date", "target_academic_calendar_version_id", "target_time_slot_definition_id",
        "scheduled_teacher_user_id"
    );
CREATE UNIQUE INDEX "special_activities_execution_source_key"
    ON "special_activities"("id", "academic_year_id", "academic_calendar_version_id", "civil_date");
CREATE UNIQUE INDEX "special_activity_time_slots_execution_source_key"
    ON "special_activity_time_slots"("id", "special_activity_id", "academic_year_id", "time_slot_definition_id");
CREATE UNIQUE INDEX "special_activity_staffing_execution_source_key"
    ON "special_activity_staffing"("id", "special_activity_id", "scheduled_teacher_user_id");

CREATE TABLE "curricular_teaching_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "CurricularTeachingExecutionKind" NOT NULL,
    "status" "TeachingExecutionStatus" NOT NULL DEFAULT 'ACTIVE',
    "academic_year_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "source_normal_occurrence_key" VARCHAR(100) NOT NULL,
    "original_timetable_version_id" UUID NOT NULL,
    "original_timetable_entry_id" UUID NOT NULL,
    "source_civil_date" DATE NOT NULL,
    "source_academic_calendar_version_id" UUID NOT NULL,
    "source_time_slot_definition_id" UUID NOT NULL,
    "original_teaching_assignment_id" UUID NOT NULL,
    "responsible_teacher_user_id" UUID NOT NULL,
    "ppct_class_association_id" UUID NOT NULL,
    "ppct_plan_id" UUID NOT NULL,
    "ppct_version_id" UUID NOT NULL,
    "ppct_item_id" UUID NOT NULL,
    "ppct_item_revision_id" UUID NOT NULL,
    "operational_lesson_disposition_id" UUID,
    "operational_disposition_type" "OperationalLessonDispositionType",
    "makeup_teaching_schedule_id" UUID,
    "execution_civil_date" DATE NOT NULL,
    "execution_academic_calendar_version_id" UUID NOT NULL,
    "execution_time_slot_definition_id" UUID NOT NULL,
    "execution_academic_week_id" UUID NOT NULL,
    "execution_academic_week_segment_id" UUID NOT NULL,
    "actual_teacher_user_id" UUID NOT NULL,
    "school_class_code_snapshot" VARCHAR(50) NOT NULL,
    "school_class_name_snapshot" VARCHAR(150) NOT NULL,
    "subject_code_snapshot" VARCHAR(50) NOT NULL,
    "subject_name_snapshot" VARCHAR(150) NOT NULL,
    "responsible_teacher_display_name_snapshot" VARCHAR(150) NOT NULL,
    "actual_teacher_display_name_snapshot" VARCHAR(150) NOT NULL,
    "note" VARCHAR(500),
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

    CONSTRAINT "curricular_teaching_executions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "curricular_exec_source_shape_check" CHECK (
        ("kind" = 'NORMAL' AND "makeup_teaching_schedule_id" IS NULL AND (
            ("operational_lesson_disposition_id" IS NULL AND "operational_disposition_type" IS NULL)
            OR ("operational_lesson_disposition_id" IS NOT NULL AND "operational_disposition_type" = 'SAME_SUBJECT_SUBSTITUTION')
        ))
        OR ("kind" = 'MAKEUP' AND "makeup_teaching_schedule_id" IS NOT NULL
            AND "operational_lesson_disposition_id" IS NULL AND "operational_disposition_type" IS NULL)
    ),
    CONSTRAINT "curricular_exec_normal_coordinates_check" CHECK (
        "kind" <> 'NORMAL' OR (
            "execution_civil_date" = "source_civil_date"
            AND "execution_academic_calendar_version_id" = "source_academic_calendar_version_id"
            AND "execution_time_slot_definition_id" = "source_time_slot_definition_id"
        )
    ),
    CONSTRAINT "curricular_exec_base_teacher_check" CHECK (
        NOT ("kind" = 'NORMAL' AND "operational_lesson_disposition_id" IS NULL)
        OR "actual_teacher_user_id" = "responsible_teacher_user_id"
    ),
    CONSTRAINT "curricular_exec_lifecycle_shape_check" CHECK (
        ("status" = 'ACTIVE' AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL
            AND "reversal_reason" IS NULL AND "reverse_request_key" IS NULL
            AND "reverse_request_fingerprint" IS NULL)
        OR
        ("status" = 'REVERSED' AND "reversed_by_user_id" IS NOT NULL AND "reversed_at" IS NOT NULL
            AND "reversal_reason" IS NOT NULL AND "reverse_request_key" IS NOT NULL
            AND "reverse_request_fingerprint" IS NOT NULL)
    ),
    CONSTRAINT "curricular_exec_request_identity_check" CHECK (
        "create_request_key" = btrim("create_request_key") AND "create_request_key" <> ''
        AND "create_request_fingerprint" = btrim("create_request_fingerprint") AND "create_request_fingerprint" <> ''
        AND ("reverse_request_key" IS NULL OR ("reverse_request_key" = btrim("reverse_request_key") AND "reverse_request_key" <> ''))
        AND ("reverse_request_fingerprint" IS NULL OR ("reverse_request_fingerprint" = btrim("reverse_request_fingerprint") AND "reverse_request_fingerprint" <> ''))
    ),
    CONSTRAINT "curricular_exec_bounded_text_check" CHECK (
        "source_normal_occurrence_key" = btrim("source_normal_occurrence_key") AND "source_normal_occurrence_key" <> ''
        AND "school_class_code_snapshot" = btrim("school_class_code_snapshot") AND "school_class_code_snapshot" <> ''
        AND "school_class_name_snapshot" = btrim("school_class_name_snapshot") AND "school_class_name_snapshot" <> ''
        AND "subject_code_snapshot" = btrim("subject_code_snapshot") AND "subject_code_snapshot" <> ''
        AND "subject_name_snapshot" = btrim("subject_name_snapshot") AND "subject_name_snapshot" <> ''
        AND "responsible_teacher_display_name_snapshot" = btrim("responsible_teacher_display_name_snapshot") AND "responsible_teacher_display_name_snapshot" <> ''
        AND "actual_teacher_display_name_snapshot" = btrim("actual_teacher_display_name_snapshot") AND "actual_teacher_display_name_snapshot" <> ''
        AND ("note" IS NULL OR ("note" = btrim("note") AND "note" <> ''))
        AND ("reversal_reason" IS NULL OR ("reversal_reason" = btrim("reversal_reason") AND "reversal_reason" <> ''))
    ),
    CONSTRAINT "curricular_exec_no_self_replacement_check" CHECK ("replaces_id" IS NULL OR "replaces_id" <> "id")
);

CREATE TABLE "special_activity_participation_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "TeachingExecutionStatus" NOT NULL DEFAULT 'ACTIVE',
    "special_activity_id" UUID NOT NULL,
    "special_activity_staffing_id" UUID NOT NULL,
    "special_activity_time_slot_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "execution_civil_date" DATE NOT NULL,
    "execution_academic_calendar_version_id" UUID NOT NULL,
    "execution_time_slot_definition_id" UUID NOT NULL,
    "execution_academic_week_id" UUID,
    "execution_academic_week_segment_id" UUID,
    "actual_teacher_user_id" UUID NOT NULL,
    "activity_title_snapshot" VARCHAR(200) NOT NULL,
    "actual_teacher_display_name_snapshot" VARCHAR(150) NOT NULL,
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

    CONSTRAINT "special_activity_participation_executions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activity_participation_week_shape_check" CHECK (
        ("execution_academic_week_id" IS NULL AND "execution_academic_week_segment_id" IS NULL)
        OR ("execution_academic_week_id" IS NOT NULL AND "execution_academic_week_segment_id" IS NOT NULL)
    ),
    CONSTRAINT "activity_participation_lifecycle_shape_check" CHECK (
        ("status" = 'ACTIVE' AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL
            AND "reversal_reason" IS NULL AND "reverse_request_key" IS NULL
            AND "reverse_request_fingerprint" IS NULL)
        OR
        ("status" = 'REVERSED' AND "reversed_by_user_id" IS NOT NULL AND "reversed_at" IS NOT NULL
            AND "reversal_reason" IS NOT NULL AND "reverse_request_key" IS NOT NULL
            AND "reverse_request_fingerprint" IS NOT NULL)
    ),
    CONSTRAINT "activity_participation_request_identity_check" CHECK (
        "create_request_key" = btrim("create_request_key") AND "create_request_key" <> ''
        AND "create_request_fingerprint" = btrim("create_request_fingerprint") AND "create_request_fingerprint" <> ''
        AND ("reverse_request_key" IS NULL OR ("reverse_request_key" = btrim("reverse_request_key") AND "reverse_request_key" <> ''))
        AND ("reverse_request_fingerprint" IS NULL OR ("reverse_request_fingerprint" = btrim("reverse_request_fingerprint") AND "reverse_request_fingerprint" <> ''))
    ),
    CONSTRAINT "activity_participation_bounded_text_check" CHECK (
        "activity_title_snapshot" = btrim("activity_title_snapshot") AND "activity_title_snapshot" <> ''
        AND "actual_teacher_display_name_snapshot" = btrim("actual_teacher_display_name_snapshot") AND "actual_teacher_display_name_snapshot" <> ''
        AND ("reversal_reason" IS NULL OR ("reversal_reason" = btrim("reversal_reason") AND "reversal_reason" <> ''))
    ),
    CONSTRAINT "activity_participation_no_self_replacement_check" CHECK ("replaces_id" IS NULL OR "replaces_id" <> "id")
);

CREATE UNIQUE INDEX "curricular_exec_create_request_key_key" ON "curricular_teaching_executions"("create_request_key");
CREATE UNIQUE INDEX "curricular_exec_reverse_request_key_key" ON "curricular_teaching_executions"("reverse_request_key");
CREATE UNIQUE INDEX "curricular_exec_replaces_id_key" ON "curricular_teaching_executions"("replaces_id");
CREATE UNIQUE INDEX "curricular_exec_replacement_provenance_key"
    ON "curricular_teaching_executions"(
        "id", "academic_year_id", "school_class_id", "subject_id", "original_timetable_entry_id",
        "source_civil_date", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id"
    );
CREATE UNIQUE INDEX "curricular_exec_replacement_fk_key"
    ON "curricular_teaching_executions"(
        "replaces_id", "academic_year_id", "school_class_id", "subject_id", "original_timetable_entry_id",
        "source_civil_date", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id"
    );
CREATE UNIQUE INDEX "curricular_exec_one_active_obligation_key"
    ON "curricular_teaching_executions"(
        "academic_year_id", "school_class_id", "subject_id", "original_timetable_entry_id", "source_civil_date",
        "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id"
    ) WHERE "status" = 'ACTIVE';
CREATE INDEX "curricular_exec_stream_source_idx"
    ON "curricular_teaching_executions"("academic_year_id", "school_class_id", "subject_id", "source_civil_date");

CREATE UNIQUE INDEX "activity_participation_create_request_key_key" ON "special_activity_participation_executions"("create_request_key");
CREATE UNIQUE INDEX "activity_participation_reverse_request_key_key" ON "special_activity_participation_executions"("reverse_request_key");
CREATE UNIQUE INDEX "activity_participation_replaces_id_key" ON "special_activity_participation_executions"("replaces_id");
CREATE UNIQUE INDEX "activity_participation_replacement_provenance_key"
    ON "special_activity_participation_executions"("id", "special_activity_id", "special_activity_staffing_id", "special_activity_time_slot_id");
CREATE UNIQUE INDEX "activity_participation_replacement_fk_key"
    ON "special_activity_participation_executions"("replaces_id", "special_activity_id", "special_activity_staffing_id", "special_activity_time_slot_id");
CREATE UNIQUE INDEX "activity_participation_one_active_key"
    ON "special_activity_participation_executions"("special_activity_id", "special_activity_staffing_id", "special_activity_time_slot_id")
    WHERE "status" = 'ACTIVE';
CREATE INDEX "activity_participation_year_date_idx"
    ON "special_activity_participation_executions"("academic_year_id", "execution_civil_date");

ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_academic_year_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_original_timetable_version_fkey"
    FOREIGN KEY ("original_timetable_version_id", "academic_year_id", "source_academic_calendar_version_id")
    REFERENCES "timetable_versions"("id", "academic_year_id", "calendar_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_original_timetable_entry_fkey"
    FOREIGN KEY ("original_timetable_entry_id", "original_timetable_version_id", "academic_year_id", "source_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id")
    REFERENCES "timetable_entries"("id", "timetable_version_id", "academic_year_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_ppct_association_fkey"
    FOREIGN KEY ("ppct_class_association_id", "academic_year_id", "school_class_id", "subject_id", "ppct_plan_id", "ppct_version_id")
    REFERENCES "ppct_class_associations"("id", "academic_year_id", "school_class_id", "subject_id", "ppct_plan_id", "ppct_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_ppct_revision_fkey"
    FOREIGN KEY ("ppct_item_revision_id", "ppct_version_id", "ppct_item_id", "ppct_plan_id")
    REFERENCES "ppct_item_revisions"("id", "ppct_version_id", "ppct_item_id", "ppct_plan_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_calendar_year_fkey"
    FOREIGN KEY ("execution_academic_calendar_version_id", "academic_year_id")
    REFERENCES "academic_calendar_versions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_slot_year_fkey"
    FOREIGN KEY ("execution_time_slot_definition_id", "academic_year_id")
    REFERENCES "time_slot_definitions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_week_calendar_fkey"
    FOREIGN KEY ("execution_academic_week_id", "execution_academic_calendar_version_id")
    REFERENCES "academic_weeks"("id", "calendar_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_segment_week_calendar_fkey"
    FOREIGN KEY ("execution_academic_week_segment_id", "execution_academic_week_id", "execution_academic_calendar_version_id")
    REFERENCES "academic_week_segments"("id", "academic_week_id", "calendar_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_disposition_source_fkey"
    FOREIGN KEY ("operational_lesson_disposition_id", "academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "source_civil_date", "source_academic_calendar_version_id", "source_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "operational_disposition_type")
    REFERENCES "operational_lesson_dispositions"("id", "academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_disposition_teacher_fkey"
    FOREIGN KEY ("operational_lesson_disposition_id", "actual_teacher_user_id")
    REFERENCES "operational_lesson_dispositions"("id", "assigned_teacher_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_makeup_schedule_fkey"
    FOREIGN KEY ("makeup_teaching_schedule_id", "academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "source_civil_date", "source_academic_calendar_version_id", "source_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id", "execution_civil_date", "execution_academic_calendar_version_id", "execution_time_slot_definition_id", "actual_teacher_user_id")
    REFERENCES "makeup_teaching_schedules"("id", "academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date", "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id", "target_civil_date", "target_academic_calendar_version_id", "target_time_slot_definition_id", "scheduled_teacher_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_responsible_teacher_fkey"
    FOREIGN KEY ("responsible_teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_actual_teacher_fkey"
    FOREIGN KEY ("actual_teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_created_by_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_reversed_by_fkey"
    FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricular_teaching_executions" ADD CONSTRAINT "curricular_exec_replaces_provenance_fkey"
    FOREIGN KEY ("replaces_id", "academic_year_id", "school_class_id", "subject_id", "original_timetable_entry_id", "source_civil_date", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id")
    REFERENCES "curricular_teaching_executions"("id", "academic_year_id", "school_class_id", "subject_id", "original_timetable_entry_id", "source_civil_date", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_academic_year_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_activity_source_fkey"
    FOREIGN KEY ("special_activity_id", "academic_year_id", "execution_academic_calendar_version_id", "execution_civil_date")
    REFERENCES "special_activities"("id", "academic_year_id", "academic_calendar_version_id", "civil_date") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_slot_source_fkey"
    FOREIGN KEY ("special_activity_time_slot_id", "special_activity_id", "academic_year_id", "execution_time_slot_definition_id")
    REFERENCES "special_activity_time_slots"("id", "special_activity_id", "academic_year_id", "time_slot_definition_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_staffing_source_fkey"
    FOREIGN KEY ("special_activity_staffing_id", "special_activity_id", "actual_teacher_user_id")
    REFERENCES "special_activity_staffing"("id", "special_activity_id", "scheduled_teacher_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_calendar_year_fkey"
    FOREIGN KEY ("execution_academic_calendar_version_id", "academic_year_id")
    REFERENCES "academic_calendar_versions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_slot_year_fkey"
    FOREIGN KEY ("execution_time_slot_definition_id", "academic_year_id")
    REFERENCES "time_slot_definitions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_week_calendar_fkey"
    FOREIGN KEY ("execution_academic_week_id", "execution_academic_calendar_version_id")
    REFERENCES "academic_weeks"("id", "calendar_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_segment_week_calendar_fkey"
    FOREIGN KEY ("execution_academic_week_segment_id", "execution_academic_week_id", "execution_academic_calendar_version_id")
    REFERENCES "academic_week_segments"("id", "academic_week_id", "calendar_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_actual_teacher_fkey"
    FOREIGN KEY ("actual_teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_created_by_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_reversed_by_fkey"
    FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_participation_executions" ADD CONSTRAINT "activity_exec_replaces_provenance_fkey"
    FOREIGN KEY ("replaces_id", "special_activity_id", "special_activity_staffing_id", "special_activity_time_slot_id")
    REFERENCES "special_activity_participation_executions"("id", "special_activity_id", "special_activity_staffing_id", "special_activity_time_slot_id") ON DELETE RESTRICT ON UPDATE CASCADE;
