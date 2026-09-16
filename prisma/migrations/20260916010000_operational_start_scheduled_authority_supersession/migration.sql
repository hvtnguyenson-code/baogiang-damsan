-- P1-031A: OPERATIONAL_START continuity and never-effective scheduled-authority supersession.
-- The enum value used below is established by the preceding ordered migration.

ALTER TABLE "business_policy_versions"
  ADD COLUMN "supersedes_scheduled_version_id" UUID,
  ADD COLUMN "superseded_before_effective_by_user_id" UUID,
  ADD COLUMN "superseded_before_effective_at" TIMESTAMPTZ(3),
  ADD COLUMN "superseded_before_effective_reason" TEXT;

ALTER TABLE "business_policy_versions"
  ADD CONSTRAINT "business_policy_versions_supersedes_scheduled_fkey"
    FOREIGN KEY ("supersedes_scheduled_version_id") REFERENCES "business_policy_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "business_policy_versions_superseded_by_fkey"
    FOREIGN KEY ("superseded_before_effective_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "business_policy_versions_supersedes_scheduled_idx"
  ON "business_policy_versions" ("supersedes_scheduled_version_id");
CREATE UNIQUE INDEX "business_policy_versions_one_scheduled_child_key"
  ON "business_policy_versions" ("supersedes_scheduled_version_id")
  WHERE "supersedes_scheduled_version_id" IS NOT NULL;

ALTER TABLE "business_policy_versions"
  DROP CONSTRAINT "business_policy_versions_no_self_lineage_check",
  DROP CONSTRAINT "business_policy_versions_lifecycle_evidence_check";

ALTER TABLE "business_policy_versions"
  ADD CONSTRAINT "business_policy_versions_no_self_lineage_check" CHECK (
    ("replaces_version_id" IS NULL OR "replaces_version_id" <> "id")
    AND ("corrects_version_id" IS NULL OR "corrects_version_id" <> "id")
    AND ("supersedes_scheduled_version_id" IS NULL OR "supersedes_scheduled_version_id" <> "id")
  ),
  ADD CONSTRAINT "business_policy_versions_successor_lineage_shape_check" CHECK (
    num_nonnulls("replaces_version_id", "corrects_version_id", "supersedes_scheduled_version_id") <= 1
    AND (
      "supersedes_scheduled_version_id" IS NULL
      OR "status" IN ('PUBLISHED', 'SUPERSEDED_BEFORE_EFFECTIVE')
    )
  ),
  ADD CONSTRAINT "business_policy_versions_scheduled_reason_check" CHECK (
    "superseded_before_effective_reason" IS NULL
    OR (
      length("superseded_before_effective_reason") BETWEEN 1 AND 1000
      AND btrim("superseded_before_effective_reason") = "superseded_before_effective_reason"
    )
  ),
  ADD CONSTRAINT "business_policy_versions_lifecycle_evidence_check" CHECK (
    (
      "status" = 'DRAFT'
      AND "published_by_user_id" IS NULL AND "published_at" IS NULL
      AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL AND "correction_reason" IS NULL
      AND "superseded_before_effective_by_user_id" IS NULL
      AND "superseded_before_effective_at" IS NULL
      AND "superseded_before_effective_reason" IS NULL
    )
    OR (
      "status" = 'PUBLISHED'
      AND "published_by_user_id" IS NOT NULL AND "published_at" IS NOT NULL
      AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL AND "correction_reason" IS NULL
      AND "superseded_before_effective_by_user_id" IS NULL
      AND "superseded_before_effective_at" IS NULL
      AND "superseded_before_effective_reason" IS NULL
    )
    OR (
      "status" = 'REVERSED'
      AND "published_by_user_id" IS NOT NULL AND "published_at" IS NOT NULL
      AND "reversed_by_user_id" IS NOT NULL AND "reversed_at" IS NOT NULL
      AND "correction_reason" IS NOT NULL AND btrim("correction_reason") <> ''
      AND "superseded_before_effective_by_user_id" IS NULL
      AND "superseded_before_effective_at" IS NULL
      AND "superseded_before_effective_reason" IS NULL
    )
    OR (
      "status" = 'SUPERSEDED_BEFORE_EFFECTIVE'
      AND "published_by_user_id" IS NOT NULL AND "published_at" IS NOT NULL
      AND "reversed_by_user_id" IS NULL AND "reversed_at" IS NULL AND "correction_reason" IS NULL
      AND "superseded_before_effective_by_user_id" IS NOT NULL
      AND "superseded_before_effective_at" IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION business_policy_versions_validate_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ancestor_stream UUID;
BEGIN
  IF NEW.replaces_version_id IS NOT NULL THEN
    SELECT stream_id INTO ancestor_stream FROM business_policy_versions WHERE id = NEW.replaces_version_id;
    IF ancestor_stream IS NULL OR ancestor_stream <> NEW.stream_id THEN
      RAISE EXCEPTION 'business policy replacement must remain in its stream';
    END IF;
  END IF;
  IF NEW.corrects_version_id IS NOT NULL THEN
    SELECT stream_id INTO ancestor_stream FROM business_policy_versions WHERE id = NEW.corrects_version_id;
    IF ancestor_stream IS NULL OR ancestor_stream <> NEW.stream_id THEN
      RAISE EXCEPTION 'business policy correction must remain in its stream';
    END IF;
  END IF;
  IF NEW.supersedes_scheduled_version_id IS NOT NULL THEN
    SELECT stream_id INTO ancestor_stream FROM business_policy_versions WHERE id = NEW.supersedes_scheduled_version_id;
    IF ancestor_stream IS NULL OR ancestor_stream <> NEW.stream_id THEN
      RAISE EXCEPTION 'business policy scheduled supersession must remain in its stream';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION business_policy_versions_validate_scheduled_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  stream_family TEXT;
  ancestor business_policy_versions%ROWTYPE;
BEGIN
  SELECT family_key INTO stream_family FROM business_policy_streams WHERE id = NEW.stream_id;
  IF stream_family IS NULL THEN
    RAISE EXCEPTION 'business policy version stream is missing';
  END IF;

  IF stream_family <> 'OPERATIONAL_START' AND (
    NEW.status = 'SUPERSEDED_BEFORE_EFFECTIVE'
    OR NEW.supersedes_scheduled_version_id IS NOT NULL
    OR NEW.superseded_before_effective_by_user_id IS NOT NULL
    OR NEW.superseded_before_effective_at IS NOT NULL
    OR NEW.superseded_before_effective_reason IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'scheduled authority lifecycle is restricted to OPERATIONAL_START';
  END IF;

  IF NEW.supersedes_scheduled_version_id IS NOT NULL THEN
    SELECT * INTO ancestor FROM business_policy_versions WHERE id = NEW.supersedes_scheduled_version_id;
    IF ancestor.id IS NULL
       OR ancestor.stream_id <> NEW.stream_id
       OR ancestor.status <> 'SUPERSEDED_BEFORE_EFFECTIVE'
       OR ancestor.effective_from <> NEW.effective_from
       OR ancestor.effective_until IS NOT NULL
       OR NEW.effective_until IS NOT NULL
       OR NEW.status NOT IN ('PUBLISHED', 'SUPERSEDED_BEFORE_EFFECTIVE')
    THEN
      RAISE EXCEPTION 'invalid scheduled authority lineage pair';
    END IF;
  END IF;

  -- A newly published initial OPERATIONAL_START authority is always open-ended.
  IF stream_family = 'OPERATIONAL_START'
     AND NEW.status = 'PUBLISHED'
     AND NEW.replaces_version_id IS NULL
     AND NEW.corrects_version_id IS NULL
     AND NEW.supersedes_scheduled_version_id IS NULL
     AND NEW.effective_until IS NOT NULL
  THEN
    IF TG_OP = 'INSERT' OR OLD.status <> 'PUBLISHED' THEN
      RAISE EXCEPTION 'initial OPERATIONAL_START authority must be open-ended';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER business_policy_versions_scheduled_scope_guard
  BEFORE INSERT OR UPDATE ON business_policy_versions
  FOR EACH ROW EXECUTE FUNCTION business_policy_versions_validate_scheduled_scope();

CREATE FUNCTION business_policy_versions_validate_scheduled_chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM business_policy_versions source
    JOIN business_policy_streams stream ON stream.id = source.stream_id
    LEFT JOIN business_policy_versions child
      ON child.supersedes_scheduled_version_id = source.id
    WHERE source.status = 'SUPERSEDED_BEFORE_EFFECTIVE'
      AND stream.family_key = 'OPERATIONAL_START'
    GROUP BY source.id
    HAVING count(child.id) <> 1
  ) THEN
    RAISE EXCEPTION 'terminal scheduled authority must have exactly one successor';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM business_policy_versions child
    JOIN business_policy_versions source ON source.id = child.supersedes_scheduled_version_id
    WHERE child.supersedes_scheduled_version_id IS NOT NULL
      AND (
        child.stream_id <> source.stream_id
        OR child.effective_from <> source.effective_from
        OR child.effective_until IS NOT NULL
        OR source.effective_until IS NOT NULL
        OR source.status <> 'SUPERSEDED_BEFORE_EFFECTIVE'
        OR child.status NOT IN ('PUBLISHED', 'SUPERSEDED_BEFORE_EFFECTIVE')
      )
  ) THEN
    RAISE EXCEPTION 'scheduled authority chain is invalid';
  END IF;

  IF EXISTS (
    WITH RECURSIVE lineage AS (
      SELECT v.id AS start_id,
             v.supersedes_scheduled_version_id AS next_id,
             ARRAY[v.id]::UUID[] AS path,
             FALSE AS cycle
      FROM business_policy_versions v
      WHERE v.supersedes_scheduled_version_id IS NOT NULL
      UNION ALL
      SELECT lineage.start_id,
             ancestor.supersedes_scheduled_version_id,
             lineage.path || ancestor.id,
             ancestor.id = ANY(lineage.path)
      FROM lineage
      JOIN business_policy_versions ancestor ON ancestor.id = lineage.next_id
      WHERE lineage.next_id IS NOT NULL AND NOT lineage.cycle
    )
    SELECT 1 FROM lineage WHERE cycle
  ) THEN
    RAISE EXCEPTION 'scheduled authority lineage cycle is forbidden';
  END IF;

  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER business_policy_versions_scheduled_chain_guard
  AFTER INSERT OR UPDATE OR DELETE ON business_policy_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION business_policy_versions_validate_scheduled_chain();

CREATE OR REPLACE FUNCTION business_policy_versions_immutable_published() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'REVERSED' THEN
    RAISE EXCEPTION 'reversed business policy versions are immutable';
  END IF;
  IF OLD.status = 'SUPERSEDED_BEFORE_EFFECTIVE' THEN
    RAISE EXCEPTION 'superseded-before-effective business policy versions are immutable';
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
       OR NEW.supersedes_scheduled_version_id IS DISTINCT FROM OLD.supersedes_scheduled_version_id
    THEN
      RAISE EXCEPTION 'published business policy semantics are immutable';
    END IF;
    IF NEW.status = 'PUBLISHED' AND OLD.effective_until IS NOT NULL
       AND NEW.effective_until IS DISTINCT FROM OLD.effective_until THEN
      RAISE EXCEPTION 'closed published business policy effective_until cannot be modified';
    END IF;
    IF NEW.status = 'REVERSED' AND NEW.effective_until IS DISTINCT FROM OLD.effective_until THEN
      RAISE EXCEPTION 'reversing published business policy cannot modify effective_until';
    END IF;
    IF NEW.status = 'SUPERSEDED_BEFORE_EFFECTIVE' AND (
      NEW.effective_until IS DISTINCT FROM OLD.effective_until
      OR NEW.reversed_by_user_id IS DISTINCT FROM OLD.reversed_by_user_id
      OR NEW.reversed_at IS DISTINCT FROM OLD.reversed_at
      OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason
      OR NEW.superseded_before_effective_by_user_id IS NULL
      OR NEW.superseded_before_effective_at IS NULL
    ) THEN
      RAISE EXCEPTION 'invalid scheduled authority terminal transition';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- The existing GiST exclusion remains unchanged and continues to cover only PUBLISHED authority.
