-- P1-011: canonical retained homeroom responsibility history.
-- Effective boundaries are inclusive civil DATE values; audit instants use TIMESTAMPTZ(3).

CREATE TYPE "HomeroomAssignmentStatus" AS ENUM ('ACTIVE', 'REVERSED');

CREATE TABLE "homeroom_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "status" "HomeroomAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" VARCHAR(500),
    "entry_reason" TEXT,
    "replaces_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "reversed_by_user_id" UUID,
    "reversed_at" TIMESTAMPTZ(3),
    "reversal_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homeroom_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "homeroom_assignments_validity_check"
        CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from"),
    CONSTRAINT "homeroom_assignments_reversal_evidence_check"
        CHECK (
            ("status" = 'ACTIVE'
                AND "reversed_by_user_id" IS NULL
                AND "reversed_at" IS NULL
                AND "reversal_reason" IS NULL)
            OR
            ("status" = 'REVERSED'
                AND "reversed_by_user_id" IS NOT NULL
                AND "reversed_at" IS NOT NULL
                AND "reversal_reason" IS NOT NULL
                AND btrim("reversal_reason") <> '')
        ),
    CONSTRAINT "homeroom_assignments_no_self_replacement_check"
        CHECK ("replaces_id" IS NULL OR "replaces_id" <> "id")
);

CREATE UNIQUE INDEX "homeroom_assignments_provenance_key"
    ON "homeroom_assignments"("id", "academic_year_id", "school_class_id", "teacher_user_id");
CREATE INDEX "homeroom_assignments_class_status_validity_idx"
    ON "homeroom_assignments"(
        "academic_year_id", "school_class_id", "status", "valid_from", "valid_until"
    );
CREATE INDEX "homeroom_assignments_teacher_year_validity_idx"
    ON "homeroom_assignments"(
        "teacher_user_id", "academic_year_id", "valid_from", "valid_until"
    );
CREATE INDEX "homeroom_assignments_replaces_id_idx"
    ON "homeroom_assignments"("replaces_id");

ALTER TABLE "homeroom_assignments"
    ADD CONSTRAINT "homeroom_assignments_no_active_overlap"
    EXCLUDE USING gist (
        "academic_year_id" WITH =,
        "school_class_id" WITH =,
        daterange("valid_from", "valid_until", '[]') WITH &&
    ) WHERE ("status" = 'ACTIVE');

ALTER TABLE "homeroom_assignments"
    ADD CONSTRAINT "homeroom_assignments_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homeroom_assignments"
    ADD CONSTRAINT "homeroom_assignments_school_class_year_fkey"
    FOREIGN KEY ("school_class_id", "academic_year_id")
    REFERENCES "classes"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homeroom_assignments"
    ADD CONSTRAINT "homeroom_assignments_teacher_user_id_fkey"
    FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homeroom_assignments"
    ADD CONSTRAINT "homeroom_assignments_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homeroom_assignments"
    ADD CONSTRAINT "homeroom_assignments_reversed_by_user_id_fkey"
    FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homeroom_assignments"
    ADD CONSTRAINT "homeroom_assignments_replaces_id_fkey"
    FOREIGN KEY ("replaces_id") REFERENCES "homeroom_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
