\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    missing_count integer;
BEGIN
    SELECT count(*) INTO missing_count
    FROM (VALUES
        ('programme_masters'),
        ('programme_plan_versions'),
        ('programme_topic_items'),
        ('planned_programme_occurrences'),
        ('planned_occurrence_slots'),
        ('planned_slot_staffing'),
        ('programme_planning_commands')
    ) AS expected(table_name)
    WHERE to_regclass('public.' || expected.table_name) IS NULL;

    IF missing_count <> 0 THEN
        RAISE EXCEPTION 'P4-020 programme persistence tables are incomplete';
    END IF;
END $$;

INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a4200000-0000-0000-0000-000000000001', 'P4-2026-2027', 'Programme 2026-2027');

INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('d4200000-0000-0000-0000-000000000001', 'p4.actor', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d4200000-0000-0000-0000-000000000002', 'p4.teacher.a', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d4200000-0000-0000-0000-000000000003', 'p4.teacher.b', 'not-a-real-password-hash', 'ACTIVE', false);

INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('c4200000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'P4-10A1', 'Programme Class 10A1', 10),
    ('c4200000-0000-0000-0000-000000000002', 'a4200000-0000-0000-0000-000000000001', 'P4-11A1', 'Programme Class 11A1', 11);

INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "revision",
    "display_label", "start_time", "end_time"
) VALUES
    ('e4200000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 1, 1, 'P4 Period 1', TIME '07:00', TIME '07:45'),
    ('e4200000-0000-0000-0000-000000000002', 'a4200000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 2, 1, 'P4 Period 2', TIME '07:50', TIME '08:35');

-- Canonical programme masters: GDDP is year+grade; HĐTN-HN is year-wide.
INSERT INTO "programme_masters" (
    "id", "academic_year_id", "kind", "grade_level", "created_by_user_id"
) VALUES
    ('f4200000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'GDDP', 10, 'd4200000-0000-0000-0000-000000000001'),
    ('f4200000-0000-0000-0000-000000000002', 'a4200000-0000-0000-0000-000000000001', 'HDTN_HN', NULL, 'd4200000-0000-0000-0000-000000000001');

DO $$
BEGIN
    BEGIN
        INSERT INTO "programme_masters" ("academic_year_id", "kind", "grade_level", "created_by_user_id")
        VALUES ('a4200000-0000-0000-0000-000000000001', 'GDDP', 10, 'd4200000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected duplicate GDDP year+grade rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "programme_masters" ("academic_year_id", "kind", "grade_level", "created_by_user_id")
        VALUES ('a4200000-0000-0000-0000-000000000001', 'HDTN_HN', 10, 'd4200000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Expected HDTN grade-shape rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Build and publish GDDP v1 with two retained topic items.
INSERT INTO "programme_plan_versions" (
    "id", "programme_master_id", "version_number", "created_by_user_id"
) VALUES (
    '14200000-0000-0000-0000-000000000001',
    'f4200000-0000-0000-0000-000000000001',
    1,
    'd4200000-0000-0000-0000-000000000001'
);

INSERT INTO "programme_topic_items" (
    "id", "programme_plan_version_id", "sequence", "title", "required_periods",
    "guideline_week_from", "guideline_week_to", "guideline_segment_label"
) VALUES
    ('24200000-0000-0000-0000-000000000001', '14200000-0000-0000-0000-000000000001', 1, 'GDDP Topic 1', 2, 1, 2, 'Đầu học kì'),
    ('24200000-0000-0000-0000-000000000002', '14200000-0000-0000-0000-000000000001', 2, 'GDDP Topic 2', 1, 3, 3, NULL);

UPDATE "programme_plan_versions"
SET "status" = 'PUBLISHED',
    "published_by_user_id" = 'd4200000-0000-0000-0000-000000000001',
    "published_at" = CURRENT_TIMESTAMP
WHERE "id" = '14200000-0000-0000-0000-000000000001';

DO $$
BEGIN
    BEGIN
        UPDATE "programme_topic_items"
        SET "title" = 'Illegal in-place published edit'
        WHERE "id" = '24200000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected published topic immutability rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "programme_topic_items" (
            "programme_plan_version_id", "sequence", "title", "required_periods"
        ) VALUES (
            '14200000-0000-0000-0000-000000000001', 3, 'Illegal late topic', 1
        );
        RAISE EXCEPTION 'Expected topic insertion into published plan rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- A GDDP CLASS occurrence may target only a class in the programme-master grade.
INSERT INTO "planned_programme_occurrences" (
    "id", "programme_master_id", "programme_plan_version_id", "programme_topic_item_id",
    "academic_year_id", "civil_date", "mode", "school_class_id", "created_by_user_id"
) VALUES (
    '34200000-0000-0000-0000-000000000001',
    'f4200000-0000-0000-0000-000000000001',
    '14200000-0000-0000-0000-000000000001',
    '24200000-0000-0000-0000-000000000001',
    'a4200000-0000-0000-0000-000000000001',
    DATE '2026-10-05', 'CLASS',
    'c4200000-0000-0000-0000-000000000001',
    'd4200000-0000-0000-0000-000000000001'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "planned_programme_occurrences" (
            "programme_master_id", "programme_plan_version_id", "programme_topic_item_id",
            "academic_year_id", "civil_date", "mode", "school_class_id", "created_by_user_id"
        ) VALUES (
            'f4200000-0000-0000-0000-000000000001',
            '14200000-0000-0000-0000-000000000001',
            '24200000-0000-0000-0000-000000000001',
            'a4200000-0000-0000-0000-000000000001',
            DATE '2026-10-06', 'CLASS',
            'c4200000-0000-0000-0000-000000000002',
            'd4200000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected GDDP CLASS target-grade rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "planned_programme_occurrences" (
            "programme_master_id", "programme_plan_version_id", "programme_topic_item_id",
            "academic_year_id", "civil_date", "mode", "created_by_user_id"
        ) VALUES (
            'f4200000-0000-0000-0000-000000000001',
            '14200000-0000-0000-0000-000000000001',
            '24200000-0000-0000-0000-000000000001',
            'a4200000-0000-0000-0000-000000000001',
            DATE '2026-10-06', 'SCHOOL_WIDE',
            'd4200000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected GDDP SCHOOL_WIDE rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Exact Slot -> Set<Teacher>: two slots may carry different teacher sets without Cartesian expansion.
INSERT INTO "planned_occurrence_slots" (
    "id", "planned_programme_occurrence_id", "academic_year_id", "time_slot_definition_id"
) VALUES
    ('44200000-0000-0000-0000-000000000001', '34200000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'e4200000-0000-0000-0000-000000000001'),
    ('44200000-0000-0000-0000-000000000002', '34200000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'e4200000-0000-0000-0000-000000000002');

INSERT INTO "planned_slot_staffing" (
    "id", "planned_occurrence_slot_id", "teacher_user_id"
) VALUES
    ('54200000-0000-0000-0000-000000000001', '44200000-0000-0000-0000-000000000001', 'd4200000-0000-0000-0000-000000000002'),
    ('54200000-0000-0000-0000-000000000002', '44200000-0000-0000-0000-000000000002', 'd4200000-0000-0000-0000-000000000003');

DO $$
BEGIN
    BEGIN
        INSERT INTO "planned_slot_staffing" ("planned_occurrence_slot_id", "teacher_user_id")
        VALUES ('44200000-0000-0000-0000-000000000001', 'd4200000-0000-0000-0000-000000000002');
        RAISE EXCEPTION 'Expected duplicate teacher membership within exact slot rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;

UPDATE "planned_programme_occurrences"
SET "status" = 'PUBLISHED',
    "published_by_user_id" = 'd4200000-0000-0000-0000-000000000001',
    "published_at" = CURRENT_TIMESTAMP
WHERE "id" = '34200000-0000-0000-0000-000000000001';

DO $$
BEGIN
    BEGIN
        INSERT INTO "planned_slot_staffing" ("planned_occurrence_slot_id", "teacher_user_id")
        VALUES ('44200000-0000-0000-0000-000000000001', 'd4200000-0000-0000-0000-000000000003');
        RAISE EXCEPTION 'Expected staffing insertion into published occurrence rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM "planned_slot_staffing"
        WHERE "id" = '54200000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected staffing deletion from published occurrence rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE "planned_programme_occurrences"
        SET "civil_date" = DATE '2026-10-12'
        WHERE "id" = '34200000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected in-place published occurrence edit rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Publish an HĐTN plan and prove SCHOOL_WIDE is a valid business mode there.
INSERT INTO "programme_plan_versions" (
    "id", "programme_master_id", "version_number", "created_by_user_id"
) VALUES (
    '14200000-0000-0000-0000-000000000010',
    'f4200000-0000-0000-0000-000000000002',
    1,
    'd4200000-0000-0000-0000-000000000001'
);
INSERT INTO "programme_topic_items" (
    "id", "programme_plan_version_id", "sequence", "title", "required_periods"
) VALUES (
    '24200000-0000-0000-0000-000000000010',
    '14200000-0000-0000-0000-000000000010',
    1, 'HĐTN school-wide topic', 1
);
UPDATE "programme_plan_versions"
SET "status" = 'PUBLISHED',
    "published_by_user_id" = 'd4200000-0000-0000-0000-000000000001',
    "published_at" = CURRENT_TIMESTAMP
WHERE "id" = '14200000-0000-0000-0000-000000000010';
INSERT INTO "planned_programme_occurrences" (
    "id", "programme_master_id", "programme_plan_version_id", "programme_topic_item_id",
    "academic_year_id", "civil_date", "mode", "created_by_user_id"
) VALUES (
    '34200000-0000-0000-0000-000000000010',
    'f4200000-0000-0000-0000-000000000002',
    '14200000-0000-0000-0000-000000000010',
    '24200000-0000-0000-0000-000000000010',
    'a4200000-0000-0000-0000-000000000001',
    DATE '2026-10-12', 'SCHOOL_WIDE',
    'd4200000-0000-0000-0000-000000000001'
);

-- Retained plan successor: no in-place rewrite of v1.
INSERT INTO "programme_plan_versions" (
    "id", "programme_master_id", "version_number", "predecessor_version_id", "change_reason", "created_by_user_id"
) VALUES (
    '14200000-0000-0000-0000-000000000002',
    'f4200000-0000-0000-0000-000000000001',
    2,
    '14200000-0000-0000-0000-000000000001',
    'Forward curriculum correction',
    'd4200000-0000-0000-0000-000000000001'
);
INSERT INTO "programme_topic_items" (
    "id", "programme_plan_version_id", "sequence", "title", "required_periods"
) VALUES (
    '24200000-0000-0000-0000-000000000003',
    '14200000-0000-0000-0000-000000000002',
    1, 'GDDP Topic 1 corrected', 2
);

UPDATE "programme_plan_versions"
SET "status" = 'SUPERSEDED',
    "superseded_by_user_id" = 'd4200000-0000-0000-0000-000000000001',
    "superseded_at" = CURRENT_TIMESTAMP
WHERE "id" = '14200000-0000-0000-0000-000000000001';
UPDATE "programme_plan_versions"
SET "status" = 'PUBLISHED',
    "published_by_user_id" = 'd4200000-0000-0000-0000-000000000001',
    "published_at" = CURRENT_TIMESTAMP
WHERE "id" = '14200000-0000-0000-0000-000000000002';

DO $$
BEGIN
    BEGIN
        UPDATE "programme_plan_versions"
        SET "change_reason" = 'Illegal historical rewrite'
        WHERE "id" = '14200000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected superseded plan immutability rejection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Idempotency receipt uniqueness is actor+command id; fingerprint is retained for conflict detection.
INSERT INTO "programme_planning_commands" (
    "actor_user_id", "command_id", "command_type", "fingerprint", "result"
) VALUES (
    'd4200000-0000-0000-0000-000000000001',
    'p4-command-001', 'PROGRAMME_PLAN_PUBLISH', 'fingerprint-a', '{"ok":true}'::jsonb
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "programme_planning_commands" (
            "actor_user_id", "command_id", "command_type", "fingerprint", "result"
        ) VALUES (
            'd4200000-0000-0000-0000-000000000001',
            'p4-command-001', 'PROGRAMME_PLAN_PUBLISH', 'fingerprint-b', '{"ok":false}'::jsonb
        );
        RAISE EXCEPTION 'Expected duplicate actor+command id rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;

-- P4-020 must not add programme-planning provenance columns to SpecialActivity yet.
DO $$
DECLARE
    leaked_columns integer;
BEGIN
    SELECT count(*) INTO leaked_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'special_activities'
      AND column_name IN (
          'programme_master_id',
          'programme_plan_version_id',
          'programme_topic_item_id',
          'planned_programme_occurrence_id'
      );
    IF leaked_columns <> 0 THEN
        RAISE EXCEPTION 'P4-020 leaked programme provenance into SpecialActivity runtime';
    END IF;
END $$;

ROLLBACK;
