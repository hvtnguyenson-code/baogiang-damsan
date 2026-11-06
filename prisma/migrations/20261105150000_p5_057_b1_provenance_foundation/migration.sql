-- AlterTable
ALTER TABLE "capability_grants" ADD COLUMN     "coordinate_id" UUID;

-- CreateTable
CREATE TABLE "authorization_states" (
    "id" VARCHAR(100) NOT NULL,
    "epoch" BIGINT NOT NULL DEFAULT 0,
    "last_mutation_at" TIMESTAMPTZ(3),

    CONSTRAINT "authorization_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_commands" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "peer_user_id" UUID,
    "command_type" VARCHAR(50) NOT NULL,
    "request_key" VARCHAR(200) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_coordinates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "capability_key" VARCHAR(100) NOT NULL,
    "scope_type" VARCHAR(50) NOT NULL,
    "scope_resource_id" UUID,
    "version" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "access_coordinates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authority_seats" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "policy_version" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "authority_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_appointments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seat_id" UUID,
    "template_key" VARCHAR(100) NOT NULL,
    "template_version" VARCHAR(100) NOT NULL,
    "template_snapshot" JSONB NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "version" BIGINT NOT NULL DEFAULT 0,
    "created_command_id" UUID NOT NULL,

    CONSTRAINT "role_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_sources" (
    "id" UUID NOT NULL,
    "coordinate_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "appointment_id" UUID,
    "legacy_grant_id" UUID,
    "created_command_id" UUID NOT NULL,
    "supersedes_source_id" UUID,

    CONSTRAINT "grant_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_source_revisions" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "coordinate_id" UUID NOT NULL,
    "revision" BIGINT NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3),
    "disposition" VARCHAR(20) NOT NULL,
    "command_id" UUID NOT NULL,

    CONSTRAINT "grant_source_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_projection_revisions" (
    "id" UUID NOT NULL,
    "coordinate_id" UUID NOT NULL,
    "version" BIGINT NOT NULL,
    "command_id" UUID NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "grant_projection_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_projection_slices" (
    "id" UUID NOT NULL,
    "projection_revision_id" UUID NOT NULL,
    "coordinate_id" UUID NOT NULL,
    "grant_id" UUID NOT NULL,
    "valid_from_snapshot" TIMESTAMPTZ(3) NOT NULL,
    "valid_until_snapshot" TIMESTAMPTZ(3),

    CONSTRAINT "grant_projection_slices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_supports" (
    "slice_id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "coordinate_id" UUID NOT NULL,
    "covered_from" TIMESTAMPTZ(3) NOT NULL,
    "covered_until" TIMESTAMPTZ(3),

    CONSTRAINT "grant_supports_pkey" PRIMARY KEY ("slice_id","source_revision_id")
);

-- CreateIndex
CREATE INDEX "access_commands_target_user_id_idx" ON "access_commands"("target_user_id");

-- CreateIndex
CREATE INDEX "access_commands_peer_user_id_idx" ON "access_commands"("peer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_commands_actor_type_request_key" ON "access_commands"("actor_user_id", "command_type", "request_key");

-- CreateIndex
CREATE INDEX "access_coordinates_user_id_capability_key_idx" ON "access_coordinates"("user_id", "capability_key");

-- CreateIndex
CREATE INDEX "access_coordinates_capability_key_idx" ON "access_coordinates"("capability_key");

-- CreateIndex
CREATE UNIQUE INDEX "access_coordinates_id_user_key" ON "access_coordinates"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_coordinates_grant_identity_key" ON "access_coordinates"("id", "user_id", "capability_key", "scope_type");

-- CreateIndex
CREATE UNIQUE INDEX "access_coordinates_id_resource_key" ON "access_coordinates"("id", "scope_resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "authority_seats_key_key" ON "authority_seats"("key");

-- CreateIndex
CREATE INDEX "role_appointments_user_id_valid_from_valid_until_idx" ON "role_appointments"("user_id", "valid_from", "valid_until");

-- CreateIndex
CREATE INDEX "role_appointments_created_command_id_idx" ON "role_appointments"("created_command_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_appointments_id_user_key" ON "role_appointments"("id", "user_id");

-- CreateIndex
CREATE INDEX "grant_sources_user_id_idx" ON "grant_sources"("user_id");

-- CreateIndex
CREATE INDEX "grant_sources_appointment_id_idx" ON "grant_sources"("appointment_id");

-- CreateIndex
CREATE INDEX "grant_sources_legacy_grant_id_idx" ON "grant_sources"("legacy_grant_id");

-- CreateIndex
CREATE INDEX "grant_sources_created_command_id_idx" ON "grant_sources"("created_command_id");

-- CreateIndex
CREATE INDEX "grant_sources_coordinate_id_idx" ON "grant_sources"("coordinate_id");

-- CreateIndex
CREATE INDEX "grant_sources_supersedes_source_id_idx" ON "grant_sources"("supersedes_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "grant_sources_id_coordinate_key" ON "grant_sources"("id", "coordinate_id");

-- CreateIndex
CREATE INDEX "grant_source_revisions_command_id_idx" ON "grant_source_revisions"("command_id");

-- CreateIndex
CREATE UNIQUE INDEX "grant_source_revisions_source_revision_key" ON "grant_source_revisions"("source_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "grant_source_revisions_id_coordinate_key" ON "grant_source_revisions"("id", "coordinate_id");

-- CreateIndex
CREATE INDEX "grant_projection_revisions_command_id_idx" ON "grant_projection_revisions"("command_id");

-- CreateIndex
CREATE UNIQUE INDEX "grant_projection_revisions_coordinate_version_key" ON "grant_projection_revisions"("coordinate_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "grant_projection_revisions_id_coordinate_key" ON "grant_projection_revisions"("id", "coordinate_id");

-- CreateIndex
CREATE INDEX "grant_projection_slices_grant_id_idx" ON "grant_projection_slices"("grant_id");

-- CreateIndex
CREATE UNIQUE INDEX "grant_projection_slices_revision_grant_key" ON "grant_projection_slices"("projection_revision_id", "grant_id");

-- CreateIndex
CREATE UNIQUE INDEX "grant_projection_slices_id_coordinate_key" ON "grant_projection_slices"("id", "coordinate_id");

-- CreateIndex
CREATE INDEX "grant_supports_source_revision_id_idx" ON "grant_supports"("source_revision_id");

-- CreateIndex
CREATE INDEX "capability_grants_coordinate_id_idx" ON "capability_grants"("coordinate_id");

-- CreateIndex
CREATE UNIQUE INDEX "capability_grants_id_coordinate_key" ON "capability_grants"("id", "coordinate_id");

-- AddForeignKey
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_coordinate_fkey" FOREIGN KEY ("coordinate_id", "user_id", "capability_key", "scope_type") REFERENCES "access_coordinates"("id", "user_id", "capability_key", "scope_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_coordinate_resource_fkey" FOREIGN KEY ("coordinate_id", "scope_resource_id") REFERENCES "access_coordinates"("id", "scope_resource_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "access_commands" ADD CONSTRAINT "access_commands_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "access_commands" ADD CONSTRAINT "access_commands_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "access_commands" ADD CONSTRAINT "access_commands_peer_user_id_fkey" FOREIGN KEY ("peer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "access_coordinates" ADD CONSTRAINT "access_coordinates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "access_coordinates" ADD CONSTRAINT "access_coordinates_capability_key_fkey" FOREIGN KEY ("capability_key") REFERENCES "capability_definitions"("key") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_appointments" ADD CONSTRAINT "role_appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_appointments" ADD CONSTRAINT "role_appointments_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "authority_seats"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_appointments" ADD CONSTRAINT "role_appointments_created_command_id_fkey" FOREIGN KEY ("created_command_id") REFERENCES "access_commands"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_sources" ADD CONSTRAINT "grant_sources_coordinate_id_user_id_fkey" FOREIGN KEY ("coordinate_id", "user_id") REFERENCES "access_coordinates"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_sources" ADD CONSTRAINT "grant_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_sources" ADD CONSTRAINT "grant_sources_appointment_id_user_id_fkey" FOREIGN KEY ("appointment_id", "user_id") REFERENCES "role_appointments"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_sources" ADD CONSTRAINT "grant_sources_legacy_grant_id_coordinate_id_fkey" FOREIGN KEY ("legacy_grant_id", "coordinate_id") REFERENCES "capability_grants"("id", "coordinate_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_sources" ADD CONSTRAINT "grant_sources_created_command_id_fkey" FOREIGN KEY ("created_command_id") REFERENCES "access_commands"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_sources" ADD CONSTRAINT "grant_sources_supersedes_source_id_coordinate_id_fkey" FOREIGN KEY ("supersedes_source_id", "coordinate_id") REFERENCES "grant_sources"("id", "coordinate_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_source_revisions" ADD CONSTRAINT "grant_source_revisions_source_id_coordinate_id_fkey" FOREIGN KEY ("source_id", "coordinate_id") REFERENCES "grant_sources"("id", "coordinate_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_source_revisions" ADD CONSTRAINT "grant_source_revisions_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "access_commands"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_projection_revisions" ADD CONSTRAINT "grant_projection_revisions_coordinate_id_fkey" FOREIGN KEY ("coordinate_id") REFERENCES "access_coordinates"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_projection_revisions" ADD CONSTRAINT "grant_projection_revisions_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "access_commands"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_projection_slices" ADD CONSTRAINT "grant_projection_slices_projection_revision_id_coordinate__fkey" FOREIGN KEY ("projection_revision_id", "coordinate_id") REFERENCES "grant_projection_revisions"("id", "coordinate_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_projection_slices" ADD CONSTRAINT "grant_projection_slices_grant_id_coordinate_id_fkey" FOREIGN KEY ("grant_id", "coordinate_id") REFERENCES "capability_grants"("id", "coordinate_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_supports" ADD CONSTRAINT "grant_supports_slice_id_coordinate_id_fkey" FOREIGN KEY ("slice_id", "coordinate_id") REFERENCES "grant_projection_slices"("id", "coordinate_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grant_supports" ADD CONSTRAINT "grant_supports_source_revision_id_coordinate_id_fkey" FOREIGN KEY ("source_revision_id", "coordinate_id") REFERENCES "grant_source_revisions"("id", "coordinate_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- B1 is inert: no INSERT, backfill, catalogue change or projection writer.
-- Keep BOTH existing capability_grants_exact_key and no_active_overlap unchanged.
CREATE UNIQUE INDEX capability_grants_live_exact_key ON capability_grants (
  user_id, capability_key, scope_type,
  (COALESCE(scope_resource_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  valid_from, (COALESCE(valid_until, 'infinity'::timestamptz))
) WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX access_coordinates_identity ON access_coordinates (
  user_id, capability_key, scope_type,
  (COALESCE(scope_resource_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

ALTER TABLE access_coordinates ADD CONSTRAINT access_coordinates_shape_check CHECK (
  version >= 0 AND capability_key = upper(btrim(capability_key)) AND capability_key <> '' AND (
    (scope_type IN ('PERSONAL','SCHOOL_WIDE') AND scope_resource_id IS NULL) OR
    (scope_type IN ('SUBJECT','SUBJECT_GROUP','ACTIVITY') AND scope_resource_id IS NOT NULL
      AND scope_resource_id <> '00000000-0000-0000-0000-000000000000'::uuid)
  )
);
-- Nullable coordinate_id leaves all legacy rows and old writers untouched.
-- The identity + resource composite FKs together prevent MATCH SIMPLE NULL bypass.
ALTER TABLE capability_grants ADD CONSTRAINT capability_grants_managed_shape_check CHECK (
  coordinate_id IS NULL OR (
    (scope_type IN ('PERSONAL','SCHOOL_WIDE') AND scope_resource_id IS NULL) OR
    (scope_type IN ('SUBJECT','SUBJECT_GROUP','ACTIVITY') AND scope_resource_id IS NOT NULL)
  )
);
ALTER TABLE authorization_states ADD CONSTRAINT authorization_states_shape_check CHECK (
  btrim(id) <> '' AND id = btrim(id) AND epoch >= 0 AND (last_mutation_at IS NULL OR isfinite(last_mutation_at))
);
ALTER TABLE access_commands ADD CONSTRAINT access_commands_shape_check CHECK (
  btrim(command_type) <> '' AND command_type = btrim(command_type)
  AND btrim(request_key) <> '' AND request_key = btrim(request_key)
  AND fingerprint ~ '^[0-9a-f]{64}$' AND isfinite(effective_at) AND isfinite(created_at)
  AND jsonb_typeof(result) = 'object'
);
ALTER TABLE authority_seats ADD CONSTRAINT authority_seats_shape_check CHECK (
  btrim(key) <> '' AND key = btrim(key) AND policy_version > 0
);
ALTER TABLE role_appointments ADD CONSTRAINT role_appointments_shape_check CHECK (
  version >= 0 AND btrim(template_key) <> '' AND template_key = btrim(template_key)
  AND btrim(template_version) <> '' AND template_version = btrim(template_version)
  AND jsonb_typeof(template_snapshot) = 'object' AND isfinite(valid_from)
  AND (valid_until IS NULL OR (isfinite(valid_until) AND valid_until > valid_from))
  AND (cancelled_at IS NULL OR (isfinite(cancelled_at) AND cancelled_at <= valid_from))
);
ALTER TABLE role_appointments ADD CONSTRAINT role_appointments_seat_no_overlap
EXCLUDE USING gist (
  seat_id WITH =,
  tstzrange(valid_from, COALESCE(valid_until, 'infinity'::timestamptz), '[)') WITH &&
) WHERE (seat_id IS NOT NULL AND cancelled_at IS NULL);

ALTER TABLE grant_sources ADD CONSTRAINT grant_sources_shape_check CHECK (
  kind IN ('ROLE_TEMPLATE','ACADEMIC_DIRECT','PROFESSIONAL_BASELINE','TECHNICAL_DIRECT','LEGACY_UNCLASSIFIED')
  AND ((kind = 'ROLE_TEMPLATE' AND appointment_id IS NOT NULL AND legacy_grant_id IS NULL)
    OR (kind <> 'ROLE_TEMPLATE' AND appointment_id IS NULL))
  AND (kind <> 'LEGACY_UNCLASSIFIED' OR legacy_grant_id IS NOT NULL)
  AND (supersedes_source_id IS NULL OR supersedes_source_id <> id)
);
ALTER TABLE grant_source_revisions ADD CONSTRAINT grant_source_revisions_shape_check CHECK (
  revision > 0 AND disposition IN ('ACCEPTED','ENDED','CANCELLED') AND isfinite(valid_from)
  AND (valid_until IS NULL OR (isfinite(valid_until) AND valid_until > valid_from))
  AND (disposition <> 'ENDED' OR valid_until IS NOT NULL)
);
ALTER TABLE grant_projection_revisions ADD CONSTRAINT grant_projection_revisions_shape_check CHECK (
  version > 0 AND isfinite(effective_at)
);
ALTER TABLE grant_projection_slices ADD CONSTRAINT grant_projection_slices_shape_check CHECK (
  isfinite(valid_from_snapshot) AND (valid_until_snapshot IS NULL OR
    (isfinite(valid_until_snapshot) AND valid_until_snapshot > valid_from_snapshot))
);
ALTER TABLE grant_supports ADD CONSTRAINT grant_supports_shape_check CHECK (
  isfinite(covered_from) AND (covered_until IS NULL OR
    (isfinite(covered_until) AND covered_until > covered_from))
);

-- Only NEW retained evidence tables are append-only. No existing table trigger is changed.
CREATE FUNCTION p5_057_reject_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Retained access evidence is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER access_commands_retained BEFORE UPDATE OR DELETE ON access_commands
FOR EACH ROW EXECUTE FUNCTION p5_057_reject_evidence_mutation();
CREATE TRIGGER grant_sources_retained BEFORE UPDATE OR DELETE ON grant_sources
FOR EACH ROW EXECUTE FUNCTION p5_057_reject_evidence_mutation();
CREATE TRIGGER grant_source_revisions_retained BEFORE UPDATE OR DELETE ON grant_source_revisions
FOR EACH ROW EXECUTE FUNCTION p5_057_reject_evidence_mutation();
CREATE TRIGGER grant_projection_revisions_retained BEFORE UPDATE OR DELETE ON grant_projection_revisions
FOR EACH ROW EXECUTE FUNCTION p5_057_reject_evidence_mutation();
CREATE TRIGGER grant_projection_slices_retained BEFORE UPDATE OR DELETE ON grant_projection_slices
FOR EACH ROW EXECUTE FUNCTION p5_057_reject_evidence_mutation();
CREATE TRIGGER grant_supports_retained BEFORE UPDATE OR DELETE ON grant_supports
FOR EACH ROW EXECUTE FUNCTION p5_057_reject_evidence_mutation();

CREATE FUNCTION p5_057_validate_support_interval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_range tstzrange; slice_range tstzrange; source_state text; proposed tstzrange;
BEGIN
  SELECT tstzrange(valid_from, COALESCE(valid_until, 'infinity'::timestamptz), '[)'), disposition
    INTO source_range, source_state FROM grant_source_revisions
    WHERE id = NEW.source_revision_id AND coordinate_id = NEW.coordinate_id;
  SELECT tstzrange(valid_from_snapshot, COALESCE(valid_until_snapshot, 'infinity'::timestamptz), '[)')
    INTO slice_range FROM grant_projection_slices
    WHERE id = NEW.slice_id AND coordinate_id = NEW.coordinate_id;
  proposed := tstzrange(NEW.covered_from, COALESCE(NEW.covered_until, 'infinity'::timestamptz), '[)');
  IF source_range IS NULL OR slice_range IS NULL OR source_state = 'CANCELLED'
    OR isempty(proposed) OR NOT (source_range @> proposed) OR NOT (slice_range @> proposed) THEN
    RAISE EXCEPTION 'Grant support must be contained in its source and projection snapshot'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER grant_supports_interval BEFORE INSERT ON grant_supports
FOR EACH ROW EXECUTE FUNCTION p5_057_validate_support_interval();
