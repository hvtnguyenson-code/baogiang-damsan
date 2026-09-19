-- P4-020 forward hardening: reject moving a retained published child into a mutable draft parent.
-- The first migration checked only the destination parent on UPDATE; this replacement checks
-- both source and destination ownership for topic items, slots, and slot staffing.

CREATE OR REPLACE FUNCTION programme_topic_item_draft_guard() RETURNS trigger AS $$
DECLARE
    source_status "ProgrammePlanVersionStatus";
    destination_status "ProgrammePlanVersionStatus";
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT status INTO source_status
          FROM "programme_plan_versions"
         WHERE id = OLD.programme_plan_version_id;
        IF source_status IS DISTINCT FROM 'DRAFT'::"ProgrammePlanVersionStatus" THEN
            RAISE EXCEPTION 'Programme topic items are mutable only while the source plan version is DRAFT' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT status INTO destination_status
          FROM "programme_plan_versions"
         WHERE id = NEW.programme_plan_version_id;
        IF destination_status IS DISTINCT FROM 'DRAFT'::"ProgrammePlanVersionStatus" THEN
            RAISE EXCEPTION 'Programme topic items are mutable only while the destination plan version is DRAFT' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION planned_occurrence_child_draft_guard() RETURNS trigger AS $$
DECLARE
    source_occurrence_id UUID;
    destination_occurrence_id UUID;
    source_status "ProgrammeOccurrenceStatus";
    destination_status "ProgrammeOccurrenceStatus";
BEGIN
    IF TG_TABLE_NAME = 'planned_occurrence_slots' THEN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            source_occurrence_id := OLD.planned_programme_occurrence_id;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            destination_occurrence_id := NEW.planned_programme_occurrence_id;
        END IF;
    ELSE
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            SELECT planned_programme_occurrence_id INTO source_occurrence_id
              FROM "planned_occurrence_slots"
             WHERE id = OLD.planned_occurrence_slot_id;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            SELECT planned_programme_occurrence_id INTO destination_occurrence_id
              FROM "planned_occurrence_slots"
             WHERE id = NEW.planned_occurrence_slot_id;
        END IF;
    END IF;

    IF source_occurrence_id IS NOT NULL THEN
        SELECT status INTO source_status
          FROM "planned_programme_occurrences"
         WHERE id = source_occurrence_id;
        IF source_status IS DISTINCT FROM 'DRAFT'::"ProgrammeOccurrenceStatus" THEN
            RAISE EXCEPTION 'Programme occurrence child cannot be changed or moved out of a published source occurrence' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF destination_occurrence_id IS NOT NULL THEN
        SELECT status INTO destination_status
          FROM "planned_programme_occurrences"
         WHERE id = destination_occurrence_id;
        IF destination_status IS DISTINCT FROM 'DRAFT'::"ProgrammeOccurrenceStatus" THEN
            RAISE EXCEPTION 'Programme occurrence child cannot be inserted or moved into a published destination occurrence' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
