-- Local Phase 03A: academic-year teaching-assignment history foundation.
-- Effective boundaries are inclusive civil DATE values; audit instants use TIMESTAMPTZ(3).

CREATE UNIQUE INDEX "classes_id_academic_year_id_key"
    ON "classes"("id", "academic_year_id");

CREATE TABLE "teaching_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "teaching_assignments_validity_check"
        CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from")
);

CREATE INDEX "teaching_assignments_class_subject_validity_idx"
    ON "teaching_assignments"(
        "academic_year_id", "school_class_id", "subject_id", "valid_from", "valid_until"
    );
CREATE INDEX "teaching_assignments_teacher_year_validity_idx"
    ON "teaching_assignments"(
        "teacher_user_id", "academic_year_id", "valid_from", "valid_until"
    );
CREATE INDEX "teaching_assignments_subject_year_validity_idx"
    ON "teaching_assignments"(
        "subject_id", "academic_year_id", "valid_from", "valid_until"
    );

ALTER TABLE "teaching_assignments"
    ADD CONSTRAINT "teaching_assignments_no_overlap"
    EXCLUDE USING gist (
        "academic_year_id" WITH =,
        "school_class_id" WITH =,
        "subject_id" WITH =,
        daterange("valid_from", "valid_until", '[]') WITH &&
    );

ALTER TABLE "teaching_assignments"
    ADD CONSTRAINT "teaching_assignments_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teaching_assignments"
    ADD CONSTRAINT "teaching_assignments_school_class_year_fkey"
    FOREIGN KEY ("school_class_id", "academic_year_id")
    REFERENCES "classes"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teaching_assignments"
    ADD CONSTRAINT "teaching_assignments_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teaching_assignments"
    ADD CONSTRAINT "teaching_assignments_teacher_user_id_fkey"
    FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
