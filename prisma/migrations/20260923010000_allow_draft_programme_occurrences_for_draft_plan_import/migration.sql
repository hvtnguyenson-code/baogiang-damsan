-- P4-072 correction: the workbook confirmation contract persists one all-DRAFT package
-- (DRAFT ProgrammePlanVersion + DRAFT PlannedProgrammeOccurrence rows) without publishing.
--
-- P4-020's original semantic guard required every occurrence to reference a PUBLISHED
-- plan version. That is correct for normal occurrence authoring, but it prevents the
-- retained P4-072 DRAFT package required by the accepted ingestion architecture.
--
-- Preserve the existing database backstop while aligning it with the retained lifecycle:
--   * a DRAFT plan version may own only DRAFT occurrences;
--   * a PUBLISHED plan version may own occurrence rows under the existing occurrence lifecycle;
--   * a SUPERSEDED plan version cannot be used for new/provenance-changing occurrence rows.
--
-- This is a forward-only trigger-function correction. It changes no table shape, enum,
-- foreign key, retained row, or runtime/materialization semantics.

CREATE OR REPLACE FUNCTION planned_programme_occurrence_semantic_guard() RETURNS trigger AS $$
DECLARE
    master_kind "ProgrammeKind";
    master_grade INTEGER;
    plan_status "ProgrammePlanVersionStatus";
    class_grade INTEGER;
BEGIN
    SELECT kind, grade_level INTO master_kind, master_grade
      FROM "programme_masters"
     WHERE id = NEW.programme_master_id AND academic_year_id = NEW.academic_year_id;
    IF NOT FOUND THEN
        RETURN NEW; -- composite FK will produce the canonical violation.
    END IF;

    SELECT status INTO plan_status
      FROM "programme_plan_versions"
     WHERE id = NEW.programme_plan_version_id
       AND programme_master_id = NEW.programme_master_id;
    IF NOT FOUND THEN
        RETURN NEW; -- composite FK will produce the canonical violation.
    END IF;

    IF plan_status = 'DRAFT'::"ProgrammePlanVersionStatus" THEN
        IF NEW.status IS DISTINCT FROM 'DRAFT'::"ProgrammeOccurrenceStatus" THEN
            RAISE EXCEPTION 'Only DRAFT programme occurrences may reference a DRAFT programme plan version' USING ERRCODE = '23514';
        END IF;
    ELSIF plan_status IS DISTINCT FROM 'PUBLISHED'::"ProgrammePlanVersionStatus" THEN
        RAISE EXCEPTION 'Planned programme occurrences cannot reference a SUPERSEDED programme plan version for new or provenance-changing rows' USING ERRCODE = '23514';
    END IF;

    IF NEW.mode = 'CLASS' THEN
        SELECT grade_level INTO class_grade
          FROM "classes"
         WHERE id = NEW.school_class_id AND academic_year_id = NEW.academic_year_id;
        IF master_kind = 'GDDP' AND class_grade IS DISTINCT FROM master_grade THEN
            RAISE EXCEPTION 'GDDP CLASS occurrence target must belong to the programme master grade' USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.mode = 'GRADE' THEN
        IF master_kind = 'GDDP' AND NEW.grade_level IS DISTINCT FROM master_grade THEN
            RAISE EXCEPTION 'GDDP GRADE occurrence target must equal the programme master grade' USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.mode = 'SCHOOL_WIDE' AND master_kind = 'GDDP' THEN
        RAISE EXCEPTION 'GDDP occurrence cannot use SCHOOL_WIDE mode' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
