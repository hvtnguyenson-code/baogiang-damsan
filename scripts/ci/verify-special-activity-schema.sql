\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    enum_values text[];
BEGIN
    IF to_regclass('public.special_activities') IS NULL
       OR to_regclass('public.special_activity_time_slots') IS NULL
       OR to_regclass('public.special_activity_class_targets') IS NULL
       OR to_regclass('public.special_activity_staffing') IS NULL THEN
        RAISE EXCEPTION 'Special Activity tables are missing';
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SpecialActivityStatus';
    IF enum_values <> ARRAY['ACTIVE', 'REVERSED'] THEN
        RAISE EXCEPTION 'Unexpected SpecialActivityStatus values: %', enum_values;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SpecialActivityScope';
    IF enum_values <> ARRAY['SCHOOL_WIDE', 'GRADE', 'CLASS'] THEN
        RAISE EXCEPTION 'Unexpected SpecialActivityScope values: %', enum_values;
    END IF;

    IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'special_activities'
          AND column_name = 'civil_date' AND data_type = 'date') <> 1 THEN
        RAISE EXCEPTION 'SpecialActivity civil date must use DATE';
    END IF;

    IF (SELECT count(*) FROM pg_constraint
        WHERE conname IN (
          'special_activities_scope_shape_check',
          'special_activities_lifecycle_shape_check',
          'special_activities_request_identity_check',
          'special_activities_bounded_text_check',
          'special_activities_no_self_replacement_check',
          'special_activity_staffing_eligibility_shape_check'
        )) <> 6 THEN
        RAISE EXCEPTION 'Required Special Activity CHECK constraints are missing';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid IN (
            'special_activities'::regclass, 'special_activity_time_slots'::regclass,
            'special_activity_class_targets'::regclass, 'special_activity_staffing'::regclass
          )
          AND confdeltype <> 'r'
    ) THEN
        RAISE EXCEPTION 'Every Special Activity history FK must use ON DELETE RESTRICT';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgrelid IN (
            'special_activities'::regclass, 'special_activity_time_slots'::regclass,
            'special_activity_class_targets'::regclass, 'special_activity_staffing'::regclass
          )
    ) THEN
        RAISE EXCEPTION 'Special Activity persistence must not use triggers';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid IN (
            'special_activities'::regclass, 'special_activity_time_slots'::regclass,
            'special_activity_class_targets'::regclass, 'special_activity_staffing'::regclass
        )
          AND i.indpred IS NOT NULL
    ) OR EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid IN (
            'special_activities'::regclass, 'special_activity_time_slots'::regclass,
            'special_activity_class_targets'::regclass, 'special_activity_staffing'::regclass
        )
          AND contype = 'x'
    ) THEN
        RAISE EXCEPTION 'Special Activity persistence must not own partial or exclusion collision constraints';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('special_activities', 'special_activity_time_slots', 'special_activity_class_targets', 'special_activity_staffing')
          AND column_name ~* '^(ppct|subject_id|teaching_assignment|completed|completion|progress|debt|execution|actual_teacher|content|report|snapshot|room|location|category|type|attendance|student|enrollment|notification|approval)'
    ) THEN
        RAISE EXCEPTION 'Forbidden downstream coupling found in Special Activity persistence';
    END IF;
END $$;

INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a5d10000-0000-0000-0000-000000000001', 'SA-2026-2027', 'Special Activity year A'),
    ('a5d10000-0000-0000-0000-000000000002', 'SA-2027-2028', 'Special Activity year B');
INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('d5d10000-0000-0000-0000-000000000001', 'activity.actor', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d5d10000-0000-0000-0000-000000000002', 'activity.teacher', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d5d10000-0000-0000-0000-000000000003', 'activity.other', 'not-a-real-password-hash', 'ACTIVE', false);
INSERT INTO "staff_profiles" ("id", "user_id", "display_name", "is_teaching_staff") VALUES
    ('b5d10000-0000-0000-0000-000000000001', 'd5d10000-0000-0000-0000-000000000002', 'Activity teacher', true),
    ('b5d10000-0000-0000-0000-000000000002', 'd5d10000-0000-0000-0000-000000000003', 'Activity other', true);
INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('c5d10000-0000-0000-0000-000000000001', 'a5d10000-0000-0000-0000-000000000001', 'SA10A1', 'Activity class A', 10),
    ('c5d10000-0000-0000-0000-000000000002', 'a5d10000-0000-0000-0000-000000000002', 'SA11B1', 'Activity class B', 11);
INSERT INTO "academic_calendar_versions" (
    "id", "academic_year_id", "version_number", "start_date", "end_date", "official_week_count", "reserve_week_count", "teaching_weekdays"
) VALUES
    ('e5d10000-0000-0000-0000-000000000001', 'a5d10000-0000-0000-0000-000000000001', 1, DATE '2026-09-01', DATE '2027-05-31', 35, 1, ARRAY['MONDAY'::"AcademicWeekday"]),
    ('e5d10000-0000-0000-0000-000000000002', 'a5d10000-0000-0000-0000-000000000002', 1, DATE '2027-09-01', DATE '2028-05-31', 35, 1, ARRAY['MONDAY'::"AcademicWeekday"]);
INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time"
) VALUES
    ('f5d10000-0000-0000-0000-000000000001', 'a5d10000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 1, 'Activity slot A', TIME '07:00', TIME '07:45'),
    ('f5d10000-0000-0000-0000-000000000002', 'a5d10000-0000-0000-0000-000000000002', 'MONDAY', 'MORNING', 1, 'Activity slot B', TIME '07:00', TIME '07:45');

INSERT INTO "special_activities" (
    "id", "academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "school_class_id", "title",
    "grade_level", "create_request_key", "create_request_fingerprint", "created_by_user_id"
) VALUES
    ('05d10000-0000-0000-0000-000000000001', 'a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-05', 'SCHOOL_WIDE', NULL, 'School ceremony', NULL, 'activity-create-1', 'activity-fingerprint-1', 'd5d10000-0000-0000-0000-000000000001'),
    ('05d10000-0000-0000-0000-000000000002', 'a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-12', 'CLASS', 'c5d10000-0000-0000-0000-000000000001', 'Class activity', NULL, 'activity-create-2', 'activity-fingerprint-2', 'd5d10000-0000-0000-0000-000000000001'),
    ('05d10000-0000-0000-0000-000000000003', 'a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-19', 'GRADE', NULL, 'Grade activity', 10, 'activity-create-3', 'activity-fingerprint-3', 'd5d10000-0000-0000-0000-000000000001'),
    ('05d10000-0000-0000-0000-000000000004', 'a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-26', 'SCHOOL_WIDE', NULL, 'Reversed activity', NULL, 'activity-create-4', 'activity-fingerprint-4', 'd5d10000-0000-0000-0000-000000000001');
UPDATE "special_activities"
SET "status" = 'REVERSED',
    "reversed_by_user_id" = 'd5d10000-0000-0000-0000-000000000001',
    "reversed_at" = CURRENT_TIMESTAMP,
    "reversal_reason" = 'Corrected schedule',
    "reverse_request_key" = 'activity-reverse-4',
    "reverse_request_fingerprint" = 'activity-reverse-fingerprint-4'
WHERE "id" = '05d10000-0000-0000-0000-000000000004';
INSERT INTO "special_activity_time_slots" ("special_activity_id", "academic_year_id", "time_slot_definition_id") VALUES
    ('05d10000-0000-0000-0000-000000000001', 'a5d10000-0000-0000-0000-000000000001', 'f5d10000-0000-0000-0000-000000000001');
INSERT INTO "special_activity_class_targets" ("special_activity_id", "academic_year_id", "school_class_id") VALUES
    ('05d10000-0000-0000-0000-000000000002', 'a5d10000-0000-0000-0000-000000000001', 'c5d10000-0000-0000-0000-000000000001');
INSERT INTO "special_activity_staffing" (
    "special_activity_id", "scheduled_teacher_user_id", "staff_profile_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff"
) VALUES
    ('05d10000-0000-0000-0000-000000000001', 'd5d10000-0000-0000-0000-000000000002', 'b5d10000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP, true, true);

DO $$
BEGIN
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "grade_level", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-06', 'SCHOOL_WIDE', 10, 'Bad scope', 'bad-scope', 'bad-scope-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected invalid scope rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "grade_level", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-06', 'GRADE', 9, 'Bad grade', 'bad-grade', 'bad-grade-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected invalid GRADE level rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "grade_level", "school_class_id", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-06', 'GRADE', 10, 'c5d10000-0000-0000-0000-000000000001', 'Grade with class', 'grade-with-class', 'grade-with-class-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected GRADE class selector rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-06', 'CLASS', 'Class without selector', 'class-without-selector', 'class-without-selector-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected CLASS selector rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "school_class_id", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-06', 'CLASS', 'c5d10000-0000-0000-0000-000000000002', 'Cross-year class selector', 'cross-class-selector', 'cross-class-selector-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected cross-year CLASS selector rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000002', DATE '2026-10-06', 'SCHOOL_WIDE', 'Cross calendar', 'cross-calendar', 'cross-calendar-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected cross-year calendar rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activity_time_slots" ("special_activity_id", "academic_year_id", "time_slot_definition_id")
        VALUES ('05d10000-0000-0000-0000-000000000001', 'a5d10000-0000-0000-0000-000000000001', 'f5d10000-0000-0000-0000-000000000002');
        RAISE EXCEPTION 'Expected cross-year slot rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activity_time_slots" ("special_activity_id", "academic_year_id", "time_slot_definition_id")
        VALUES ('05d10000-0000-0000-0000-000000000001', 'a5d10000-0000-0000-0000-000000000001', 'f5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected duplicate activity slot rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activity_class_targets" ("special_activity_id", "academic_year_id", "school_class_id")
        VALUES ('05d10000-0000-0000-0000-000000000001', 'a5d10000-0000-0000-0000-000000000001', 'c5d10000-0000-0000-0000-000000000002');
        RAISE EXCEPTION 'Expected cross-year class rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activity_class_targets" ("special_activity_id", "academic_year_id", "school_class_id")
        VALUES ('05d10000-0000-0000-0000-000000000002', 'a5d10000-0000-0000-0000-000000000001', 'c5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected duplicate activity class target rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activity_staffing" ("special_activity_id", "scheduled_teacher_user_id", "staff_profile_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff")
        VALUES ('05d10000-0000-0000-0000-000000000001', 'd5d10000-0000-0000-0000-000000000003', 'b5d10000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP, true, true);
        RAISE EXCEPTION 'Expected staffing provenance rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activity_staffing" ("special_activity_id", "scheduled_teacher_user_id", "staff_profile_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff")
        VALUES ('05d10000-0000-0000-0000-000000000001', 'd5d10000-0000-0000-0000-000000000003', 'b5d10000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP, false, true);
        RAISE EXCEPTION 'Expected eligibility rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activity_staffing" ("special_activity_id", "scheduled_teacher_user_id", "staff_profile_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff")
        VALUES ('05d10000-0000-0000-0000-000000000001', 'd5d10000-0000-0000-0000-000000000002', 'b5d10000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP, true, true);
        RAISE EXCEPTION 'Expected duplicate scheduled teacher rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activity_staffing" ("special_activity_id", "scheduled_teacher_user_id", "staff_profile_id", "eligibility_checked_at", "eligibility_was_active", "eligibility_was_teaching_staff")
        VALUES ('05d10000-0000-0000-0000-000000000002', 'd5d10000-0000-0000-0000-000000000003', 'b5d10000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP, true, false);
        RAISE EXCEPTION 'Expected teaching-staff eligibility rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "status", "reversed_by_user_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'Bad lifecycle', 'ACTIVE', 'd5d10000-0000-0000-0000-000000000001', 'bad-active', 'bad-active-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected ACTIVE lifecycle rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "status", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'Bad reversed', 'REVERSED', 'bad-reversed', 'bad-reversed-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected REVERSED lifecycle rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', ' Bad text ', 'bad-text', 'bad-text-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected normalized title rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'Blank request key', ' ', 'blank-key-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected blank create request key rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'Blank request fingerprint', 'blank-fingerprint-key', ' ', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected blank create request fingerprint rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', ' ', 'blank-title-key', 'blank-title-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected blank title rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "note", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'Blank note', ' ', 'blank-note-key', 'blank-note-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected blank note rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'Duplicate request', 'activity-create-1', 'another-fingerprint', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected create request identity rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" (
            "academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "status",
            "reversed_by_user_id", "reversed_at", "reversal_reason", "reverse_request_key",
            "reverse_request_fingerprint", "create_request_key", "create_request_fingerprint", "created_by_user_id"
        ) VALUES (
            'a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-08',
            'SCHOOL_WIDE', 'Duplicate reverse request', 'REVERSED', 'd5d10000-0000-0000-0000-000000000001',
            CURRENT_TIMESTAMP, 'Correction', 'activity-reverse-4', 'another-reverse-fingerprint',
            'unique-create-for-reverse', 'unique-create-fingerprint', 'd5d10000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected reverse request identity rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        INSERT INTO "special_activities" ("id", "academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "replaces_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('05d10000-0000-0000-0000-000000000009', 'a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-07', 'SCHOOL_WIDE', 'Self replacement', '05d10000-0000-0000-0000-000000000009', 'self-replace', 'self-replace-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected self replacement rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
    INSERT INTO "special_activities" ("id", "academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "replaces_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
    VALUES ('05d10000-0000-0000-0000-000000000010', 'a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-08', 'SCHOOL_WIDE', 'Valid successor', '05d10000-0000-0000-0000-000000000001', 'valid-successor-key', 'valid-successor-fp', 'd5d10000-0000-0000-0000-000000000001');
    BEGIN
        INSERT INTO "special_activities" ("id", "academic_year_id", "academic_calendar_version_id", "civil_date", "scope", "title", "replaces_id", "create_request_key", "create_request_fingerprint", "created_by_user_id")
        VALUES ('05d10000-0000-0000-0000-000000000011', 'a5d10000-0000-0000-0000-000000000001', 'e5d10000-0000-0000-0000-000000000001', DATE '2026-10-09', 'SCHOOL_WIDE', 'Second successor', '05d10000-0000-0000-0000-000000000001', 'second-successor-key', 'second-successor-fp', 'd5d10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected replacement cardinality rejection';
    EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

DO $$
BEGIN
    BEGIN
        DELETE FROM "special_activities" WHERE "id" = '05d10000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected history delete restriction';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
ROLLBACK;
