-- P4-020: retained special-programme planning persistence and control-plane foundation.
-- This migration is planning-only. It does not modify SpecialActivity runtime tables,
-- capability bindings, programme attestation, workload projection, or production data.

CREATE TYPE "ProgrammeKind" AS ENUM ('GDDP', 'HDTN_HN');
CREATE TYPE "ProgrammePlanVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "ProgrammeOccurrenceMode" AS ENUM ('CLASS', 'GRADE', 'SCHOOL_WIDE');
CREATE TYPE "ProgrammeOccurrenceStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

CREATE TABLE "programme_masters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "kind" "ProgrammeKind" NOT NULL,
    "grade_level" INTEGER,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_masters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "programme_masters_kind_grade_shape_check" CHECK (
        ("kind" = 'GDDP' AND "grade_level" BETWEEN 10 AND 12)
        OR
        ("kind" = 'HDTN_HN' AND "grade_level" IS NULL)
    )
);

CREATE UNIQUE INDEX "programme_masters_id_academic_year_id_key"
    ON "programme_masters"("id", "academic_year_id");
CREATE UNIQUE INDEX "programme_masters_gddp_identity_key"
    ON "programme_masters"("academic_year_id", "grade_level")
    WHERE "kind" = 'GDDP';
CREATE UNIQUE INDEX "programme_masters_hdtn_identity_key"
    ON "programme_masters"("academic_year_id")
    WHERE "kind" = 'HDTN_HN';
CREATE INDEX "programme_masters_year_kind_idx"
    ON "programme_masters"("academic_year_id", "kind", "grade_level");

CREATE TABLE "programme_plan_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "programme_master_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "ProgrammePlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "predecessor_version_id" UUID,
    "change_reason" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "published_by_user_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "superseded_by_user_id" UUID,
    "superseded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_plan_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "programme_plan_versions_version_number_check" CHECK ("version_number" > 0),
    CONSTRAINT "programme_plan_versions_draft_revision_check" CHECK ("draft_revision" > 0),
    CONSTRAINT "programme_plan_versions_no_self_predecessor_check"
        CHECK ("predecessor_version_id" IS NULL OR "predecessor_version_id" <> "id"),
    CONSTRAINT "programme_plan_versions_lineage_reason_check" CHECK (
        ("predecessor_version_id" IS NULL)
        OR ("change_reason" IS NOT NULL AND btrim("change_reason") <> '')
    ),
    CONSTRAINT "programme_plan_versions_lifecycle_evidence_check" CHECK (
        ("status" = 'DRAFT'
            AND "published_by_user_id" IS NULL
            AND "published_at" IS NULL
            AND "superseded_by_user_id" IS NULL
            AND "superseded_at" IS NULL)
        OR
        ("status" = 'PUBLISHED'
            AND "published_by_user_id" IS NOT NULL
            AND "published_at" IS NOT NULL
            AND "superseded_by_user_id" IS NULL
            AND "superseded_at" IS NULL)
        OR
        ("status" = 'SUPERSEDED'
            AND "published_by_user_id" IS NOT NULL
            AND "published_at" IS NOT NULL
            AND "superseded_by_user_id" IS NOT NULL
            AND "superseded_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "programme_plan_versions_master_version_key"
    ON "programme_plan_versions"("programme_master_id", "version_number");
CREATE UNIQUE INDEX "programme_plan_versions_id_master_key"
    ON "programme_plan_versions"("id", "programme_master_id");
CREATE UNIQUE INDEX "programme_plan_versions_predecessor_key"
    ON "programme_plan_versions"("predecessor_version_id")
    WHERE "predecessor_version_id" IS NOT NULL;
CREATE UNIQUE INDEX "programme_plan_versions_one_draft_per_master_key"
    ON "programme_plan_versions"("programme_master_id")
    WHERE "status" = 'DRAFT';
CREATE UNIQUE INDEX "programme_plan_versions_one_published_per_master_key"
    ON "programme_plan_versions"("programme_master_id")
    WHERE "status" = 'PUBLISHED';
CREATE INDEX "programme_plan_versions_master_status_idx"
    ON "programme_plan_versions"("programme_master_id", "status", "version_number");

CREATE TABLE "programme_topic_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "programme_plan_version_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "required_periods" INTEGER NOT NULL,
    "guideline_week_from" INTEGER,
    "guideline_week_to" INTEGER,
    "guideline_segment_label" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_topic_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "programme_topic_items_sequence_check" CHECK ("sequence" > 0),
    CONSTRAINT "programme_topic_items_required_periods_check" CHECK ("required_periods" > 0),
    CONSTRAINT "programme_topic_items_title_check" CHECK (btrim("title") <> ''),
    CONSTRAINT "programme_topic_items_guideline_week_check" CHECK (
        ("guideline_week_from" IS NULL OR "guideline_week_from" > 0)
        AND ("guideline_week_to" IS NULL OR "guideline_week_to" > 0)
        AND ("guideline_week_from" IS NULL OR "guideline_week_to" IS NULL OR "guideline_week_to" >= "guideline_week_from")
    )
);

CREATE UNIQUE INDEX "programme_topic_items_version_sequence_key"
    ON "programme_topic_items"("programme_plan_version_id", "sequence");
CREATE UNIQUE INDEX "programme_topic_items_id_version_key"
    ON "programme_topic_items"("id", "programme_plan_version_id");
CREATE INDEX "programme_topic_items_version_idx"
    ON "programme_topic_items"("programme_plan_version_id", "sequence");

CREATE TABLE "planned_programme_occurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "programme_master_id" UUID NOT NULL,
    "programme_plan_version_id" UUID NOT NULL,
    "programme_topic_item_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "civil_date" DATE NOT NULL,
    "mode" "ProgrammeOccurrenceMode" NOT NULL,
    "grade_level" INTEGER,
    "school_class_id" UUID,
    "status" "ProgrammeOccurrenceStatus" NOT NULL DEFAULT 'DRAFT',
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "note" VARCHAR(500),
    "replaces_occurrence_id" UUID,
    "change_reason" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "published_by_user_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "superseded_by_user_id" UUID,
    "superseded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planned_programme_occurrences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "planned_programme_occurrences_draft_revision_check" CHECK ("draft_revision" > 0),
    CONSTRAINT "planned_programme_occurrences_target_shape_check" CHECK (
        ("mode" = 'CLASS' AND "school_class_id" IS NOT NULL AND "grade_level" IS NULL)
        OR
        ("mode" = 'GRADE' AND "school_class_id" IS NULL AND "grade_level" BETWEEN 10 AND 12)
        OR
        ("mode" = 'SCHOOL_WIDE' AND "school_class_id" IS NULL AND "grade_level" IS NULL)
    ),
    CONSTRAINT "planned_programme_occurrences_no_self_replacement_check"
        CHECK ("replaces_occurrence_id" IS NULL OR "replaces_occurrence_id" <> "id"),
    CONSTRAINT "planned_programme_occurrences_lineage_reason_check" CHECK (
        ("replaces_occurrence_id" IS NULL)
        OR ("change_reason" IS NOT NULL AND btrim("change_reason") <> '')
    ),
    CONSTRAINT "planned_programme_occurrences_lifecycle_evidence_check" CHECK (
        ("status" = 'DRAFT'
            AND "published_by_user_id" IS NULL
            AND "published_at" IS NULL
            AND "superseded_by_user_id" IS NULL
            AND "superseded_at" IS NULL)
        OR
        ("status" = 'PUBLISHED'
            AND "published_by_user_id" IS NOT NULL
            AND "published_at" IS NOT NULL
            AND "superseded_by_user_id" IS NULL
            AND "superseded_at" IS NULL)
        OR
        ("status" = 'SUPERSEDED'
            AND "published_by_user_id" IS NOT NULL
            AND "published_at" IS NOT NULL
            AND "superseded_by_user_id" IS NOT NULL
            AND "superseded_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "planned_programme_occurrences_id_year_key"
    ON "planned_programme_occurrences"("id", "academic_year_id");
CREATE UNIQUE INDEX "planned_programme_occurrences_id_master_key"
    ON "planned_programme_occurrences"("id", "programme_master_id");
CREATE UNIQUE INDEX "planned_programme_occurrences_replaces_key"
    ON "planned_programme_occurrences"("replaces_occurrence_id")
    WHERE "replaces_occurrence_id" IS NOT NULL;
CREATE INDEX "planned_programme_occurrences_master_date_status_idx"
    ON "planned_programme_occurrences"("programme_master_id", "civil_date", "status");
CREATE INDEX "planned_programme_occurrences_year_date_mode_idx"
    ON "planned_programme_occurrences"("academic_year_id", "civil_date", "mode");
CREATE INDEX "planned_programme_occurrences_plan_topic_idx"
    ON "planned_programme_occurrences"("programme_plan_version_id", "programme_topic_item_id");

CREATE TABLE "planned_occurrence_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planned_programme_occurrence_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "time_slot_definition_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planned_occurrence_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "planned_occurrence_slots_occurrence_slot_key"
    ON "planned_occurrence_slots"("planned_programme_occurrence_id", "time_slot_definition_id");
CREATE UNIQUE INDEX "planned_occurrence_slots_id_occurrence_key"
    ON "planned_occurrence_slots"("id", "planned_programme_occurrence_id");
CREATE INDEX "planned_occurrence_slots_year_slot_idx"
    ON "planned_occurrence_slots"("academic_year_id", "time_slot_definition_id");

CREATE TABLE "planned_slot_staffing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planned_occurrence_slot_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planned_slot_staffing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "planned_slot_staffing_slot_teacher_key"
    ON "planned_slot_staffing"("planned_occurrence_slot_id", "teacher_user_id");
CREATE INDEX "planned_slot_staffing_teacher_slot_idx"
    ON "planned_slot_staffing"("teacher_user_id", "planned_occurrence_slot_id");

CREATE TABLE "programme_planning_commands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID NOT NULL,
    "command_id" VARCHAR(100) NOT NULL,
    "command_type" VARCHAR(100) NOT NULL,
    "fingerprint" VARCHAR(128) NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_planning_commands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "programme_planning_commands_command_id_check" CHECK (btrim("command_id") <> ''),
    CONSTRAINT "programme_planning_commands_command_type_check" CHECK (btrim("command_type") <> ''),
    CONSTRAINT "programme_planning_commands_fingerprint_check" CHECK (btrim("fingerprint") <> '')
);

CREATE UNIQUE INDEX "programme_planning_commands_actor_command_key"
    ON "programme_planning_commands"("actor_user_id", "command_id");
CREATE INDEX "programme_planning_commands_created_at_idx"
    ON "programme_planning_commands"("created_at");

ALTER TABLE "programme_masters"
    ADD CONSTRAINT "programme_masters_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "programme_masters"
    ADD CONSTRAINT "programme_masters_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_plan_versions"
    ADD CONSTRAINT "programme_plan_versions_master_id_fkey"
    FOREIGN KEY ("programme_master_id") REFERENCES "programme_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "programme_plan_versions"
    ADD CONSTRAINT "programme_plan_versions_predecessor_master_fkey"
    FOREIGN KEY ("predecessor_version_id", "programme_master_id")
    REFERENCES "programme_plan_versions"("id", "programme_master_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "programme_plan_versions"
    ADD CONSTRAINT "programme_plan_versions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "programme_plan_versions"
    ADD CONSTRAINT "programme_plan_versions_published_by_user_id_fkey"
    FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "programme_plan_versions"
    ADD CONSTRAINT "programme_plan_versions_superseded_by_user_id_fkey"
    FOREIGN KEY ("superseded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_topic_items"
    ADD CONSTRAINT "programme_topic_items_version_id_fkey"
    FOREIGN KEY ("programme_plan_version_id") REFERENCES "programme_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planned_programme_occurrences"
    ADD CONSTRAINT "planned_programme_occurrences_master_year_fkey"
    FOREIGN KEY ("programme_master_id", "academic_year_id")
    REFERENCES "programme_masters"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planned_programme_occurrences"
    ADD CONSTRAINT "planned_programme_occurrences_plan_master_fkey"
    FOREIGN KEY ("programme_plan_version_id", "programme_master_id")
    REFERENCES "programme_plan_versions"("id", "programme_master_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planned_programme_occurrences"
    ADD CONSTRAINT "planned_programme_occurrences_topic_plan_fkey"
    FOREIGN KEY ("programme_topic_item_id", "programme_plan_version_id")
    REFERENCES "programme_topic_items"("id", "programme_plan_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planned_programme_occurrences"
    ADD CONSTRAINT "planned_programme_occurrences_school_class_year_fkey"
    FOREIGN KEY ("school_class_id", "academic_year_id")
    REFERENCES "classes"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planned_programme_occurrences"
    ADD CONSTRAINT "planned_programme_occurrences_replaces_master_fkey"
    FOREIGN KEY ("replaces_occurrence_id", "programme_master_id")
    REFERENCES "planned_programme_occurrences"("id", "programme_master_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planned_programme_occurrences"
    ADD CONSTRAINT "planned_programme_occurrences_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planned_programme_occurrences"
    ADD CONSTRAINT "planned_programme_occurrences_published_by_user_id_fkey"
    FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planned_programme_occurrences"
    ADD CONSTRAINT "planned_programme_occurrences_superseded_by_user_id_fkey"
    FOREIGN KEY ("superseded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planned_occurrence_slots"
    ADD CONSTRAINT "planned_occurrence_slots_occurrence_year_fkey"
    FOREIGN KEY ("planned_programme_occurrence_id", "academic_year_id")
    REFERENCES "planned_programme_occurrences"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planned_occurrence_slots"
    ADD CONSTRAINT "planned_occurrence_slots_time_slot_year_fkey"
    FOREIGN KEY ("time_slot_definition_id", "academic_year_id")
    REFERENCES "time_slot_definitions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planned_slot_staffing"
    ADD CONSTRAINT "planned_slot_staffing_occurrence_slot_id_fkey"
    FOREIGN KEY ("planned_occurrence_slot_id") REFERENCES "planned_occurrence_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planned_slot_staffing"
    ADD CONSTRAINT "planned_slot_staffing_teacher_user_id_fkey"
    FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_planning_commands"
    ADD CONSTRAINT "programme_planning_commands_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Published plan versions are immutable except for the single retained PUBLISHED -> SUPERSEDED transition.
CREATE FUNCTION programme_plan_version_immutability_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'DRAFT' THEN
            RAISE EXCEPTION 'Published programme plan versions are retained and cannot be deleted' USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status = 'SUPERSEDED' THEN
        RAISE EXCEPTION 'Superseded programme plan versions are immutable' USING ERRCODE = '23514';
    END IF;

    IF OLD.status = 'PUBLISHED' THEN
        IF NEW.status <> 'SUPERSEDED'
           OR ROW(NEW.programme_master_id, NEW.version_number, NEW.draft_revision,
                  NEW.predecessor_version_id, NEW.change_reason, NEW.created_by_user_id,
                  NEW.published_by_user_id, NEW.published_at, NEW.created_at)
              IS DISTINCT FROM
              ROW(OLD.programme_master_id, OLD.version_number, OLD.draft_revision,
                  OLD.predecessor_version_id, OLD.change_reason, OLD.created_by_user_id,
                  OLD.published_by_user_id, OLD.published_at, OLD.created_at)
           OR NEW.superseded_by_user_id IS NULL
           OR NEW.superseded_at IS NULL THEN
            RAISE EXCEPTION 'Published programme plan versions may only transition to SUPERSEDED with retained evidence' USING ERRCODE = '23514';
        END IF;
    ELSIF OLD.status = 'DRAFT' AND NEW.status NOT IN ('DRAFT', 'PUBLISHED') THEN
        RAISE EXCEPTION 'Draft programme plan versions may only remain DRAFT or become PUBLISHED' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "programme_plan_version_immutability_guard"
    BEFORE UPDATE OR DELETE ON "programme_plan_versions"
    FOR EACH ROW EXECUTE FUNCTION programme_plan_version_immutability_guard();

-- Topic rows may be structurally edited only while their owning plan version is DRAFT.
CREATE FUNCTION programme_topic_item_draft_guard() RETURNS trigger AS $$
DECLARE
    owner_version_id UUID;
    owner_status "ProgrammePlanVersionStatus";
BEGIN
    owner_version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.programme_plan_version_id ELSE NEW.programme_plan_version_id END;
    SELECT status INTO owner_status FROM "programme_plan_versions" WHERE id = owner_version_id;
    IF owner_status IS DISTINCT FROM 'DRAFT'::"ProgrammePlanVersionStatus" THEN
        RAISE EXCEPTION 'Programme topic items are mutable only while the plan version is DRAFT' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "programme_topic_item_draft_guard"
    BEFORE INSERT OR UPDATE OR DELETE ON "programme_topic_items"
    FOR EACH ROW EXECUTE FUNCTION programme_topic_item_draft_guard();

-- Occurrence semantic backstop: exact programme/year/target shape and a published content authority.
CREATE FUNCTION planned_programme_occurrence_semantic_guard() RETURNS trigger AS $$
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
    IF plan_status IS DISTINCT FROM 'PUBLISHED'::"ProgrammePlanVersionStatus" THEN
        RAISE EXCEPTION 'Planned programme occurrences require a PUBLISHED programme plan version' USING ERRCODE = '23514';
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

CREATE TRIGGER "planned_programme_occurrence_semantic_guard"
    BEFORE INSERT OR UPDATE OF "programme_master_id", "programme_plan_version_id", "programme_topic_item_id",
        "academic_year_id", "mode", "grade_level", "school_class_id"
    ON "planned_programme_occurrences"
    FOR EACH ROW EXECUTE FUNCTION planned_programme_occurrence_semantic_guard();

-- Published occurrence scheduling is immutable except for retained forward supersession.
CREATE FUNCTION planned_programme_occurrence_immutability_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'DRAFT' THEN
            RAISE EXCEPTION 'Published programme occurrences are retained and cannot be deleted' USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status = 'SUPERSEDED' THEN
        RAISE EXCEPTION 'Superseded programme occurrences are immutable' USING ERRCODE = '23514';
    END IF;

    IF OLD.status = 'PUBLISHED' THEN
        IF NEW.status <> 'SUPERSEDED'
           OR ROW(NEW.programme_master_id, NEW.programme_plan_version_id, NEW.programme_topic_item_id,
                  NEW.academic_year_id, NEW.civil_date, NEW.mode, NEW.grade_level, NEW.school_class_id,
                  NEW.draft_revision, NEW.note, NEW.replaces_occurrence_id, NEW.change_reason,
                  NEW.created_by_user_id, NEW.published_by_user_id, NEW.published_at, NEW.created_at)
              IS DISTINCT FROM
              ROW(OLD.programme_master_id, OLD.programme_plan_version_id, OLD.programme_topic_item_id,
                  OLD.academic_year_id, OLD.civil_date, OLD.mode, OLD.grade_level, OLD.school_class_id,
                  OLD.draft_revision, OLD.note, OLD.replaces_occurrence_id, OLD.change_reason,
                  OLD.created_by_user_id, OLD.published_by_user_id, OLD.published_at, OLD.created_at)
           OR NEW.superseded_by_user_id IS NULL
           OR NEW.superseded_at IS NULL THEN
            RAISE EXCEPTION 'Published programme occurrences may only transition to SUPERSEDED with retained evidence' USING ERRCODE = '23514';
        END IF;
    ELSIF OLD.status = 'DRAFT' AND NEW.status NOT IN ('DRAFT', 'PUBLISHED') THEN
        RAISE EXCEPTION 'Draft programme occurrences may only remain DRAFT or become PUBLISHED' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "planned_programme_occurrence_immutability_guard"
    BEFORE UPDATE OR DELETE ON "planned_programme_occurrences"
    FOR EACH ROW EXECUTE FUNCTION planned_programme_occurrence_immutability_guard();

-- Exact slots and per-slot teacher sets may change only while the occurrence remains DRAFT.
CREATE FUNCTION planned_occurrence_child_draft_guard() RETURNS trigger AS $$
DECLARE
    occurrence_id UUID;
    occurrence_status "ProgrammeOccurrenceStatus";
BEGIN
    IF TG_TABLE_NAME = 'planned_occurrence_slots' THEN
        occurrence_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.planned_programme_occurrence_id ELSE NEW.planned_programme_occurrence_id END;
    ELSE
        SELECT planned_programme_occurrence_id INTO occurrence_id
          FROM "planned_occurrence_slots"
         WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.planned_occurrence_slot_id ELSE NEW.planned_occurrence_slot_id END;
    END IF;

    SELECT status INTO occurrence_status FROM "planned_programme_occurrences" WHERE id = occurrence_id;
    IF occurrence_status IS DISTINCT FROM 'DRAFT'::"ProgrammeOccurrenceStatus" THEN
        RAISE EXCEPTION 'Programme occurrence slots/staffing are mutable only while the occurrence is DRAFT' USING ERRCODE = '23514';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "planned_occurrence_slot_draft_guard"
    BEFORE INSERT OR UPDATE OR DELETE ON "planned_occurrence_slots"
    FOR EACH ROW EXECUTE FUNCTION planned_occurrence_child_draft_guard();

CREATE TRIGGER "planned_slot_staffing_draft_guard"
    BEFORE INSERT OR UPDATE OR DELETE ON "planned_slot_staffing"
    FOR EACH ROW EXECUTE FUNCTION planned_occurrence_child_draft_guard();
