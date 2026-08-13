\set ON_ERROR_STOP on

DO $$
DECLARE
    capability_count integer;
    distinct_count integer;
    validity_constraint_count integer;
BEGIN
    SELECT count(*), count(DISTINCT "key")
      INTO capability_count, distinct_count
      FROM "capability_definitions";
    IF capability_count <> 28 OR distinct_count <> 28 THEN
        RAISE EXCEPTION 'Capability seed is not idempotent: count %, distinct %',
            capability_count, distinct_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM "capability_definitions"
         WHERE "key" = 'PPCT_MANAGE'
           AND cardinality("allowed_scope_types") = 2
           AND "allowed_scope_types" @> ARRAY['SUBJECT', 'SCHOOL_WIDE']::text[]
           AND "allowed_scope_types" <@ ARRAY['SUBJECT', 'SCHOOL_WIDE']::text[]
    ) THEN
        RAISE EXCEPTION 'PPCT_MANAGE must allow exactly SUBJECT and SCHOOL_WIDE';
    END IF;

    SELECT count(*)
      INTO validity_constraint_count
      FROM pg_constraint
     WHERE conname IN (
        'subject_group_memberships_validity_check',
        'staff_subjects_validity_check',
        'capability_grants_validity_check',
        'additional_duty_definitions_validity_check',
        'staff_duty_assignments_validity_check'
     );
    IF validity_constraint_count <> 5 THEN
        RAISE EXCEPTION 'Expected five temporal validity CHECK constraints, found %',
            validity_constraint_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON tc.constraint_catalog = rc.constraint_catalog
         AND tc.constraint_schema = rc.constraint_schema
         AND tc.constraint_name = rc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name IN (
              'capability_grants',
              'staff_additional_duty_assignments',
              'audit_events'
          )
          AND rc.delete_rule = 'CASCADE'
    ) THEN
        RAISE EXCEPTION 'History-bearing foreign key uses ON DELETE CASCADE';
    END IF;
END $$;

INSERT INTO "users" ("id", "username", "password_hash", "status") VALUES
    ('10000000-0000-0000-0000-000000000001', 'schema.admin', 'test-hash-only', 'ACTIVE'),
    ('10000000-0000-0000-0000-000000000002', 'schema.teacher', 'test-hash-only', 'ACTIVE');

INSERT INTO "staff_profiles" ("id", "user_id", "staff_code", "display_name") VALUES
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'GV001', 'Giáo viên kiểm thử');

INSERT INTO "subject_groups" ("id", "code", "name") VALUES
    ('30000000-0000-0000-0000-000000000001', 'TOAN', 'Tổ Toán');

INSERT INTO "subjects" ("id", "code", "name") VALUES
    ('40000000-0000-0000-0000-000000000001', 'TOAN', 'Toán');

INSERT INTO "additional_duty_definitions" (
    "id", "code", "name", "category", "valid_from"
) VALUES (
    '50000000-0000-0000-0000-000000000001', 'TO_PHO', 'Tổ phó', 'TO_CHUYEN_MON', '2026-01-01T00:00:00Z'
);

-- CHECK validity must reject reversed ranges.
DO $$
BEGIN
    BEGIN
        INSERT INTO "subject_group_memberships" (
            "user_id", "subject_group_id", "valid_from", "valid_until"
        ) VALUES (
            '10000000-0000-0000-0000-000000000002',
            '30000000-0000-0000-0000-000000000001',
            '2026-06-01T00:00:00Z', '2026-05-01T00:00:00Z'
        );
        RAISE EXCEPTION 'Expected membership validity CHECK violation';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END $$;

INSERT INTO "subject_group_memberships" (
    "user_id", "subject_group_id", "valid_from", "valid_until", "is_primary"
) VALUES (
    '10000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z', true
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "subject_group_memberships" (
            "user_id", "subject_group_id", "valid_from", "valid_until"
        ) VALUES (
            '10000000-0000-0000-0000-000000000002',
            '30000000-0000-0000-0000-000000000001',
            '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z'
        );
        RAISE EXCEPTION 'Expected exact membership duplicate violation';
    EXCEPTION WHEN unique_violation OR exclusion_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO "subject_group_memberships" (
            "user_id", "subject_group_id", "valid_from", "valid_until"
        ) VALUES (
            '10000000-0000-0000-0000-000000000002',
            '30000000-0000-0000-0000-000000000001',
            '2026-06-01T00:00:00Z', '2026-12-01T00:00:00Z'
        );
        RAISE EXCEPTION 'Expected membership overlap violation';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;
END $$;

INSERT INTO "staff_subjects" (
    "user_id", "subject_id", "valid_from", "valid_until", "is_primary"
) VALUES (
    '10000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z', true
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "staff_subjects" (
            "user_id", "subject_id", "valid_from", "valid_until"
        ) VALUES (
            '10000000-0000-0000-0000-000000000002',
            '40000000-0000-0000-0000-000000000001',
            '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z'
        );
        RAISE EXCEPTION 'Expected exact staff-subject duplicate violation';
    EXCEPTION WHEN unique_violation OR exclusion_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO "staff_subjects" (
            "user_id", "subject_id", "valid_from", "valid_until"
        ) VALUES (
            '10000000-0000-0000-0000-000000000002',
            '40000000-0000-0000-0000-000000000001',
            '2026-03-01T00:00:00Z', '2026-09-01T00:00:00Z'
        );
        RAISE EXCEPTION 'Expected staff-subject overlap violation';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;
END $$;

INSERT INTO "capability_grants" (
    "user_id", "capability_key", "scope_type", "valid_from", "valid_until", "granted_by_user_id"
) VALUES (
    '10000000-0000-0000-0000-000000000002', 'USER_MANAGE', 'SCHOOL_WIDE',
    '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z',
    '10000000-0000-0000-0000-000000000001'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "capability_grants" (
            "user_id", "capability_key", "scope_type", "valid_from", "valid_until"
        ) VALUES (
            '10000000-0000-0000-0000-000000000002', 'USER_MANAGE', 'SCHOOL_WIDE',
            '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z'
        );
        RAISE EXCEPTION 'Expected exact capability-grant duplicate violation';
    EXCEPTION WHEN unique_violation OR exclusion_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO "capability_grants" (
            "user_id", "capability_key", "scope_type", "valid_from", "valid_until"
        ) VALUES (
            '10000000-0000-0000-0000-000000000002', 'USER_MANAGE', 'SCHOOL_WIDE',
            '2026-06-01T00:00:00Z', '2026-12-01T00:00:00Z'
        );
        RAISE EXCEPTION 'Expected active capability-grant overlap violation';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;
END $$;

INSERT INTO "staff_additional_duty_assignments" (
    "staff_profile_id", "duty_definition_id", "scope_type", "valid_from", "valid_until", "created_by_user_id"
) VALUES (
    '20000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    'SUBJECT_GROUP', '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z',
    '10000000-0000-0000-0000-000000000001'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO "staff_additional_duty_assignments" (
            "staff_profile_id", "duty_definition_id", "scope_type", "valid_from", "valid_until", "created_by_user_id"
        ) VALUES (
            '20000000-0000-0000-0000-000000000001',
            '50000000-0000-0000-0000-000000000001',
            'SUBJECT_GROUP', '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z',
            '10000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected exact additional-duty assignment duplicate violation';
    EXCEPTION WHEN unique_violation OR exclusion_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO "staff_additional_duty_assignments" (
            "staff_profile_id", "duty_definition_id", "scope_type", "valid_from", "valid_until", "created_by_user_id"
        ) VALUES (
            '20000000-0000-0000-0000-000000000001',
            '50000000-0000-0000-0000-000000000001',
            'SUBJECT_GROUP', '2026-04-01T00:00:00Z', '2026-10-01T00:00:00Z',
            '10000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'Expected additional-duty assignment overlap violation';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;
END $$;

-- Disabling a catalog item must preserve assignment history.
UPDATE "additional_duty_definitions"
SET "is_active" = false
WHERE "id" = '50000000-0000-0000-0000-000000000001';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "staff_additional_duty_assignments"
        WHERE "duty_definition_id" = '50000000-0000-0000-0000-000000000001'
    ) THEN
        RAISE EXCEPTION 'Inactive catalog item lost assignment history';
    END IF;

    BEGIN
        DELETE FROM "additional_duty_definitions"
        WHERE "id" = '50000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Expected duty catalog history delete restriction';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        DELETE FROM "capability_definitions" WHERE "key" = 'USER_MANAGE';
        RAISE EXCEPTION 'Expected capability catalog history delete restriction';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;
END $$;

-- Audit rows survive actor deletion by nulling the actor reference.
INSERT INTO "users" ("id", "username", "password_hash", "status") VALUES
    ('10000000-0000-0000-0000-000000000003', 'schema.audit.actor', 'test-hash-only', 'ACTIVE');
INSERT INTO "audit_events" ("actor_user_id", "action", "entity_type", "result") VALUES
    ('10000000-0000-0000-0000-000000000003', 'SCHEMA_TEST', 'User', 'SUCCESS');
DELETE FROM "users" WHERE "id" = '10000000-0000-0000-0000-000000000003';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "audit_events"
        WHERE "action" = 'SCHEMA_TEST' AND "actor_user_id" IS NULL
    ) THEN
        RAISE EXCEPTION 'Audit history was not preserved after actor deletion';
    END IF;
END $$;
