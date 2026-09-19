\set ON_ERROR_STOP on

BEGIN;

INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('a4210000-0000-0000-0000-000000000001', 'P4H-2026-2027', 'Programme hardening 2026-2027');

INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('d4210000-0000-0000-0000-000000000001', 'p4h.actor', 'not-a-real-password-hash', 'ACTIVE', false),
    ('d4210000-0000-0000-0000-000000000002', 'p4h.teacher.a', 'not-a-real-password-hash', 'ACTIVE', false);

INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('c4210000-0000-0000-0000-000000000001', 'a4210000-0000-0000-0000-000000000001', 'P4H-10A1', 'Programme Hardening 10A1', 10);

INSERT INTO "time_slot_definitions" (
    "id", "academic_year_id", "weekday", "session", "ordinal", "revision",
    "display_label", "start_time", "end_time"
) VALUES
    ('e4210000-0000-0000-0000-000000000001', 'a4210000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 1, 1, 'P4H Monday 1', TIME '07:00', TIME '07:45'),
    ('e4210000-0000-0000-0000-000000000002', 'a4210000-0000-0000-0000-000000000001', 'TUESDAY', 'MORNING', 1, 1, 'P4H Tuesday 1', TIME '07:00', TIME '07:45'),
    ('e4210000-0000-0000-0000-000000000003', 'a4210000-0000-0000-0000-000000000001', 'MONDAY', 'MORNING', 2, 1, 'P4H Monday 2', TIME '07:50', TIME '08:35');

INSERT INTO "programme_masters" (
    "id", "academic_year_id", "kind", "grade_level", "created_by_user_id"
) VALUES (
    'f4210000-0000-0000-0000-000000000001',
    'a4210000-0000-0000-0000-000000000001',
    'GDDP', 10,
    'd4210000-0000-0000-0000-000000000001'
);

-- Source plan is created as draft, populated with topics, then published.
INSERT INTO "programme_plan_versions" (
    "id", "programme_master_id", "version_number", "created_by_user_id"
) VALUES (
    '14210000-0000-0000-0000-000000000001', 'f4210000-0000-0000-0000-000000000001', 1, 'd4210000-0000-0000-0000-000000000001'
);

INSERT INTO "programme_topic_items" (
    "id", "programme_plan_version_id", "sequence", "title", "required_periods"
) VALUES (
    '24210000-0000-0000-0000-000000000001', '14210000-0000-0000-0000-000000000001', 1, 'Published source topic', 1
);

UPDATE "programme_plan_versions"
SET "status" = 'PUBLISHED',
    "published_by_user_id" = 'd4210000-0000-0000-0000-000000000001',
    "published_at" = CURRENT_TIMESTAMP
WHERE "id" = '14210000-0000-0000-0000-000000000001';

-- Destination plan remains a mutable draft after version 1 is published.
INSERT INTO "programme_plan_versions" (
    "id", "programme_master_id", "version_number", "created_by_user_id"
) VALUES (
    '14210000-0000-0000-0000-000000000002', 'f4210000-0000-0000-0000-000000000001', 2, 'd4210000-0000-0000-0000-000000000001'
);

INSERT INTO "programme_topic_items" (
    "id", "programme_plan_version_id", "sequence", "title", "required_periods"
) VALUES (
    '24210000-0000-0000-0000-000000000002', '14210000-0000-0000-0000-000000000002', 1, 'Draft destination topic', 1
);

DO $$
BEGIN
    BEGIN
        UPDATE "programme_topic_items"
        SET "programme_plan_version_id" = '14210000-0000-0000-0000-000000000002'
        WHERE "id" = '24210000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected moving a topic out of a published source plan to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Monday 2026-10-05 is a valid exact-date/slot pairing.
INSERT INTO "planned_programme_occurrences" (
    "id", "programme_master_id", "programme_plan_version_id", "programme_topic_item_id",
    "academic_year_id", "civil_date", "mode", "school_class_id", "created_by_user_id"
) VALUES
    ('34210000-0000-0000-0000-000000000001', 'f4210000-0000-0000-0000-000000000001', '14210000-0000-0000-0000-000000000001', '24210000-0000-0000-0000-000000000001', 'a4210000-0000-0000-0000-000000000001', DATE '2026-10-05', 'CLASS', 'c4210000-0000-0000-0000-000000000001', 'd4210000-0000-0000-0000-000000000001'),
    ('34210000-0000-0000-0000-000000000002', 'f4210000-0000-0000-0000-000000000001', '14210000-0000-0000-0000-000000000001', '24210000-0000-0000-0000-000000000001', 'a4210000-0000-0000-0000-000000000001', DATE '2026-10-05', 'CLASS', 'c4210000-0000-0000-0000-000000000001', 'd4210000-0000-0000-0000-000000000001');

INSERT INTO "planned_occurrence_slots" (
    "id", "planned_programme_occurrence_id", "academic_year_id", "time_slot_definition_id"
) VALUES
    ('44210000-0000-0000-0000-000000000001', '34210000-0000-0000-0000-000000000001', 'a4210000-0000-0000-0000-000000000001', 'e4210000-0000-0000-0000-000000000001'),
    ('44210000-0000-0000-0000-000000000002', '34210000-0000-0000-0000-000000000002', 'a4210000-0000-0000-0000-000000000001', 'e4210000-0000-0000-0000-000000000003');

INSERT INTO "planned_slot_staffing" (
    "id", "planned_occurrence_slot_id", "teacher_user_id"
) VALUES
    ('54210000-0000-0000-0000-000000000001', '44210000-0000-0000-0000-000000000001', 'd4210000-0000-0000-0000-000000000002'),
    ('54210000-0000-0000-0000-000000000002', '44210000-0000-0000-0000-000000000002', 'd4210000-0000-0000-0000-000000000002');

DO $$
BEGIN
    BEGIN
        INSERT INTO "planned_occurrence_slots" (
            "planned_programme_occurrence_id", "academic_year_id", "time_slot_definition_id"
        ) VALUES (
            '34210000-0000-0000-0000-000000000002',
            'a4210000-0000-0000-0000-000000000001',
            'e4210000-0000-0000-0000-000000000002'
        );
        RAISE EXCEPTION 'Expected Tuesday slot on Monday occurrence to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE "planned_programme_occurrences"
        SET "civil_date" = DATE '2026-10-06'
        WHERE "id" = '34210000-0000-0000-0000-000000000002';
        RAISE EXCEPTION 'Expected date change that invalidates existing Monday slot to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Freeze source occurrence, then prove children cannot be moved out into a DRAFT occurrence.
UPDATE "planned_programme_occurrences"
SET "status" = 'PUBLISHED',
    "published_by_user_id" = 'd4210000-0000-0000-0000-000000000001',
    "published_at" = CURRENT_TIMESTAMP
WHERE "id" = '34210000-0000-0000-0000-000000000001';

DO $$
BEGIN
    BEGIN
        UPDATE "planned_occurrence_slots"
        SET "planned_programme_occurrence_id" = '34210000-0000-0000-0000-000000000002'
        WHERE "id" = '44210000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected moving a slot out of a published source occurrence to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE "planned_slot_staffing"
        SET "planned_occurrence_slot_id" = '44210000-0000-0000-0000-000000000002'
        WHERE "id" = '54210000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected moving staffing out of a published source occurrence to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

ROLLBACK;
