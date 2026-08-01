-- Phase 01 identity, access, organizational assignment, and audit foundation.
-- system_settings intentionally remains owned by the Phase 00 baseline migration.

CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'LOCKED', 'DISABLED');
CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(100) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_username_normalized_check"
        CHECK ("username" = lower(btrim("username")) AND "username" <> ''),
    CONSTRAINT "users_failed_login_count_check" CHECK ("failed_login_count" >= 0)
);

CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "staff_code" VARCHAR(50),
    "display_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "position_title" VARCHAR(150),
    "is_teaching_staff" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_profiles_staff_code_normalized_check"
        CHECK ("staff_code" IS NULL OR ("staff_code" = upper(btrim("staff_code")) AND "staff_code" <> ''))
);

CREATE TABLE "subject_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subject_groups_code_normalized_check"
        CHECK ("code" = upper(btrim("code")) AND "code" <> '')
);

CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subjects_code_normalized_check"
        CHECK ("code" = upper(btrim("code")) AND "code" <> '')
);

CREATE TABLE "subject_group_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "subject_group_id" UUID NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(3),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_group_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subject_group_memberships_validity_check"
        CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from")
);

CREATE TABLE "staff_subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(3),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_subjects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_subjects_validity_check"
        CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from")
);

CREATE TABLE "capability_definitions" (
    "key" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "allowed_scope_types" TEXT[] NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_definitions_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "capability_definitions_key_normalized_check"
        CHECK ("key" = upper(btrim("key")) AND "key" <> '')
);

CREATE TABLE "capability_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "capability_key" VARCHAR(100) NOT NULL,
    "scope_type" VARCHAR(50) NOT NULL,
    "scope_resource_id" UUID,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(3),
    "granted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_user_id" UUID,
    "revoke_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "capability_grants_validity_check"
        CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from"),
    CONSTRAINT "capability_grants_scope_type_normalized_check"
        CHECK ("scope_type" = upper(btrim("scope_type")) AND "scope_type" <> ''),
    CONSTRAINT "capability_grants_reserved_scope_resource_check"
        CHECK ("scope_resource_id" IS NULL OR "scope_resource_id" <> '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_sessions_expiry_check" CHECK ("expires_at" > "created_at")
);

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100),
    "request_id" VARCHAR(100),
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "additional_duty_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "additional_duty_definitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "additional_duty_definitions_code_normalized_check"
        CHECK ("code" = upper(btrim("code")) AND "code" <> ''),
    CONSTRAINT "additional_duty_definitions_validity_check"
        CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from")
);

CREATE TABLE "staff_additional_duty_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staff_profile_id" UUID NOT NULL,
    "duty_definition_id" UUID NOT NULL,
    "scope_type" VARCHAR(50) NOT NULL,
    "scope_resource_id" UUID,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(3),
    "note" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_additional_duty_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_duty_assignments_validity_check"
        CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from"),
    CONSTRAINT "staff_duty_assignments_scope_type_normalized_check"
        CHECK ("scope_type" = upper(btrim("scope_type")) AND "scope_type" <> ''),
    CONSTRAINT "staff_duty_assignments_reserved_scope_resource_check"
        CHECK ("scope_resource_id" IS NULL OR "scope_resource_id" <> '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE UNIQUE INDEX "staff_profiles_user_id_key" ON "staff_profiles"("user_id");
CREATE UNIQUE INDEX "staff_profiles_staff_code_key" ON "staff_profiles"("staff_code");
CREATE UNIQUE INDEX "subject_groups_code_key" ON "subject_groups"("code");
CREATE INDEX "subject_groups_status_code_idx" ON "subject_groups"("status", "code");
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");
CREATE INDEX "subjects_status_code_idx" ON "subjects"("status", "code");
CREATE INDEX "subject_group_memberships_user_validity_idx"
    ON "subject_group_memberships"("user_id", "valid_from", "valid_until");
CREATE INDEX "subject_group_memberships_group_validity_idx"
    ON "subject_group_memberships"("subject_group_id", "valid_from", "valid_until");
CREATE UNIQUE INDEX "subject_group_memberships_exact_key"
    ON "subject_group_memberships"("user_id", "subject_group_id", "valid_from", (COALESCE("valid_until", 'infinity'::timestamptz)));
CREATE INDEX "staff_subjects_user_validity_idx"
    ON "staff_subjects"("user_id", "valid_from", "valid_until");
CREATE INDEX "staff_subjects_subject_validity_idx"
    ON "staff_subjects"("subject_id", "valid_from", "valid_until");
CREATE UNIQUE INDEX "staff_subjects_exact_key"
    ON "staff_subjects"("user_id", "subject_id", "valid_from", (COALESCE("valid_until", 'infinity'::timestamptz)));
CREATE INDEX "capability_definitions_active_key_idx" ON "capability_definitions"("is_active", "key");
CREATE INDEX "capability_grants_user_capability_validity_idx"
    ON "capability_grants"("user_id", "capability_key", "revoked_at", "valid_from", "valid_until");
CREATE INDEX "capability_grants_scope_validity_idx"
    ON "capability_grants"("scope_type", "scope_resource_id", "valid_from", "valid_until");
CREATE UNIQUE INDEX "capability_grants_exact_key"
    ON "capability_grants"(
        "user_id", "capability_key", "scope_type",
        (COALESCE("scope_resource_id", '00000000-0000-0000-0000-000000000000'::uuid)),
        "valid_from", (COALESCE("valid_until", 'infinity'::timestamptz))
    );
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");
CREATE INDEX "auth_sessions_user_revoked_expiry_idx" ON "auth_sessions"("user_id", "revoked_at", "expires_at");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");
CREATE INDEX "audit_events_actor_created_at_idx" ON "audit_events"("actor_user_id", "created_at");
CREATE INDEX "audit_events_entity_created_at_idx" ON "audit_events"("entity_type", "entity_id", "created_at");
CREATE INDEX "audit_events_action_result_created_at_idx" ON "audit_events"("action", "result", "created_at");
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");
CREATE UNIQUE INDEX "additional_duty_definitions_code_key" ON "additional_duty_definitions"("code");
CREATE INDEX "additional_duty_definitions_active_validity_sort_idx"
    ON "additional_duty_definitions"("is_active", "valid_from", "valid_until", "sort_order");
CREATE INDEX "additional_duty_definitions_category_active_idx"
    ON "additional_duty_definitions"("category", "is_active");
CREATE INDEX "staff_duty_assignments_profile_validity_idx"
    ON "staff_additional_duty_assignments"("staff_profile_id", "valid_from", "valid_until");
CREATE INDEX "staff_duty_assignments_definition_validity_idx"
    ON "staff_additional_duty_assignments"("duty_definition_id", "valid_from", "valid_until");
CREATE INDEX "staff_duty_assignments_scope_validity_idx"
    ON "staff_additional_duty_assignments"("scope_type", "scope_resource_id", "valid_from", "valid_until");
CREATE UNIQUE INDEX "staff_duty_assignments_exact_key"
    ON "staff_additional_duty_assignments"(
        "staff_profile_id", "duty_definition_id", "scope_type",
        (COALESCE("scope_resource_id", '00000000-0000-0000-0000-000000000000'::uuid)),
        "valid_from", (COALESCE("valid_until", 'infinity'::timestamptz))
    );

ALTER TABLE "subject_group_memberships"
    ADD CONSTRAINT "subject_group_memberships_no_overlap"
    EXCLUDE USING gist (
        "user_id" WITH =,
        "subject_group_id" WITH =,
        tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
    );

ALTER TABLE "staff_subjects"
    ADD CONSTRAINT "staff_subjects_no_overlap"
    EXCLUDE USING gist (
        "user_id" WITH =,
        "subject_id" WITH =,
        tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
    );

ALTER TABLE "capability_grants"
    ADD CONSTRAINT "capability_grants_no_active_overlap"
    EXCLUDE USING gist (
        "user_id" WITH =,
        "capability_key" WITH =,
        "scope_type" WITH =,
        (COALESCE("scope_resource_id", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
    ) WHERE ("revoked_at" IS NULL);

ALTER TABLE "staff_additional_duty_assignments"
    ADD CONSTRAINT "staff_duty_assignments_no_overlap"
    EXCLUDE USING gist (
        "staff_profile_id" WITH =,
        "duty_definition_id" WITH =,
        "scope_type" WITH =,
        (COALESCE("scope_resource_id", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
    );

ALTER TABLE "staff_profiles"
    ADD CONSTRAINT "staff_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subject_group_memberships"
    ADD CONSTRAINT "subject_group_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subject_group_memberships"
    ADD CONSTRAINT "subject_group_memberships_subject_group_id_fkey"
    FOREIGN KEY ("subject_group_id") REFERENCES "subject_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_subjects"
    ADD CONSTRAINT "staff_subjects_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_subjects"
    ADD CONSTRAINT "staff_subjects_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "capability_grants"
    ADD CONSTRAINT "capability_grants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "capability_grants"
    ADD CONSTRAINT "capability_grants_capability_key_fkey"
    FOREIGN KEY ("capability_key") REFERENCES "capability_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "capability_grants"
    ADD CONSTRAINT "capability_grants_granted_by_user_id_fkey"
    FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "capability_grants"
    ADD CONSTRAINT "capability_grants_revoked_by_user_id_fkey"
    FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "auth_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events"
    ADD CONSTRAINT "audit_events_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "staff_additional_duty_assignments"
    ADD CONSTRAINT "staff_duty_assignments_staff_profile_id_fkey"
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_additional_duty_assignments"
    ADD CONSTRAINT "staff_duty_assignments_duty_definition_id_fkey"
    FOREIGN KEY ("duty_definition_id") REFERENCES "additional_duty_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_additional_duty_assignments"
    ADD CONSTRAINT "staff_duty_assignments_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
