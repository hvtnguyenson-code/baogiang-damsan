\set ON_ERROR_STOP on

-- Academic years are stable identities and may own multiple calendar versions.
INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a1000000-0000-0000-0000-000000000001', '2025-2026', 'Năm học 2025-2026'),
    ('a1000000-0000-0000-0000-000000000002', '2026-2027', 'Năm học 2026-2027');

INSERT INTO "academic_calendar_versions" (
    "id", "academic_year_id", "version_number", "start_date", "end_date",
    "official_week_count", "reserve_week_count", "teaching_weekdays", "is_active", "activated_at"
) VALUES
    (
        'b1000000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000001',
        1, DATE '2025-09-01', DATE '2026-05-31', 35, 2,
        ARRAY['MONDAY'::"AcademicWeekday", 'TUESDAY'::"AcademicWeekday", 'WEDNESDAY'::"AcademicWeekday", 'THURSDAY'::"AcademicWeekday", 'FRIDAY'::"AcademicWeekday"],
        true, TIMESTAMPTZ '2025-08-20 08:00:00+07'
    ),
    (
        'b1000000-0000-0000-0000-000000000002',
        'a1000000-0000-0000-0000-000000000001',
        2, DATE '2025-09-01', DATE '2026-06-07', 36, 3,
        ARRAY['MONDAY'::"AcademicWeekday", 'TUESDAY'::"AcademicWeekday", 'WEDNESDAY'::"AcademicWeekday", 'THURSDAY'::"AcademicWeekday", 'FRIDAY'::"AcademicWeekday", 'SATURDAY'::"AcademicWeekday"],
        false, NULL
    ),
    (
        'b1000000-0000-0000-0000-000000000003',
        'a1000000-0000-0000-0000-000000000002',
        1, DATE '2026-09-01', DATE '2027-05-31', 34, 1,
        ARRAY['MONDAY'::"AcademicWeekday", 'TUESDAY'::"AcademicWeekday", 'WEDNESDAY'::"AcademicWeekday", 'THURSDAY'::"AcademicWeekday", 'FRIDAY'::"AcademicWeekday"],
        false, NULL
    );

DO $$
BEGIN
    IF (SELECT count(*) FROM "academic_calendar_versions" WHERE "academic_year_id" = 'a1000000-0000-0000-0000-000000000001') <> 2 THEN
        RAISE EXCEPTION 'AcademicYear must support multiple calendar versions';
    END IF;

    BEGIN
        INSERT INTO "academic_calendar_versions" (
            "academic_year_id", "version_number", "start_date", "end_date",
            "official_week_count", "reserve_week_count", "teaching_weekdays"
        ) VALUES (
            'a1000000-0000-0000-0000-000000000001', 1,
            DATE '2025-09-01', DATE '2026-05-31', 35, 2, ARRAY['MONDAY'::"AcademicWeekday"]
        );
        RAISE EXCEPTION 'Expected duplicate calendar version number rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "academic_calendar_versions" (
            "academic_year_id", "version_number", "start_date", "end_date",
            "official_week_count", "reserve_week_count", "teaching_weekdays", "is_active", "activated_at"
        ) VALUES (
            'a1000000-0000-0000-0000-000000000001', 3,
            DATE '2025-09-01', DATE '2026-05-31', 35, 2, ARRAY['MONDAY'::"AcademicWeekday"],
            true, TIMESTAMPTZ '2025-08-21 08:00:00+07'
        );
        RAISE EXCEPTION 'Expected second active calendar version rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "academic_calendar_versions" (
            "academic_year_id", "version_number", "start_date", "end_date",
            "official_week_count", "reserve_week_count", "teaching_weekdays"
        ) VALUES (
            'a1000000-0000-0000-0000-000000000001', 4,
            DATE '2026-06-01', DATE '2025-09-01', 35, 2, ARRAY['MONDAY'::"AcademicWeekday"]
        );
        RAISE EXCEPTION 'Expected invalid calendar version date range rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "academic_calendar_versions" (
            "academic_year_id", "version_number", "start_date", "end_date",
            "official_week_count", "reserve_week_count", "teaching_weekdays"
        ) VALUES (
            'a1000000-0000-0000-0000-000000000001', 5,
            DATE '2025-09-01', DATE '2026-05-31', 0, 2, ARRAY['MONDAY'::"AcademicWeekday"]
        );
        RAISE EXCEPTION 'Expected non-positive official week count rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "academic_calendar_versions" (
            "academic_year_id", "version_number", "start_date", "end_date",
            "official_week_count", "reserve_week_count", "teaching_weekdays"
        ) VALUES (
            'a1000000-0000-0000-0000-000000000001', 6,
            DATE '2025-09-01', DATE '2026-05-31', 35, -1, ARRAY['MONDAY'::"AcademicWeekday"]
        );
        RAISE EXCEPTION 'Expected negative reserve week count rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

INSERT INTO "semesters" (
    "id", "calendar_version_id", "code", "name", "ordinal", "start_date", "end_date"
) VALUES (
    'c1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'HOC_KY_A', 'Học kỳ A', 1, DATE '2025-09-01', DATE '2026-01-15'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "semesters" ("calendar_version_id", "code", "name", "ordinal", "start_date", "end_date")
        VALUES ('b1000000-0000-0000-0000-000000000001', 'RANGE_BAD', 'Sai khoảng', 2, DATE '2026-05-01', DATE '2026-04-01');
        RAISE EXCEPTION 'Expected invalid semester range rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "semesters" ("calendar_version_id", "code", "name", "ordinal", "start_date", "end_date")
        VALUES ('b1000000-0000-0000-0000-000000000001', 'OVERLAP', 'Chồng lấn', 2, DATE '2026-01-15', DATE '2026-05-31');
        RAISE EXCEPTION 'Expected overlapping semester rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "semesters" ("calendar_version_id", "code", "name", "ordinal", "start_date", "end_date")
        VALUES ('b1000000-0000-0000-0000-000000000001', 'HOC_KY_A', 'Trùng mã', 2, DATE '2026-01-16', DATE '2026-05-31');
        RAISE EXCEPTION 'Expected duplicate semester code rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "semesters" ("calendar_version_id", "code", "name", "ordinal", "start_date", "end_date")
        VALUES ('b1000000-0000-0000-0000-000000000001', 'ORDINAL_DUP', 'Trùng thứ tự', 1, DATE '2026-01-16', DATE '2026-05-31');
        RAISE EXCEPTION 'Expected duplicate semester ordinal rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;

INSERT INTO "academic_weeks" (
    "id", "calendar_version_id", "kind", "official_week_number", "display_label", "sort_order"
) VALUES (
    'd1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'OFFICIAL', 5, 'Tuần 5', 5
);
INSERT INTO "academic_weeks" (
    "id", "calendar_version_id", "kind", "reserve_week_number", "display_label", "sort_order"
) VALUES (
    'd1000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000001',
    'RESERVE', 1, 'DP1', 101
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "academic_weeks" ("calendar_version_id", "kind", "display_label", "sort_order")
        VALUES ('b1000000-0000-0000-0000-000000000001', 'OFFICIAL', 'Thiếu tuần chính thức', 10);
        RAISE EXCEPTION 'Expected OFFICIAL without number rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "academic_weeks" ("calendar_version_id", "kind", "official_week_number", "reserve_week_number", "display_label", "sort_order")
        VALUES ('b1000000-0000-0000-0000-000000000001', 'OFFICIAL', 10, 1, 'Tuần sai', 10);
        RAISE EXCEPTION 'Expected OFFICIAL with reserve number rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "academic_weeks" ("calendar_version_id", "kind", "display_label", "sort_order")
        VALUES ('b1000000-0000-0000-0000-000000000001', 'RESERVE', 'Thiếu dự phòng', 102);
        RAISE EXCEPTION 'Expected RESERVE without number rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "academic_weeks" ("calendar_version_id", "kind", "official_week_number", "reserve_week_number", "display_label", "sort_order")
        VALUES ('b1000000-0000-0000-0000-000000000001', 'RESERVE', 36, 2, 'DP2', 102);
        RAISE EXCEPTION 'Expected RESERVE with official number rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "academic_weeks" ("calendar_version_id", "kind", "official_week_number", "display_label", "sort_order")
        VALUES ('b1000000-0000-0000-0000-000000000001', 'OFFICIAL', 5, 'Tuần 5 trùng', 6);
        RAISE EXCEPTION 'Expected duplicate official week number rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM "academic_weeks"
        WHERE "id" = 'd1000000-0000-0000-0000-000000000002'
          AND "kind" = 'RESERVE'
          AND "reserve_week_number" = 1
          AND "official_week_number" IS NULL
          AND "display_label" = 'DP1'
    ) THEN
        RAISE EXCEPTION 'DP1 must remain RESERVE and must not become official Week 36';
    END IF;
END $$;

INSERT INTO "academic_week_segments" (
    "id", "academic_week_id", "calendar_version_id", "label", "segment_order", "start_date", "end_date"
) VALUES
    (
        'e1000000-0000-0000-0000-000000000001',
        'd1000000-0000-0000-0000-000000000001',
        'b1000000-0000-0000-0000-000000000001',
        '5a', 1, DATE '2026-01-26', DATE '2026-01-30'
    ),
    (
        'e1000000-0000-0000-0000-000000000002',
        'd1000000-0000-0000-0000-000000000001',
        'b1000000-0000-0000-0000-000000000001',
        '5b', 2, DATE '2026-02-09', DATE '2026-02-13'
    );

DO $$
BEGIN
    IF (
        SELECT count(DISTINCT "academic_week_id")
        FROM "academic_week_segments"
        WHERE "id" IN (
            'e1000000-0000-0000-0000-000000000001',
            'e1000000-0000-0000-0000-000000000002'
        )
    ) <> 1 THEN
        RAISE EXCEPTION 'Segments 5a and 5b must resolve to the same AcademicWeek';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM "academic_week_segments" a
        JOIN "academic_week_segments" b ON b."id" = 'e1000000-0000-0000-0000-000000000002'
        WHERE a."id" = 'e1000000-0000-0000-0000-000000000001'
          AND a."end_date" + 1 < b."start_date"
    ) THEN
        RAISE EXCEPTION 'A real-date gap between 5a and 5b must be allowed';
    END IF;

    BEGIN
        INSERT INTO "academic_week_segments" (
            "academic_week_id", "calendar_version_id", "label", "segment_order", "start_date", "end_date"
        ) VALUES (
            'd1000000-0000-0000-0000-000000000002',
            'b1000000-0000-0000-0000-000000000001',
            'DP1-overlap', 1, DATE '2026-02-12', DATE '2026-02-14'
        );
        RAISE EXCEPTION 'Expected overlapping week segment rejection across the calendar version';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;
END $$;

INSERT INTO "calendar_interruptions" (
    "id", "calendar_version_id", "code", "name", "start_date", "end_date"
) VALUES (
    'f1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'TET_2026', 'Nghỉ Tết 2026', DATE '2026-02-01', DATE '2026-02-08'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "calendar_interruptions" ("calendar_version_id", "code", "name", "start_date", "end_date")
        VALUES ('b1000000-0000-0000-0000-000000000001', 'TET_OVERLAP', 'Chồng lấn', DATE '2026-02-08', DATE '2026-02-10');
        RAISE EXCEPTION 'Expected overlapping calendar interruption rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;
END $$;

INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '10A1', 'Lớp 10A1', 10),
    ('11000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', '10A1', 'Lớp 10A1', 10);

DO $$
BEGIN
    BEGIN
        INSERT INTO "classes" ("academic_year_id", "code", "name", "grade_level")
        VALUES ('a1000000-0000-0000-0000-000000000001', '10A1', 'Trùng lớp', 10);
        RAISE EXCEPTION 'Expected class code duplicate within one academic year';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    IF (SELECT count(*) FROM "classes" WHERE "code" = '10A1') <> 2 THEN
        RAISE EXCEPTION 'Same class code must be permitted in different academic years';
    END IF;

    BEGIN
        DELETE FROM "academic_years" WHERE "id" = 'a1000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected referenced AcademicYear delete rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

DO $$
DECLARE
    civil_date_count integer;
    instant_count integer;
BEGIN
    SELECT count(*) INTO civil_date_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('academic_calendar_versions', 'semesters', 'academic_week_segments', 'calendar_interruptions')
      AND column_name IN ('start_date', 'end_date')
      AND data_type = 'date';
    IF civil_date_count <> 8 THEN
        RAISE EXCEPTION 'Expected eight civil DATE boundary columns, found %', civil_date_count;
    END IF;

    SELECT count(*) INTO instant_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'academic_calendar_versions'
      AND column_name IN ('created_at', 'updated_at', 'activated_at')
      AND data_type = 'timestamp with time zone';
    IF instant_count <> 3 THEN
        RAISE EXCEPTION 'Calendar version instants must use TIMESTAMPTZ';
    END IF;
END $$;

SELECT 'Academic structure PostgreSQL verification PASS.' AS result;
