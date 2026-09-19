-- P4-040: Programme-to-SpecialActivity runtime bridge and attestation persistence foundation.
-- Materializes published occurrences into SpecialActivity roots via dedicated bridge table
-- and manages Programme Occurrence Attestation lifecycle.

CREATE TYPE "ProgrammeAttestationStatus" AS ENUM ('ACTIVE', 'REVERSED');
CREATE TYPE "ProgrammeAttestorAuthorityType" AS ENUM ('COORDINATOR', 'BGH_PRINCIPAL', 'BGH_VICE_PRINCIPAL');

CREATE TABLE "programme_materialized_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "programme_master_id" UUID NOT NULL,
    "programme_plan_version_id" UUID NOT NULL,
    "programme_topic_item_id" UUID NOT NULL,
    "planned_programme_occurrence_id" UUID NOT NULL,
    "planned_occurrence_slot_id" UUID NOT NULL,
    "special_activity_id" UUID NOT NULL,
    "homeroom_assignment_id" UUID,
    "homeroom_teacher_user_id" UUID,
    "materialized_by_user_id" UUID NOT NULL,
    "materialized_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_materialized_activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "programme_materialized_activities_homeroom_pairing_check" CHECK (
        ("homeroom_assignment_id" IS NULL AND "homeroom_teacher_user_id" IS NULL)
        OR
        ("homeroom_assignment_id" IS NOT NULL AND "homeroom_teacher_user_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "programme_materialized_activities_special_activity_id_key"
    ON "programme_materialized_activities"("special_activity_id");

CREATE INDEX "programme_materialized_activities_occurrence_idx"
    ON "programme_materialized_activities"("planned_programme_occurrence_id");

CREATE INDEX "programme_materialized_activities_slot_idx"
    ON "programme_materialized_activities"("planned_occurrence_slot_id");

CREATE INDEX "programme_materialized_activities_master_idx"
    ON "programme_materialized_activities"("programme_master_id");

CREATE INDEX "programme_materialized_activities_homeroom_idx"
    ON "programme_materialized_activities"("homeroom_assignment_id")
    WHERE "homeroom_assignment_id" IS NOT NULL;

ALTER TABLE "programme_materialized_activities"
    ADD CONSTRAINT "programme_materialized_activities_master_fkey"
    FOREIGN KEY ("programme_master_id")
    REFERENCES "programme_masters"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_materialized_activities"
    ADD CONSTRAINT "programme_materialized_activities_plan_version_fkey"
    FOREIGN KEY ("programme_plan_version_id")
    REFERENCES "programme_plan_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_materialized_activities"
    ADD CONSTRAINT "programme_materialized_activities_topic_item_fkey"
    FOREIGN KEY ("programme_topic_item_id")
    REFERENCES "programme_topic_items"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_materialized_activities"
    ADD CONSTRAINT "programme_materialized_activities_occurrence_fkey"
    FOREIGN KEY ("planned_programme_occurrence_id")
    REFERENCES "planned_programme_occurrences"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_materialized_activities"
    ADD CONSTRAINT "programme_materialized_activities_slot_fkey"
    FOREIGN KEY ("planned_occurrence_slot_id")
    REFERENCES "planned_occurrence_slots"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_materialized_activities"
    ADD CONSTRAINT "programme_materialized_activities_special_activity_fkey"
    FOREIGN KEY ("special_activity_id")
    REFERENCES "special_activities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_materialized_activities"
    ADD CONSTRAINT "programme_materialized_activities_homeroom_assignment_fkey"
    FOREIGN KEY ("homeroom_assignment_id")
    REFERENCES "homeroom_assignments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_materialized_activities"
    ADD CONSTRAINT "programme_materialized_activities_homeroom_teacher_fkey"
    FOREIGN KEY ("homeroom_teacher_user_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_materialized_activities"
    ADD CONSTRAINT "programme_materialized_activities_materialized_by_fkey"
    FOREIGN KEY ("materialized_by_user_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "programme_occurrence_attestations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "programme_master_id" UUID NOT NULL,
    "planned_programme_occurrence_id" UUID NOT NULL,
    "attested_by_user_id" UUID NOT NULL,
    "authority_type" "ProgrammeAttestorAuthorityType" NOT NULL,
    "capability_key" VARCHAR(100) NOT NULL,
    "scope" VARCHAR(50) NOT NULL,
    "scope_resource_id" UUID,
    "status" "ProgrammeAttestationStatus" NOT NULL DEFAULT 'ACTIVE',
    "create_request_key" VARCHAR(200) NOT NULL,
    "create_request_fingerprint" VARCHAR(128) NOT NULL,
    "attested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_by_user_id" UUID,
    "reversed_at" TIMESTAMPTZ(3),
    "reversal_reason" VARCHAR(500),
    "reverse_request_key" VARCHAR(200),
    "reverse_request_fingerprint" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_occurrence_attestations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "programme_occurrence_attestations_request_shape_check" CHECK (
        btrim("create_request_key") <> ''
        AND btrim("create_request_fingerprint") <> ''
    ),
    CONSTRAINT "programme_occurrence_attestations_reversal_evidence_check" CHECK (
        ("status" = 'ACTIVE'
            AND "reversed_by_user_id" IS NULL
            AND "reversed_at" IS NULL
            AND "reversal_reason" IS NULL
            AND "reverse_request_key" IS NULL
            AND "reverse_request_fingerprint" IS NULL)
        OR
        ("status" = 'REVERSED'
            AND "reversed_by_user_id" IS NOT NULL
            AND "reversed_at" IS NOT NULL
            AND btrim("reversal_reason") <> ''
            AND "reverse_request_key" IS NOT NULL
            AND "reverse_request_fingerprint" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "programme_occurrence_attestations_create_request_key_key"
    ON "programme_occurrence_attestations"("create_request_key");

CREATE UNIQUE INDEX "programme_occurrence_attestations_reverse_request_key_key"
    ON "programme_occurrence_attestations"("reverse_request_key")
    WHERE "reverse_request_key" IS NOT NULL;

CREATE UNIQUE INDEX "programme_occurrence_attestations_one_active_per_actor"
    ON "programme_occurrence_attestations"("planned_programme_occurrence_id", "attested_by_user_id")
    WHERE "status" = 'ACTIVE';

CREATE INDEX "programme_occurrence_attestations_occurrence_status_idx"
    ON "programme_occurrence_attestations"("planned_programme_occurrence_id", "status");

CREATE INDEX "programme_occurrence_attestations_master_status_idx"
    ON "programme_occurrence_attestations"("programme_master_id", "status");

ALTER TABLE "programme_occurrence_attestations"
    ADD CONSTRAINT "programme_occurrence_attestations_master_fkey"
    FOREIGN KEY ("programme_master_id")
    REFERENCES "programme_masters"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_occurrence_attestations"
    ADD CONSTRAINT "programme_occurrence_attestations_occurrence_fkey"
    FOREIGN KEY ("planned_programme_occurrence_id")
    REFERENCES "planned_programme_occurrences"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_occurrence_attestations"
    ADD CONSTRAINT "programme_occurrence_attestations_attested_by_fkey"
    FOREIGN KEY ("attested_by_user_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programme_occurrence_attestations"
    ADD CONSTRAINT "programme_occurrence_attestations_reversed_by_fkey"
    FOREIGN KEY ("reversed_by_user_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
