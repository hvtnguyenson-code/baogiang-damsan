\set ON_ERROR_STOP on

DO $$
DECLARE
    wall_clock_count integer;
    instant_count integer;
BEGIN
    IF to_regclass('public.time_slot_definitions') IS NULL THEN
        RAISE EXCEPTION 'time_slot_definitions table is missing';
    END IF;

    SELECT count(*) INTO wall_clock_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'time_slot_definitions'
      AND column_name IN ('start_time', 'end_time')
      AND data_type = 'time without time zone'
      AND datetime_precision = 0;
    IF wall_clock_count <> 2 THEN
        RAISE EXCEPTION 'Time-slot boundaries must both use TIME(0) WITHOUT TIME ZONE';
    END IF;

    SELECT count(*) INTO instant_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'time_slot_definitions'
      AND column_name IN ('created_at', 'updated_at')
      AND data_type = 'timestamp with time zone';
    IF instant_count <> 2 THEN
        RAISE EXCEPTION 'Time-slot audit instants must use TIMESTAMPTZ';
    END IF;
END $$;

-- This year intentionally has no AcademicCalendarVersion.
INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a4000000-0000-0000-0000-000000000001', 'TS-2026-2027', 'Time-slot 2026-2027');

-- Valid active slot and an exact sequential half-open boundary.
INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "revision",
    "display_label", "start_time", "end_time"
) VALUES
    (
        '40000000-0000-0000-0000-000000000001',
        'a4000000-0000-0000-0000-000000000001',
        'MONDAY', 'MORNING', 1, 1, 'Period 1', TIME '07:00:00', TIME '07:45:00'
    ),
    (
        '40000000-0000-0000-0000-000000000002',
        'a4000000-0000-0000-0000-000000000001',
        'MONDAY', 'MORNING', 2, 1, 'Period 2', TIME '07:45:00', TIME '08:30:00'
    );

DO $$
BEGIN
    BEGIN
        INSERT INTO "time_slot_definitions" (
            "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time"
        ) VALUES (
            'a4000000-0000-0000-0000-000000000001',
            'MONDAY', 'MORNING', 90, 'Overlapping period', TIME '07:30:00', TIME '08:15:00'
        );
        RAISE EXCEPTION 'Expected true active overlap rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "time_slot_definitions" (
            "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time"
        ) VALUES (
            'a4000000-0000-0000-0000-000000000001',
            'MONDAY', 'AFTERNOON', 1, 'Mislabelled afternoon', TIME '07:15:00', TIME '07:30:00'
        );
        RAISE EXCEPTION 'Expected overlap rejection across session labels';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "time_slot_definitions" (
            "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time"
        ) VALUES (
            'a4000000-0000-0000-0000-000000000001',
            'MONDAY', 'MORNING', 91, 'Period 1', TIME '10:00:00', TIME '10:45:00'
        );
        RAISE EXCEPTION 'Expected active display-label uniqueness rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;

-- The same wall-clock interval on another weekday is valid.
INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time"
) VALUES (
    '40000000-0000-0000-0000-000000000003',
    'a4000000-0000-0000-0000-000000000001',
    'TUESDAY', 'MORNING', 1, 'Period 1', TIME '07:00:00', TIME '07:45:00'
);

-- One inactive historical revision and one current revision of the same logical coordinate coexist.
INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "revision",
    "display_label", "start_time", "end_time", "is_active"
) VALUES
    (
        '40000000-0000-0000-0000-000000000004',
        'a4000000-0000-0000-0000-000000000001',
        'MONDAY', 'MORNING', 3, 1, 'Period 3 old', TIME '08:45:00', TIME '09:30:00', false
    ),
    (
        '40000000-0000-0000-0000-000000000005',
        'a4000000-0000-0000-0000-000000000001',
        'MONDAY', 'MORNING', 3, 2, 'Period 3', TIME '08:45:00', TIME '09:30:00', true
    );

DO $$
DECLARE
    i integer;
    invalid_label text;
BEGIN
    BEGIN
        INSERT INTO "time_slot_definitions" (
            "academic_year_id", "weekday", "session", "ordinal", "revision",
            "display_label", "start_time", "end_time", "is_active"
        ) VALUES (
            'a4000000-0000-0000-0000-000000000001',
            'MONDAY', 'MORNING', 3, 3, 'Period 3 current duplicate', TIME '10:00:00', TIME '10:45:00', true
        );
        RAISE EXCEPTION 'Expected two active revisions for one logical coordinate rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "time_slot_definitions" (
            "academic_year_id", "weekday", "session", "ordinal", "revision",
            "display_label", "start_time", "end_time", "is_active"
        ) VALUES (
            'a4000000-0000-0000-0000-000000000001',
            'MONDAY', 'MORNING', 3, 2, 'Duplicate revision', TIME '10:00:00', TIME '10:45:00', false
        );
        RAISE EXCEPTION 'Expected duplicate logical revision rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "time_slot_definitions" (
            "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time"
        ) VALUES (
            'a4000000-0000-0000-0000-000000000001',
            'WEDNESDAY', 'MORNING', 10, 'Equal range', TIME '10:00:00', TIME '10:00:00'
        );
        RAISE EXCEPTION 'Expected equal time boundary rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "time_slot_definitions" (
            "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time"
        ) VALUES (
            'a4000000-0000-0000-0000-000000000001',
            'WEDNESDAY', 'MORNING', 11, 'Reverse range', TIME '11:00:00', TIME '10:00:00'
        );
        RAISE EXCEPTION 'Expected reverse time boundary rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    FOREACH i IN ARRAY ARRAY[0, -1] LOOP
        BEGIN
            INSERT INTO "time_slot_definitions" (
                "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time"
            ) VALUES (
                'a4000000-0000-0000-0000-000000000001',
                'WEDNESDAY', 'MORNING', i, 'Invalid ordinal ' || i, TIME '10:00:00', TIME '10:45:00'
            );
            RAISE EXCEPTION 'Expected invalid ordinal rejection for %', i;
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;

    FOREACH i IN ARRAY ARRAY[0, -1] LOOP
        BEGIN
            INSERT INTO "time_slot_definitions" (
                "academic_year_id", "weekday", "session", "ordinal", "revision",
                "display_label", "start_time", "end_time", "is_active"
            ) VALUES (
                'a4000000-0000-0000-0000-000000000001',
                'WEDNESDAY', 'MORNING', 20 + abs(i), i,
                'Invalid revision ' || i, TIME '11:00:00', TIME '11:45:00', false
            );
            RAISE EXCEPTION 'Expected invalid revision rejection for %', i;
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;

    FOREACH invalid_label IN ARRAY ARRAY['', ' Untrimmed', 'Untrimmed '] LOOP
        BEGIN
            INSERT INTO "time_slot_definitions" (
                "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time", "is_active"
            ) VALUES (
                'a4000000-0000-0000-0000-000000000001',
                'WEDNESDAY', 'MORNING', 30, invalid_label, TIME '12:00:00', TIME '12:45:00', false
            );
            RAISE EXCEPTION 'Expected blank or untrimmed label rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;

    BEGIN
        INSERT INTO "time_slot_definitions" (
            "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time",
            "allow_regular_teaching", "allow_makeup_teaching", "allow_self_study"
        ) VALUES (
            'a4000000-0000-0000-0000-000000000001',
            'WEDNESDAY', 'MORNING', 40, 'No usage', TIME '12:00:00', TIME '12:45:00', false, false, false
        );
        RAISE EXCEPTION 'Expected all-false usage rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "time_slot_definitions" (
            "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time"
        ) VALUES (
            'a4999999-0000-0000-0000-000000000999',
            'FRIDAY', 'MORNING', 1, 'Missing parent', TIME '07:00:00', TIME '07:45:00'
        );
        RAISE EXCEPTION 'Expected missing AcademicYear rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

-- Explicit usage variants are independently valid.
INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time",
    "allow_regular_teaching", "allow_makeup_teaching", "allow_self_study"
) VALUES
    (
        '40000000-0000-0000-0000-000000000006',
        'a4000000-0000-0000-0000-000000000001',
        'WEDNESDAY', 'AFTERNOON', 1, 'Make-up only', TIME '13:00:00', TIME '13:45:00',
        false, true, false
    ),
    (
        '40000000-0000-0000-0000-000000000007',
        'a4000000-0000-0000-0000-000000000001',
        'THURSDAY', 'EVENING', 1, 'Self-study only', TIME '19:00:00', TIME '19:45:00',
        false, false, true
    );

-- Inactive history may overlap the current active grid.
INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time", "is_active"
) VALUES (
    '40000000-0000-0000-0000-000000000008',
    'a4000000-0000-0000-0000-000000000001',
    'MONDAY', 'EVENING', 50, 'Historical overlap', TIME '07:30:00', TIME '08:15:00', false
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "academic_calendar_versions"
        WHERE "academic_year_id" = 'a4000000-0000-0000-0000-000000000001'
    ) THEN
        RAISE EXCEPTION 'Time-slot fixture must not depend on an AcademicCalendarVersion';
    END IF;

    BEGIN
        DELETE FROM "academic_years" WHERE "id" = 'a4000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected referenced AcademicYear delete rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

SELECT 'Time-slot PostgreSQL verification PASS.' AS result;
