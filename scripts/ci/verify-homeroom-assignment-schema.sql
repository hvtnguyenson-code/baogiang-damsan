\set ON_ERROR_STOP on

DO $$
DECLARE
    civil_date_count integer;
    instant_count integer;
BEGIN
    IF to_regclass('public.homeroom_assignments') IS NULL THEN
        RAISE EXCEPTION 'homeroom_assignments table is missing';
    END IF;

    SELECT count(*) INTO civil_date_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'homeroom_assignments'
      AND column_name IN ('valid_from', 'valid_until')
      AND data_type = 'date';
    IF civil_date_count <> 2 THEN
        RAISE EXCEPTION 'Homeroom-assignment boundaries must both use DATE';
    END IF;

    SELECT count(*) INTO instant_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'homeroom_assignments'
      AND column_name IN ('created_at', 'updated_at', 'reversed_at')
      AND data_type = 'timestamp with time zone';
    IF instant_count <> 3 THEN
        RAISE EXCEPTION 'Homeroom-assignment audit and reversal instants must use TIMESTAMPTZ';
    END IF;
END $$;

INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a3110000-0000-0000-0000-000000000001', 'HR-2026-2027', 'Homeroom 2026-2027'),
    ('a3110000-0000-0000-0000-000000000002', 'HR-2027-2028', 'Homeroom 2027-2028');

INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('c3110000-0000-0000-0000-000000000001', 'a3110000-0000-0000-0000-000000000001', 'HR10A1', 'Homeroom Class 10A1', 10),
    ('c3110000-0000-0000-0000-000000000002', 'a3110000-0000-0000-0000-000000000001', 'HR10A2', 'Homeroom Class 10A2', 10),
    ('c3110000-0000-0000-0000-000000000003', 'a3110000-0000-0000-0000-000000000001', 'HR10A3', 'Homeroom Class 10A3', 10),
    ('c3110000-0000-0000-0000-000000000004', 'a3110000-0000-0000-0000-000000000002', 'HR11A1', 'Homeroom Class 11A1', 11);

INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('d3110000-0000-0000-0000-000000000001', 'hr.teacher.one', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d3110000-0000-0000-0000-000000000002', 'hr.teacher.two', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d3110000-0000-0000-0000-000000000003', 'hr.actor', 'not-a-real-password-hash', 'ACTIVE', false);

-- A normal bounded ACTIVE assertion succeeds.
INSERT INTO "homeroom_assignments" (
    "id", "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "created_by_user_id"
) VALUES (
    'b3110000-0000-0000-0000-000000000001',
    'a3110000-0000-0000-0000-000000000001',
    'c3110000-0000-0000-0000-000000000001',
    'd3110000-0000-0000-0000-000000000001',
    DATE '2026-09-01', DATE '2026-12-31',
    'd3110000-0000-0000-0000-000000000003'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "homeroom_assignments" (
            "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "created_by_user_id"
        ) VALUES (
            'a3110000-0000-0000-0000-000000000001',
            'c3110000-0000-0000-0000-000000000004',
            'd3110000-0000-0000-0000-000000000001',
            DATE '2026-09-01', DATE '2026-12-31',
            'd3110000-0000-0000-0000-000000000003'
        );
        RAISE EXCEPTION 'Expected class/year mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "homeroom_assignments" (
            "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "created_by_user_id"
        ) VALUES (
            'a3110000-0000-0000-0000-000000000001',
            'c3110000-0000-0000-0000-000000000001',
            'd3110000-0000-0000-0000-000000000002',
            DATE '2026-10-01', DATE '2026-09-30',
            'd3110000-0000-0000-0000-000000000003'
        );
        RAISE EXCEPTION 'Expected invalid inclusive date range rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "homeroom_assignments" (
            "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "created_by_user_id"
        ) VALUES (
            'a3110000-0000-0000-0000-000000000001',
            'c3110000-0000-0000-0000-000000000001',
            'd3110000-0000-0000-0000-000000000002',
            DATE '2026-10-01', DATE '2027-01-15',
            'd3110000-0000-0000-0000-000000000003'
        );
        RAISE EXCEPTION 'Expected same-class overlap rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "homeroom_assignments" (
            "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "created_by_user_id"
        ) VALUES (
            'a3110000-0000-0000-0000-000000000001',
            'c3110000-0000-0000-0000-000000000001',
            'd3110000-0000-0000-0000-000000000002',
            DATE '2026-12-31', DATE '2026-12-31',
            'd3110000-0000-0000-0000-000000000003'
        );
        RAISE EXCEPTION 'Expected same-day inclusive boundary overlap rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;
END $$;

-- Starting on the next civil day is valid.
INSERT INTO "homeroom_assignments" (
    "id", "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "created_by_user_id"
) VALUES (
    'b3110000-0000-0000-0000-000000000002',
    'a3110000-0000-0000-0000-000000000001',
    'c3110000-0000-0000-0000-000000000001',
    'd3110000-0000-0000-0000-000000000002',
    DATE '2027-01-01', DATE '2027-05-31',
    'd3110000-0000-0000-0000-000000000003'
);

-- An open-ended ACTIVE assertion blocks a later overlap.
INSERT INTO "homeroom_assignments" (
    "id", "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "created_by_user_id"
) VALUES (
    'b3110000-0000-0000-0000-000000000003',
    'a3110000-0000-0000-0000-000000000001',
    'c3110000-0000-0000-0000-000000000002',
    'd3110000-0000-0000-0000-000000000001',
    DATE '2026-09-01', NULL,
    'd3110000-0000-0000-0000-000000000003'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "homeroom_assignments" (
            "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "created_by_user_id"
        ) VALUES (
            'a3110000-0000-0000-0000-000000000001',
            'c3110000-0000-0000-0000-000000000002',
            'd3110000-0000-0000-0000-000000000002',
            DATE '2027-01-01', DATE '2027-05-31',
            'd3110000-0000-0000-0000-000000000003'
        );
        RAISE EXCEPTION 'Expected open-ended assignment overlap rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;
END $$;

-- The same teacher may concurrently be GVCN of another class.
INSERT INTO "homeroom_assignments" (
    "id", "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "created_by_user_id"
) VALUES (
    'b3110000-0000-0000-0000-000000000004',
    'a3110000-0000-0000-0000-000000000001',
    'c3110000-0000-0000-0000-000000000003',
    'd3110000-0000-0000-0000-000000000001',
    DATE '2026-09-01', DATE '2026-12-31',
    'd3110000-0000-0000-0000-000000000003'
);

-- Reversing retained evidence releases it from the ACTIVE no-overlap set.
UPDATE "homeroom_assignments"
SET "status" = 'REVERSED',
    "reversed_by_user_id" = 'd3110000-0000-0000-0000-000000000003',
    "reversed_at" = CURRENT_TIMESTAMP,
    "reversal_reason" = 'Entered for the wrong teacher'
WHERE "id" = 'b3110000-0000-0000-0000-000000000004';

INSERT INTO "homeroom_assignments" (
    "id", "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "replaces_id", "created_by_user_id"
) VALUES (
    'b3110000-0000-0000-0000-000000000005',
    'a3110000-0000-0000-0000-000000000001',
    'c3110000-0000-0000-0000-000000000003',
    'd3110000-0000-0000-0000-000000000002',
    DATE '2026-09-01', DATE '2026-12-31',
    'b3110000-0000-0000-0000-000000000004',
    'd3110000-0000-0000-0000-000000000003'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "homeroom_assignments" (
            "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "created_by_user_id", "reversal_reason"
        ) VALUES (
            'a3110000-0000-0000-0000-000000000001',
            'c3110000-0000-0000-0000-000000000003',
            'd3110000-0000-0000-0000-000000000002',
            DATE '2027-01-01', DATE '2027-01-31',
            'd3110000-0000-0000-0000-000000000003', 'Contradictory active evidence'
        );
        RAISE EXCEPTION 'Expected ACTIVE reversal-evidence rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "homeroom_assignments" (
            "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "status", "created_by_user_id", "reversed_by_user_id", "reversed_at", "reversal_reason"
        ) VALUES (
            'a3110000-0000-0000-0000-000000000001',
            'c3110000-0000-0000-0000-000000000003',
            'd3110000-0000-0000-0000-000000000002',
            DATE '2027-02-01', DATE '2027-02-28', 'REVERSED',
            'd3110000-0000-0000-0000-000000000003',
            'd3110000-0000-0000-0000-000000000003', CURRENT_TIMESTAMP, '   '
        );
        RAISE EXCEPTION 'Expected blank reversal-reason rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "homeroom_assignments" (
            "id", "academic_year_id", "school_class_id", "teacher_user_id", "valid_from", "valid_until", "replaces_id", "created_by_user_id"
        ) VALUES (
            'b3110000-0000-0000-0000-000000000006',
            'a3110000-0000-0000-0000-000000000001',
            'c3110000-0000-0000-0000-000000000003',
            'd3110000-0000-0000-0000-000000000002',
            DATE '2027-03-01', DATE '2027-03-31',
            'b3110000-0000-0000-0000-000000000006',
            'd3110000-0000-0000-0000-000000000003'
        );
        RAISE EXCEPTION 'Expected self-replacement rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- A later disabled status preserves the retained historical identity.
UPDATE "users" SET "status" = 'DISABLED'
WHERE "id" = 'd3110000-0000-0000-0000-000000000001';

DO $$
DECLARE
    retained_count integer;
BEGIN
    SELECT count(*) INTO retained_count
    FROM "homeroom_assignments"
    WHERE "teacher_user_id" = 'd3110000-0000-0000-0000-000000000001';
    IF retained_count <> 3 THEN
        RAISE EXCEPTION 'Disabling a teacher must not remove or invalidate retained homeroom assignments';
    END IF;

    BEGIN
        DELETE FROM "academic_years" WHERE "id" = 'a3110000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected referenced AcademicYear delete rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM "classes" WHERE "id" = 'c3110000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected referenced SchoolClass delete rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM "users" WHERE "id" = 'd3110000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected referenced teacher User delete rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM "homeroom_assignments" WHERE "id" = 'b3110000-0000-0000-0000-000000000004';
        RAISE EXCEPTION 'Expected referenced replacement-history parent delete rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

SELECT 'Homeroom assignment PostgreSQL verification PASS.' AS result;
