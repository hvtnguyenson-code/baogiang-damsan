\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    enum_values text[];
    table_count integer;
    date_count integer;
    forbidden_count integer;
    not_null_count integer;
BEGIN
    SELECT count(*) INTO table_count
    FROM unnest(ARRAY[
        'ppct_plans', 'ppct_versions', 'ppct_items', 'ppct_item_revisions',
        'ppct_item_lineage', 'ppct_class_associations'
    ]) AS expected(table_name)
    WHERE to_regclass('public.' || expected.table_name) IS NOT NULL;
    IF table_count <> 6 THEN
        RAISE EXCEPTION 'Expected all six PPCT tables, found %', table_count;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PpctVersionStatus';
    IF enum_values <> ARRAY['DRAFT', 'PUBLISHED', 'SUPERSEDED'] THEN
        RAISE EXCEPTION 'Unexpected PpctVersionStatus values: %', enum_values;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PpctCurricularComponent';
    IF enum_values <> ARRAY['CORE', 'SPECIALIZED_STUDY'] THEN
        RAISE EXCEPTION 'Unexpected PpctCurricularComponent values: %', enum_values;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PpctClassCurricularProfile';
    IF enum_values <> ARRAY['CORE_ONLY', 'CORE_PLUS_SPECIALIZED_STUDY'] THEN
        RAISE EXCEPTION 'Unexpected PpctClassCurricularProfile values: %', enum_values;
    END IF;

    SELECT count(*) INTO date_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ppct_class_associations'
      AND column_name IN ('effective_from', 'effective_until')
      AND data_type = 'date';
    IF date_count <> 2 THEN
        RAISE EXCEPTION 'PPCT association boundaries must use DATE';
    END IF;

    -- Verify new columns are NOT NULL
    SELECT count(*) INTO not_null_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND is_nullable = 'NO'
      AND (
          (table_name = 'ppct_items' AND column_name = 'component')
          OR (table_name = 'ppct_item_revisions' AND column_name = 'component')
          OR (table_name = 'ppct_item_lineage' AND column_name = 'component')
          OR (table_name = 'ppct_class_associations' AND column_name = 'curricular_profile')
      );
    IF not_null_count <> 4 THEN
        RAISE EXCEPTION 'Expected all 4 PPCT component/profile columns to be NOT NULL, found %', not_null_count;
    END IF;

    SELECT count(*) INTO forbidden_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name LIKE 'ppct_%'
      AND (
          column_name IN ('academic_calendar_version_id', 'calendar_version_id', 'academic_week_id', 'completed')
          OR column_name ~ '(checksum|workbook|sheet_name|column_mapping|import_profile|request_idempotency)'
      );
    IF forbidden_count <> 0 THEN
        RAISE EXCEPTION 'Forbidden calendar/week/completion/import persistence found in PPCT tables';
    END IF;

    -- Downstream boundary preservation: assert no component columns in downstream tables
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('timetable_entries', 'teaching_assignments', 'curricular_teaching_executions', 'makeup_teaching_schedules')
          AND (column_name LIKE '%component%' OR column_name LIKE '%curricular_profile%')
    ) THEN
        RAISE EXCEPTION 'Downstream tables must remain component-free and profile-free';
    END IF;

    -- Assert legacy version-wide sequence uniqueness index is gone
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'ppct_item_revisions'
          AND indexname = 'ppct_item_revisions_version_sequence_key'
    ) THEN
        RAISE EXCEPTION 'Obsolete version-wide sequence unique index must be dropped';
    END IF;

    -- Assert component-aware sequence uniqueness index exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'ppct_item_revisions'
          AND indexname = 'ppct_item_revisions_version_component_sequence_key'
    ) THEN
        RAISE EXCEPTION 'Component-aware sequence unique index must exist';
    END IF;

    -- Assert obsolete pre-component revision -> item FK is gone
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ppct_item_revisions_item_plan_fkey'
          AND conrelid = 'ppct_item_revisions'::regclass
    ) THEN
        RAISE EXCEPTION 'Obsolete ppct_item_revisions_item_plan_fkey must be dropped';
    END IF;

    -- Assert component-aware revision -> item FK exists and has RESTRICT update/delete
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ppct_item_revisions_item_plan_component_fkey'
          AND conrelid = 'ppct_item_revisions'::regclass
          AND confrelid = 'ppct_items'::regclass
          AND contype = 'f'
          AND confdeltype IN ('r', 'a')
          AND confupdtype IN ('r', 'a')
    ) THEN
        RAISE EXCEPTION 'Component-aware ppct_item_revisions_item_plan_component_fkey missing or invalid';
    END IF;

    -- Assert component-aware lineage predecessor FK exists and has RESTRICT update/delete (no CASCADE)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ppct_item_lineage_predecessor_revision_fkey'
          AND conrelid = 'ppct_item_lineage'::regclass
          AND confrelid = 'ppct_item_revisions'::regclass
          AND contype = 'f'
          AND confdeltype IN ('r', 'a')
          AND confupdtype IN ('r', 'a')
    ) THEN
        RAISE EXCEPTION 'Component-aware ppct_item_lineage_predecessor_revision_fkey missing or invalid';
    END IF;

    -- Assert component-aware lineage successor FK exists and has RESTRICT update/delete (no CASCADE)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ppct_item_lineage_successor_revision_fkey'
          AND conrelid = 'ppct_item_lineage'::regclass
          AND confrelid = 'ppct_item_revisions'::regclass
          AND contype = 'f'
          AND confdeltype IN ('r', 'a')
          AND confupdtype IN ('r', 'a')
    ) THEN
        RAISE EXCEPTION 'Component-aware ppct_item_lineage_successor_revision_fkey missing or invalid';
    END IF;

    -- Assert retained provenance unique indexes on ppct_item_revisions exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'ppct_item_revisions'
          AND indexname = 'ppct_item_revisions_provenance_key'
    ) THEN
        RAISE EXCEPTION 'Required ppct_item_revisions_provenance_key index missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'ppct_item_revisions'
          AND indexname = 'ppct_item_revisions_execution_provenance_key'
    ) THEN
        RAISE EXCEPTION 'Required ppct_item_revisions_execution_provenance_key index missing';
    END IF;

    -- Assert GiST exclusion constraint on ppct_class_associations exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ppct_class_associations_no_overlap'
          AND conrelid = 'ppct_class_associations'::regclass
          AND contype = 'x'
    ) THEN
        RAISE EXCEPTION 'Required ppct_class_associations_no_overlap exclusion constraint missing';
    END IF;
END $$;

INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a5a10000-0000-0000-0000-000000000001', 'PPCT-2026-2027', 'PPCT year A'),
    ('a5a10000-0000-0000-0000-000000000002', 'PPCT-2027-2028', 'PPCT year B');

INSERT INTO "subjects" ("id", "code", "name") VALUES
    ('b5a10000-0000-0000-0000-000000000001', 'PPCT_MATH', 'PPCT Mathematics'),
    ('b5a10000-0000-0000-0000-000000000002', 'PPCT_LITERATURE', 'PPCT Literature');

INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('c5a10000-0000-0000-0000-000000000001', 'a5a10000-0000-0000-0000-000000000001', 'PPCT10A1', 'PPCT Class 10A1', 10),
    ('c5a10000-0000-0000-0000-000000000002', 'a5a10000-0000-0000-0000-000000000001', 'PPCT10A2', 'PPCT Class 10A2', 10),
    ('c5a10000-0000-0000-0000-000000000003', 'a5a10000-0000-0000-0000-000000000002', 'PPCT11A1', 'PPCT Class 11A1', 11);

INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('d5a10000-0000-0000-0000-000000000001', 'ppct.creator', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d5a10000-0000-0000-0000-000000000002', 'ppct.publisher', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d5a10000-0000-0000-0000-000000000003', 'ppct.superseder', 'not-a-real-password-hash', 'ACTIVE', false);

DO $$
BEGIN
    BEGIN
        INSERT INTO "ppct_plans" ("academic_year_id", "subject_id", "grade_level")
        VALUES ('a5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000001', 9);
        RAISE EXCEPTION 'Expected invalid plan grade rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

INSERT INTO "ppct_plans" ("id", "academic_year_id", "subject_id", "grade_level") VALUES
    ('e5a10000-0000-0000-0000-000000000001', 'a5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000001', 10),
    ('e5a10000-0000-0000-0000-000000000002', 'a5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000002', 10),
    ('e5a10000-0000-0000-0000-000000000003', 'a5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000001', 11),
    ('e5a10000-0000-0000-0000-000000000004', 'a5a10000-0000-0000-0000-000000000002', 'b5a10000-0000-0000-0000-000000000001', 11),
    ('e5a10000-0000-0000-0000-000000000006', 'a5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000002', 11);

DO $$
BEGIN
    BEGIN
        INSERT INTO "ppct_plans" ("academic_year_id", "subject_id", "grade_level")
        VALUES ('a5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000001', 10);
        RAISE EXCEPTION 'Expected duplicate logical plan rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_versions" ("ppct_plan_id", "version_number", "created_by_user_id")
        VALUES ('e5a10000-0000-0000-0000-000000000001', 0, 'd5a10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected non-positive version rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_versions" (
            "ppct_plan_id", "version_number", "status", "created_by_user_id", "published_by_user_id"
        ) VALUES (
            'e5a10000-0000-0000-0000-000000000001', 90, 'PUBLISHED',
            'd5a10000-0000-0000-0000-000000000001', 'd5a10000-0000-0000-0000-000000000002'
        );
        RAISE EXCEPTION 'Expected incomplete publication metadata rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_versions" (
            "ppct_plan_id", "version_number", "status", "created_by_user_id",
            "published_by_user_id", "published_at", "superseded_by_user_id", "superseded_at"
        ) VALUES (
            'e5a10000-0000-0000-0000-000000000001', 91, 'SUPERSEDED',
            'd5a10000-0000-0000-0000-000000000001', 'd5a10000-0000-0000-0000-000000000002',
            TIMESTAMPTZ '2026-08-10 08:00:00+07', 'd5a10000-0000-0000-0000-000000000003',
            TIMESTAMPTZ '2026-08-09 08:00:00+07'
        );
        RAISE EXCEPTION 'Expected backwards supersession metadata rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

INSERT INTO "ppct_versions" (
    "id", "ppct_plan_id", "version_number", "status", "created_by_user_id", "published_by_user_id", "published_at"
) VALUES
    ('f5a10000-0000-0000-0000-000000000001', 'e5a10000-0000-0000-0000-000000000001', 1, 'PUBLISHED', 'd5a10000-0000-0000-0000-000000000001', 'd5a10000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-08-10 08:00:00+07'),
    ('f5a10000-0000-0000-0000-000000000003', 'e5a10000-0000-0000-0000-000000000002', 1, 'PUBLISHED', 'd5a10000-0000-0000-0000-000000000001', 'd5a10000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-08-10 08:00:00+07'),
    ('f5a10000-0000-0000-0000-000000000004', 'e5a10000-0000-0000-0000-000000000003', 1, 'PUBLISHED', 'd5a10000-0000-0000-0000-000000000001', 'd5a10000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-08-10 08:00:00+07'),
    ('f5a10000-0000-0000-0000-000000000005', 'e5a10000-0000-0000-0000-000000000004', 1, 'PUBLISHED', 'd5a10000-0000-0000-0000-000000000001', 'd5a10000-0000-0000-0000-000000000002', TIMESTAMPTZ '2027-08-10 08:00:00+07'),
    ('f5a10000-0000-0000-0000-000000000006', 'e5a10000-0000-0000-0000-000000000006', 1, 'PUBLISHED', 'd5a10000-0000-0000-0000-000000000001', 'd5a10000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-08-10 08:00:00+07');

DO $$
BEGIN
    BEGIN
        INSERT INTO "ppct_versions" ("ppct_plan_id", "version_number", "created_by_user_id")
        VALUES ('e5a10000-0000-0000-0000-000000000001', 1, 'd5a10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected duplicate version number rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_versions" (
            "ppct_plan_id", "version_number", "status", "created_by_user_id", "published_by_user_id", "published_at"
        ) VALUES (
            'e5a10000-0000-0000-0000-000000000001', 2, 'PUBLISHED',
            'd5a10000-0000-0000-0000-000000000001', 'd5a10000-0000-0000-0000-000000000002', now()
        );
        RAISE EXCEPTION 'Expected second published head rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_versions" (
            "ppct_plan_id", "version_number", "status", "created_by_user_id", "published_by_user_id", "published_at"
        ) VALUES (
            'e5a10000-0000-0000-0000-000000000001', 92, 'DRAFT',
            'd5a10000-0000-0000-0000-000000000001', 'd5a10000-0000-0000-0000-000000000002', now()
        );
        RAISE EXCEPTION 'Expected DRAFT publication metadata rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Create a binding while v1 is PUBLISHED; it must survive the later supersession.
INSERT INTO "ppct_class_associations" (
    "id", "academic_year_id", "school_class_id", "subject_id", "grade_level",
    "ppct_plan_id", "ppct_version_id", "curricular_profile", "effective_from", "effective_until", "created_by_user_id"
) VALUES (
    '25a10000-0000-0000-0000-000000000001', 'a5a10000-0000-0000-0000-000000000001',
    'c5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000001', 10,
    'e5a10000-0000-0000-0000-000000000001', 'f5a10000-0000-0000-0000-000000000001',
    'CORE_ONLY', DATE '2026-09-01', DATE '2026-12-31', 'd5a10000-0000-0000-0000-000000000001'
);

UPDATE "ppct_versions"
SET "status" = 'SUPERSEDED',
    "superseded_by_user_id" = 'd5a10000-0000-0000-0000-000000000003',
    "superseded_at" = TIMESTAMPTZ '2026-08-11 08:00:00+07'
WHERE "id" = 'f5a10000-0000-0000-0000-000000000001';

INSERT INTO "ppct_versions" (
    "id", "ppct_plan_id", "version_number", "status", "created_by_user_id", "published_by_user_id", "published_at"
) VALUES (
    'f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', 2, 'PUBLISHED',
    'd5a10000-0000-0000-0000-000000000001', 'd5a10000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-08-11 08:00:00+07'
);

INSERT INTO "ppct_items" ("id", "ppct_plan_id", "component") VALUES
    ('15a10000-0000-0000-0000-000000000001', 'e5a10000-0000-0000-0000-000000000001', 'CORE'),
    ('15a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', 'CORE'),
    ('15a10000-0000-0000-0000-000000000003', 'e5a10000-0000-0000-0000-000000000001', 'CORE'),
    ('15a10000-0000-0000-0000-000000000004', 'e5a10000-0000-0000-0000-000000000001', 'CORE'),
    ('15a10000-0000-0000-0000-000000000006', 'e5a10000-0000-0000-0000-000000000001', 'CORE'),
    ('15a10000-0000-0000-0000-000000000007', 'e5a10000-0000-0000-0000-000000000001', 'CORE'),
    ('15a10000-0000-0000-0000-000000000005', 'e5a10000-0000-0000-0000-000000000002', 'CORE'),
    ('15a10000-0000-0000-0000-000000000008', 'e5a10000-0000-0000-0000-000000000001', 'SPECIALIZED_STUDY');

-- The same stable UUID appears in two versions by design.
-- Both CORE sequence 1 and SPECIALIZED_STUDY sequence 1 coexist in version f5a1...002.
INSERT INTO "ppct_item_revisions" (
    "ppct_version_id", "ppct_plan_id", "ppct_item_id", "component", "sequence", "title", "lesson_type"
) VALUES
    ('f5a10000-0000-0000-0000-000000000001', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000001', 'CORE', 1, 'Preserved obligation v1', 'Lesson'),
    ('f5a10000-0000-0000-0000-000000000001', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000002', 'CORE', 2, 'Split source', 'Lesson'),
    ('f5a10000-0000-0000-0000-000000000001', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000003', 'CORE', 3, 'Merge source', 'Lesson'),
    ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000001', 'CORE', 1, 'Preserved obligation v2', 'Lesson'),
    ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000004', 'CORE', 2, 'Split and merge successor', 'Lesson'),
    ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000006', 'CORE', 3, 'Second split successor', 'Lesson'),
    ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000008', 'SPECIALIZED_STUDY', 1, 'Specialized study topic 1', 'SpecializedTopic'),
    ('f5a10000-0000-0000-0000-000000000003', 'e5a10000-0000-0000-0000-000000000002', '15a10000-0000-0000-0000-000000000005', 'CORE', 1, 'Other plan item', 'Lesson');

DO $$
BEGIN
    -- Duplicate sequence in the same component (CORE 2) must be rejected
    BEGIN
        INSERT INTO "ppct_item_revisions" ("ppct_version_id", "ppct_plan_id", "ppct_item_id", "component", "sequence", "title", "lesson_type")
        VALUES ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000002', 'CORE', 2, 'Duplicate sequence', 'Lesson');
        RAISE EXCEPTION 'Expected duplicate sequence in component rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    -- Component mismatch between revision and item must be rejected by composite FK
    BEGIN
        INSERT INTO "ppct_item_revisions" ("ppct_version_id", "ppct_plan_id", "ppct_item_id", "component", "sequence", "title", "lesson_type")
        VALUES ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000007', 'SPECIALIZED_STUDY', 9, 'Component mismatch', 'Lesson');
        RAISE EXCEPTION 'Expected component mismatch rejection between revision and item';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_item_revisions" ("ppct_version_id", "ppct_plan_id", "ppct_item_id", "component", "sequence", "title", "lesson_type")
        VALUES ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000001', 'CORE', 9, 'Duplicate item', 'Lesson');
        RAISE EXCEPTION 'Expected duplicate item in version rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_item_revisions" ("ppct_version_id", "ppct_plan_id", "ppct_item_id", "component", "sequence", "title", "lesson_type")
        VALUES ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000005', 'CORE', 9, 'Cross plan item', 'Lesson');
        RAISE EXCEPTION 'Expected cross-plan revision rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_item_revisions" ("ppct_version_id", "ppct_plan_id", "ppct_item_id", "component", "sequence", "title", "lesson_type")
        VALUES ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000007', 'CORE', 0, 'Invalid sequence', 'Lesson');
        RAISE EXCEPTION 'Expected non-positive sequence rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_item_revisions" ("ppct_version_id", "ppct_plan_id", "ppct_item_id", "component", "sequence", "title", "lesson_type")
        VALUES ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000007', 'CORE', 9, '   ', 'Lesson');
        RAISE EXCEPTION 'Expected blank title rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_item_revisions" ("ppct_version_id", "ppct_plan_id", "ppct_item_id", "component", "sequence", "title", "lesson_type")
        VALUES ('f5a10000-0000-0000-0000-000000000002', 'e5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000007', 'CORE', 9, 'Valid title', '   ');
        RAISE EXCEPTION 'Expected blank lesson type rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- One predecessor to two successors is a split; two predecessors to one successor is a merge.
INSERT INTO "ppct_item_lineage" (
    "ppct_plan_id", "component", "predecessor_version_id", "predecessor_item_id", "successor_version_id", "successor_item_id"
) VALUES
    ('e5a10000-0000-0000-0000-000000000001', 'CORE', 'f5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000002', 'f5a10000-0000-0000-0000-000000000002', '15a10000-0000-0000-0000-000000000004'),
    ('e5a10000-0000-0000-0000-000000000001', 'CORE', 'f5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000002', 'f5a10000-0000-0000-0000-000000000002', '15a10000-0000-0000-0000-000000000006'),
    ('e5a10000-0000-0000-0000-000000000001', 'CORE', 'f5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000003', 'f5a10000-0000-0000-0000-000000000002', '15a10000-0000-0000-0000-000000000004');

DO $$
BEGIN
    BEGIN
        INSERT INTO "ppct_item_lineage" ("ppct_plan_id", "component", "predecessor_version_id", "predecessor_item_id", "successor_version_id", "successor_item_id")
        VALUES ('e5a10000-0000-0000-0000-000000000001', 'CORE', 'f5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000002', 'f5a10000-0000-0000-0000-000000000002', '15a10000-0000-0000-0000-000000000004');
        RAISE EXCEPTION 'Expected duplicate lineage edge rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_item_lineage" ("ppct_plan_id", "component", "predecessor_version_id", "predecessor_item_id", "successor_version_id", "successor_item_id")
        VALUES ('e5a10000-0000-0000-0000-000000000001', 'CORE', 'f5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000001', 'f5a10000-0000-0000-0000-000000000002', '15a10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected same-item lineage rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_item_lineage" ("ppct_plan_id", "component", "predecessor_version_id", "predecessor_item_id", "successor_version_id", "successor_item_id")
        VALUES ('e5a10000-0000-0000-0000-000000000002', 'CORE', 'f5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000002', 'f5a10000-0000-0000-0000-000000000003', '15a10000-0000-0000-0000-000000000005');
        RAISE EXCEPTION 'Expected cross-plan lineage rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- Cross-component lineage must be rejected by foreign key constraint
    BEGIN
        INSERT INTO "ppct_item_lineage" ("ppct_plan_id", "component", "predecessor_version_id", "predecessor_item_id", "successor_version_id", "successor_item_id")
        VALUES ('e5a10000-0000-0000-0000-000000000001', 'CORE', 'f5a10000-0000-0000-0000-000000000001', '15a10000-0000-0000-0000-000000000002', 'f5a10000-0000-0000-0000-000000000002', '15a10000-0000-0000-0000-000000000008');
        RAISE EXCEPTION 'Expected cross-component lineage rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

INSERT INTO "ppct_class_associations" (
    "id", "academic_year_id", "school_class_id", "subject_id", "grade_level",
    "ppct_plan_id", "ppct_version_id", "curricular_profile", "effective_from", "effective_until", "created_by_user_id"
) VALUES
    ('25a10000-0000-0000-0000-000000000002', 'a5a10000-0000-0000-0000-000000000001', 'c5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000001', 10, 'e5a10000-0000-0000-0000-000000000001', 'f5a10000-0000-0000-0000-000000000002', 'CORE_PLUS_SPECIALIZED_STUDY', DATE '2027-01-01', NULL, 'd5a10000-0000-0000-0000-000000000001'),
    ('25a10000-0000-0000-0000-000000000003', 'a5a10000-0000-0000-0000-000000000001', 'c5a10000-0000-0000-0000-000000000002', 'b5a10000-0000-0000-0000-000000000001', 10, 'e5a10000-0000-0000-0000-000000000001', 'f5a10000-0000-0000-0000-000000000002', 'CORE_ONLY', DATE '2026-09-01', NULL, 'd5a10000-0000-0000-0000-000000000001');

DO $$
BEGIN
    BEGIN
        INSERT INTO "ppct_class_associations" ("academic_year_id", "school_class_id", "subject_id", "grade_level", "ppct_plan_id", "ppct_version_id", "curricular_profile", "effective_from", "effective_until", "created_by_user_id")
        VALUES ('a5a10000-0000-0000-0000-000000000001', 'c5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000001', 10, 'e5a10000-0000-0000-0000-000000000001', 'f5a10000-0000-0000-0000-000000000002', 'CORE_ONLY', DATE '2027-03-01', DATE '2027-02-01', 'd5a10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected invalid association interval rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_class_associations" ("academic_year_id", "school_class_id", "subject_id", "grade_level", "ppct_plan_id", "ppct_version_id", "curricular_profile", "effective_from", "effective_until", "created_by_user_id")
        VALUES ('a5a10000-0000-0000-0000-000000000001', 'c5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000001', 10, 'e5a10000-0000-0000-0000-000000000001', 'f5a10000-0000-0000-0000-000000000002', 'CORE_ONLY', DATE '2026-12-31', DATE '2027-02-01', 'd5a10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected inclusive overlap rejection';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_class_associations" ("academic_year_id", "school_class_id", "subject_id", "grade_level", "ppct_plan_id", "ppct_version_id", "curricular_profile", "effective_from", "created_by_user_id")
        VALUES ('a5a10000-0000-0000-0000-000000000002', 'c5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000001', 11, 'e5a10000-0000-0000-0000-000000000004', 'f5a10000-0000-0000-0000-000000000005', 'CORE_ONLY', DATE '2027-09-01', 'd5a10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected wrong AcademicYear class binding rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_class_associations" ("academic_year_id", "school_class_id", "subject_id", "grade_level", "ppct_plan_id", "ppct_version_id", "curricular_profile", "effective_from", "created_by_user_id")
        VALUES ('a5a10000-0000-0000-0000-000000000001', 'c5a10000-0000-0000-0000-000000000002', 'b5a10000-0000-0000-0000-000000000002', 10, 'e5a10000-0000-0000-0000-000000000001', 'f5a10000-0000-0000-0000-000000000001', 'CORE_ONLY', DATE '2028-01-01', 'd5a10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected wrong Subject plan binding rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_class_associations" ("academic_year_id", "school_class_id", "subject_id", "grade_level", "ppct_plan_id", "ppct_version_id", "curricular_profile", "effective_from", "created_by_user_id")
        VALUES ('a5a10000-0000-0000-0000-000000000001', 'c5a10000-0000-0000-0000-000000000002', 'b5a10000-0000-0000-0000-000000000002', 11, 'e5a10000-0000-0000-0000-000000000006', 'f5a10000-0000-0000-0000-000000000006', 'CORE_ONLY', DATE '2028-01-01', 'd5a10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected wrong Grade class binding rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "ppct_class_associations" ("academic_year_id", "school_class_id", "subject_id", "grade_level", "ppct_plan_id", "ppct_version_id", "curricular_profile", "effective_from", "created_by_user_id")
        VALUES ('a5a10000-0000-0000-0000-000000000001', 'c5a10000-0000-0000-0000-000000000001', 'b5a10000-0000-0000-0000-000000000002', 10, 'e5a10000-0000-0000-0000-000000000002', 'f5a10000-0000-0000-0000-000000000001', 'CORE_ONLY', DATE '2028-01-01', 'd5a10000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected version from another plan rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

-- Association 25a1...001 still references v1 after v1 became SUPERSEDED.
DO $$
DECLARE
    historical_count integer;
BEGIN
    SELECT count(*) INTO historical_count
    FROM "ppct_class_associations" a
    JOIN "ppct_versions" v ON v."id" = a."ppct_version_id"
    WHERE a."id" = '25a10000-0000-0000-0000-000000000001'
      AND v."status" = 'SUPERSEDED';
    IF historical_count <> 1 THEN
        RAISE EXCEPTION 'Historical association did not remain pinned to SUPERSEDED version';
    END IF;

    BEGIN
        DELETE FROM "ppct_versions" WHERE "id" = 'f5a10000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected referenced version deletion restriction';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM "ppct_plans" WHERE "id" = 'e5a10000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected referenced plan deletion restriction';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

ROLLBACK;

SELECT 'PPCT schema verification PASS' AS result;
