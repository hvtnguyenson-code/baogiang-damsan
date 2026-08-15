\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    enum_values text[];
    date_count integer;
    partial_index_count integer;
BEGIN
    IF to_regclass('public.calendar_exceptions') IS NULL
       OR to_regclass('public.calendar_exception_time_slots') IS NULL
       OR to_regclass('public.operational_lesson_dispositions') IS NULL
       OR to_regclass('public.makeup_teaching_schedules') IS NULL THEN
        RAISE EXCEPTION 'Operational-overlay tables are missing';
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OperationalOverlayStatus';
    IF enum_values <> ARRAY['ACTIVE', 'REVERSED'] THEN
        RAISE EXCEPTION 'Unexpected OperationalOverlayStatus values: %', enum_values;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'CalendarExceptionScope';
    IF enum_values <> ARRAY['SCHOOL_WIDE', 'GRADE', 'CLASS'] THEN
        RAISE EXCEPTION 'Unexpected CalendarExceptionScope values: %', enum_values;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'CalendarExceptionTimeSelector';
    IF enum_values <> ARRAY['WHOLE_DAY', 'SESSION', 'EXACT_SLOTS'] THEN
        RAISE EXCEPTION 'Unexpected CalendarExceptionTimeSelector values: %', enum_values;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OperationalLessonDispositionType';
    IF enum_values <> ARRAY['AUTHORIZED_CANCELLATION', 'ABSENCE_NO_REPLACEMENT', 'SAME_SUBJECT_SUBSTITUTION', 'DIFFERENT_SUBJECT_SUPERVISION'] THEN
        RAISE EXCEPTION 'Unexpected OperationalLessonDispositionType values: %', enum_values;
    END IF;

    SELECT count(*) INTO date_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'calendar_exceptions' AND column_name = 'civil_date')
        OR (table_name = 'operational_lesson_dispositions' AND column_name = 'source_civil_date')
        OR (table_name = 'makeup_teaching_schedules' AND column_name IN ('original_civil_date', 'target_civil_date')))
      AND data_type = 'date';
    IF date_count <> 4 THEN
        RAISE EXCEPTION 'All operational-overlay civil dates must use DATE';
    END IF;

    SELECT count(*) INTO partial_index_count
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE c.relname IN ('operational_lesson_dispositions_one_active_source_key', 'makeup_teaching_schedules_one_active_obligation_key')
      AND i.indisunique
      AND i.indpred IS NOT NULL
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%ACTIVE%';
    IF partial_index_count <> 2 THEN
        RAISE EXCEPTION 'Expected both ACTIVE partial unique indexes';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('calendar_exceptions', 'operational_lesson_dispositions', 'makeup_teaching_schedules')
          AND column_name ~ '(completed|completion|debt|progress|report|execution|move|swap|activity)'
    ) OR EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name ~ '(teaching_execution|operational.*ledger|debt|resolved.*occurrence|move|swap)'
    ) THEN
        RAISE EXCEPTION 'Forbidden downstream operational persistence found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'operational_lesson_dispositions'
          AND column_name LIKE 'ppct%'
    ) THEN
        RAISE EXCEPTION 'OperationalLessonDisposition must not own PPCT';
    END IF;

    IF (SELECT count(*) FROM pg_constraint
        WHERE conname IN (
            'calendar_exceptions_lifecycle_shape_check',
            'calendar_exceptions_scope_shape_check',
            'calendar_exceptions_time_selector_shape_check',
            'operational_lesson_dispositions_lifecycle_shape_check',
            'operational_lesson_dispositions_type_shape_check',
            'makeup_teaching_schedules_lifecycle_shape_check',
            'makeup_teaching_schedules_eligibility_shape_check'
        )) <> 7 THEN
        RAISE EXCEPTION 'Expected overlay CHECK constraints are missing';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid IN (
              'calendar_exceptions'::regclass,
              'calendar_exception_time_slots'::regclass,
              'operational_lesson_dispositions'::regclass,
              'makeup_teaching_schedules'::regclass
          )
          AND confdeltype <> 'r'
    ) THEN
        RAISE EXCEPTION 'Every overlay history FK must use ON DELETE RESTRICT';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgrelid IN (
              'calendar_exceptions'::regclass,
              'calendar_exception_time_slots'::regclass,
              'operational_lesson_dispositions'::regclass,
              'makeup_teaching_schedules'::regclass
          )
    ) THEN
        RAISE EXCEPTION 'Operational-overlay persistence must not use triggers';
    END IF;
END $$;

INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a5c10000-0000-0000-0000-000000000001', 'OVL-2026-2027', 'Overlay year A'),
    ('a5c10000-0000-0000-0000-000000000002', 'OVL-2027-2028', 'Overlay year B');

INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('d5c10000-0000-0000-0000-000000000001', 'overlay.actor', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d5c10000-0000-0000-0000-000000000002', 'overlay.responsible', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d5c10000-0000-0000-0000-000000000003', 'overlay.assigned', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d5c10000-0000-0000-0000-000000000004', 'overlay.other', 'not-a-real-password-hash', 'ACTIVE', false);

INSERT INTO "subjects" ("id", "code", "name") VALUES
    ('b5c10000-0000-0000-0000-000000000001', 'OVL_MATH', 'Overlay Mathematics'),
    ('b5c10000-0000-0000-0000-000000000002', 'OVL_LIT', 'Overlay Literature');

INSERT INTO "staff_subjects" ("id", "user_id", "subject_id") VALUES
    ('15c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000003', 'b5c10000-0000-0000-0000-000000000001'),
    ('15c10000-0000-0000-0000-000000000002', 'd5c10000-0000-0000-0000-000000000004', 'b5c10000-0000-0000-0000-000000000002');

INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('c5c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001', 'OVL10A1', 'Overlay Class A', 10),
    ('c5c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000001', 'OVL10A2', 'Overlay Class A2', 10),
    ('c5c10000-0000-0000-0000-000000000003', 'a5c10000-0000-0000-0000-000000000002', 'OVL11B1', 'Overlay Class B', 11);

INSERT INTO "academic_calendar_versions" (
    "id", "academic_year_id", "version_number", "start_date", "end_date",
    "official_week_count", "reserve_week_count", "teaching_weekdays"
) VALUES
    ('e5c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001', 1, DATE '2026-09-01', DATE '2027-05-31', 35, 1, ARRAY['MONDAY'::"AcademicWeekday"]),
    ('e5c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000002', 1, DATE '2027-09-01', DATE '2028-05-31', 35, 1, ARRAY['MONDAY'::"AcademicWeekday"]);

INSERT INTO "academic_weeks" ("id", "calendar_version_id", "kind", "official_week_number", "display_label", "sort_order") VALUES
    ('25c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', 'OFFICIAL', 1, 'Overlay week A', 1),
    ('25c10000-0000-0000-0000-000000000002', 'e5c10000-0000-0000-0000-000000000002', 'OFFICIAL', 1, 'Overlay week B', 1);

INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time", "allow_makeup_teaching"
) VALUES
    ('f5c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 1, 'Overlay slot A1', TIME '07:00', TIME '07:45', true),
    ('f5c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 2, 'Overlay slot A2', TIME '07:45', TIME '08:30', true),
    ('f5c10000-0000-0000-0000-000000000003', 'a5c10000-0000-0000-0000-000000000002', 'MONDAY', 'MORNING', 1, 'Overlay slot B1', TIME '07:00', TIME '07:45', true);

INSERT INTO "teaching_assignments" (
    "id", "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
) VALUES
    ('35c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', DATE '2026-09-01', DATE '2027-05-31'),
    ('35c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000002', 'b5c10000-0000-0000-0000-000000000002', 'd5c10000-0000-0000-0000-000000000004', DATE '2026-09-01', DATE '2027-05-31');

INSERT INTO "timetable_versions" (
    "id", "academic_year_id", "version_number", "calendar_version_id", "effective_academic_week_id", "effective_from", "created_by_user_id"
) VALUES
    ('45c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001', 1, 'e5c10000-0000-0000-0000-000000000001', '25c10000-0000-0000-0000-000000000001', DATE '2026-09-01', 'd5c10000-0000-0000-0000-000000000001'),
    ('45c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000002', 1, 'e5c10000-0000-0000-0000-000000000002', '25c10000-0000-0000-0000-000000000002', DATE '2027-09-01', 'd5c10000-0000-0000-0000-000000000001');

INSERT INTO "timetable_entries" (
    "id", "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
    "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
) VALUES
    ('55c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001', 'MONDAY', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002'),
    ('55c10000-0000-0000-0000-000000000002', '45c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001', 'MONDAY', 'f5c10000-0000-0000-0000-000000000002', 'c5c10000-0000-0000-0000-000000000002', 'b5c10000-0000-0000-0000-000000000002', '35c10000-0000-0000-0000-000000000002', 'd5c10000-0000-0000-0000-000000000004');

INSERT INTO "ppct_plans" ("id", "academic_year_id", "subject_id", "grade_level") VALUES
    ('65c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', 10),
    ('65c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000002', 10);
INSERT INTO "ppct_versions" ("id", "ppct_plan_id", "version_number", "created_by_user_id") VALUES
    ('75c10000-0000-0000-0000-000000000001', '65c10000-0000-0000-0000-000000000001', 1, 'd5c10000-0000-0000-0000-000000000001'),
    ('75c10000-0000-0000-0000-000000000002', '65c10000-0000-0000-0000-000000000002', 1, 'd5c10000-0000-0000-0000-000000000001');
INSERT INTO "ppct_items" ("id", "ppct_plan_id") VALUES
    ('85c10000-0000-0000-0000-000000000001', '65c10000-0000-0000-0000-000000000001'),
    ('85c10000-0000-0000-0000-000000000002', '65c10000-0000-0000-0000-000000000002');
INSERT INTO "ppct_item_revisions" ("ppct_version_id", "ppct_plan_id", "ppct_item_id", "sequence", "title", "lesson_type") VALUES
    ('75c10000-0000-0000-0000-000000000001', '65c10000-0000-0000-0000-000000000001', '85c10000-0000-0000-0000-000000000001', 1, 'Overlay obligation A', 'Lesson'),
    ('75c10000-0000-0000-0000-000000000002', '65c10000-0000-0000-0000-000000000002', '85c10000-0000-0000-0000-000000000002', 1, 'Overlay obligation B', 'Lesson');
INSERT INTO "ppct_class_associations" (
    "id", "academic_year_id", "school_class_id", "subject_id", "grade_level", "ppct_plan_id", "ppct_version_id", "effective_from", "created_by_user_id"
) VALUES
    ('95c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', 10, '65c10000-0000-0000-0000-000000000001', '75c10000-0000-0000-0000-000000000001', DATE '2026-09-01', 'd5c10000-0000-0000-0000-000000000001'),
    ('95c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000002', 'b5c10000-0000-0000-0000-000000000002', 10, '65c10000-0000-0000-0000-000000000002', '75c10000-0000-0000-0000-000000000002', DATE '2026-09-01', 'd5c10000-0000-0000-0000-000000000001');

-- Valid ACTIVE lifecycle and exact-slot normalization.
INSERT INTO "calendar_exceptions" (
    "id", "academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "school_class_id", "time_selector",
    "create_request_key", "create_request_fingerprint", "created_by_user_id"
) VALUES
    ('05c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', DATE '2026-10-05', 'SCHOOL_WIDE', NULL, 'WHOLE_DAY', 'calendar-create-1', 'calendar-fingerprint-1', 'd5c10000-0000-0000-0000-000000000001'),
    ('05c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', DATE '2026-10-06', 'CLASS', 'c5c10000-0000-0000-0000-000000000001', 'EXACT_SLOTS', 'calendar-create-2', 'calendar-fingerprint-2', 'd5c10000-0000-0000-0000-000000000001');
INSERT INTO "calendar_exception_time_slots" ("calendar_exception_id", "academic_year_id", "time_slot_definition_id") VALUES
    ('05c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001');

DO $$
BEGIN
    BEGIN
        INSERT INTO "calendar_exceptions" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "time_selector", "status", "reversed_by_user_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'WHOLE_DAY', 'ACTIVE', 'd5c10000-0000-0000-0000-000000000001', 'bad-active', 'bad-active-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected ACTIVE reversal metadata rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;

    BEGIN
        INSERT INTO "calendar_exceptions" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "time_selector", "status", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'WHOLE_DAY', 'REVERSED', 'bad-reversed', 'bad-reversed-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected incomplete REVERSED metadata rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;

    BEGIN
        INSERT INTO "calendar_exceptions" ("id", "academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "time_selector", "replaces_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('05c10000-0000-0000-0000-000000000009', 'a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'WHOLE_DAY', '05c10000-0000-0000-0000-000000000009', 'self-replace', 'self-replace-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected self replacement rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;

    BEGIN
        INSERT INTO "calendar_exceptions" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "grade_level", "time_selector", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 10, 'WHOLE_DAY', 'bad-scope', 'bad-scope-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected invalid SCHOOL_WIDE shape rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;

    BEGIN
        INSERT INTO "calendar_exceptions" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "grade_level", "time_selector", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'GRADE', 9, 'WHOLE_DAY', 'bad-grade', 'bad-grade-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected invalid grade rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;

    BEGIN
        INSERT INTO "calendar_exceptions" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "time_selector", "session", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'WHOLE_DAY', 'MORNING', 'bad-selector', 'bad-selector-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected invalid selector/session rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;

    BEGIN
        INSERT INTO "calendar_exception_time_slots" ("calendar_exception_id", "academic_year_id", "time_slot_definition_id")
        VALUES ('05c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected duplicate exact slot rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;

    BEGIN
        INSERT INTO "calendar_exceptions" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "school_class_id", "time_selector", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'CLASS', 'c5c10000-0000-0000-0000-000000000003', 'WHOLE_DAY', 'cross-year-class', 'cross-year-class-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected cross-year CalendarException class rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;

    BEGIN
        INSERT INTO "calendar_exceptions" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "time_selector", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000002', DATE '2026-10-07', 'SCHOOL_WIDE', 'WHOLE_DAY', 'cross-year-calendar', 'cross-year-calendar-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected cross-year calendar version rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

-- One valid active absence disposition.
INSERT INTO "operational_lesson_dispositions" (
    "id", "academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date",
    "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id",
    "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type",
    "create_request_key", "create_request_fingerprint", "created_by_user_id"
) VALUES (
    'a6c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001',
    '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-12',
    'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001',
    'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001',
    '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002',
    'ABSENCE_NO_REPLACEMENT', 'disposition-create-1', 'disposition-fingerprint-1', 'd5c10000-0000-0000-0000-000000000001'
);

DO $$
DECLARE
    bad_type "OperationalLessonDispositionType";
BEGIN
    -- Each source coordinate is protected by the exact entry provenance FK.
    BEGIN
        INSERT INTO "operational_lesson_dispositions" ("academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000002', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-13', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', 'AUTHORIZED_CANCELLATION', 'bad-version', 'bad-version-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected disposition source version mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;

    BEGIN
        INSERT INTO "operational_lesson_dispositions" ("academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-13', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000002', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', 'AUTHORIZED_CANCELLATION', 'bad-class', 'bad-class-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected source class mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;

    BEGIN
        INSERT INTO "operational_lesson_dispositions" ("academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-13', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000002', '35c10000-0000-0000-0000-000000000002', 'd5c10000-0000-0000-0000-000000000004', 'AUTHORIZED_CANCELLATION', 'bad-subject-assignment-teacher', 'bad-source-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected source subject/assignment/teacher mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;

    FOREACH bad_type IN ARRAY ARRAY['AUTHORIZED_CANCELLATION'::"OperationalLessonDispositionType", 'ABSENCE_NO_REPLACEMENT'::"OperationalLessonDispositionType"] LOOP
        BEGIN
            INSERT INTO "operational_lesson_dispositions" ("academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type", "assigned_teacher_user_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
            VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-14', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', bad_type, 'd5c10000-0000-0000-0000-000000000003', 'bad-no-teacher-type-' || bad_type::text, 'bad-type-fp-' || bad_type::text, 'd5c10000-0000-0000-0000-000000000001');
            RAISE EXCEPTION 'Expected assigned teacher rejection for %', bad_type;
        EXCEPTION WHEN check_violation THEN NULL; END;
    END LOOP;

    BEGIN
        INSERT INTO "operational_lesson_dispositions" ("academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-14', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', 'SAME_SUBJECT_SUBSTITUTION', 'bad-sub-no-teacher', 'bad-sub-no-teacher-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected substitution without teacher rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;

    BEGIN
        INSERT INTO "operational_lesson_dispositions" ("academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type", "assigned_teacher_user_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-14', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', 'SAME_SUBJECT_SUBSTITUTION', 'd5c10000-0000-0000-0000-000000000003', 'bad-sub-evidence', 'bad-sub-evidence-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected substitution without evidence rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;

    BEGIN
        INSERT INTO "operational_lesson_dispositions" ("academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-14', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', 'DIFFERENT_SUBJECT_SUPERVISION', 'bad-supervision', 'bad-supervision-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected supervision without teacher/evidence rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;

    BEGIN
        INSERT INTO "operational_lesson_dispositions" ("academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-12', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', 'AUTHORIZED_CANCELLATION', 'active-conflict', 'active-conflict-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected second ACTIVE disposition rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

UPDATE "operational_lesson_dispositions"
SET "status" = 'REVERSED', "reversed_by_user_id" = 'd5c10000-0000-0000-0000-000000000001',
    "reversed_at" = TIMESTAMPTZ '2026-10-13 08:00+07', "reversal_reason" = 'Corrected disposition',
    "reverse_request_key" = 'disposition-reverse-1', "reverse_request_fingerprint" = 'disposition-reverse-fingerprint-1'
WHERE "id" = 'a6c10000-0000-0000-0000-000000000001';

INSERT INTO "operational_lesson_dispositions" (
    "id", "academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id",
    "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id",
    "disposition_type", "replaces_id", "create_request_key", "create_request_fingerprint", "created_by_user_id"
) VALUES (
    'a6c10000-0000-0000-0000-000000000002', 'a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001',
    '55c10000-0000-0000-0000-000000000001', DATE '2026-10-12', 'e5c10000-0000-0000-0000-000000000001',
    'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001',
    '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', 'AUTHORIZED_CANCELLATION',
    'a6c10000-0000-0000-0000-000000000001', 'disposition-create-2', 'disposition-fingerprint-2', 'd5c10000-0000-0000-0000-000000000001'
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "operational_lesson_dispositions" d
        JOIN "timetable_entries" e ON e."id" = d."timetable_entry_id"
        WHERE d."id" = 'a6c10000-0000-0000-0000-000000000001' AND d."status" = 'REVERSED'
    ) THEN RAISE EXCEPTION 'Reversed source history is no longer addressable'; END IF;

    BEGIN
        INSERT INTO "operational_lesson_dispositions" ("academic_year_id", "timetable_version_id", "timetable_entry_id", "source_civil_date", "academic_calendar_version_id", "time_slot_definition_id", "school_class_id", "subject_id", "teaching_assignment_id", "responsible_teacher_user_id", "disposition_type", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-20', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', 'AUTHORIZED_CANCELLATION', 'disposition-create-2', 'different-fingerprint', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected duplicate disposition request key rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

-- Valid make-up claim with exact PPCT obligation and target provenance.
INSERT INTO "makeup_teaching_schedules" (
    "id", "academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date",
    "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id",
    "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id",
    "ppct_version_id", "ppct_item_id", "source_disposition_id", "target_civil_date", "target_academic_calendar_version_id",
    "target_time_slot_definition_id", "scheduled_teacher_user_id", "eligibility_checked_at", "eligibility_was_active",
    "eligibility_was_teaching_staff", "eligibility_same_subject", "eligibility_staff_subject_id",
    "create_request_key", "create_request_fingerprint", "created_by_user_id"
) VALUES (
    'b6c10000-0000-0000-0000-000000000001', 'a5c10000-0000-0000-0000-000000000001',
    '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-12',
    'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001',
    'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001',
    '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002',
    '95c10000-0000-0000-0000-000000000001', '65c10000-0000-0000-0000-000000000001',
    '75c10000-0000-0000-0000-000000000001', '85c10000-0000-0000-0000-000000000001', 'a6c10000-0000-0000-0000-000000000001',
    DATE '2026-10-19', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000002',
    'd5c10000-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-10-13 09:00+07', true, true, true,
    '15c10000-0000-0000-0000-000000000001', 'makeup-create-1', 'makeup-fingerprint-1', 'd5c10000-0000-0000-0000-000000000001'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "makeup_teaching_schedules" ("academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date", "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id", "target_civil_date", "target_academic_calendar_version_id", "target_time_slot_definition_id", "scheduled_teacher_user_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff", "eligibility_same_subject", "eligibility_staff_subject_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-12', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', '95c10000-0000-0000-0000-000000000002', '65c10000-0000-0000-0000-000000000002', '75c10000-0000-0000-0000-000000000002', '85c10000-0000-0000-0000-000000000002', DATE '2026-10-20', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000002', 'd5c10000-0000-0000-0000-000000000003', now(), true, true, true, '15c10000-0000-0000-0000-000000000001', 'bad-association-scope', 'bad-association-scope-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected wrong PPCT association class rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;

    BEGIN
        INSERT INTO "makeup_teaching_schedules" ("academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date", "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id", "target_civil_date", "target_academic_calendar_version_id", "target_time_slot_definition_id", "scheduled_teacher_user_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff", "eligibility_same_subject", "eligibility_staff_subject_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-12', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', '95c10000-0000-0000-0000-000000000001', '65c10000-0000-0000-0000-000000000002', '75c10000-0000-0000-0000-000000000002', '85c10000-0000-0000-0000-000000000002', DATE '2026-10-20', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000002', 'd5c10000-0000-0000-0000-000000000003', now(), true, true, true, '15c10000-0000-0000-0000-000000000001', 'bad-ppct-bundle', 'bad-ppct-bundle-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected wrong PPCT version/plan/item rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;

    BEGIN
        INSERT INTO "makeup_teaching_schedules" ("academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date", "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id", "target_civil_date", "target_academic_calendar_version_id", "target_time_slot_definition_id", "scheduled_teacher_user_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff", "eligibility_same_subject", "eligibility_staff_subject_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000001', DATE '2026-10-12', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000001', 'c5c10000-0000-0000-0000-000000000001', 'b5c10000-0000-0000-0000-000000000001', '35c10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', '95c10000-0000-0000-0000-000000000001', '65c10000-0000-0000-0000-000000000001', '75c10000-0000-0000-0000-000000000001', '85c10000-0000-0000-0000-000000000001', DATE '2026-10-20', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000002', 'd5c10000-0000-0000-0000-000000000003', now(), true, true, true, '15c10000-0000-0000-0000-000000000001', 'duplicate-active-obligation', 'duplicate-active-obligation-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected duplicate ACTIVE make-up claim rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;

    BEGIN
        INSERT INTO "makeup_teaching_schedules" ("academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date", "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id", "target_civil_date", "target_academic_calendar_version_id", "target_time_slot_definition_id", "scheduled_teacher_user_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff", "eligibility_same_subject", "eligibility_staff_subject_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', '45c10000-0000-0000-0000-000000000001', '55c10000-0000-0000-0000-000000000002', DATE '2026-10-12', 'e5c10000-0000-0000-0000-000000000001', 'f5c10000-0000-0000-0000-000000000002', 'c5c10000-0000-0000-0000-000000000002', 'b5c10000-0000-0000-0000-000000000002', '35c10000-0000-0000-0000-000000000002', 'd5c10000-0000-0000-0000-000000000004', '95c10000-0000-0000-0000-000000000002', '65c10000-0000-0000-0000-000000000002', '75c10000-0000-0000-0000-000000000002', '85c10000-0000-0000-0000-000000000002', DATE '2026-10-20', 'e5c10000-0000-0000-0000-000000000002', 'f5c10000-0000-0000-0000-000000000003', 'd5c10000-0000-0000-0000-000000000004', now(), true, true, true, '15c10000-0000-0000-0000-000000000002', 'cross-year-target', 'cross-year-target-fp', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected cross-year target calendar/slot rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

UPDATE "makeup_teaching_schedules"
SET "status" = 'REVERSED', "reversed_by_user_id" = 'd5c10000-0000-0000-0000-000000000001',
    "reversed_at" = TIMESTAMPTZ '2026-10-14 08:00+07', "reversal_reason" = 'Corrected make-up target',
    "reverse_request_key" = 'makeup-reverse-1', "reverse_request_fingerprint" = 'makeup-reverse-fingerprint-1'
WHERE "id" = 'b6c10000-0000-0000-0000-000000000001';

INSERT INTO "makeup_teaching_schedules" (
    "id", "academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date", "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id", "source_disposition_id", "target_civil_date", "target_academic_calendar_version_id", "target_time_slot_definition_id", "scheduled_teacher_user_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff", "eligibility_same_subject", "eligibility_staff_subject_id", "replaces_id", "create_request_key", "create_request_fingerprint", "created_by_user_id"
) SELECT
    'b6c10000-0000-0000-0000-000000000002', "academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date", "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id", "source_disposition_id", DATE '2026-10-26', "target_academic_calendar_version_id", "target_time_slot_definition_id", "scheduled_teacher_user_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff", "eligibility_same_subject", "eligibility_staff_subject_id", "id", 'makeup-create-2', 'makeup-fingerprint-2', "created_by_user_id"
FROM "makeup_teaching_schedules" WHERE "id" = 'b6c10000-0000-0000-0000-000000000001';

DO $$
BEGIN
    BEGIN
        INSERT INTO "calendar_exceptions" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "time_selector", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5c10000-0000-0000-0000-000000000001', 'e5c10000-0000-0000-0000-000000000001', DATE '2026-11-01', 'SCHOOL_WIDE', 'WHOLE_DAY', 'calendar-create-1', 'new-fingerprint', 'd5c10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected duplicate calendar request key rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;

    BEGIN
        INSERT INTO "makeup_teaching_schedules" ("academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date", "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id", "target_civil_date", "target_academic_calendar_version_id", "target_time_slot_definition_id", "scheduled_teacher_user_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff", "eligibility_same_subject", "eligibility_staff_subject_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        SELECT "academic_year_id", "original_timetable_version_id", "original_timetable_entry_id", "original_civil_date", "original_academic_calendar_version_id", "original_time_slot_definition_id", "school_class_id", "subject_id", "original_teaching_assignment_id", "responsible_teacher_user_id", "ppct_class_association_id", "ppct_plan_id", "ppct_version_id", "ppct_item_id", DATE '2026-11-02', "target_academic_calendar_version_id", "target_time_slot_definition_id", "scheduled_teacher_user_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff", "eligibility_same_subject", "eligibility_staff_subject_id", 'makeup-create-2', 'different-fingerprint', "created_by_user_id"
        FROM "makeup_teaching_schedules" WHERE "id" = 'b6c10000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected duplicate make-up request key rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;

    BEGIN DELETE FROM "timetable_entries" WHERE "id" = '55c10000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected source entry deletion restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "ppct_item_revisions" WHERE "ppct_version_id" = '75c10000-0000-0000-0000-000000000001' AND "ppct_item_id" = '85c10000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected PPCT item deletion restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "calendar_exceptions" WHERE "id" = '05c10000-0000-0000-0000-000000000002'; RAISE EXCEPTION 'Expected exact-slot parent deletion restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "operational_lesson_dispositions" WHERE "id" = 'a6c10000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected replacement/source disposition deletion restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

ROLLBACK;

SELECT 'Operational-overlay persistence schema verification PASS' AS result;
