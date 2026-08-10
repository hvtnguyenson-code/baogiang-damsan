-- Local Phase 02A: versioned academic calendar and academic-year class foundation.
-- Civil school calendar boundaries use DATE; audit and activation instants use TIMESTAMPTZ(3).

CREATE TYPE "AcademicWeekday" AS ENUM (
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'
);
CREATE TYPE "AcademicWeekKind" AS ENUM ('OFFICIAL', 'RESERVE');

CREATE TABLE "academic_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "academic_years_code_normalized_check"
        CHECK ("code" = upper(btrim("code")) AND "code" <> ''),
    CONSTRAINT "academic_years_name_normalized_check"
        CHECK ("name" = btrim("name") AND "name" <> '')
);

CREATE TABLE "academic_calendar_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "official_week_count" INTEGER NOT NULL,
    "reserve_week_count" INTEGER NOT NULL,
    "teaching_weekdays" "AcademicWeekday"[] NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "activated_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_calendar_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "academic_calendar_versions_version_number_check"
        CHECK ("version_number" > 0),
    CONSTRAINT "academic_calendar_versions_date_range_check"
        CHECK ("end_date" >= "start_date"),
    CONSTRAINT "academic_calendar_versions_official_week_count_check"
        CHECK ("official_week_count" > 0),
    CONSTRAINT "academic_calendar_versions_reserve_week_count_check"
        CHECK ("reserve_week_count" >= 0),
    CONSTRAINT "academic_calendar_versions_teaching_weekdays_check"
        CHECK (
            cardinality("teaching_weekdays") BETWEEN 1 AND 7
            AND array_position("teaching_weekdays", NULL) IS NULL
        ),
    CONSTRAINT "academic_calendar_versions_active_activation_check"
        CHECK (NOT "is_active" OR "activated_at" IS NOT NULL)
);

CREATE TABLE "semesters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "calendar_version_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "semesters_code_normalized_check"
        CHECK ("code" = upper(btrim("code")) AND "code" <> ''),
    CONSTRAINT "semesters_name_normalized_check"
        CHECK ("name" = btrim("name") AND "name" <> ''),
    CONSTRAINT "semesters_ordinal_check" CHECK ("ordinal" > 0),
    CONSTRAINT "semesters_date_range_check" CHECK ("end_date" >= "start_date")
);

CREATE TABLE "academic_weeks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "calendar_version_id" UUID NOT NULL,
    "kind" "AcademicWeekKind" NOT NULL,
    "official_week_number" INTEGER,
    "reserve_week_number" INTEGER,
    "display_label" VARCHAR(50) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_weeks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "academic_weeks_display_label_normalized_check"
        CHECK ("display_label" = btrim("display_label") AND "display_label" <> ''),
    CONSTRAINT "academic_weeks_sort_order_check" CHECK ("sort_order" > 0),
    CONSTRAINT "academic_weeks_kind_numbers_check" CHECK (
        (
            "kind" = 'OFFICIAL'
            AND "official_week_number" IS NOT NULL
            AND "official_week_number" > 0
            AND "reserve_week_number" IS NULL
        )
        OR
        (
            "kind" = 'RESERVE'
            AND "reserve_week_number" IS NOT NULL
            AND "reserve_week_number" > 0
            AND "official_week_number" IS NULL
        )
    )
);

CREATE TABLE "academic_week_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_week_id" UUID NOT NULL,
    "calendar_version_id" UUID NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "segment_order" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_week_segments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "academic_week_segments_label_normalized_check"
        CHECK ("label" = btrim("label") AND "label" <> ''),
    CONSTRAINT "academic_week_segments_order_check" CHECK ("segment_order" > 0),
    CONSTRAINT "academic_week_segments_date_range_check" CHECK ("end_date" >= "start_date")
);

CREATE TABLE "calendar_interruptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "calendar_version_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_interruptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_interruptions_code_normalized_check"
        CHECK ("code" = upper(btrim("code")) AND "code" <> ''),
    CONSTRAINT "calendar_interruptions_name_normalized_check"
        CHECK ("name" = btrim("name") AND "name" <> ''),
    CONSTRAINT "calendar_interruptions_date_range_check" CHECK ("end_date" >= "start_date")
);

CREATE TABLE "classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "grade_level" INTEGER NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "classes_code_normalized_check"
        CHECK ("code" = upper(btrim("code")) AND "code" <> ''),
    CONSTRAINT "classes_name_normalized_check"
        CHECK ("name" = btrim("name") AND "name" <> ''),
    CONSTRAINT "classes_grade_level_check" CHECK ("grade_level" BETWEEN 10 AND 12)
);

CREATE UNIQUE INDEX "academic_years_code_key" ON "academic_years"("code");
CREATE UNIQUE INDEX "academic_calendar_versions_academic_year_id_version_number_key"
    ON "academic_calendar_versions"("academic_year_id", "version_number");
CREATE UNIQUE INDEX "academic_calendar_versions_one_active_per_year_key"
    ON "academic_calendar_versions"("academic_year_id") WHERE "is_active";
CREATE INDEX "academic_calendar_versions_academic_year_id_is_active_idx"
    ON "academic_calendar_versions"("academic_year_id", "is_active");

CREATE UNIQUE INDEX "semesters_calendar_version_id_code_key"
    ON "semesters"("calendar_version_id", "code");
CREATE UNIQUE INDEX "semesters_calendar_version_id_ordinal_key"
    ON "semesters"("calendar_version_id", "ordinal");
CREATE INDEX "semesters_calendar_version_id_start_date_end_date_idx"
    ON "semesters"("calendar_version_id", "start_date", "end_date");

CREATE UNIQUE INDEX "academic_weeks_id_calendar_version_id_key"
    ON "academic_weeks"("id", "calendar_version_id");
CREATE UNIQUE INDEX "academic_weeks_calendar_version_id_display_label_key"
    ON "academic_weeks"("calendar_version_id", "display_label");
CREATE UNIQUE INDEX "academic_weeks_calendar_version_id_sort_order_key"
    ON "academic_weeks"("calendar_version_id", "sort_order");
CREATE UNIQUE INDEX "academic_weeks_official_number_key"
    ON "academic_weeks"("calendar_version_id", "official_week_number")
    WHERE "kind" = 'OFFICIAL';
CREATE UNIQUE INDEX "academic_weeks_reserve_number_key"
    ON "academic_weeks"("calendar_version_id", "reserve_week_number")
    WHERE "kind" = 'RESERVE';
CREATE INDEX "academic_weeks_calendar_version_id_kind_idx"
    ON "academic_weeks"("calendar_version_id", "kind");

CREATE UNIQUE INDEX "academic_week_segments_academic_week_id_label_key"
    ON "academic_week_segments"("academic_week_id", "label");
CREATE UNIQUE INDEX "academic_week_segments_academic_week_id_segment_order_key"
    ON "academic_week_segments"("academic_week_id", "segment_order");
CREATE INDEX "academic_week_segments_version_dates_idx"
    ON "academic_week_segments"("calendar_version_id", "start_date", "end_date");

CREATE UNIQUE INDEX "calendar_interruptions_calendar_version_id_code_key"
    ON "calendar_interruptions"("calendar_version_id", "code");
CREATE INDEX "calendar_interruptions_version_dates_idx"
    ON "calendar_interruptions"("calendar_version_id", "start_date", "end_date");

CREATE UNIQUE INDEX "classes_academic_year_id_code_key"
    ON "classes"("academic_year_id", "code");
CREATE INDEX "classes_academic_year_id_status_grade_level_code_idx"
    ON "classes"("academic_year_id", "status", "grade_level", "code");

ALTER TABLE "semesters"
    ADD CONSTRAINT "semesters_no_overlap"
    EXCLUDE USING gist (
        "calendar_version_id" WITH =,
        daterange("start_date", "end_date", '[]') WITH &&
    );

ALTER TABLE "academic_week_segments"
    ADD CONSTRAINT "academic_week_segments_no_overlap"
    EXCLUDE USING gist (
        "calendar_version_id" WITH =,
        daterange("start_date", "end_date", '[]') WITH &&
    );

ALTER TABLE "calendar_interruptions"
    ADD CONSTRAINT "calendar_interruptions_no_overlap"
    EXCLUDE USING gist (
        "calendar_version_id" WITH =,
        daterange("start_date", "end_date", '[]') WITH &&
    );

ALTER TABLE "academic_calendar_versions"
    ADD CONSTRAINT "academic_calendar_versions_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "semesters"
    ADD CONSTRAINT "semesters_calendar_version_id_fkey"
    FOREIGN KEY ("calendar_version_id") REFERENCES "academic_calendar_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_weeks"
    ADD CONSTRAINT "academic_weeks_calendar_version_id_fkey"
    FOREIGN KEY ("calendar_version_id") REFERENCES "academic_calendar_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_week_segments"
    ADD CONSTRAINT "academic_week_segments_academic_week_version_fkey"
    FOREIGN KEY ("academic_week_id", "calendar_version_id")
    REFERENCES "academic_weeks"("id", "calendar_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_interruptions"
    ADD CONSTRAINT "calendar_interruptions_calendar_version_id_fkey"
    FOREIGN KEY ("calendar_version_id") REFERENCES "academic_calendar_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "classes"
    ADD CONSTRAINT "classes_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
