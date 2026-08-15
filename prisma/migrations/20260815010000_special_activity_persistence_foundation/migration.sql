-- LOCAL-FC-05D1: Special Activity persistence foundation only.
-- One root is one atomic retained occurrence; collision and command behavior are deferred.

CREATE TYPE "SpecialActivityStatus" AS ENUM ('ACTIVE', 'REVERSED');
CREATE TYPE "SpecialActivityScope" AS ENUM ('SCHOOL_WIDE', 'GRADE', 'CLASS');

-- Narrow provenance key required for frozen staffing identity.
CREATE UNIQUE INDEX "staff_profiles_id_user_id_key"
    ON "staff_profiles"("id", "user_id");

CREATE TABLE "special_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "academic_calendar_version_id" UUID NOT NULL,
    "civil_date" DATE NOT NULL,
    "scope" "SpecialActivityScope" NOT NULL,
    "grade_level" INTEGER,
    "school_class_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "note" VARCHAR(500),
    "status" "SpecialActivityStatus" NOT NULL DEFAULT 'ACTIVE',
    "create_request_key" VARCHAR(200) NOT NULL,
    "create_request_fingerprint" VARCHAR(128) NOT NULL,
    "reversed_by_user_id" UUID,
    "reversed_at" TIMESTAMPTZ(3),
    "reversal_reason" VARCHAR(500),
    "reverse_request_key" VARCHAR(200),
    "reverse_request_fingerprint" VARCHAR(128),
    "replaces_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "special_activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "special_activities_scope_shape_check" CHECK (
        ("scope" = 'SCHOOL_WIDE' AND "grade_level" IS NULL AND "school_class_id" IS NULL)
        OR ("scope" = 'GRADE' AND "grade_level" BETWEEN 10 AND 12 AND "school_class_id" IS NULL)
        OR ("scope" = 'CLASS' AND "grade_level" IS NULL AND "school_class_id" IS NOT NULL)
    ),
    CONSTRAINT "special_activities_lifecycle_shape_check" CHECK (
        ("status" = 'ACTIVE' AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL
            AND "reversal_reason" IS NULL AND "reverse_request_key" IS NULL
            AND "reverse_request_fingerprint" IS NULL)
        OR
        ("status" = 'REVERSED' AND "reversed_by_user_id" IS NOT NULL AND "reversed_at" IS NOT NULL
            AND "reversal_reason" IS NOT NULL AND "reverse_request_key" IS NOT NULL
            AND "reverse_request_fingerprint" IS NOT NULL)
    ),
    CONSTRAINT "special_activities_request_identity_check" CHECK (
        "create_request_key" = btrim("create_request_key") AND "create_request_key" <> ''
        AND "create_request_fingerprint" = btrim("create_request_fingerprint") AND "create_request_fingerprint" <> ''
        AND ("reverse_request_key" IS NULL OR ("reverse_request_key" = btrim("reverse_request_key") AND "reverse_request_key" <> ''))
        AND ("reverse_request_fingerprint" IS NULL OR ("reverse_request_fingerprint" = btrim("reverse_request_fingerprint") AND "reverse_request_fingerprint" <> ''))
    ),
    CONSTRAINT "special_activities_bounded_text_check" CHECK (
        "title" = btrim("title") AND "title" <> ''
        AND ("note" IS NULL OR ("note" = btrim("note") AND "note" <> ''))
        AND ("reversal_reason" IS NULL OR ("reversal_reason" = btrim("reversal_reason") AND "reversal_reason" <> ''))
    ),
    CONSTRAINT "special_activities_no_self_replacement_check"
        CHECK ("replaces_id" IS NULL OR "replaces_id" <> "id")
);

CREATE TABLE "special_activity_time_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "special_activity_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "time_slot_definition_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "special_activity_time_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "special_activity_class_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "special_activity_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "special_activity_class_targets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "special_activity_staffing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "special_activity_id" UUID NOT NULL,
    "scheduled_teacher_user_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "eligibility_checked_at" TIMESTAMPTZ(3) NOT NULL,
    "eligibility_was_active" BOOLEAN NOT NULL,
    "eligibility_was_teaching_staff" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "special_activity_staffing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "special_activity_staffing_eligibility_shape_check" CHECK (
        "eligibility_was_active" IS TRUE
        AND "eligibility_was_teaching_staff" IS TRUE
    )
);

CREATE UNIQUE INDEX "special_activities_id_academic_year_id_key"
    ON "special_activities"("id", "academic_year_id");
CREATE UNIQUE INDEX "special_activities_create_request_key_key"
    ON "special_activities"("create_request_key");
CREATE UNIQUE INDEX "special_activities_reverse_request_key_key"
    ON "special_activities"("reverse_request_key");
CREATE UNIQUE INDEX "special_activities_replaces_id_key"
    ON "special_activities"("replaces_id");
CREATE INDEX "special_activities_year_date_status_idx"
    ON "special_activities"("academic_year_id", "civil_date", "status");
CREATE INDEX "special_activities_calendar_date_idx"
    ON "special_activities"("academic_calendar_version_id", "civil_date");

CREATE UNIQUE INDEX "special_activity_time_slots_activity_slot_key"
    ON "special_activity_time_slots"("special_activity_id", "time_slot_definition_id");
CREATE INDEX "special_activity_time_slots_year_slot_idx"
    ON "special_activity_time_slots"("academic_year_id", "time_slot_definition_id");

CREATE UNIQUE INDEX "special_activity_class_targets_activity_class_key"
    ON "special_activity_class_targets"("special_activity_id", "school_class_id");
CREATE INDEX "special_activity_class_targets_year_class_idx"
    ON "special_activity_class_targets"("academic_year_id", "school_class_id");

CREATE UNIQUE INDEX "special_activity_staffing_activity_teacher_key"
    ON "special_activity_staffing"("special_activity_id", "scheduled_teacher_user_id");
CREATE INDEX "special_activity_staffing_teacher_activity_idx"
    ON "special_activity_staffing"("scheduled_teacher_user_id", "special_activity_id");

ALTER TABLE "special_activities" ADD CONSTRAINT "special_activities_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activities" ADD CONSTRAINT "special_activities_calendar_version_year_fkey"
    FOREIGN KEY ("academic_calendar_version_id", "academic_year_id")
    REFERENCES "academic_calendar_versions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activities" ADD CONSTRAINT "special_activities_school_class_year_fkey"
    FOREIGN KEY ("school_class_id", "academic_year_id")
    REFERENCES "classes"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activities" ADD CONSTRAINT "special_activities_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activities" ADD CONSTRAINT "special_activities_reversed_by_user_id_fkey"
    FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activities" ADD CONSTRAINT "special_activities_replaces_id_fkey"
    FOREIGN KEY ("replaces_id") REFERENCES "special_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "special_activity_time_slots" ADD CONSTRAINT "special_activity_time_slots_activity_year_fkey"
    FOREIGN KEY ("special_activity_id", "academic_year_id")
    REFERENCES "special_activities"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_time_slots" ADD CONSTRAINT "special_activity_time_slots_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_time_slots" ADD CONSTRAINT "special_activity_time_slots_time_slot_year_fkey"
    FOREIGN KEY ("time_slot_definition_id", "academic_year_id")
    REFERENCES "time_slot_definitions"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "special_activity_class_targets" ADD CONSTRAINT "special_activity_class_targets_activity_year_fkey"
    FOREIGN KEY ("special_activity_id", "academic_year_id")
    REFERENCES "special_activities"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_class_targets" ADD CONSTRAINT "special_activity_class_targets_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_class_targets" ADD CONSTRAINT "special_activity_class_targets_school_class_year_fkey"
    FOREIGN KEY ("school_class_id", "academic_year_id")
    REFERENCES "classes"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "special_activity_staffing" ADD CONSTRAINT "special_activity_staffing_activity_id_fkey"
    FOREIGN KEY ("special_activity_id") REFERENCES "special_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_staffing" ADD CONSTRAINT "special_activity_staffing_scheduled_teacher_user_id_fkey"
    FOREIGN KEY ("scheduled_teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_activity_staffing" ADD CONSTRAINT "special_activity_staffing_staff_profile_user_fkey"
    FOREIGN KEY ("staff_profile_id", "scheduled_teacher_user_id")
    REFERENCES "staff_profiles"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
