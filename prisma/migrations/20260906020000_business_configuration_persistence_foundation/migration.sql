-- P1-021: retained, fail-closed Business Configuration persistence foundation.
CREATE TYPE "BusinessConfigurationResourceKind" AS ENUM ('SCHOOL_WIDE', 'ACADEMIC_YEAR');
CREATE TYPE "BusinessPolicyVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REVERSED');

CREATE TABLE "business_policy_streams" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "family_key" VARCHAR(100) NOT NULL,
  "resource_kind" "BusinessConfigurationResourceKind" NOT NULL,
  "academic_year_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_policy_streams_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_policy_streams_resource_shape_check" CHECK (
    ("resource_kind" = 'SCHOOL_WIDE' AND "academic_year_id" IS NULL)
    OR ("resource_kind" = 'ACADEMIC_YEAR' AND "academic_year_id" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "business_policy_streams_school_wide_family_key" ON "business_policy_streams" ("family_key") WHERE "resource_kind" = 'SCHOOL_WIDE';
CREATE UNIQUE INDEX "business_policy_streams_academic_year_family_key" ON "business_policy_streams" ("family_key", "academic_year_id") WHERE "resource_kind" = 'ACADEMIC_YEAR';
ALTER TABLE "business_policy_streams" ADD CONSTRAINT "business_policy_streams_academic_year_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "business_policy_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "stream_id" UUID NOT NULL, "version_number" INTEGER NOT NULL,
  "status" "BusinessPolicyVersionStatus" NOT NULL DEFAULT 'DRAFT', "payload" JSONB NOT NULL,
  "validator_version" VARCHAR(100) NOT NULL, "effective_from" DATE NOT NULL, "effective_until" DATE,
  "draft_revision" INTEGER NOT NULL DEFAULT 1, "created_by_user_id" UUID NOT NULL,
  "published_by_user_id" UUID, "published_at" TIMESTAMPTZ(3), "replaces_version_id" UUID,
  "corrects_version_id" UUID, "reversed_by_user_id" UUID, "reversed_at" TIMESTAMPTZ(3), "correction_reason" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_policy_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_policy_versions_interval_check" CHECK ("effective_until" IS NULL OR "effective_until" >= "effective_from"),
  CONSTRAINT "business_policy_versions_positive_number_check" CHECK ("version_number" > 0 AND "draft_revision" > 0),
  CONSTRAINT "business_policy_versions_no_self_lineage_check" CHECK (("replaces_version_id" IS NULL OR "replaces_version_id" <> "id") AND ("corrects_version_id" IS NULL OR "corrects_version_id" <> "id")),
  CONSTRAINT "business_policy_versions_lifecycle_evidence_check" CHECK (
    ("status" = 'DRAFT' AND "published_by_user_id" IS NULL AND "published_at" IS NULL AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL AND "correction_reason" IS NULL)
    OR ("status" = 'PUBLISHED' AND "published_by_user_id" IS NOT NULL AND "published_at" IS NOT NULL AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL AND "correction_reason" IS NULL)
    OR ("status" = 'REVERSED' AND "published_by_user_id" IS NOT NULL AND "published_at" IS NOT NULL AND "reversed_by_user_id" IS NOT NULL AND "reversed_at" IS NOT NULL AND "correction_reason" IS NOT NULL AND btrim("correction_reason") <> '')
  ),
  CONSTRAINT "business_policy_versions_stream_number_key" UNIQUE ("stream_id", "version_number")
);
ALTER TABLE "business_policy_versions" ADD CONSTRAINT "business_policy_versions_stream_fkey" FOREIGN KEY ("stream_id") REFERENCES "business_policy_streams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_policy_versions" ADD CONSTRAINT "business_policy_versions_created_by_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_policy_versions" ADD CONSTRAINT "business_policy_versions_published_by_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_policy_versions" ADD CONSTRAINT "business_policy_versions_reversed_by_fkey" FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_policy_versions" ADD CONSTRAINT "business_policy_versions_replaces_fkey" FOREIGN KEY ("replaces_version_id") REFERENCES "business_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_policy_versions" ADD CONSTRAINT "business_policy_versions_corrects_fkey" FOREIGN KEY ("corrects_version_id") REFERENCES "business_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_policy_versions" ADD CONSTRAINT "business_policy_versions_no_published_overlap" EXCLUDE USING gist ("stream_id" WITH =, daterange("effective_from", "effective_until", '[]') WITH &&) WHERE ("status" = 'PUBLISHED');

CREATE FUNCTION business_policy_versions_validate_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ancestor_stream UUID;
BEGIN
  IF NEW.replaces_version_id IS NOT NULL THEN SELECT stream_id INTO ancestor_stream FROM business_policy_versions WHERE id = NEW.replaces_version_id; IF ancestor_stream IS NULL OR ancestor_stream <> NEW.stream_id THEN RAISE EXCEPTION 'business policy replacement must remain in its stream'; END IF; END IF;
  IF NEW.corrects_version_id IS NOT NULL THEN SELECT stream_id INTO ancestor_stream FROM business_policy_versions WHERE id = NEW.corrects_version_id; IF ancestor_stream IS NULL OR ancestor_stream <> NEW.stream_id THEN RAISE EXCEPTION 'business policy correction must remain in its stream'; END IF; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_policy_versions_lineage_guard BEFORE INSERT OR UPDATE ON business_policy_versions FOR EACH ROW EXECUTE FUNCTION business_policy_versions_validate_lineage();
CREATE FUNCTION business_policy_versions_immutable_published() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'REVERSED' THEN
    RAISE EXCEPTION 'reversed business policy versions are immutable';
  END IF;
  IF OLD.status = 'PUBLISHED' THEN
    IF NEW.status = 'DRAFT' THEN
      RAISE EXCEPTION 'cannot revert published business policy to draft';
    END IF;
    IF NEW.stream_id IS DISTINCT FROM OLD.stream_id
       OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.validator_version IS DISTINCT FROM OLD.validator_version
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.replaces_version_id IS DISTINCT FROM OLD.replaces_version_id
       OR NEW.corrects_version_id IS DISTINCT FROM OLD.corrects_version_id
    THEN
      RAISE EXCEPTION 'published business policy semantics are immutable';
    END IF;
    IF NEW.status = 'PUBLISHED' AND OLD.effective_until IS NOT NULL AND NEW.effective_until IS DISTINCT FROM OLD.effective_until THEN
      RAISE EXCEPTION 'closed published business policy effective_until cannot be modified';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_policy_versions_immutable_guard BEFORE UPDATE ON business_policy_versions FOR EACH ROW EXECUTE FUNCTION business_policy_versions_immutable_published();

CREATE TABLE "business_policy_commands" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "actor_user_id" UUID NOT NULL, "command_id" VARCHAR(100) NOT NULL,
  "fingerprint" VARCHAR(128) NOT NULL, "result" JSONB NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_policy_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_policy_commands_shape_check" CHECK (btrim("command_id") <> '' AND length("fingerprint") >= 32),
  CONSTRAINT "business_policy_commands_actor_command_key" UNIQUE ("actor_user_id", "command_id")
);
ALTER TABLE "business_policy_commands" ADD CONSTRAINT "business_policy_commands_actor_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
