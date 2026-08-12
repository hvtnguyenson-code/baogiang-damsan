-- LOCAL-FC-04B3B: school-wide timetable import configuration and immutable committed provenance.
-- Partial uniqueness and discriminated alias shapes remain PostgreSQL invariants because Prisma cannot express them.

CREATE TYPE "TimetableImportTeacherIdentifierMode" AS ENUM (
    'GENERIC_EXACT', 'STAFF_CODE', 'USERNAME', 'APPROVED_ALIAS'
);

CREATE TYPE "TimetableImportSemanticField" AS ENUM (
    'WEEKDAY', 'SESSION', 'PERIOD_ORDINAL', 'SCHOOL_CLASS', 'SUBJECT', 'TEACHER'
);

CREATE TYPE "TimetableImportAliasEntityType" AS ENUM (
    'TEACHER', 'SCHOOL_CLASS', 'SUBJECT'
);

CREATE TABLE "timetable_import_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_import_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetable_import_profiles_source_key_normalized_check" CHECK (
        "source_key" = btrim("source_key") AND "source_key" <> ''
    ),
    CONSTRAINT "timetable_import_profiles_name_normalized_check" CHECK (
        "name" = btrim("name") AND "name" <> ''
    )
);

CREATE TABLE "timetable_import_profile_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sheet_name_hint" VARCHAR(150),
    "header_row_hint" INTEGER,
    "teacher_identifier_mode" "TimetableImportTeacherIdentifierMode" NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "retired_by_user_id" UUID,
    "retired_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_import_profile_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetable_import_profile_revisions_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "timetable_import_profile_revisions_header_row_hint_check" CHECK (
        "header_row_hint" IS NULL OR "header_row_hint" > 0
    ),
    CONSTRAINT "timetable_import_profile_revisions_lifecycle_check" CHECK (
        (
            "is_active"
            AND "retired_at" IS NULL
            AND "retired_by_user_id" IS NULL
        )
        OR
        (
            NOT "is_active"
            AND "retired_at" IS NOT NULL
            AND "retired_by_user_id" IS NOT NULL
        )
    )
);

CREATE TABLE "timetable_import_column_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_revision_id" UUID NOT NULL,
    "semantic_field" "TimetableImportSemanticField" NOT NULL,
    "source_header" VARCHAR(150) NOT NULL,
    "source_header_key" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_import_column_mappings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetable_import_column_mappings_source_header_normalized_check" CHECK (
        "source_header" = btrim("source_header") AND "source_header" <> ''
    ),
    CONSTRAINT "timetable_import_column_mappings_source_header_key_normalized_check" CHECK (
        "source_header_key" = btrim("source_header_key") AND "source_header_key" <> ''
    )
);

CREATE TABLE "timetable_import_entity_aliases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "entity_type" "TimetableImportAliasEntityType" NOT NULL,
    "academic_year_id" UUID,
    "source_value" VARCHAR(200) NOT NULL,
    "source_value_key" VARCHAR(200) NOT NULL,
    "teacher_user_id" UUID,
    "school_class_id" UUID,
    "subject_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "retired_by_user_id" UUID,
    "retired_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_import_entity_aliases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetable_import_entity_aliases_source_value_normalized_check" CHECK (
        "source_value" = btrim("source_value") AND "source_value" <> ''
    ),
    CONSTRAINT "timetable_import_entity_aliases_source_value_key_normalized_check" CHECK (
        "source_value_key" = btrim("source_value_key") AND "source_value_key" <> ''
    ),
    CONSTRAINT "timetable_import_entity_aliases_target_shape_check" CHECK (
        (
            "entity_type" = 'TEACHER'
            AND "teacher_user_id" IS NOT NULL
            AND "academic_year_id" IS NULL
            AND "school_class_id" IS NULL
            AND "subject_id" IS NULL
        )
        OR
        (
            "entity_type" = 'SCHOOL_CLASS'
            AND "academic_year_id" IS NOT NULL
            AND "school_class_id" IS NOT NULL
            AND "teacher_user_id" IS NULL
            AND "subject_id" IS NULL
        )
        OR
        (
            "entity_type" = 'SUBJECT'
            AND "subject_id" IS NOT NULL
            AND "academic_year_id" IS NULL
            AND "school_class_id" IS NULL
            AND "teacher_user_id" IS NULL
        )
    ),
    CONSTRAINT "timetable_import_entity_aliases_lifecycle_check" CHECK (
        (
            "is_active"
            AND "retired_at" IS NULL
            AND "retired_by_user_id" IS NULL
        )
        OR
        (
            NOT "is_active"
            AND "retired_at" IS NOT NULL
            AND "retired_by_user_id" IS NOT NULL
        )
    )
);

CREATE TABLE "timetable_import_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "timetable_version_id" UUID NOT NULL,
    "profile_revision_id" UUID NOT NULL,
    "checksum_algorithm" VARCHAR(20) NOT NULL,
    "serialization_version" VARCHAR(30) NOT NULL,
    "request_idempotency_key" VARCHAR(200),
    "request_fingerprint" VARCHAR(128),
    "source_file_name" VARCHAR(255) NOT NULL,
    "sheet_name" VARCHAR(150) NOT NULL,
    "header_row_number" INTEGER NOT NULL,
    "source_row_count" INTEGER NOT NULL,
    "normalized_entry_count" INTEGER NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "committed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_import_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetable_import_receipts_checksum_algorithm_check" CHECK (
        "checksum_algorithm" = 'SHA-256'
    ),
    CONSTRAINT "timetable_import_receipts_serialization_version_check" CHECK (
        "serialization_version" = 'semantic-v1'
    ),
    CONSTRAINT "timetable_import_receipts_request_pair_check" CHECK (
        (
            "request_idempotency_key" IS NULL
            AND "request_fingerprint" IS NULL
        )
        OR
        (
            "request_idempotency_key" IS NOT NULL
            AND "request_fingerprint" IS NOT NULL
            AND "request_idempotency_key" = btrim("request_idempotency_key")
            AND "request_idempotency_key" <> ''
            AND "request_fingerprint" = btrim("request_fingerprint")
            AND "request_fingerprint" <> ''
        )
    ),
    CONSTRAINT "timetable_import_receipts_source_file_name_normalized_check" CHECK (
        "source_file_name" = btrim("source_file_name") AND "source_file_name" <> ''
    ),
    CONSTRAINT "timetable_import_receipts_sheet_name_normalized_check" CHECK (
        "sheet_name" = btrim("sheet_name") AND "sheet_name" <> ''
    ),
    CONSTRAINT "timetable_import_receipts_header_row_number_check" CHECK ("header_row_number" > 0),
    CONSTRAINT "timetable_import_receipts_source_row_count_check" CHECK ("source_row_count" >= 0),
    CONSTRAINT "timetable_import_receipts_normalized_entry_count_check" CHECK ("normalized_entry_count" > 0)
);

CREATE UNIQUE INDEX "timetable_versions_import_semantic_duplicate_key"
    ON "timetable_versions"(
        "academic_year_id", "calendar_version_id", "effective_academic_week_id", "content_checksum"
    );

CREATE UNIQUE INDEX "timetable_import_profiles_source_key_name_key"
    ON "timetable_import_profiles"("source_key", "name");
CREATE INDEX "timetable_import_profiles_source_key_name_idx"
    ON "timetable_import_profiles"("source_key", "name");

CREATE UNIQUE INDEX "timetable_import_profile_revisions_profile_revision_key"
    ON "timetable_import_profile_revisions"("profile_id", "revision");
CREATE UNIQUE INDEX "timetable_import_profile_revisions_one_active_key"
    ON "timetable_import_profile_revisions"("profile_id") WHERE "is_active";
CREATE INDEX "timetable_import_profile_revisions_profile_active_idx"
    ON "timetable_import_profile_revisions"("profile_id", "is_active");

CREATE UNIQUE INDEX "timetable_import_column_mappings_revision_field_key"
    ON "timetable_import_column_mappings"("profile_revision_id", "semantic_field");
CREATE UNIQUE INDEX "timetable_import_column_mappings_revision_source_key"
    ON "timetable_import_column_mappings"("profile_revision_id", "source_header_key");

CREATE UNIQUE INDEX "timetable_import_entity_aliases_active_global_key"
    ON "timetable_import_entity_aliases"("profile_id", "entity_type", "source_value_key")
    WHERE "is_active" AND "entity_type" IN ('TEACHER', 'SUBJECT');
CREATE UNIQUE INDEX "timetable_import_entity_aliases_active_class_key"
    ON "timetable_import_entity_aliases"("profile_id", "academic_year_id", "source_value_key")
    WHERE "is_active" AND "entity_type" = 'SCHOOL_CLASS';
CREATE INDEX "timetable_import_entity_aliases_profile_entity_active_idx"
    ON "timetable_import_entity_aliases"("profile_id", "entity_type", "is_active");
CREATE INDEX "timetable_import_entity_aliases_year_class_idx"
    ON "timetable_import_entity_aliases"("academic_year_id", "school_class_id");

CREATE UNIQUE INDEX "timetable_import_receipts_timetable_version_id_key"
    ON "timetable_import_receipts"("timetable_version_id");
CREATE UNIQUE INDEX "timetable_import_receipts_request_idempotency_key_key"
    ON "timetable_import_receipts"("request_idempotency_key");
CREATE INDEX "timetable_import_receipts_profile_revision_id_idx"
    ON "timetable_import_receipts"("profile_revision_id");
CREATE INDEX "timetable_import_receipts_created_by_user_id_idx"
    ON "timetable_import_receipts"("created_by_user_id");

ALTER TABLE "timetable_import_profiles"
    ADD CONSTRAINT "timetable_import_profiles_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_import_profile_revisions"
    ADD CONSTRAINT "timetable_import_profile_revisions_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "timetable_import_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_import_profile_revisions"
    ADD CONSTRAINT "timetable_import_profile_revisions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_import_profile_revisions"
    ADD CONSTRAINT "timetable_import_profile_revisions_retired_by_user_id_fkey"
    FOREIGN KEY ("retired_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_import_column_mappings"
    ADD CONSTRAINT "timetable_import_column_mappings_profile_revision_id_fkey"
    FOREIGN KEY ("profile_revision_id") REFERENCES "timetable_import_profile_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_import_entity_aliases"
    ADD CONSTRAINT "timetable_import_entity_aliases_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "timetable_import_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_import_entity_aliases"
    ADD CONSTRAINT "timetable_import_entity_aliases_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_import_entity_aliases"
    ADD CONSTRAINT "timetable_import_entity_aliases_teacher_user_id_fkey"
    FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_import_entity_aliases"
    ADD CONSTRAINT "timetable_import_entity_aliases_school_class_year_fkey"
    FOREIGN KEY ("school_class_id", "academic_year_id")
    REFERENCES "classes"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_import_entity_aliases"
    ADD CONSTRAINT "timetable_import_entity_aliases_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_import_entity_aliases"
    ADD CONSTRAINT "timetable_import_entity_aliases_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_import_entity_aliases"
    ADD CONSTRAINT "timetable_import_entity_aliases_retired_by_user_id_fkey"
    FOREIGN KEY ("retired_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_import_receipts"
    ADD CONSTRAINT "timetable_import_receipts_timetable_version_id_fkey"
    FOREIGN KEY ("timetable_version_id") REFERENCES "timetable_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_import_receipts"
    ADD CONSTRAINT "timetable_import_receipts_profile_revision_id_fkey"
    FOREIGN KEY ("profile_revision_id") REFERENCES "timetable_import_profile_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_import_receipts"
    ADD CONSTRAINT "timetable_import_receipts_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
