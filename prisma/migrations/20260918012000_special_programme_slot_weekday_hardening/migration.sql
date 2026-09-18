-- P4-020 forward hardening: exact planned slots must match the occurrence civil-date weekday.
-- P4-040 must never receive a planning record whose civil date and canonical time-slot weekday disagree.

CREATE FUNCTION planned_occurrence_slot_weekday_guard() RETURNS trigger AS $$
DECLARE
    occurrence_date DATE;
    slot_weekday "AcademicWeekday";
    expected_weekday "AcademicWeekday";
BEGIN
    SELECT civil_date INTO occurrence_date
      FROM "planned_programme_occurrences"
     WHERE id = NEW.planned_programme_occurrence_id;

    SELECT weekday INTO slot_weekday
      FROM "time_slot_definitions"
     WHERE id = NEW.time_slot_definition_id
       AND academic_year_id = NEW.academic_year_id;

    IF occurrence_date IS NULL OR slot_weekday IS NULL THEN
        RETURN NEW; -- canonical FK constraints report missing/mismatched provenance.
    END IF;

    expected_weekday := CASE EXTRACT(ISODOW FROM occurrence_date)::INTEGER
        WHEN 1 THEN 'MONDAY'::"AcademicWeekday"
        WHEN 2 THEN 'TUESDAY'::"AcademicWeekday"
        WHEN 3 THEN 'WEDNESDAY'::"AcademicWeekday"
        WHEN 4 THEN 'THURSDAY'::"AcademicWeekday"
        WHEN 5 THEN 'FRIDAY'::"AcademicWeekday"
        WHEN 6 THEN 'SATURDAY'::"AcademicWeekday"
        WHEN 7 THEN 'SUNDAY'::"AcademicWeekday"
    END;

    IF slot_weekday IS DISTINCT FROM expected_weekday THEN
        RAISE EXCEPTION 'Planned programme slot weekday does not match occurrence civil date'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "planned_occurrence_slot_weekday_guard"
    BEFORE INSERT OR UPDATE OF "planned_programme_occurrence_id", "academic_year_id", "time_slot_definition_id"
    ON "planned_occurrence_slots"
    FOR EACH ROW EXECUTE FUNCTION planned_occurrence_slot_weekday_guard();

CREATE FUNCTION planned_occurrence_date_weekday_guard() RETURNS trigger AS $$
DECLARE
    expected_weekday "AcademicWeekday";
    mismatch_count INTEGER;
BEGIN
    IF NEW.civil_date IS NOT DISTINCT FROM OLD.civil_date THEN
        RETURN NEW;
    END IF;

    expected_weekday := CASE EXTRACT(ISODOW FROM NEW.civil_date)::INTEGER
        WHEN 1 THEN 'MONDAY'::"AcademicWeekday"
        WHEN 2 THEN 'TUESDAY'::"AcademicWeekday"
        WHEN 3 THEN 'WEDNESDAY'::"AcademicWeekday"
        WHEN 4 THEN 'THURSDAY'::"AcademicWeekday"
        WHEN 5 THEN 'FRIDAY'::"AcademicWeekday"
        WHEN 6 THEN 'SATURDAY'::"AcademicWeekday"
        WHEN 7 THEN 'SUNDAY'::"AcademicWeekday"
    END;

    SELECT count(*) INTO mismatch_count
      FROM "planned_occurrence_slots" s
      JOIN "time_slot_definitions" t
        ON t.id = s.time_slot_definition_id
       AND t.academic_year_id = s.academic_year_id
     WHERE s.planned_programme_occurrence_id = OLD.id
       AND t.weekday IS DISTINCT FROM expected_weekday;

    IF mismatch_count <> 0 THEN
        RAISE EXCEPTION 'Occurrence civil-date change would invalidate existing planned slot weekdays'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "planned_occurrence_date_weekday_guard"
    BEFORE UPDATE OF "civil_date" ON "planned_programme_occurrences"
    FOR EACH ROW EXECUTE FUNCTION planned_occurrence_date_weekday_guard();
