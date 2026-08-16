\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_sqlstate(command text, expected_state text, scenario text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE command;
        RAISE EXCEPTION '% expected SQLSTATE %, but statement succeeded', scenario, expected_state;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE <> expected_state THEN
            RAISE EXCEPTION '% expected SQLSTATE %, got %: %', scenario, expected_state, SQLSTATE, SQLERRM;
        END IF;
    END;
END $$;

DO $$
DECLARE
    enum_values text[];
    index_definition text;
BEGIN
    IF to_regclass('public.curricular_teaching_executions') IS NULL
       OR to_regclass('public.special_activity_participation_executions') IS NULL THEN
        RAISE EXCEPTION 'Teaching Execution tables are missing';
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TeachingExecutionStatus';
    IF enum_values <> ARRAY['ACTIVE', 'REVERSED'] THEN
        RAISE EXCEPTION 'Unexpected TeachingExecutionStatus values: %', enum_values;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'CurricularTeachingExecutionKind';
    IF enum_values <> ARRAY['NORMAL', 'MAKEUP'] THEN
        RAISE EXCEPTION 'Unexpected CurricularTeachingExecutionKind values: %', enum_values;
    END IF;

    IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public'
          AND ((table_name = 'curricular_teaching_executions' AND column_name IN ('source_civil_date', 'execution_civil_date'))
            OR (table_name = 'special_activity_participation_executions' AND column_name = 'execution_civil_date'))
          AND data_type = 'date') <> 3 THEN
        RAISE EXCEPTION 'All Teaching Execution civil dates must use DATE';
    END IF;

    IF (SELECT count(*) FROM pg_constraint WHERE conname IN (
        'curricular_exec_source_shape_check', 'curricular_exec_normal_coordinates_check',
        'curricular_exec_base_teacher_check', 'curricular_exec_lifecycle_shape_check',
        'curricular_exec_request_identity_check', 'curricular_exec_bounded_text_check',
        'curricular_exec_no_self_replacement_check', 'activity_participation_week_shape_check',
        'activity_participation_lifecycle_shape_check', 'activity_participation_request_identity_check',
        'activity_participation_bounded_text_check', 'activity_participation_no_self_replacement_check'
    )) <> 12 THEN
        RAISE EXCEPTION 'Required Teaching Execution CHECK constraints are missing';
    END IF;

    SELECT pg_get_indexdef('curricular_exec_one_active_obligation_key'::regclass) INTO index_definition;
    IF index_definition !~ 'academic_year_id.*school_class_id.*subject_id.*original_timetable_entry_id.*source_civil_date.*ppct_class_association_id.*ppct_plan_id.*ppct_version_id.*ppct_item_id'
       OR index_definition NOT LIKE '%WHERE (status = ''ACTIVE''%' THEN
        RAISE EXCEPTION 'Curricular ACTIVE obligation index has unexpected definition: %', index_definition;
    END IF;
    SELECT pg_get_indexdef('activity_participation_one_active_key'::regclass) INTO index_definition;
    IF index_definition !~ 'special_activity_id.*special_activity_staffing_id.*special_activity_time_slot_id'
       OR index_definition NOT LIKE '%WHERE (status = ''ACTIVE''%' THEN
        RAISE EXCEPTION 'Activity ACTIVE participation index has unexpected definition: %', index_definition;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid IN ('curricular_teaching_executions'::regclass, 'special_activity_participation_executions'::regclass)
          AND confdeltype <> 'r'
    ) THEN
        RAISE EXCEPTION 'Every Teaching Execution FK must use ON DELETE RESTRICT';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgrelid IN ('curricular_teaching_executions'::regclass, 'special_activity_participation_executions'::regclass)
    ) THEN
        RAISE EXCEPTION 'Teaching Execution persistence must not use triggers';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'special_activity_participation_executions'
          AND column_name IN ('school_class_id', 'subject_id', 'ppct_plan_id', 'ppct_version_id', 'ppct_item_id', 'teaching_assignment_id')
    ) THEN
        RAISE EXCEPTION 'T31: activity participation must have no class fan-out or curricular coupling';
    END IF;
END $$;

-- Complete retained source fixture: two weeks, three curricular obligations, two make-up targets,
-- exact substitution/absence dispositions, and two activities with owned staffing/slot children.
INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a5f10000-0000-0000-0000-000000000001', 'EXEC-2026', 'Execution year');
INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('d5f10000-0000-0000-0000-000000000001', 'exec.actor', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d5f10000-0000-0000-0000-000000000002', 'exec.responsible', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d5f10000-0000-0000-0000-000000000003', 'exec.substitute', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d5f10000-0000-0000-0000-000000000004', 'exec.other', 'not-a-real-password-hash', 'ACTIVE', false);
INSERT INTO "staff_profiles" ("id", "user_id", "display_name", "is_teaching_staff") VALUES
    ('b5f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002', 'Responsible Teacher', true),
    ('b5f10000-0000-0000-0000-000000000002', 'd5f10000-0000-0000-0000-000000000003', 'Substitute Teacher', true),
    ('b5f10000-0000-0000-0000-000000000003', 'd5f10000-0000-0000-0000-000000000004', 'Other Teacher', true);
INSERT INTO "subjects" ("id", "code", "name") VALUES
    ('c5f10000-0000-0000-0000-000000000001', 'EXEC_MATH', 'Execution Mathematics');
INSERT INTO "staff_subjects" ("id", "user_id", "subject_id") VALUES
    ('15f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000003', 'c5f10000-0000-0000-0000-000000000001');
INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('e5f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', 'EXEC10A1', 'Execution Class', 10);
INSERT INTO "academic_calendar_versions" (
    "id", "academic_year_id", "version_number", "start_date", "end_date",
    "official_week_count", "reserve_week_count", "teaching_weekdays"
) VALUES (
    'f5f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', 1,
    DATE '2026-09-01', DATE '2027-05-31', 35, 1, ARRAY['MONDAY'::"AcademicWeekday"]
);
INSERT INTO "academic_weeks" ("id", "calendar_version_id", "kind", "official_week_number", "display_label", "sort_order") VALUES
    ('05f10000-0000-0000-0000-000000000001', 'f5f10000-0000-0000-0000-000000000001', 'OFFICIAL', 1, 'Execution week 1', 1),
    ('05f10000-0000-0000-0000-000000000002', 'f5f10000-0000-0000-0000-000000000001', 'OFFICIAL', 2, 'Execution week 2', 2);
INSERT INTO "academic_week_segments" ("id", "academic_week_id", "calendar_version_id", "label", "segment_order", "start_date", "end_date") VALUES
    ('15f10000-0000-0000-0000-000000000011', '05f10000-0000-0000-0000-000000000001', 'f5f10000-0000-0000-0000-000000000001', 'October', 1, DATE '2026-10-01', DATE '2026-10-31'),
    ('15f10000-0000-0000-0000-000000000012', '05f10000-0000-0000-0000-000000000002', 'f5f10000-0000-0000-0000-000000000001', 'November', 1, DATE '2026-11-01', DATE '2026-11-30');
INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time", "allow_makeup_teaching"
) VALUES
    ('25f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 1, 'Execution slot 1', TIME '07:00', TIME '07:45', true),
    ('25f10000-0000-0000-0000-000000000002', 'a5f10000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 2, 'Execution slot 2', TIME '07:45', TIME '08:30', true),
    ('25f10000-0000-0000-0000-000000000003', 'a5f10000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 3, 'Execution slot 3', TIME '08:30', TIME '09:15', true);
INSERT INTO "teaching_assignments" (
    "id", "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
) VALUES (
    '35f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001',
    'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001',
    'd5f10000-0000-0000-0000-000000000002', DATE '2026-09-01', DATE '2027-05-31'
);
INSERT INTO "timetable_versions" (
    "id", "academic_year_id", "version_number", "calendar_version_id", "effective_academic_week_id", "effective_from", "created_by_user_id"
) VALUES (
    '45f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', 1,
    'f5f10000-0000-0000-0000-000000000001', '05f10000-0000-0000-0000-000000000001', DATE '2026-09-01',
    'd5f10000-0000-0000-0000-000000000001'
);
INSERT INTO "timetable_entries" (
    "id", "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
    "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
) VALUES
    ('55f10000-0000-0000-0000-000000000001', '45f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', 'MONDAY', '25f10000-0000-0000-0000-000000000001', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002'),
    ('55f10000-0000-0000-0000-000000000002', '45f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', 'MONDAY', '25f10000-0000-0000-0000-000000000002', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002'),
    ('55f10000-0000-0000-0000-000000000003', '45f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', 'MONDAY', '25f10000-0000-0000-0000-000000000003', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002');

INSERT INTO "ppct_plans" ("id", "academic_year_id", "subject_id", "grade_level") VALUES
    ('65f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', 10);
INSERT INTO "ppct_versions" ("id", "ppct_plan_id", "version_number", "created_by_user_id") VALUES
    ('75f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', 1, 'd5f10000-0000-0000-0000-000000000001');
INSERT INTO "ppct_items" ("id", "ppct_plan_id") VALUES
    ('85f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001'),
    ('85f10000-0000-0000-0000-000000000002', '65f10000-0000-0000-0000-000000000001'),
    ('85f10000-0000-0000-0000-000000000003', '65f10000-0000-0000-0000-000000000001'),
    ('85f10000-0000-0000-0000-000000000004', '65f10000-0000-0000-0000-000000000001');
INSERT INTO "ppct_item_revisions" ("id", "ppct_version_id", "ppct_plan_id", "ppct_item_id", "sequence", "title", "lesson_type") VALUES
    ('95f10000-0000-0000-0000-000000000001', '75f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000001', 1, 'Execution obligation A', 'Lesson'),
    ('95f10000-0000-0000-0000-000000000002', '75f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000002', 2, 'Execution obligation B', 'Lesson'),
    ('95f10000-0000-0000-0000-000000000003', '75f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000003', 3, 'Execution obligation C', 'Lesson'),
    ('95f10000-0000-0000-0000-000000000004', '75f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000004', 4, 'Wrong revision', 'Lesson');
INSERT INTO "ppct_class_associations" (
    "id", "academic_year_id", "school_class_id", "subject_id", "grade_level", "ppct_plan_id", "ppct_version_id", "effective_from", "created_by_user_id"
) VALUES (
    'a6f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001',
    'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', 10,
    '65f10000-0000-0000-0000-000000000001', '75f10000-0000-0000-0000-000000000001', DATE '2026-09-01',
    'd5f10000-0000-0000-0000-000000000001'
);

INSERT INTO "operational_lesson_dispositions" (
    "id", "academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date",
    "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id",
    "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type", "assigned_teacher_user_id",
    "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff", "eligibility_same_subject",
    "eligibility_staff_subject_id", "create_request_key", "create_request_fingerprint", "created_by_user_id"
) VALUES (
    'b6f10000-0000-0000-0000-000000000003', 'a5f10000-0000-0000-0000-000000000001', '45f10000-0000-0000-0000-000000000001',
    '55f10000-0000-0000-0000-000000000003', DATE '2026-10-19', 'f5f10000-0000-0000-0000-000000000001',
    '25f10000-0000-0000-0000-000000000003', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001',
    '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002', 'SAME_SUBJECT_SUBSTITUTION',
    'd5f10000-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-10-20 09:00+07', true, true, true,
    '15f10000-0000-0000-0000-000000000001', 'exec-disposition-sub', 'exec-disposition-sub-fp', 'd5f10000-0000-0000-0000-000000000001'
);
INSERT INTO "operational_lesson_dispositions" (
    "id", "academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date",
    "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id",
    "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type",
    "create_request_key", "create_request_fingerprint", "created_by_user_id"
) VALUES (
    'b6f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', '45f10000-0000-0000-0000-000000000001',
    '55f10000-0000-0000-0000-000000000001', DATE '2026-10-05', 'f5f10000-0000-0000-0000-000000000001',
    '25f10000-0000-0000-0000-000000000001', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001',
    '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002', 'ABSENCE_NO_REPLACEMENT',
    'exec-disposition-absence', 'exec-disposition-absence-fp', 'd5f10000-0000-0000-0000-000000000001'
);

INSERT INTO "makeup_teaching_schedules" (
    "id", "academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date",
    "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id",
    "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id",
    "ppct_version_id", "ppct_item_id", "target_civil_date", "target_academic_calendar_version_id",
    "target_time_slot_definition_id", "scheduled_teacher_user_id", "eligibility_checked_at", "eligibility_was_active",
    "eligibility_was_teaching_staff", "eligibility_same_subject", "eligibility_staff_subject_id",
    "create_request_key", "create_request_fingerprint", "created_by_user_id"
) VALUES
    ('c6f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', '45f10000-0000-0000-0000-000000000001', '55f10000-0000-0000-0000-000000000001', DATE '2026-10-05', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000001', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002', 'a6f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '75f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000001', DATE '2026-10-26', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000002', 'd5f10000-0000-0000-0000-000000000003', now(), true, true, true, '15f10000-0000-0000-0000-000000000001', 'exec-makeup-a', 'exec-makeup-a-fp', 'd5f10000-0000-0000-0000-000000000001'),
    ('c6f10000-0000-0000-0000-000000000002', 'a5f10000-0000-0000-0000-000000000001', '45f10000-0000-0000-0000-000000000001', '55f10000-0000-0000-0000-000000000002', DATE '2026-10-12', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000002', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002', 'a6f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '75f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000002', DATE '2026-11-02', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000003', 'd5f10000-0000-0000-0000-000000000003', now(), true, true, true, '15f10000-0000-0000-0000-000000000001', 'exec-makeup-b', 'exec-makeup-b-fp', 'd5f10000-0000-0000-0000-000000000001');

CREATE TEMP TABLE exec_templates (LIKE curricular_teaching_executions INCLUDING DEFAULTS);
CREATE TEMP TABLE exec_candidate (LIKE curricular_teaching_executions INCLUDING DEFAULTS);

INSERT INTO exec_templates (
    id, kind, academic_year_id, school_class_id, subject_id, source_normal_occurrence_key,
    original_timetable_version_id, original_timetable_entry_id, source_civil_date,
    source_academic_calendar_version_id, source_time_slot_definition_id, original_teaching_assignment_id,
    responsible_teacher_user_id, ppct_class_association_id, ppct_plan_id, ppct_version_id, ppct_item_id,
    ppct_item_revision_id, operational_lesson_disposition_id, operational_disposition_type,
    makeup_teaching_schedule_id, execution_civil_date, execution_academic_calendar_version_id,
    execution_time_slot_definition_id, execution_academic_week_id, execution_academic_week_segment_id,
    actual_teacher_user_id, school_class_code_snapshot, school_class_name_snapshot, subject_code_snapshot,
    subject_name_snapshot, responsible_teacher_display_name_snapshot, actual_teacher_display_name_snapshot,
    create_request_key, create_request_fingerprint, created_by_user_id
) VALUES
    ('d6f10000-0000-0000-0000-000000000001', 'NORMAL', 'a5f10000-0000-0000-0000-000000000001', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', 'NORMAL:55f10000-0000-0000-0000-000000000001:2026-10-05', '45f10000-0000-0000-0000-000000000001', '55f10000-0000-0000-0000-000000000001', DATE '2026-10-05', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000001', '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002', 'a6f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '75f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000001', '95f10000-0000-0000-0000-000000000001', NULL, NULL, NULL, DATE '2026-10-05', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000001', '05f10000-0000-0000-0000-000000000001', '15f10000-0000-0000-0000-000000000011', 'd5f10000-0000-0000-0000-000000000002', 'EXEC10A1', 'Execution Class', 'EXEC_MATH', 'Execution Mathematics', 'Responsible Teacher', 'Responsible Teacher', 'exec-base-a', 'exec-base-a-fp', 'd5f10000-0000-0000-0000-000000000001'),
    ('d6f10000-0000-0000-0000-000000000002', 'NORMAL', 'a5f10000-0000-0000-0000-000000000001', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', 'NORMAL:55f10000-0000-0000-0000-000000000002:2026-10-12', '45f10000-0000-0000-0000-000000000001', '55f10000-0000-0000-0000-000000000002', DATE '2026-10-12', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000002', '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002', 'a6f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '75f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000002', '95f10000-0000-0000-0000-000000000002', NULL, NULL, NULL, DATE '2026-10-12', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000002', '05f10000-0000-0000-0000-000000000001', '15f10000-0000-0000-0000-000000000011', 'd5f10000-0000-0000-0000-000000000002', 'EXEC10A1', 'Execution Class', 'EXEC_MATH', 'Execution Mathematics', 'Responsible Teacher', 'Responsible Teacher', 'exec-base-b', 'exec-base-b-fp', 'd5f10000-0000-0000-0000-000000000001'),
    ('d6f10000-0000-0000-0000-000000000003', 'NORMAL', 'a5f10000-0000-0000-0000-000000000001', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', 'NORMAL:55f10000-0000-0000-0000-000000000003:2026-10-19', '45f10000-0000-0000-0000-000000000001', '55f10000-0000-0000-0000-000000000003', DATE '2026-10-19', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000003', '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002', 'a6f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '75f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000003', '95f10000-0000-0000-0000-000000000003', 'b6f10000-0000-0000-0000-000000000003', 'SAME_SUBJECT_SUBSTITUTION', NULL, DATE '2026-10-19', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000003', '05f10000-0000-0000-0000-000000000001', '15f10000-0000-0000-0000-000000000011', 'd5f10000-0000-0000-0000-000000000003', 'EXEC10A1', 'Execution Class', 'EXEC_MATH', 'Execution Mathematics', 'Responsible Teacher', 'Substitute Teacher', 'exec-sub-c', 'exec-sub-c-fp', 'd5f10000-0000-0000-0000-000000000001'),
    ('d6f10000-0000-0000-0000-000000000011', 'MAKEUP', 'a5f10000-0000-0000-0000-000000000001', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', 'NORMAL:55f10000-0000-0000-0000-000000000001:2026-10-05', '45f10000-0000-0000-0000-000000000001', '55f10000-0000-0000-0000-000000000001', DATE '2026-10-05', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000001', '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002', 'a6f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '75f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000001', '95f10000-0000-0000-0000-000000000001', NULL, NULL, 'c6f10000-0000-0000-0000-000000000001', DATE '2026-10-26', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000002', '05f10000-0000-0000-0000-000000000001', '15f10000-0000-0000-0000-000000000011', 'd5f10000-0000-0000-0000-000000000003', 'EXEC10A1', 'Execution Class', 'EXEC_MATH', 'Execution Mathematics', 'Responsible Teacher', 'Substitute Teacher', 'exec-makeup-a-row', 'exec-makeup-a-row-fp', 'd5f10000-0000-0000-0000-000000000001'),
    ('d6f10000-0000-0000-0000-000000000012', 'MAKEUP', 'a5f10000-0000-0000-0000-000000000001', 'e5f10000-0000-0000-0000-000000000001', 'c5f10000-0000-0000-0000-000000000001', 'NORMAL:55f10000-0000-0000-0000-000000000002:2026-10-12', '45f10000-0000-0000-0000-000000000001', '55f10000-0000-0000-0000-000000000002', DATE '2026-10-12', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000002', '35f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000002', 'a6f10000-0000-0000-0000-000000000001', '65f10000-0000-0000-0000-000000000001', '75f10000-0000-0000-0000-000000000001', '85f10000-0000-0000-0000-000000000002', '95f10000-0000-0000-0000-000000000002', NULL, NULL, 'c6f10000-0000-0000-0000-000000000002', DATE '2026-11-02', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000003', '05f10000-0000-0000-0000-000000000002', '15f10000-0000-0000-0000-000000000012', 'd5f10000-0000-0000-0000-000000000003', 'EXEC10A1', 'Execution Class', 'EXEC_MATH', 'Execution Mathematics', 'Responsible Teacher', 'Substitute Teacher', 'exec-makeup-b-row', 'exec-makeup-b-row-fp', 'd5f10000-0000-0000-0000-000000000001');

-- T2, T3, T7, T18, T19: invalid base/discriminator/lifecycle/text shapes.
TRUNCATE exec_candidate; INSERT INTO exec_candidate SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000001';
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000101', actual_teacher_user_id = 'd5f10000-0000-0000-0000-000000000004', create_request_key = 't2';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23514', 'T2 base teacher mismatch');
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000102', actual_teacher_user_id = responsible_teacher_user_id, execution_civil_date = DATE '2026-10-06', create_request_key = 't3';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23514', 'T3 normal coordinates mismatch');
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000103', execution_civil_date = source_civil_date, operational_lesson_disposition_id = 'b6f10000-0000-0000-0000-000000000001', operational_disposition_type = 'ABSENCE_NO_REPLACEMENT', create_request_key = 't7';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23514', 'T7 forbidden disposition type');
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000104', operational_lesson_disposition_id = NULL, operational_disposition_type = NULL, status = 'ACTIVE', reversed_by_user_id = 'd5f10000-0000-0000-0000-000000000001', create_request_key = 't18-active';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23514', 'T18 ACTIVE reversal metadata');
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000105', status = 'REVERSED', reversed_by_user_id = NULL, create_request_key = 't18-reversed';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23514', 'T18 incomplete REVERSED metadata');
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000106', status = 'ACTIVE', create_request_key = ' ', school_class_code_snapshot = 'EXEC10A1';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23514', 'T19 blank request key');
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000107', create_request_key = 't19-snapshot', school_class_code_snapshot = ' ';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23514', 'T19 blank snapshot');

-- T1 valid NORMAL BASE.
INSERT INTO curricular_teaching_executions SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000001';
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM curricular_teaching_executions
        WHERE id = 'd6f10000-0000-0000-0000-000000000001'
          AND kind = 'NORMAL' AND operational_lesson_disposition_id IS NULL AND makeup_teaching_schedule_id IS NULL
          AND execution_civil_date = source_civil_date
          AND execution_academic_calendar_version_id = source_academic_calendar_version_id
          AND execution_time_slot_definition_id = source_time_slot_definition_id
          AND actual_teacher_user_id = responsible_teacher_user_id
    ) THEN RAISE EXCEPTION 'T1 valid base semantics were not retained'; END IF;
END $$;

-- T5/T6 prove exact substitution source and assigned teacher; T4 then inserts the valid substitution.
TRUNCATE exec_candidate; INSERT INTO exec_candidate SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000003';
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000108', original_timetable_entry_id = '55f10000-0000-0000-0000-000000000001', source_civil_date = DATE '2026-10-05', source_time_slot_definition_id = '25f10000-0000-0000-0000-000000000001', execution_civil_date = DATE '2026-10-05', execution_time_slot_definition_id = '25f10000-0000-0000-0000-000000000001', create_request_key = 't5';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23503', 'T5 disposition from different source');
TRUNCATE exec_candidate; INSERT INTO exec_candidate SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000003';
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000109', actual_teacher_user_id = 'd5f10000-0000-0000-0000-000000000004', create_request_key = 't6';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23503', 'T6 substitution wrong actual teacher');
INSERT INTO curricular_teaching_executions SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000003';
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM curricular_teaching_executions
        WHERE id = 'd6f10000-0000-0000-0000-000000000003'
          AND operational_disposition_type = 'SAME_SUBJECT_SUBSTITUTION'
          AND operational_lesson_disposition_id = 'b6f10000-0000-0000-0000-000000000003'
          AND actual_teacher_user_id = 'd5f10000-0000-0000-0000-000000000003'
    ) THEN RAISE EXCEPTION 'T4 valid substitution semantics were not retained'; END IF;
END $$;

-- T9-T13 validate the exact make-up source/target/teacher, revision, and week segment before T8 succeeds.
TRUNCATE exec_candidate; INSERT INTO exec_candidate SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000012';
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000110', original_timetable_entry_id = '55f10000-0000-0000-0000-000000000001', create_request_key = 't9';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23503', 'T9 make-up original obligation mismatch');
TRUNCATE exec_candidate; INSERT INTO exec_candidate SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000012';
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000111', execution_civil_date = DATE '2026-11-09', create_request_key = 't10';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23503', 'T10 make-up target mismatch');
TRUNCATE exec_candidate; INSERT INTO exec_candidate SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000012';
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000112', actual_teacher_user_id = 'd5f10000-0000-0000-0000-000000000004', create_request_key = 't11';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23503', 'T11 make-up wrong actual teacher');
TRUNCATE exec_candidate; INSERT INTO exec_candidate SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000012';
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000113', ppct_item_revision_id = '95f10000-0000-0000-0000-000000000004', create_request_key = 't12';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23503', 'T12 wrong PPCT revision');
TRUNCATE exec_candidate; INSERT INTO exec_candidate SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000012';
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000114', execution_academic_week_id = '05f10000-0000-0000-0000-000000000001', create_request_key = 't13';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23503', 'T13 wrong week segment pairing');
INSERT INTO curricular_teaching_executions SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000012';
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM curricular_teaching_executions
        WHERE id = 'd6f10000-0000-0000-0000-000000000012'
          AND kind = 'MAKEUP' AND makeup_teaching_schedule_id = 'c6f10000-0000-0000-0000-000000000002'
          AND source_civil_date = DATE '2026-10-12' AND execution_civil_date = DATE '2026-11-02'
          AND actual_teacher_user_id = 'd5f10000-0000-0000-0000-000000000003'
    ) THEN RAISE EXCEPTION 'T8 valid make-up semantics were not retained'; END IF;
END $$;

-- T14 and T15: NORMAL and MAKEUP compete for the same ACTIVE obligation slot.
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO curricular_teaching_executions SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000011'$cmd$, '23505', 'T14 active normal blocks make-up');
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO curricular_teaching_executions SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000002'$cmd$, '23505', 'T15 active make-up blocks normal');

-- T16: reversal relinquishes ACTIVE credit and permits an exact linked replacement.
UPDATE curricular_teaching_executions
SET status = 'REVERSED', reversed_by_user_id = 'd5f10000-0000-0000-0000-000000000001', reversed_at = now(),
    reversal_reason = 'Replace base with make-up', reverse_request_key = 't16-reverse', reverse_request_fingerprint = 't16-reverse-fp'
WHERE id = 'd6f10000-0000-0000-0000-000000000001';
TRUNCATE exec_candidate; INSERT INTO exec_candidate SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000011';
UPDATE exec_candidate SET replaces_id = 'd6f10000-0000-0000-0000-000000000001';
INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate;

-- T17: replacement cannot cross obligation topology.
TRUNCATE exec_candidate; INSERT INTO exec_candidate SELECT * FROM exec_templates WHERE id = 'd6f10000-0000-0000-0000-000000000002';
UPDATE exec_candidate SET id = 'd6f10000-0000-0000-0000-000000000117', status = 'REVERSED',
    reversed_by_user_id = 'd5f10000-0000-0000-0000-000000000001', reversed_at = now(), reversal_reason = 'Historical test',
    reverse_request_key = 't17-reverse', reverse_request_fingerprint = 't17-reverse-fp', replaces_id = 'd6f10000-0000-0000-0000-000000000003',
    create_request_key = 't17-create';
SELECT pg_temp.expect_sqlstate('INSERT INTO curricular_teaching_executions SELECT * FROM exec_candidate', '23503', 'T17 cross-obligation replacement');

-- Activity source fixture.
INSERT INTO special_activities (
    id, academic_year_id, academic_calendar_version_id, civil_date, scope, title,
    create_request_key, create_request_fingerprint, created_by_user_id
) VALUES
    ('e6f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', 'f5f10000-0000-0000-0000-000000000001', DATE '2026-11-09', 'SCHOOL_WIDE', 'Execution activity one', 'activity-root-1', 'activity-root-1-fp', 'd5f10000-0000-0000-0000-000000000001'),
    ('e6f10000-0000-0000-0000-000000000002', 'a5f10000-0000-0000-0000-000000000001', 'f5f10000-0000-0000-0000-000000000001', DATE '2026-11-16', 'SCHOOL_WIDE', 'Execution activity two', 'activity-root-2', 'activity-root-2-fp', 'd5f10000-0000-0000-0000-000000000001');
INSERT INTO special_activity_time_slots (id, special_activity_id, academic_year_id, time_slot_definition_id) VALUES
    ('f6f10000-0000-0000-0000-000000000001', 'e6f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000001'),
    ('f6f10000-0000-0000-0000-000000000002', 'e6f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000002'),
    ('f6f10000-0000-0000-0000-000000000003', 'e6f10000-0000-0000-0000-000000000002', 'a5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000003');
INSERT INTO special_activity_staffing (
    id, special_activity_id, scheduled_teacher_user_id, staff_profile_id,
    eligibility_checked_at, eligibility_was_active, eligibility_was_teaching_staff
) VALUES
    ('06f10000-0000-0000-0000-000000000011', 'e6f10000-0000-0000-0000-000000000001', 'd5f10000-0000-0000-0000-000000000003', 'b5f10000-0000-0000-0000-000000000002', now(), true, true),
    ('06f10000-0000-0000-0000-000000000012', 'e6f10000-0000-0000-0000-000000000002', 'd5f10000-0000-0000-0000-000000000004', 'b5f10000-0000-0000-0000-000000000003', now(), true, true);

CREATE TEMP TABLE activity_templates (LIKE special_activity_participation_executions INCLUDING DEFAULTS);
CREATE TEMP TABLE activity_candidate (LIKE special_activity_participation_executions INCLUDING DEFAULTS);
INSERT INTO activity_templates (
    id, special_activity_id, special_activity_staffing_id, special_activity_time_slot_id, academic_year_id,
    execution_civil_date, execution_academic_calendar_version_id, execution_time_slot_definition_id,
    execution_academic_week_id, execution_academic_week_segment_id, actual_teacher_user_id,
    activity_title_snapshot, actual_teacher_display_name_snapshot, create_request_key,
    create_request_fingerprint, created_by_user_id
) VALUES
    ('16f10000-0000-0000-0000-000000000001', 'e6f10000-0000-0000-0000-000000000001', '06f10000-0000-0000-0000-000000000011', 'f6f10000-0000-0000-0000-000000000001', 'a5f10000-0000-0000-0000-000000000001', DATE '2026-11-09', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000001', NULL, NULL, 'd5f10000-0000-0000-0000-000000000003', 'Execution activity one', 'Substitute Teacher', 'activity-exec-1', 'activity-exec-1-fp', 'd5f10000-0000-0000-0000-000000000001'),
    ('16f10000-0000-0000-0000-000000000002', 'e6f10000-0000-0000-0000-000000000001', '06f10000-0000-0000-0000-000000000011', 'f6f10000-0000-0000-0000-000000000002', 'a5f10000-0000-0000-0000-000000000001', DATE '2026-11-09', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000002', '05f10000-0000-0000-0000-000000000002', '15f10000-0000-0000-0000-000000000012', 'd5f10000-0000-0000-0000-000000000003', 'Execution activity one', 'Substitute Teacher', 'activity-exec-2', 'activity-exec-2-fp', 'd5f10000-0000-0000-0000-000000000001'),
    ('16f10000-0000-0000-0000-000000000003', 'e6f10000-0000-0000-0000-000000000002', '06f10000-0000-0000-0000-000000000012', 'f6f10000-0000-0000-0000-000000000003', 'a5f10000-0000-0000-0000-000000000001', DATE '2026-11-16', 'f5f10000-0000-0000-0000-000000000001', '25f10000-0000-0000-0000-000000000003', '05f10000-0000-0000-0000-000000000002', '15f10000-0000-0000-0000-000000000012', 'd5f10000-0000-0000-0000-000000000004', 'Execution activity two', 'Other Teacher', 'activity-exec-3', 'activity-exec-3-fp', 'd5f10000-0000-0000-0000-000000000001');

-- T21-T23 source/teacher mismatches before T20/T26 valid null-week participation.
TRUNCATE activity_candidate; INSERT INTO activity_candidate SELECT * FROM activity_templates WHERE id = '16f10000-0000-0000-0000-000000000001';
UPDATE activity_candidate SET id = '16f10000-0000-0000-0000-000000000101', special_activity_staffing_id = '06f10000-0000-0000-0000-000000000012', create_request_key = 't21';
SELECT pg_temp.expect_sqlstate('INSERT INTO special_activity_participation_executions SELECT * FROM activity_candidate', '23503', 'T21 staffing from another activity');
TRUNCATE activity_candidate; INSERT INTO activity_candidate SELECT * FROM activity_templates WHERE id = '16f10000-0000-0000-0000-000000000001';
UPDATE activity_candidate SET id = '16f10000-0000-0000-0000-000000000102', special_activity_time_slot_id = 'f6f10000-0000-0000-0000-000000000003', create_request_key = 't22';
SELECT pg_temp.expect_sqlstate('INSERT INTO special_activity_participation_executions SELECT * FROM activity_candidate', '23503', 'T22 slot from another activity');
TRUNCATE activity_candidate; INSERT INTO activity_candidate SELECT * FROM activity_templates WHERE id = '16f10000-0000-0000-0000-000000000001';
UPDATE activity_candidate SET id = '16f10000-0000-0000-0000-000000000103', actual_teacher_user_id = 'd5f10000-0000-0000-0000-000000000004', create_request_key = 't23';
SELECT pg_temp.expect_sqlstate('INSERT INTO special_activity_participation_executions SELECT * FROM activity_candidate', '23503', 'T23 wrong activity teacher');
INSERT INTO special_activity_participation_executions SELECT * FROM activity_templates WHERE id = '16f10000-0000-0000-0000-000000000001';

-- T24 duplicate, T25 different selected slot allowed, T26 is already proven by the null-week T20 row.
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO special_activity_participation_executions SELECT * FROM activity_templates WHERE id = '16f10000-0000-0000-0000-000000000001'$cmd$, '23505', 'T24 duplicate ACTIVE participation');
INSERT INTO special_activity_participation_executions SELECT * FROM activity_templates WHERE id = '16f10000-0000-0000-0000-000000000002';

-- T27/T28 optional week/segment shape and relational calendar/week pairing.
TRUNCATE activity_candidate; INSERT INTO activity_candidate SELECT * FROM activity_templates WHERE id = '16f10000-0000-0000-0000-000000000003';
UPDATE activity_candidate SET id = '16f10000-0000-0000-0000-000000000104', execution_academic_week_id = NULL, create_request_key = 't27';
SELECT pg_temp.expect_sqlstate('INSERT INTO special_activity_participation_executions SELECT * FROM activity_candidate', '23514', 'T27 segment without week');
TRUNCATE activity_candidate; INSERT INTO activity_candidate SELECT * FROM activity_templates WHERE id = '16f10000-0000-0000-0000-000000000003';
UPDATE activity_candidate SET id = '16f10000-0000-0000-0000-000000000105', execution_academic_week_id = '05f10000-0000-0000-0000-000000000001', create_request_key = 't28';
SELECT pg_temp.expect_sqlstate('INSERT INTO special_activity_participation_executions SELECT * FROM activity_candidate', '23503', 'T28 wrong activity week segment pairing');

-- T29 replacement cannot cross the activity/staffing/slot participation unit.
TRUNCATE activity_candidate; INSERT INTO activity_candidate SELECT * FROM activity_templates WHERE id = '16f10000-0000-0000-0000-000000000003';
UPDATE activity_candidate SET id = '16f10000-0000-0000-0000-000000000106', status = 'REVERSED',
    reversed_by_user_id = 'd5f10000-0000-0000-0000-000000000001', reversed_at = now(), reversal_reason = 'Historical test',
    reverse_request_key = 't29-reverse', reverse_request_fingerprint = 't29-reverse-fp',
    replaces_id = '16f10000-0000-0000-0000-000000000001', create_request_key = 't29-create';
SELECT pg_temp.expect_sqlstate('INSERT INTO special_activity_participation_executions SELECT * FROM activity_candidate', '23503', 'T29 cross-unit activity replacement');

-- T30 representative curricular and activity source deletion remains restricted.
SELECT pg_temp.expect_sqlstate($cmd$DELETE FROM timetable_entries WHERE id = '55f10000-0000-0000-0000-000000000001'$cmd$, '23503', 'T30 curricular source delete restriction');
SELECT pg_temp.expect_sqlstate($cmd$DELETE FROM special_activities WHERE id = 'e6f10000-0000-0000-0000-000000000001'$cmd$, '23503', 'T30 activity source delete restriction');

ROLLBACK;

SELECT 'Teaching Execution persistence schema verification T1-T31 PASS' AS result;
