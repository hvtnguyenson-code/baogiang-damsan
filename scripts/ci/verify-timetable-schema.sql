\set ON_ERROR_STOP on

DO $$
DECLARE
    enum_values text[];
    date_count integer;
    instant_count integer;
BEGIN
    IF to_regclass('public.timetable_versions') IS NULL OR to_regclass('public.timetable_entries') IS NULL THEN
        RAISE EXCEPTION 'Timetable foundation tables are missing';
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TimetableVersionStatus';
    IF enum_values <> ARRAY['DRAFT', 'VALIDATED', 'APPROVED', 'ACTIVE', 'SUPERSEDED'] THEN
        RAISE EXCEPTION 'Unexpected TimetableVersionStatus values: %', enum_values;
    END IF;

    SELECT count(*) INTO date_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'timetable_versions'
      AND column_name IN ('effective_from', 'effective_until')
      AND data_type = 'date';
    IF date_count <> 2 THEN
        RAISE EXCEPTION 'Timetable effectivity boundaries must use DATE';
    END IF;

    SELECT count(*) INTO instant_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'timetable_versions'
      AND column_name IN (
          'validated_at', 'approved_at', 'activated_at', 'superseded_at', 'created_at', 'updated_at'
      )
      AND data_type = 'timestamp with time zone';
    IF instant_count <> 6 THEN
        RAISE EXCEPTION 'Timetable lifecycle and audit instants must use TIMESTAMPTZ';
    END IF;
END $$;

INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a5000000-0000-0000-0000-000000000001', 'TT-2026-2027', 'Timetable year A'),
    ('a5000000-0000-0000-0000-000000000002', 'TT-2027-2028', 'Timetable year B');

INSERT INTO "academic_calendar_versions" (
    "id", "academic_year_id", "version_number", "start_date", "end_date",
    "official_week_count", "reserve_week_count", "teaching_weekdays"
) VALUES
    (
        'b5000000-0000-0000-0000-000000000001',
        'a5000000-0000-0000-0000-000000000001',
        1, DATE '2026-09-01', DATE '2027-05-31', 35, 2,
        ARRAY['MONDAY'::"AcademicWeekday", 'TUESDAY'::"AcademicWeekday"]
    ),
    (
        'b5000000-0000-0000-0000-000000000002',
        'a5000000-0000-0000-0000-000000000001',
        2, DATE '2026-09-01', DATE '2027-06-07', 36, 2,
        ARRAY['MONDAY'::"AcademicWeekday", 'TUESDAY'::"AcademicWeekday"]
    ),
    (
        'b5000000-0000-0000-0000-000000000003',
        'a5000000-0000-0000-0000-000000000002',
        1, DATE '2027-09-01', DATE '2028-05-31', 35, 2,
        ARRAY['MONDAY'::"AcademicWeekday", 'TUESDAY'::"AcademicWeekday"]
    );

INSERT INTO "academic_weeks" (
    "id", "calendar_version_id", "kind", "official_week_number", "display_label", "sort_order"
) VALUES
    ('c5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 'OFFICIAL', 1, 'TT A v1 week 1', 1),
    ('c5000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000002', 'OFFICIAL', 1, 'TT A v2 week 1', 1),
    ('c5000000-0000-0000-0000-000000000003', 'b5000000-0000-0000-0000-000000000003', 'OFFICIAL', 1, 'TT B week 1', 1);

INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "display_label", "start_time", "end_time", "is_active"
) VALUES
    ('d5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 1, 'TT period 1', TIME '07:00', TIME '07:45', true),
    ('d5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 2, 'TT period 2', TIME '07:45', TIME '08:30', true),
    -- Historical slot intentionally overlaps period 1; 04B resolves cross-slot real-time collisions.
    ('d5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 90, 'TT historical overlap', TIME '07:15', TIME '07:30', false),
    ('d5000000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-000000000002', 'MONDAY', 'MORNING', 1, 'TT B period 1', TIME '07:00', TIME '07:45', true);

INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('e5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'TT10A1', 'TT Class A1', 10),
    ('e5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', 'TT10A2', 'TT Class A2', 10),
    ('e5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000002', 'TT11A1', 'TT Class B1', 11);

INSERT INTO "subjects" ("id", "code", "name") VALUES
    ('f5000000-0000-0000-0000-000000000001', 'TT_MATH', 'TT Mathematics'),
    ('f5000000-0000-0000-0000-000000000002', 'TT_LITERATURE', 'TT Literature');

INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('55000000-0000-0000-0000-000000000001', 'tt.creator', 'not-a-real-password-hash', 'ACTIVE', false),
    ('55000000-0000-0000-0000-000000000002', 'tt.validator', 'not-a-real-password-hash', 'ACTIVE', false),
    ('55000000-0000-0000-0000-000000000003', 'tt.approver', 'not-a-real-password-hash', 'ACTIVE', false),
    ('55000000-0000-0000-0000-000000000004', 'tt.activator', 'not-a-real-password-hash', 'ACTIVE', false),
    ('55000000-0000-0000-0000-000000000005', 'tt.teacher.one', 'not-a-real-password-hash', 'ACTIVE', false),
    ('55000000-0000-0000-0000-000000000006', 'tt.teacher.two', 'not-a-real-password-hash', 'ACTIVE', false);

INSERT INTO "teaching_assignments" (
    "id", "academic_year_id", "school_class_id", "subject_id", "teacher_user_id", "valid_from", "valid_until"
) VALUES
    ('56000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000005', DATE '2026-09-01', DATE '2027-05-31'),
    ('56000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000006', DATE '2026-09-01', DATE '2027-05-31'),
    ('56000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000005', DATE '2026-09-01', DATE '2027-05-31'),
    ('56000000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000006', DATE '2026-09-01', DATE '2027-05-31'),
    ('56000000-0000-0000-0000-000000000005', 'a5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000003', 'f5000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000005', DATE '2027-09-01', DATE '2028-05-31');

-- DRAFT supports either no activation target or a complete target triplet.
INSERT INTO "timetable_versions" (
    "id", "academic_year_id", "version_number", "created_by_user_id", "content_checksum"
) VALUES (
    '57000000-0000-0000-0000-000000000001',
    'a5000000-0000-0000-0000-000000000001', 1,
    '55000000-0000-0000-0000-000000000001', NULL
);
INSERT INTO "timetable_versions" (
    "id", "academic_year_id", "version_number", "calendar_version_id",
    "effective_academic_week_id", "effective_from", "created_by_user_id", "content_checksum"
) VALUES (
    '57000000-0000-0000-0000-000000000002',
    'a5000000-0000-0000-0000-000000000001', 2,
    'b5000000-0000-0000-0000-000000000001',
    'c5000000-0000-0000-0000-000000000001', DATE '2026-09-01',
    '55000000-0000-0000-0000-000000000001', 'checksum-draft-a'
);
INSERT INTO "timetable_versions" (
    "id", "academic_year_id", "version_number", "created_by_user_id"
) VALUES (
    '57000000-0000-0000-0000-000000000003',
    'a5000000-0000-0000-0000-000000000002', 1,
    '55000000-0000-0000-0000-000000000001'
);

DO $$
DECLARE
    invalid_checksum text;
BEGIN
    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "calendar_version_id", "created_by_user_id"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 90,
            'b5000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected partial target triplet rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" ("academic_year_id", "version_number", "created_by_user_id")
        VALUES ('a5000000-0000-0000-0000-000000000001', 0, '55000000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected non-positive timetable version rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" ("academic_year_id", "version_number", "created_by_user_id")
        VALUES ('a5000000-0000-0000-0000-000000000001', 1, '55000000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected duplicate timetable version number rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "created_by_user_id"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 91,
            'b5000000-0000-0000-0000-000000000003',
            'c5000000-0000-0000-0000-000000000003', DATE '2026-09-01',
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected cross-year calendar snapshot rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "created_by_user_id"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 92,
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000002', DATE '2026-09-01',
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected effective week/calendar mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "created_by_user_id",
            "validated_by_user_id", "validated_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 93, 'DRAFT',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-08-01 08:00+07'
        );
        RAISE EXCEPTION 'Expected DRAFT lifecycle metadata rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "status", "created_by_user_id",
            "validated_by_user_id"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 94,
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2026-09-01', 'VALIDATED',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002'
        );
        RAISE EXCEPTION 'Expected validation actor/timestamp pair rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "created_by_user_id",
            "validated_by_user_id", "validated_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 95, 'VALIDATED',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-08-01 08:00+07'
        );
        RAISE EXCEPTION 'Expected non-DRAFT without activation target rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    FOREACH invalid_checksum IN ARRAY ARRAY['', ' leading', 'trailing '] LOOP
        BEGIN
            INSERT INTO "timetable_versions" (
                "academic_year_id", "version_number", "created_by_user_id", "content_checksum"
            ) VALUES (
                'a5000000-0000-0000-0000-000000000001', 96,
                '55000000-0000-0000-0000-000000000001', invalid_checksum
            );
            RAISE EXCEPTION 'Expected blank or untrimmed checksum rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;
END $$;

-- All five valid lifecycle shapes are represented by the drafts above and these rows.
INSERT INTO "timetable_versions" (
    "id", "academic_year_id", "version_number", "status", "calendar_version_id",
    "effective_academic_week_id", "effective_from", "created_by_user_id",
    "validated_by_user_id", "validated_at"
) VALUES (
    '57000000-0000-0000-0000-000000000004',
    'a5000000-0000-0000-0000-000000000001', 3, 'VALIDATED',
    'b5000000-0000-0000-0000-000000000001',
    'c5000000-0000-0000-0000-000000000001', DATE '2026-09-01',
    '55000000-0000-0000-0000-000000000001',
    '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-08-01 08:00+07'
);
INSERT INTO "timetable_versions" (
    "id", "academic_year_id", "version_number", "status", "calendar_version_id",
    "effective_academic_week_id", "effective_from", "created_by_user_id",
    "validated_by_user_id", "validated_at", "approved_by_user_id", "approved_at"
) VALUES (
    '57000000-0000-0000-0000-000000000005',
    'a5000000-0000-0000-0000-000000000001', 4, 'APPROVED',
    'b5000000-0000-0000-0000-000000000001',
    'c5000000-0000-0000-0000-000000000001', DATE '2026-09-01',
    '55000000-0000-0000-0000-000000000001',
    '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-08-01 08:00+07',
    '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-08-02 08:00+07'
);
INSERT INTO "timetable_versions" (
    "id", "academic_year_id", "version_number", "status", "calendar_version_id",
    "effective_academic_week_id", "effective_from", "created_by_user_id",
    "validated_by_user_id", "validated_at", "approved_by_user_id", "approved_at",
    "activated_by_user_id", "activated_at"
) VALUES (
    '57000000-0000-0000-0000-000000000006',
    'a5000000-0000-0000-0000-000000000001', 5, 'ACTIVE',
    'b5000000-0000-0000-0000-000000000001',
    'c5000000-0000-0000-0000-000000000001', DATE '2026-08-31',
    '55000000-0000-0000-0000-000000000001',
    '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-08-01 08:00+07',
    '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-08-02 08:00+07',
    '55000000-0000-0000-0000-000000000004', TIMESTAMPTZ '2026-08-03 08:00+07'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "created_by_user_id",
            "validated_by_user_id", "validated_at", "approved_by_user_id", "approved_at",
            "activated_by_user_id", "activated_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 97, 'ACTIVE',
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2027-01-01',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-12-01 08:00+07',
            '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-12-02 08:00+07',
            '55000000-0000-0000-0000-000000000004', TIMESTAMPTZ '2026-12-03 08:00+07'
        );
        RAISE EXCEPTION 'Expected one ACTIVE timetable per academic year';
    EXCEPTION WHEN unique_violation OR exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "created_by_user_id",
            "validated_by_user_id", "validated_at", "approved_by_user_id", "approved_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 98, 'APPROVED',
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2027-01-01',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-12-01 08:00+07',
            NULL, TIMESTAMPTZ '2026-12-02 08:00+07'
        );
        RAISE EXCEPTION 'Expected approval actor/timestamp pair rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "created_by_user_id"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 101, 'VALIDATED',
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2027-01-01',
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected VALIDATED without validation metadata rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "created_by_user_id",
            "approved_by_user_id", "approved_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 102, 'APPROVED',
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2027-01-01',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-12-02 08:00+07'
        );
        RAISE EXCEPTION 'Expected APPROVED without validation rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "created_by_user_id",
            "validated_by_user_id", "validated_at", "activated_by_user_id", "activated_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 103, 'ACTIVE',
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2027-01-01',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-12-01 08:00+07',
            '55000000-0000-0000-0000-000000000004', TIMESTAMPTZ '2026-12-03 08:00+07'
        );
        RAISE EXCEPTION 'Expected ACTIVE without approval rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "created_by_user_id",
            "validated_by_user_id", "validated_at", "approved_by_user_id", "approved_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 104, 'ACTIVE',
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2027-01-01',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-12-01 08:00+07',
            '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-12-02 08:00+07'
        );
        RAISE EXCEPTION 'Expected ACTIVE without activation metadata rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "effective_until", "created_by_user_id",
            "validated_by_user_id", "validated_at", "approved_by_user_id", "approved_at",
            "activated_by_user_id", "activated_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 105, 'ACTIVE',
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2027-01-01', DATE '2027-01-31',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-12-01 08:00+07',
            '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-12-02 08:00+07',
            '55000000-0000-0000-0000-000000000004', TIMESTAMPTZ '2026-12-03 08:00+07'
        );
        RAISE EXCEPTION 'Expected ACTIVE with effective_until rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Close the old interval and create a new chain head. Inclusive ranges meet only on adjacent dates.
UPDATE "timetable_versions"
SET "status" = 'SUPERSEDED',
    "effective_until" = DATE '2026-09-27',
    "superseded_at" = TIMESTAMPTZ '2026-09-20 08:00+07'
WHERE "id" = '57000000-0000-0000-0000-000000000006';

INSERT INTO "timetable_versions" (
    "id", "academic_year_id", "version_number", "status", "calendar_version_id",
    "effective_academic_week_id", "effective_from", "created_by_user_id",
    "validated_by_user_id", "validated_at", "approved_by_user_id", "approved_at",
    "activated_by_user_id", "activated_at"
) VALUES
    (
        '57000000-0000-0000-0000-000000000007',
        'a5000000-0000-0000-0000-000000000001', 6, 'ACTIVE',
        'b5000000-0000-0000-0000-000000000001',
        'c5000000-0000-0000-0000-000000000001', DATE '2026-09-28',
        '55000000-0000-0000-0000-000000000001',
        '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-09-21 08:00+07',
        '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-09-22 08:00+07',
        '55000000-0000-0000-0000-000000000004', TIMESTAMPTZ '2026-09-23 08:00+07'
    ),
    (
        '57000000-0000-0000-0000-000000000008',
        'a5000000-0000-0000-0000-000000000002', 2, 'ACTIVE',
        'b5000000-0000-0000-0000-000000000003',
        'c5000000-0000-0000-0000-000000000003', DATE '2027-09-01',
        '55000000-0000-0000-0000-000000000001',
        '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2027-08-01 08:00+07',
        '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2027-08-02 08:00+07',
        '55000000-0000-0000-0000-000000000004', TIMESTAMPTZ '2027-08-03 08:00+07'
    );

DO $$
BEGIN
    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "effective_until", "created_by_user_id",
            "validated_by_user_id", "validated_at", "approved_by_user_id", "approved_at",
            "activated_by_user_id", "activated_at", "superseded_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 99, 'SUPERSEDED',
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2026-09-27', DATE '2026-09-29',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-12-01 08:00+07',
            '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-12-02 08:00+07',
            '55000000-0000-0000-0000-000000000004', TIMESTAMPTZ '2026-12-03 08:00+07',
            TIMESTAMPTZ '2027-01-03 08:00+07'
        );
        RAISE EXCEPTION 'Expected overlapping ACTIVE/SUPERSEDED effectivity rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "created_by_user_id",
            "validated_by_user_id", "validated_at", "approved_by_user_id", "approved_at",
            "activated_by_user_id", "activated_at", "superseded_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 100, 'SUPERSEDED',
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2025-01-01',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2025-01-01 08:00+07',
            '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2025-01-02 08:00+07',
            '55000000-0000-0000-0000-000000000004', TIMESTAMPTZ '2025-01-03 08:00+07',
            TIMESTAMPTZ '2025-05-31 08:00+07'
        );
        RAISE EXCEPTION 'Expected SUPERSEDED without effective_until rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "status", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "effective_until", "created_by_user_id",
            "validated_by_user_id", "validated_at", "approved_by_user_id", "approved_at",
            "activated_by_user_id", "activated_at"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 106, 'SUPERSEDED',
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2025-01-01', DATE '2025-05-31',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', TIMESTAMPTZ '2025-01-01 08:00+07',
            '55000000-0000-0000-0000-000000000003', TIMESTAMPTZ '2025-01-02 08:00+07',
            '55000000-0000-0000-0000-000000000004', TIMESTAMPTZ '2025-01-03 08:00+07'
        );
        RAISE EXCEPTION 'Expected SUPERSEDED without superseded_at rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- A normal lesson row succeeds.
INSERT INTO "timetable_entries" (
    "id", "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
    "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
) VALUES (
    '58000000-0000-0000-0000-000000000001',
    '57000000-0000-0000-0000-000000000002',
    'a5000000-0000-0000-0000-000000000001', 'MONDAY',
    'd5000000-0000-0000-0000-000000000001',
    'e5000000-0000-0000-0000-000000000001',
    'f5000000-0000-0000-0000-000000000001',
    '56000000-0000-0000-0000-000000000001',
    '55000000-0000-0000-0000-000000000005'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "timetable_entries" (
            "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
            "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
        ) VALUES (
            '57000000-0000-0000-0000-000000000002',
            'a5000000-0000-0000-0000-000000000001', 'TUESDAY',
            'd5000000-0000-0000-0000-000000000001',
            'e5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001',
            '56000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000005'
        );
        RAISE EXCEPTION 'Expected slot weekday mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_entries" (
            "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
            "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
        ) VALUES (
            '57000000-0000-0000-0000-000000000002',
            'a5000000-0000-0000-0000-000000000001', 'MONDAY',
            'd5000000-0000-0000-0000-000000000004',
            'e5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001',
            '56000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000005'
        );
        RAISE EXCEPTION 'Expected slot academic-year mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_entries" (
            "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
            "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
        ) VALUES (
            '57000000-0000-0000-0000-000000000002',
            'a5000000-0000-0000-0000-000000000001', 'MONDAY',
            'd5000000-0000-0000-0000-000000000002',
            'e5000000-0000-0000-0000-000000000003', 'f5000000-0000-0000-0000-000000000001',
            '56000000-0000-0000-0000-000000000005', '55000000-0000-0000-0000-000000000005'
        );
        RAISE EXCEPTION 'Expected class academic-year mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_entries" (
            "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
            "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
        ) VALUES (
            '57000000-0000-0000-0000-000000000002',
            'a5000000-0000-0000-0000-000000000002', 'MONDAY',
            'd5000000-0000-0000-0000-000000000004',
            'e5000000-0000-0000-0000-000000000003', 'f5000000-0000-0000-0000-000000000001',
            '56000000-0000-0000-0000-000000000005', '55000000-0000-0000-0000-000000000005'
        );
        RAISE EXCEPTION 'Expected timetable version academic-year mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_entries" (
            "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
            "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
        ) VALUES (
            '57000000-0000-0000-0000-000000000002',
            'a5000000-0000-0000-0000-000000000001', 'MONDAY',
            'd5000000-0000-0000-0000-000000000002',
            'e5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001',
            '56000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000006'
        );
        RAISE EXCEPTION 'Expected assignment teacher snapshot mismatch rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_entries" (
            "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
            "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
        ) VALUES (
            '57000000-0000-0000-0000-000000000002',
            'a5000000-0000-0000-0000-000000000001', 'MONDAY',
            'd5000000-0000-0000-0000-000000000001',
            'e5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000002',
            '56000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000006'
        );
        RAISE EXCEPTION 'Expected exact-slot class collision rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_entries" (
            "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
            "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
        ) VALUES (
            '57000000-0000-0000-0000-000000000002',
            'a5000000-0000-0000-0000-000000000001', 'MONDAY',
            'd5000000-0000-0000-0000-000000000001',
            'e5000000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-000000000001',
            '56000000-0000-0000-0000-000000000003', '55000000-0000-0000-0000-000000000005'
        );
        RAISE EXCEPTION 'Expected exact-slot teacher collision rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;

-- Different exact slots and different teachers/classes are non-colliding.
INSERT INTO "timetable_entries" (
    "id", "timetable_version_id", "academic_year_id", "weekday", "time_slot_definition_id",
    "school_class_id", "subject_id", "teaching_assignment_id", "teacher_user_id"
) VALUES
    (
        '58000000-0000-0000-0000-000000000002',
        '57000000-0000-0000-0000-000000000002',
        'a5000000-0000-0000-0000-000000000001', 'MONDAY',
        'd5000000-0000-0000-0000-000000000002',
        'e5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000002',
        '56000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000006'
    ),
    (
        '58000000-0000-0000-0000-000000000003',
        '57000000-0000-0000-0000-000000000002',
        'a5000000-0000-0000-0000-000000000001', 'MONDAY',
        'd5000000-0000-0000-0000-000000000003',
        'e5000000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-000000000002',
        '56000000-0000-0000-0000-000000000004', '55000000-0000-0000-0000-000000000006'
    ),
    (
        '58000000-0000-0000-0000-000000000004',
        '57000000-0000-0000-0000-000000000002',
        'a5000000-0000-0000-0000-000000000001', 'MONDAY',
        'd5000000-0000-0000-0000-000000000001',
        'e5000000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-000000000002',
        '56000000-0000-0000-0000-000000000004', '55000000-0000-0000-0000-000000000006'
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "timetable_entries" a
        JOIN "time_slot_definitions" sa ON sa."id" = a."time_slot_definition_id"
        JOIN "timetable_entries" b ON b."id" = '58000000-0000-0000-0000-000000000003'
        JOIN "time_slot_definitions" sb ON sb."id" = b."time_slot_definition_id"
        WHERE a."id" = '58000000-0000-0000-0000-000000000001'
          AND int8range(extract(epoch FROM sa."start_time")::bigint, extract(epoch FROM sa."end_time")::bigint, '[)')
              && int8range(extract(epoch FROM sb."start_time")::bigint, extract(epoch FROM sb."end_time")::bigint, '[)')
    ) THEN
        RAISE EXCEPTION '04A2 fixture must prove different slot IDs with real overlap remain representable';
    END IF;

    -- These all remain RESTRICT parents. Each delete must fail without cleanup cascades.
    BEGIN DELETE FROM "timetable_versions" WHERE "id" = '57000000-0000-0000-0000-000000000002'; RAISE EXCEPTION 'Expected version delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "academic_years" WHERE "id" = 'a5000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected academic year delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "academic_calendar_versions" WHERE "id" = 'b5000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected calendar delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "academic_weeks" WHERE "id" = 'c5000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected week delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "time_slot_definitions" WHERE "id" = 'd5000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected slot delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "classes" WHERE "id" = 'e5000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected class delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "subjects" WHERE "id" = 'f5000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected subject delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "teaching_assignments" WHERE "id" = '56000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected assignment delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "users" WHERE "id" = '55000000-0000-0000-0000-000000000005'; RAISE EXCEPTION 'Expected teacher delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "users" WHERE "id" = '55000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'Expected creator delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "users" WHERE "id" = '55000000-0000-0000-0000-000000000002'; RAISE EXCEPTION 'Expected validator delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "users" WHERE "id" = '55000000-0000-0000-0000-000000000003'; RAISE EXCEPTION 'Expected approver delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN DELETE FROM "users" WHERE "id" = '55000000-0000-0000-0000-000000000004'; RAISE EXCEPTION 'Expected activator delete restriction'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

SELECT 'Timetable schema PostgreSQL verification PASS; cross-slot real-time collision remains an 04B activation invariant.' AS result;
