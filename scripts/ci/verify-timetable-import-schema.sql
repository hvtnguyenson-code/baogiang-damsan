\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    enum_values text[];
    bytea_count integer;
BEGIN
    IF to_regclass('public.timetable_import_profiles') IS NULL
       OR to_regclass('public.timetable_import_profile_revisions') IS NULL
       OR to_regclass('public.timetable_import_column_mappings') IS NULL
       OR to_regclass('public.timetable_import_entity_aliases') IS NULL
       OR to_regclass('public.timetable_import_receipts') IS NULL THEN
        RAISE EXCEPTION 'Timetable import persistence tables are missing';
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TimetableImportTeacherIdentifierMode';
    IF enum_values <> ARRAY['GENERIC_EXACT', 'STAFF_CODE', 'USERNAME', 'APPROVED_ALIAS'] THEN
        RAISE EXCEPTION 'Unexpected TimetableImportTeacherIdentifierMode values: %', enum_values;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TimetableImportSemanticField';
    IF enum_values <> ARRAY['WEEKDAY', 'SESSION', 'PERIOD_ORDINAL', 'SCHOOL_CLASS', 'SUBJECT', 'TEACHER'] THEN
        RAISE EXCEPTION 'Unexpected TimetableImportSemanticField values: %', enum_values;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TimetableImportAliasEntityType';
    IF enum_values <> ARRAY['TEACHER', 'SCHOOL_CLASS', 'SUBJECT'] THEN
        RAISE EXCEPTION 'Unexpected TimetableImportAliasEntityType values: %', enum_values;
    END IF;

    SELECT count(*) INTO bytea_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name LIKE 'timetable_import_%'
      AND data_type = 'bytea';
    IF bytea_count <> 0 THEN
        RAISE EXCEPTION 'Timetable import persistence must not contain BYTEA columns';
    END IF;
END $$;

-- Reuse deterministic canonical parents created by verify-timetable-schema.sql.
INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('65000000-0000-0000-0000-000000000001', 'tt.import.alias.teacher', 'not-a-real-password-hash', 'ACTIVE', false);
INSERT INTO "subjects" ("id", "code", "name") VALUES
    ('65000000-0000-0000-0000-000000000002', 'TT_IMPORT_SUBJECT', 'TT Import Subject');
INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('65000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', 'TTIMP-A', 'TT Import Class A', 10),
    ('65000000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-000000000002', 'TTIMP-B', 'TT Import Class B', 11);

INSERT INTO "timetable_import_profiles" (
    "id", "source_key", "name", "created_by_user_id"
) VALUES (
    '66000000-0000-0000-0000-000000000001', 'school-export', 'Default timetable',
    '55000000-0000-0000-0000-000000000001'
);

DO $$
DECLARE
    invalid_value text;
BEGIN
    FOREACH invalid_value IN ARRAY ARRAY['', ' leading', 'trailing '] LOOP
        BEGIN
            INSERT INTO "timetable_import_profiles" ("source_key", "name", "created_by_user_id")
            VALUES (invalid_value, 'Another profile', '55000000-0000-0000-0000-000000000001');
            RAISE EXCEPTION 'Expected invalid profile source_key rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        BEGIN
            INSERT INTO "timetable_import_profiles" ("source_key", "name", "created_by_user_id")
            VALUES ('another-source', invalid_value, '55000000-0000-0000-0000-000000000001');
            RAISE EXCEPTION 'Expected invalid profile name rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;

    BEGIN
        INSERT INTO "timetable_import_profiles" ("source_key", "name", "created_by_user_id")
        VALUES ('school-export', 'Default timetable', '55000000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected duplicate profile identity rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;

INSERT INTO "timetable_import_profile_revisions" (
    "id", "profile_id", "revision", "teacher_identifier_mode", "created_by_user_id"
) VALUES (
    '66000000-0000-0000-0000-000000000002',
    '66000000-0000-0000-0000-000000000001', 1, 'GENERIC_EXACT',
    '55000000-0000-0000-0000-000000000001'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "timetable_import_profile_revisions" (
            "profile_id", "revision", "teacher_identifier_mode", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 0, 'STAFF_CODE',
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected non-positive profile revision rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_import_profile_revisions" (
            "profile_id", "revision", "header_row_hint", "teacher_identifier_mode", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 2, 0, 'STAFF_CODE',
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected non-positive header row hint rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_import_profile_revisions" (
            "profile_id", "revision", "teacher_identifier_mode", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 2, 'STAFF_CODE',
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected second active profile revision rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_import_profile_revisions" (
            "profile_id", "revision", "is_active", "teacher_identifier_mode", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 2, false, 'STAFF_CODE',
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected incomplete revision retirement rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_import_profile_revisions" (
            "profile_id", "revision", "is_active", "teacher_identifier_mode", "created_by_user_id",
            "retired_by_user_id", "retired_at"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 2, true, 'STAFF_CODE',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP
        );
        RAISE EXCEPTION 'Expected active revision with retirement metadata rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

UPDATE "timetable_import_profile_revisions"
SET "is_active" = false,
    "retired_by_user_id" = '55000000-0000-0000-0000-000000000002',
    "retired_at" = CURRENT_TIMESTAMP
WHERE "id" = '66000000-0000-0000-0000-000000000002';

DO $$
BEGIN
    BEGIN
        INSERT INTO "timetable_import_profile_revisions" (
            "profile_id", "revision", "is_active", "teacher_identifier_mode", "created_by_user_id",
            "retired_by_user_id", "retired_at"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 1, false, 'STAFF_CODE',
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP
        );
        RAISE EXCEPTION 'Expected duplicate profile revision number rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;

INSERT INTO "timetable_import_profile_revisions" (
    "id", "profile_id", "revision", "sheet_name_hint", "header_row_hint",
    "teacher_identifier_mode", "created_by_user_id"
) VALUES (
    '66000000-0000-0000-0000-000000000003',
    '66000000-0000-0000-0000-000000000001', 2, 'TKB', 3, 'STAFF_CODE',
    '55000000-0000-0000-0000-000000000001'
);

INSERT INTO "timetable_import_column_mappings" (
    "profile_revision_id", "semantic_field", "source_header", "source_header_key"
) VALUES
    ('66000000-0000-0000-0000-000000000003', 'WEEKDAY', 'Thứ', 'THU'),
    ('66000000-0000-0000-0000-000000000003', 'SESSION', 'Buổi', 'BUOI'),
    ('66000000-0000-0000-0000-000000000003', 'PERIOD_ORDINAL', 'Tiết', 'TIET'),
    ('66000000-0000-0000-0000-000000000003', 'SCHOOL_CLASS', 'Lớp', 'LOP'),
    ('66000000-0000-0000-0000-000000000003', 'SUBJECT', 'Môn', 'MON'),
    ('66000000-0000-0000-0000-000000000003', 'TEACHER', 'Giáo viên', 'GIAO_VIEN');

INSERT INTO "timetable_import_column_mappings" (
    "profile_revision_id", "semantic_field", "source_header", "source_header_key"
) VALUES (
    '66000000-0000-0000-0000-000000000002', 'WEEKDAY', 'Duplicate-key fixture', 'DUPLICATE_KEY'
);

DO $$
DECLARE
    invalid_value text;
BEGIN
    BEGIN
        INSERT INTO "timetable_import_column_mappings" (
            "profile_revision_id", "semantic_field", "source_header", "source_header_key"
        ) VALUES ('66000000-0000-0000-0000-000000000003', 'WEEKDAY', 'Thứ khác', 'THU_KHAC');
        RAISE EXCEPTION 'Expected duplicate semantic field rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_import_column_mappings" (
            "profile_revision_id", "semantic_field", "source_header", "source_header_key"
        ) VALUES ('66000000-0000-0000-0000-000000000002', 'SESSION', 'Different field', 'DUPLICATE_KEY');
        RAISE EXCEPTION 'Expected duplicate normalized source header rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    FOREACH invalid_value IN ARRAY ARRAY['', ' leading', 'trailing '] LOOP
        BEGIN
            INSERT INTO "timetable_import_column_mappings" (
                "profile_revision_id", "semantic_field", "source_header", "source_header_key"
            ) VALUES ('66000000-0000-0000-0000-000000000002', 'WEEKDAY', invalid_value, 'UNUSED_HEADER');
            RAISE EXCEPTION 'Expected invalid source header rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        BEGIN
            INSERT INTO "timetable_import_column_mappings" (
                "profile_revision_id", "semantic_field", "source_header", "source_header_key"
            ) VALUES ('66000000-0000-0000-0000-000000000002', 'WEEKDAY', 'Unused header', invalid_value);
            RAISE EXCEPTION 'Expected invalid source header key rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM "timetable_import_column_mappings"
        WHERE "source_header" = "semantic_field"::text
    ) THEN
        RAISE EXCEPTION 'Raw source headers must remain separate from canonical semantic enum values';
    END IF;
END $$;

INSERT INTO "timetable_import_entity_aliases" (
    "id", "profile_id", "entity_type", "source_value", "source_value_key",
    "teacher_user_id", "created_by_user_id"
) VALUES (
    '66000000-0000-0000-0000-000000000011',
    '66000000-0000-0000-0000-000000000001', 'TEACHER', 'GV Alias', 'GV_ALIAS',
    '65000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001'
);
INSERT INTO "timetable_import_entity_aliases" (
    "id", "profile_id", "entity_type", "source_value", "source_value_key",
    "subject_id", "created_by_user_id"
) VALUES (
    '66000000-0000-0000-0000-000000000012',
    '66000000-0000-0000-0000-000000000001', 'SUBJECT', 'Môn Alias', 'MON_ALIAS',
    '65000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000001'
);
INSERT INTO "timetable_import_entity_aliases" (
    "id", "profile_id", "entity_type", "academic_year_id", "source_value", "source_value_key",
    "school_class_id", "created_by_user_id"
) VALUES
    (
        '66000000-0000-0000-0000-000000000013',
        '66000000-0000-0000-0000-000000000001', 'SCHOOL_CLASS',
        'a5000000-0000-0000-0000-000000000001', 'Lớp Alias', 'LOP_ALIAS',
        '65000000-0000-0000-0000-000000000003', '55000000-0000-0000-0000-000000000001'
    ),
    (
        '66000000-0000-0000-0000-000000000014',
        '66000000-0000-0000-0000-000000000001', 'SCHOOL_CLASS',
        'a5000000-0000-0000-0000-000000000002', 'Lớp Alias', 'LOP_ALIAS',
        '65000000-0000-0000-0000-000000000004', '55000000-0000-0000-0000-000000000001'
    );

DO $$
DECLARE
    invalid_value text;
BEGIN
    BEGIN
        INSERT INTO "timetable_import_entity_aliases" (
            "profile_id", "entity_type", "source_value", "source_value_key", "subject_id", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 'TEACHER', 'Wrong target', 'WRONG_TEACHER_TARGET',
            '65000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected TEACHER target-shape rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_entity_aliases" (
            "profile_id", "entity_type", "source_value", "source_value_key", "teacher_user_id", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 'SUBJECT', 'Wrong target', 'WRONG_SUBJECT_TARGET',
            '65000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected SUBJECT target-shape rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_entity_aliases" (
            "profile_id", "entity_type", "source_value", "source_value_key", "school_class_id", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 'SCHOOL_CLASS', 'Missing year', 'MISSING_YEAR',
            '65000000-0000-0000-0000-000000000003', '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected SCHOOL_CLASS without AcademicYear rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_entity_aliases" (
            "profile_id", "entity_type", "source_value", "source_value_key",
            "teacher_user_id", "subject_id", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 'TEACHER', 'Two targets', 'TWO_TARGETS',
            '65000000-0000-0000-0000-000000000001', '65000000-0000-0000-0000-000000000002',
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected multiple alias targets rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_entity_aliases" (
            "profile_id", "entity_type", "academic_year_id", "source_value", "source_value_key",
            "school_class_id", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 'SCHOOL_CLASS',
            'a5000000-0000-0000-0000-000000000001', 'Cross year', 'CROSS_YEAR',
            '65000000-0000-0000-0000-000000000004', '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected SCHOOL_CLASS same-year FK rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    FOREACH invalid_value IN ARRAY ARRAY['', ' leading', 'trailing '] LOOP
        BEGIN
            INSERT INTO "timetable_import_entity_aliases" (
                "profile_id", "entity_type", "source_value", "source_value_key", "teacher_user_id", "created_by_user_id"
            ) VALUES (
                '66000000-0000-0000-0000-000000000001', 'TEACHER', invalid_value, 'UNUSED_VALUE',
                '65000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001'
            );
            RAISE EXCEPTION 'Expected invalid alias source value rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        BEGIN
            INSERT INTO "timetable_import_entity_aliases" (
                "profile_id", "entity_type", "source_value", "source_value_key", "teacher_user_id", "created_by_user_id"
            ) VALUES (
                '66000000-0000-0000-0000-000000000001', 'TEACHER', 'Unused value', invalid_value,
                '65000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001'
            );
            RAISE EXCEPTION 'Expected invalid alias source value key rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;

    BEGIN
        INSERT INTO "timetable_import_entity_aliases" (
            "profile_id", "entity_type", "source_value", "source_value_key", "teacher_user_id", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 'TEACHER', 'GV duplicate', 'GV_ALIAS',
            '65000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected active teacher alias uniqueness rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_entity_aliases" (
            "profile_id", "entity_type", "source_value", "source_value_key", "subject_id", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 'SUBJECT', 'Môn duplicate', 'MON_ALIAS',
            '65000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected active subject alias uniqueness rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_entity_aliases" (
            "profile_id", "entity_type", "academic_year_id", "source_value", "source_value_key",
            "school_class_id", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 'SCHOOL_CLASS',
            'a5000000-0000-0000-0000-000000000001', 'Lớp duplicate', 'LOP_ALIAS',
            '65000000-0000-0000-0000-000000000003', '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected active class alias uniqueness rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_entity_aliases" (
            "profile_id", "entity_type", "source_value", "source_value_key", "teacher_user_id",
            "is_active", "created_by_user_id"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 'TEACHER', 'Invalid retired alias', 'INVALID_RETIRED',
            '65000000-0000-0000-0000-000000000001', false,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected incomplete alias retirement rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_entity_aliases" (
            "profile_id", "entity_type", "source_value", "source_value_key", "teacher_user_id",
            "is_active", "created_by_user_id", "retired_by_user_id", "retired_at"
        ) VALUES (
            '66000000-0000-0000-0000-000000000001', 'TEACHER', 'Invalid active alias', 'INVALID_ACTIVE',
            '65000000-0000-0000-0000-000000000001', true,
            '55000000-0000-0000-0000-000000000001',
            '55000000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP
        );
        RAISE EXCEPTION 'Expected active alias with retirement metadata rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

UPDATE "timetable_import_entity_aliases"
SET "is_active" = false,
    "retired_by_user_id" = '55000000-0000-0000-0000-000000000002',
    "retired_at" = CURRENT_TIMESTAMP
WHERE "id" = '66000000-0000-0000-0000-000000000011';

INSERT INTO "timetable_import_entity_aliases" (
    "id", "profile_id", "entity_type", "source_value", "source_value_key",
    "teacher_user_id", "created_by_user_id"
) VALUES (
    '66000000-0000-0000-0000-000000000015',
    '66000000-0000-0000-0000-000000000001', 'TEACHER', 'GV Alias replacement', 'GV_ALIAS',
    '65000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001'
);

-- Add another exact target week; equal semantic content at this week is intentionally allowed.
INSERT INTO "academic_weeks" (
    "id", "calendar_version_id", "kind", "official_week_number", "display_label", "sort_order"
) VALUES (
    'c6000000-0000-0000-0000-000000000001',
    'b5000000-0000-0000-0000-000000000001', 'OFFICIAL', 2, 'TT A v1 week 2', 2
);

INSERT INTO "timetable_versions" (
    "id", "academic_year_id", "version_number", "calendar_version_id",
    "effective_academic_week_id", "effective_from", "content_checksum", "created_by_user_id"
) VALUES
    (
        '67000000-0000-0000-0000-000000000001',
        'a5000000-0000-0000-0000-000000000001', 200,
        'b5000000-0000-0000-0000-000000000001',
        'c5000000-0000-0000-0000-000000000001', DATE '2026-09-01',
        'semantic-import-a', '55000000-0000-0000-0000-000000000001'
    ),
    (
        '67000000-0000-0000-0000-000000000002',
        'a5000000-0000-0000-0000-000000000001', 201,
        'b5000000-0000-0000-0000-000000000001',
        'c6000000-0000-0000-0000-000000000001', DATE '2026-09-08',
        'semantic-import-a', '55000000-0000-0000-0000-000000000001'
    ),
    (
        '67000000-0000-0000-0000-000000000003',
        'a5000000-0000-0000-0000-000000000002', 200,
        'b5000000-0000-0000-0000-000000000003',
        'c5000000-0000-0000-0000-000000000003', DATE '2027-09-01',
        'semantic-import-a', '55000000-0000-0000-0000-000000000001'
    ),
    (
        '67000000-0000-0000-0000-000000000004',
        'a5000000-0000-0000-0000-000000000001', 202,
        'b5000000-0000-0000-0000-000000000001',
        'c5000000-0000-0000-0000-000000000001', DATE '2026-09-01',
        'semantic-import-b', '55000000-0000-0000-0000-000000000001'
    );

DO $$
BEGIN
    BEGIN
        INSERT INTO "timetable_versions" (
            "academic_year_id", "version_number", "calendar_version_id",
            "effective_academic_week_id", "effective_from", "content_checksum", "created_by_user_id"
        ) VALUES (
            'a5000000-0000-0000-0000-000000000001', 203,
            'b5000000-0000-0000-0000-000000000001',
            'c5000000-0000-0000-0000-000000000001', DATE '2026-09-01',
            'semantic-import-a', '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected target-scoped semantic duplicate rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;

INSERT INTO "timetable_import_receipts" (
    "id", "timetable_version_id", "profile_revision_id", "checksum_algorithm",
    "serialization_version", "request_idempotency_key", "request_fingerprint",
    "source_file_name", "sheet_name", "header_row_number", "source_row_count",
    "normalized_entry_count", "created_by_user_id"
) VALUES (
    '68000000-0000-0000-0000-000000000001',
    '67000000-0000-0000-0000-000000000001',
    '66000000-0000-0000-0000-000000000002',
    'SHA-256', 'semantic-v1', 'stable-import-request', 'fingerprint-a',
    'timetable.xlsx', 'TKB', 3, 20, 18,
    '55000000-0000-0000-0000-000000000001'
);

DO $$
DECLARE
    invalid_value text;
BEGIN
    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "source_file_name", "sheet_name", "header_row_number", "source_row_count",
            "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            '67000000-0000-0000-0000-000000000001', '66000000-0000-0000-0000-000000000003',
            'SHA-256', 'semantic-v1', 'second.xlsx', 'TKB', 1, 1, 1,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected one receipt per TimetableVersion rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "source_file_name", "sheet_name", "header_row_number", "source_row_count",
            "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            'ffffffff-ffff-ffff-ffff-ffffffffffff', '66000000-0000-0000-0000-000000000003',
            'SHA-256', 'semantic-v1', 'unknown.xlsx', 'TKB', 1, 1, 1,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected unknown TimetableVersion rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "source_file_name", "sheet_name", "header_row_number", "source_row_count",
            "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            '67000000-0000-0000-0000-000000000004', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            'SHA-256', 'semantic-v1', 'unknown-profile.xlsx', 'TKB', 1, 1, 1,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected unknown profile revision rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "request_idempotency_key", "request_fingerprint", "source_file_name", "sheet_name",
            "header_row_number", "source_row_count", "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            '67000000-0000-0000-0000-000000000002', '66000000-0000-0000-0000-000000000003',
            'SHA-256', 'semantic-v1', 'stable-import-request', 'different-fingerprint',
            'other.xlsx', 'TKB', 1, 1, 1, '55000000-0000-0000-0000-000000000002'
        );
        RAISE EXCEPTION 'Expected globally unique request idempotency key rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "request_idempotency_key", "source_file_name", "sheet_name", "header_row_number",
            "source_row_count", "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
            'SHA-256', 'semantic-v1', 'key-without-fingerprint', 'pair.xlsx', 'TKB', 1, 1, 1,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected request key without fingerprint rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "request_fingerprint", "source_file_name", "sheet_name", "header_row_number",
            "source_row_count", "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
            'SHA-256', 'semantic-v1', 'fingerprint-without-key', 'pair.xlsx', 'TKB', 1, 1, 1,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected fingerprint without request key rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    FOREACH invalid_value IN ARRAY ARRAY['', ' leading', 'trailing '] LOOP
        BEGIN
            INSERT INTO "timetable_import_receipts" (
                "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
                "request_idempotency_key", "request_fingerprint", "source_file_name", "sheet_name",
                "header_row_number", "source_row_count", "normalized_entry_count", "created_by_user_id"
            ) VALUES (
                '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
                'SHA-256', 'semantic-v1', invalid_value, 'fingerprint', 'pair.xlsx', 'TKB', 1, 1, 1,
                '55000000-0000-0000-0000-000000000001'
            );
            RAISE EXCEPTION 'Expected invalid request key rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        BEGIN
            INSERT INTO "timetable_import_receipts" (
                "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
                "request_idempotency_key", "request_fingerprint", "source_file_name", "sheet_name",
                "header_row_number", "source_row_count", "normalized_entry_count", "created_by_user_id"
            ) VALUES (
                '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
                'SHA-256', 'semantic-v1', 'unused-key', invalid_value, 'pair.xlsx', 'TKB', 1, 1, 1,
                '55000000-0000-0000-0000-000000000001'
            );
            RAISE EXCEPTION 'Expected invalid request fingerprint rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;

    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "source_file_name", "sheet_name", "header_row_number", "source_row_count",
            "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
            'MD5', 'semantic-v1', 'bad-algorithm.xlsx', 'TKB', 1, 1, 1,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected checksum algorithm rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "source_file_name", "sheet_name", "header_row_number", "source_row_count",
            "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
            'SHA-256', 'semantic-v2', 'bad-serialization.xlsx', 'TKB', 1, 1, 1,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected serialization version rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    FOREACH invalid_value IN ARRAY ARRAY['', ' leading', 'trailing '] LOOP
        BEGIN
            INSERT INTO "timetable_import_receipts" (
                "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
                "source_file_name", "sheet_name", "header_row_number", "source_row_count",
                "normalized_entry_count", "created_by_user_id"
            ) VALUES (
                '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
                'SHA-256', 'semantic-v1', invalid_value, 'TKB', 1, 1, 1,
                '55000000-0000-0000-0000-000000000001'
            );
            RAISE EXCEPTION 'Expected invalid source file name rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        BEGIN
            INSERT INTO "timetable_import_receipts" (
                "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
                "source_file_name", "sheet_name", "header_row_number", "source_row_count",
                "normalized_entry_count", "created_by_user_id"
            ) VALUES (
                '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
                'SHA-256', 'semantic-v1', 'valid.xlsx', invalid_value, 1, 1, 1,
                '55000000-0000-0000-0000-000000000001'
            );
            RAISE EXCEPTION 'Expected invalid sheet name rejection';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;

    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "source_file_name", "sheet_name", "header_row_number", "source_row_count",
            "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
            'SHA-256', 'semantic-v1', 'bad-count.xlsx', 'TKB', 0, 1, 1,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected header row number rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "source_file_name", "sheet_name", "header_row_number", "source_row_count",
            "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
            'SHA-256', 'semantic-v1', 'bad-count.xlsx', 'TKB', 1, -1, 1,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected source row count rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO "timetable_import_receipts" (
            "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
            "source_file_name", "sheet_name", "header_row_number", "source_row_count",
            "normalized_entry_count", "created_by_user_id"
        ) VALUES (
            '67000000-0000-0000-0000-000000000004', '66000000-0000-0000-0000-000000000003',
            'SHA-256', 'semantic-v1', 'bad-count.xlsx', 'TKB', 1, 0, 0,
            '55000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected normalized entry count rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Multiple NULL request keys are valid and do not collide.
INSERT INTO "timetable_import_receipts" (
    "id", "timetable_version_id", "profile_revision_id", "checksum_algorithm", "serialization_version",
    "source_file_name", "sheet_name", "header_row_number", "source_row_count",
    "normalized_entry_count", "created_by_user_id"
) VALUES
    (
        '68000000-0000-0000-0000-000000000002',
        '67000000-0000-0000-0000-000000000002', '66000000-0000-0000-0000-000000000003',
        'SHA-256', 'semantic-v1', 'week-two.xlsx', 'TKB', 1, 1, 1,
        '55000000-0000-0000-0000-000000000001'
    ),
    (
        '68000000-0000-0000-0000-000000000003',
        '67000000-0000-0000-0000-000000000003', '66000000-0000-0000-0000-000000000003',
        'SHA-256', 'semantic-v1', 'other-year.xlsx', 'TKB', 1, 0, 1,
        '55000000-0000-0000-0000-000000000002'
    );

DO $$
BEGIN
    BEGIN
        DELETE FROM "timetable_import_profile_revisions"
        WHERE "id" = '66000000-0000-0000-0000-000000000002';
        RAISE EXCEPTION 'Expected receipt profile revision deletion restriction';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        DELETE FROM "timetable_versions"
        WHERE "id" = '67000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected receipt timetable version deletion restriction';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        DELETE FROM "users"
        WHERE "id" = '65000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected aliased teacher deletion restriction';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        DELETE FROM "subjects"
        WHERE "id" = '65000000-0000-0000-0000-000000000002';
        RAISE EXCEPTION 'Expected aliased subject deletion restriction';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        DELETE FROM "classes"
        WHERE "id" = '65000000-0000-0000-0000-000000000003';
        RAISE EXCEPTION 'Expected aliased class deletion restriction';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

SELECT 'Timetable import persistence PostgreSQL verification PASS; no raw workbook bytes are stored.' AS result;

ROLLBACK;
