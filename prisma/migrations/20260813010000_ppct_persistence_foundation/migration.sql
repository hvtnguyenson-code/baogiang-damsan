-- LOCAL-FC-05A1: shared PPCT plan, immutable version/item history, lineage and class binding.
-- Association boundaries are inclusive civil DATE values; lifecycle/audit instants use TIMESTAMPTZ(3).

CREATE TYPE "PpctVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

CREATE UNIQUE INDEX "classes_id_academic_year_id_grade_level_key"
    ON "classes"("id", "academic_year_id", "grade_level");

CREATE TABLE "ppct_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "grade_level" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppct_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ppct_plans_grade_level_check" CHECK ("grade_level" BETWEEN 10 AND 12)
);

CREATE TABLE "ppct_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ppct_plan_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "PpctVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" UUID NOT NULL,
    "published_by_user_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "superseded_by_user_id" UUID,
    "superseded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppct_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ppct_versions_version_number_check" CHECK ("version_number" > 0),
    CONSTRAINT "ppct_versions_published_actor_pair_check" CHECK (
        ("published_by_user_id" IS NULL) = ("published_at" IS NULL)
    ),
    CONSTRAINT "ppct_versions_superseded_actor_pair_check" CHECK (
        ("superseded_by_user_id" IS NULL) = ("superseded_at" IS NULL)
    ),
    CONSTRAINT "ppct_versions_lifecycle_shape_check" CHECK (
        (
            "status" = 'DRAFT'
            AND "published_by_user_id" IS NULL
            AND "published_at" IS NULL
            AND "superseded_by_user_id" IS NULL
            AND "superseded_at" IS NULL
        )
        OR
        (
            "status" = 'PUBLISHED'
            AND "published_by_user_id" IS NOT NULL
            AND "published_at" IS NOT NULL
            AND "superseded_by_user_id" IS NULL
            AND "superseded_at" IS NULL
        )
        OR
        (
            "status" = 'SUPERSEDED'
            AND "published_by_user_id" IS NOT NULL
            AND "published_at" IS NOT NULL
            AND "superseded_by_user_id" IS NOT NULL
            AND "superseded_at" IS NOT NULL
            AND "superseded_at" >= "published_at"
        )
    )
);

CREATE TABLE "ppct_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ppct_plan_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppct_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ppct_item_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ppct_version_id" UUID NOT NULL,
    "ppct_plan_id" UUID NOT NULL,
    "ppct_item_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "lesson_type" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppct_item_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ppct_item_revisions_sequence_check" CHECK ("sequence" > 0),
    CONSTRAINT "ppct_item_revisions_title_normalized_check"
        CHECK ("title" = btrim("title") AND "title" <> ''),
    CONSTRAINT "ppct_item_revisions_lesson_type_normalized_check"
        CHECK ("lesson_type" = btrim("lesson_type") AND "lesson_type" <> '')
);

CREATE TABLE "ppct_item_lineage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ppct_plan_id" UUID NOT NULL,
    "predecessor_version_id" UUID NOT NULL,
    "predecessor_item_id" UUID NOT NULL,
    "successor_version_id" UUID NOT NULL,
    "successor_item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppct_item_lineage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ppct_item_lineage_distinct_versions_check"
        CHECK ("predecessor_version_id" <> "successor_version_id"),
    CONSTRAINT "ppct_item_lineage_distinct_items_check"
        CHECK ("predecessor_item_id" <> "successor_item_id")
);

CREATE TABLE "ppct_class_associations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "grade_level" INTEGER NOT NULL,
    "ppct_plan_id" UUID NOT NULL,
    "ppct_version_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_until" DATE,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppct_class_associations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ppct_class_associations_effective_range_check"
        CHECK ("effective_until" IS NULL OR "effective_until" >= "effective_from")
);

CREATE UNIQUE INDEX "ppct_plans_academic_year_id_subject_id_grade_level_key"
    ON "ppct_plans"("academic_year_id", "subject_id", "grade_level");
CREATE UNIQUE INDEX "ppct_plans_identity_key"
    ON "ppct_plans"("id", "academic_year_id", "subject_id", "grade_level");

CREATE UNIQUE INDEX "ppct_versions_ppct_plan_id_version_number_key"
    ON "ppct_versions"("ppct_plan_id", "version_number");
CREATE UNIQUE INDEX "ppct_versions_id_ppct_plan_id_key"
    ON "ppct_versions"("id", "ppct_plan_id");
CREATE UNIQUE INDEX "ppct_versions_one_published_per_plan_key"
    ON "ppct_versions"("ppct_plan_id") WHERE "status" = 'PUBLISHED';
CREATE INDEX "ppct_versions_ppct_plan_id_status_idx"
    ON "ppct_versions"("ppct_plan_id", "status");

CREATE UNIQUE INDEX "ppct_items_id_ppct_plan_id_key"
    ON "ppct_items"("id", "ppct_plan_id");
CREATE INDEX "ppct_items_ppct_plan_id_idx" ON "ppct_items"("ppct_plan_id");

CREATE UNIQUE INDEX "ppct_item_revisions_version_sequence_key"
    ON "ppct_item_revisions"("ppct_version_id", "sequence");
CREATE UNIQUE INDEX "ppct_item_revisions_version_item_key"
    ON "ppct_item_revisions"("ppct_version_id", "ppct_item_id");
CREATE UNIQUE INDEX "ppct_item_revisions_provenance_key"
    ON "ppct_item_revisions"("ppct_version_id", "ppct_item_id", "ppct_plan_id");

CREATE UNIQUE INDEX "ppct_item_lineage_edge_key"
    ON "ppct_item_lineage"(
        "predecessor_version_id", "predecessor_item_id",
        "successor_version_id", "successor_item_id"
    );
CREATE INDEX "ppct_item_lineage_predecessor_idx"
    ON "ppct_item_lineage"("ppct_plan_id", "predecessor_version_id", "predecessor_item_id");
CREATE INDEX "ppct_item_lineage_successor_idx"
    ON "ppct_item_lineage"("ppct_plan_id", "successor_version_id", "successor_item_id");

CREATE UNIQUE INDEX "ppct_class_associations_provenance_key"
    ON "ppct_class_associations"("id", "academic_year_id", "school_class_id", "subject_id");
CREATE INDEX "ppct_class_associations_stream_dates_idx"
    ON "ppct_class_associations"(
        "academic_year_id", "school_class_id", "subject_id", "effective_from", "effective_until"
    );
CREATE INDEX "ppct_class_associations_ppct_version_id_idx"
    ON "ppct_class_associations"("ppct_version_id");

ALTER TABLE "ppct_class_associations"
    ADD CONSTRAINT "ppct_class_associations_no_overlap"
    EXCLUDE USING gist (
        "academic_year_id" WITH =,
        "school_class_id" WITH =,
        "subject_id" WITH =,
        daterange("effective_from", "effective_until", '[]') WITH &&
    );

ALTER TABLE "ppct_plans"
    ADD CONSTRAINT "ppct_plans_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_plans"
    ADD CONSTRAINT "ppct_plans_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ppct_versions"
    ADD CONSTRAINT "ppct_versions_ppct_plan_id_fkey"
    FOREIGN KEY ("ppct_plan_id") REFERENCES "ppct_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_versions"
    ADD CONSTRAINT "ppct_versions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_versions"
    ADD CONSTRAINT "ppct_versions_published_by_user_id_fkey"
    FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_versions"
    ADD CONSTRAINT "ppct_versions_superseded_by_user_id_fkey"
    FOREIGN KEY ("superseded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ppct_items"
    ADD CONSTRAINT "ppct_items_ppct_plan_id_fkey"
    FOREIGN KEY ("ppct_plan_id") REFERENCES "ppct_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ppct_item_revisions"
    ADD CONSTRAINT "ppct_item_revisions_version_plan_fkey"
    FOREIGN KEY ("ppct_version_id", "ppct_plan_id")
    REFERENCES "ppct_versions"("id", "ppct_plan_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_item_revisions"
    ADD CONSTRAINT "ppct_item_revisions_item_plan_fkey"
    FOREIGN KEY ("ppct_item_id", "ppct_plan_id")
    REFERENCES "ppct_items"("id", "ppct_plan_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ppct_item_lineage"
    ADD CONSTRAINT "ppct_item_lineage_predecessor_revision_fkey"
    FOREIGN KEY ("predecessor_version_id", "predecessor_item_id", "ppct_plan_id")
    REFERENCES "ppct_item_revisions"("ppct_version_id", "ppct_item_id", "ppct_plan_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_item_lineage"
    ADD CONSTRAINT "ppct_item_lineage_successor_revision_fkey"
    FOREIGN KEY ("successor_version_id", "successor_item_id", "ppct_plan_id")
    REFERENCES "ppct_item_revisions"("ppct_version_id", "ppct_item_id", "ppct_plan_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ppct_class_associations"
    ADD CONSTRAINT "ppct_class_associations_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_class_associations"
    ADD CONSTRAINT "ppct_class_associations_school_class_year_grade_fkey"
    FOREIGN KEY ("school_class_id", "academic_year_id", "grade_level")
    REFERENCES "classes"("id", "academic_year_id", "grade_level") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_class_associations"
    ADD CONSTRAINT "ppct_class_associations_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_class_associations"
    ADD CONSTRAINT "ppct_class_associations_plan_scope_fkey"
    FOREIGN KEY ("ppct_plan_id", "academic_year_id", "subject_id", "grade_level")
    REFERENCES "ppct_plans"("id", "academic_year_id", "subject_id", "grade_level")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_class_associations"
    ADD CONSTRAINT "ppct_class_associations_version_plan_fkey"
    FOREIGN KEY ("ppct_version_id", "ppct_plan_id")
    REFERENCES "ppct_versions"("id", "ppct_plan_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppct_class_associations"
    ADD CONSTRAINT "ppct_class_associations_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
