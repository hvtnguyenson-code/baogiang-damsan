\set ON_ERROR_STOP on

DO $$
DECLARE
    civil_date_count integer;
    instant_count integer;
BEGIN
    IF to_regclass('public.teaching_assignments') IS NULL THEN
        RAISE EXCEPTION 'teaching_assignments table is missing';
    END IF;

    SELECT count(*) INTO civil_date_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teaching_assignments'
      AND column_name IN ('valid_from', 'valid_until')
      AND data_type = 'date';
    IF civil_date_count <> 2 THEN
        RAISE EXCEPTION 'Teaching-assignment boundaries must both use DATE';
    END IF;

    SELECT count(*) INTO instant_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teaching_assignments'
      AND column_name IN ('created_at', 'updated_at')
      AND data_type = 'timestamp with time zone';
    IF instant_count <> 2 THEN
        RAISE EXCEPTION 'Teaching-assignment audit instants must use TIMESTAMPTZ';
    END IF;
END $$;

INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a3000000-0000-0000-0000-000000000001', 'TA-2026-2027', 'Teaching assignment 2026-2027'),
    ('a3000000-0000-0000-0000-000000000002', 'TA-2027-2028', 'Teaching assignment 2027-2028');

INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('c3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'TA10A1', 'TA Class 10A1', 10),
    ('c3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'TA10A2', 'TA Class 10A2', 10),
    ('c3000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000002', 'TA11A1', 'TA Class 11A1', 11);

INSERT INTO "subjects" ("id", "code", "name") VALUES
    ('b3000000-0000-0000-0000-000000000001', 'TA_MATH', 'TA Mathematics'),
    ('b3000000-0000-0000-0000-000000000002', 'TA_LITERATURE', 'TA Literature');

INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('d3000000-0000-0000-0000-000000000001', 'ta.teacher.one', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d3000000-0000-0000-0000-000000000002', 'ta.teacher.two', 'not-a-real-password-hash', 'ACTIVE', false);

-- A normal inclusive assignment succeeds.
INSERT INTO "teaching_assignments" (
    "id", "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
) VALUES (
    '30000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000001',
    'b3000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000001',
    DATE '2026-09-01', DATE '2026-12-31'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "teaching_assignments" (
            "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
        ) VALUES (
            'a3000000-0000-0000-0000-000000000001',
            'c3000000-0000-0000-0000-000000000003',
            'b3000000-0000-0000-0000-000000000001',
            'd3000000-0000-0000-0000-000000000001',
            DATE '2026-09-01', DATE '2026-12-31'
        );
        RAISE EXCEPTION 'Expected class/year mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "teaching_assignments" (
            "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
        ) VALUES (
            'a3000000-0000-0000-0000-000000000001',
            'c3000000-0000-0000-0000-000000000001',
            'b3000000-0000-0000-0000-000000000002',
            'd3000000-0000-0000-0000-000000000001',
            DATE '2026-10-01', DATE '2026-09-30'
        );
        RAISE EXCEPTION 'Expected invalid inclusive date range rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "teaching_assignments" (
            "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
        ) VALUES (
            'a3000000-0000-0000-0000-000000000001',
            'c3000000-0000-0000-0000-000000000001',
            'b3000000-0000-0000-0000-000000000001',
            'd3000000-0000-0000-0000-000000000002',
            DATE '2026-10-01', DATE '2027-01-15'
        );
        RAISE EXCEPTION 'Expected overlapping class/subject assignment rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "teaching_assignments" (
            "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
        ) VALUES (
            'a3000000-0000-0000-0000-000000000001',
            'c3000000-0000-0000-0000-000000000001',
            'b3000000-0000-0000-0000-000000000001',
            'd3000000-0000-0000-0000-000000000002',
            DATE '2026-12-31', DATE '2026-12-31'
        );
        RAISE EXCEPTION 'Expected same-day inclusive boundary overlap rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;
END $$;

-- Starting the day after the inclusive end is valid.
INSERT INTO "teaching_assignments" (
    "id", "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
) VALUES (
    '30000000-0000-0000-0000-000000000002',
    'a3000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000001',
    'b3000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000002',
    DATE '2027-01-01', DATE '2027-05-31'
);

-- Same class with another subject is valid, including an open-ended interval.
INSERT INTO "teaching_assignments" (
    "id", "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
) VALUES (
    '30000000-0000-0000-0000-000000000003',
    'a3000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000001',
    'b3000000-0000-0000-0000-000000000002',
    'd3000000-0000-0000-0000-000000000001',
    DATE '2026-09-01', NULL
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "teaching_assignments" (
            "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
        ) VALUES (
            'a3000000-0000-0000-0000-000000000001',
            'c3000000-0000-0000-0000-000000000001',
            'b3000000-0000-0000-0000-000000000002',
            'd3000000-0000-0000-0000-000000000002',
            DATE '2027-01-01', DATE '2027-05-31'
        );
        RAISE EXCEPTION 'Expected open-ended assignment overlap rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;
END $$;

-- Same subject in another class and the same teacher in concurrent classes are both valid.
INSERT INTO "teaching_assignments" (
    "id", "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
) VALUES (
    '30000000-0000-0000-0000-000000000004',
    'a3000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000002',
    'b3000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000001',
    DATE '2026-09-01', DATE '2026-12-31'
);

DO $$
BEGIN
    BEGIN
        DELETE FROM "academic_years" WHERE "id" = 'a3000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected referenced AcademicYear delete rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM "classes" WHERE "id" = 'c3000000-0000-0000-0000-000000000002';
        RAISE EXCEPTION 'Expected referenced SchoolClass delete rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM "subjects" WHERE "id" = 'b3000000-0000-0000-0000-000000000002';
        RAISE EXCEPTION 'Expected referenced Subject delete rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM "users" WHERE "id" = 'd3000000-0000-0000-0000-000000000002';
        RAISE EXCEPTION 'Expected referenced teacher User delete rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

SELECT 'Teaching assignment PostgreSQL verification PASS.' AS result;
