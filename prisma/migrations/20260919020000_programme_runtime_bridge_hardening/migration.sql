-- P4-040 Hardening: Coherent provenance tuple, homeroom pairing, immutable history,
-- active root guard, and actor-scoped attestation request-keys.

-- 1. Actor-scoped attestation request key uniqueness
DROP INDEX IF EXISTS "programme_occurrence_attestations_create_request_key_key";
DROP INDEX IF EXISTS "programme_occurrence_attestations_reverse_request_key_key";

CREATE UNIQUE INDEX IF NOT EXISTS "programme_occurrence_attestations_actor_create_key"
    ON "programme_occurrence_attestations"("attested_by_user_id", "create_request_key");

CREATE UNIQUE INDEX IF NOT EXISTS "programme_occurrence_attestations_actor_reverse_key"
    ON "programme_occurrence_attestations"("reversed_by_user_id", "reverse_request_key")
    WHERE "reverse_request_key" IS NOT NULL;

-- 2. Relax eligibility shape check constraint to permit truthful historical inactive staffing
ALTER TABLE "special_activity_staffing"
    DROP CONSTRAINT IF EXISTS "special_activity_staffing_eligibility_shape_check";

-- 2. Guard trigger for ProgrammeMaterializedActivity
CREATE OR REPLACE FUNCTION programme_materialized_activity_guard()
RETURNS TRIGGER AS $$
DECLARE
    v_plan_master_id UUID;
    v_topic_plan_id UUID;
    v_occ_master_id UUID;
    v_occ_plan_id UUID;
    v_occ_topic_id UUID;
    v_slot_occ_id UUID;
    v_assignment_teacher_id UUID;
    v_new_activity_status TEXT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'programme_materialized_activities rows are immutable and cannot be updated.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'programme_materialized_activities rows cannot be deleted; retained history must be preserved.';
    END IF;

    -- Coherent provenance tuple check
    SELECT programme_master_id INTO v_plan_master_id
    FROM programme_plan_versions
    WHERE id = NEW.programme_plan_version_id;

    IF v_plan_master_id IS NULL OR v_plan_master_id <> NEW.programme_master_id THEN
        RAISE EXCEPTION 'Coherent provenance check failed: programme_plan_version does not belong to programme_master.';
    END IF;

    SELECT programme_plan_version_id INTO v_topic_plan_id
    FROM programme_topic_items
    WHERE id = NEW.programme_topic_item_id;

    IF v_topic_plan_id IS NULL OR v_topic_plan_id <> NEW.programme_plan_version_id THEN
        RAISE EXCEPTION 'Coherent provenance check failed: programme_topic_item does not belong to programme_plan_version.';
    END IF;

    SELECT programme_master_id, programme_plan_version_id, programme_topic_item_id
    INTO v_occ_master_id, v_occ_plan_id, v_occ_topic_id
    FROM planned_programme_occurrences
    WHERE id = NEW.planned_programme_occurrence_id;

    IF v_occ_master_id IS NULL
       OR v_occ_master_id <> NEW.programme_master_id
       OR v_occ_plan_id <> NEW.programme_plan_version_id
       OR v_occ_topic_id <> NEW.programme_topic_item_id THEN
        RAISE EXCEPTION 'Coherent provenance check failed: planned_programme_occurrence does not match master, plan_version, or topic.';
    END IF;

    SELECT planned_programme_occurrence_id INTO v_slot_occ_id
    FROM planned_occurrence_slots
    WHERE id = NEW.planned_occurrence_slot_id;

    IF v_slot_occ_id IS NULL OR v_slot_occ_id <> NEW.planned_programme_occurrence_id THEN
        RAISE EXCEPTION 'Coherent provenance check failed: planned_occurrence_slot does not belong to planned_programme_occurrence.';
    END IF;

    -- Homeroom pair check
    IF NEW.homeroom_assignment_id IS NOT NULL THEN
        SELECT teacher_user_id INTO v_assignment_teacher_id
        FROM homeroom_assignments
        WHERE id = NEW.homeroom_assignment_id;

        IF v_assignment_teacher_id IS NULL OR v_assignment_teacher_id <> NEW.homeroom_teacher_user_id THEN
            RAISE EXCEPTION 'Homeroom pair check failed: homeroom_teacher_user_id does not match homeroom_assignment teacher.';
        END IF;
    END IF;

    -- Duplicate active slot root check
    SELECT status::text INTO v_new_activity_status
    FROM special_activities
    WHERE id = NEW.special_activity_id;

    IF v_new_activity_status = 'ACTIVE' THEN
        IF EXISTS (
            SELECT 1
            FROM programme_materialized_activities pma
            JOIN special_activities sa ON sa.id = pma.special_activity_id
            WHERE pma.planned_occurrence_slot_id = NEW.planned_occurrence_slot_id
              AND sa.status = 'ACTIVE'
              AND pma.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) THEN
            RAISE EXCEPTION 'Duplicate active root check failed: planned_occurrence_slot already has an ACTIVE materialized SpecialActivity root.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_programme_materialized_activity_guard ON programme_materialized_activities;
CREATE TRIGGER trg_programme_materialized_activity_guard
BEFORE INSERT OR UPDATE OR DELETE ON programme_materialized_activities
FOR EACH ROW EXECUTE FUNCTION programme_materialized_activity_guard();
