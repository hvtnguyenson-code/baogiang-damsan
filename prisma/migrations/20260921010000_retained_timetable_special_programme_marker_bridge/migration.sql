-- P4-071: Retained Timetable Special-Programme Marker Bridge
-- Persist retained timetable-owned marker evidence for GDDP and HDTN_HN as children of exact TimetableVersion.

-- CreateTable
CREATE TABLE "timetable_special_programme_markers" (
    "id" UUID NOT NULL,
    "timetable_version_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "time_slot_definition_id" UUID NOT NULL,
    "kind" "ProgrammeKind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_special_programme_markers_pkey" PRIMARY KEY ("id")
);

-- Unique index
CREATE UNIQUE INDEX "timetable_special_programme_markers_version_class_slot_kind_key"
    ON "timetable_special_programme_markers"("timetable_version_id", "school_class_id", "time_slot_definition_id", "kind");

-- Helper indices
CREATE INDEX "timetable_special_programme_markers_version_class_idx"
    ON "timetable_special_programme_markers"("timetable_version_id", "school_class_id");

CREATE INDEX "timetable_special_programme_markers_version_kind_idx"
    ON "timetable_special_programme_markers"("timetable_version_id", "kind");

CREATE INDEX "timetable_special_programme_markers_year_slot_idx"
    ON "timetable_special_programme_markers"("academic_year_id", "time_slot_definition_id");

-- Foreign keys enforcing same academic year provenance
ALTER TABLE "timetable_special_programme_markers"
    ADD CONSTRAINT "timetable_special_programme_markers_timetable_version_id_academic_year_id_fkey"
    FOREIGN KEY ("timetable_version_id", "academic_year_id")
    REFERENCES "timetable_versions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_special_programme_markers"
    ADD CONSTRAINT "timetable_special_programme_markers_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id")
    REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_special_programme_markers"
    ADD CONSTRAINT "timetable_special_programme_markers_school_class_id_academic_year_id_fkey"
    FOREIGN KEY ("school_class_id", "academic_year_id")
    REFERENCES "classes"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_special_programme_markers"
    ADD CONSTRAINT "timetable_special_programme_markers_time_slot_definition_id_academic_year_id_fkey"
    FOREIGN KEY ("time_slot_definition_id", "academic_year_id")
    REFERENCES "time_slot_definitions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
