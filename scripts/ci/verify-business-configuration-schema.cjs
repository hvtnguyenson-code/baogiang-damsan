const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const foundationMigration = fs.readFileSync(path.join(root, 'prisma/migrations/20260906020000_business_configuration_persistence_foundation/migration.sql'), 'utf8');
const supersessionMigration = fs.readFileSync(path.join(root, 'prisma/migrations/20260916010000_operational_start_scheduled_authority_supersession/migration.sql'), 'utf8');
const migration = `${foundationMigration}\n${supersessionMigration}`;
const { CAPABILITIES } = require(path.join(root, 'prisma/capability-catalog.cjs'));
const registrySource = fs.readFileSync(path.join(root, 'apps/api/src/business-configuration/business-policy-registry.ts'), 'utf8');

// 1. Models & enums in schema.prisma
for (const name of ['BusinessPolicyStream', 'BusinessPolicyVersion', 'BusinessPolicyCommand']) {
  assert.match(schema, new RegExp(`model\\s+${name}\\s+\\{`));
}
for (const name of ['BusinessConfigurationResourceKind', 'BusinessPolicyVersionStatus']) {
  assert.match(schema, new RegExp(`enum\\s+${name}\\s+\\{`));
}

// 2. Types & fields
assert.match(schema, /effectiveFrom\s+DateTime\s+@map\("effective_from"\) @db.Date/);
assert.match(schema, /effectiveUntil\s+DateTime\?\s+@map\("effective_until"\) @db.Date/);
assert.match(schema, /payload\s+Json\s+@db.JsonB/);
assert.match(schema, /result\s+Json\s+@db.JsonB/);
assert.match(schema, /SUPERSEDED_BEFORE_EFFECTIVE/);
assert.match(schema, /supersedesScheduledVersionId\s+String\?/);
assert.match(schema, /supersededBeforeEffectiveByUserId\s+String\?/);

// 3. FK Restrict references
assert.match(schema, /academicYear\s+AcademicYear\?\s+@relation\(fields: \[academicYearId\], references: \[id\], onDelete: Restrict\)/);
assert.match(schema, /stream\s+BusinessPolicyStream\s+@relation\(fields: \[streamId\], references: \[id\], onDelete: Restrict\)/);

// 4. SystemSetting boundary
const systemSetting = schema.match(/model SystemSetting\s+\{([\s\S]*?)\n\}/u)?.[1] ?? '';
assert.doesNotMatch(systemSetting, /BusinessPolicy/u);
assert.doesNotMatch(migration, /system_settings/u);

// 5. Migration constraints, indexes, triggers
const requiredMigrationTokens = [
  'business_policy_streams_resource_shape_check',
  'business_policy_streams_school_wide_family_key',
  'business_policy_streams_academic_year_family_key',
  'business_policy_streams_academic_year_fkey',
  'business_policy_versions_interval_check',
  'business_policy_versions_positive_number_check',
  'business_policy_versions_no_self_lineage_check',
  'business_policy_versions_lifecycle_evidence_check',
  'business_policy_versions_stream_number_key',
  'business_policy_versions_no_published_overlap',
  'business_policy_versions_lineage_guard',
  'business_policy_versions_immutable_guard',
  'business_policy_commands_shape_check',
  'business_policy_commands_actor_command_key',
  'reversing published business policy cannot modify effective_until',
  'SUPERSEDED_BEFORE_EFFECTIVE',
  'business_policy_versions_one_scheduled_child_key',
  'business_policy_versions_scheduled_scope_guard',
  'business_policy_versions_scheduled_chain_guard',
  'DEFERRABLE INITIALLY DEFERRED',
  'business_policy_versions_superseded_by_fkey',
  'business_policy_versions_scheduled_reason_check',
  'business_policy_versions_lifecycle_evidence_check',
  'business_policy_versions_successor_lineage_shape_check',
  'invalid scheduled authority terminal transition',
  'superseded-before-effective business policy versions are immutable',
  'scheduled authority lifecycle is restricted to OPERATIONAL_START',
  'initial OPERATIONAL_START authority must be open-ended',
];
for (const token of requiredMigrationTokens) {
  assert.match(migration, new RegExp(token), `Missing migration token: ${token}`);
}
assert.match(migration, /num_nonnulls\("replaces_version_id", "corrects_version_id", "supersedes_scheduled_version_id"\) <= 1/);
assert.match(migration, /CREATE UNIQUE INDEX "business_policy_versions_one_scheduled_child_key"/);
assert.match(migration, /WHERE \("status" = 'PUBLISHED'\)/, 'GiST PUBLISHED overlap predicate must remain intact');

// 6. Capability catalog verification
const configManage = CAPABILITIES.find(([key]) => key === 'BUSINESS_CONFIGURATION_MANAGE');
assert.ok(configManage, 'BUSINESS_CONFIGURATION_MANAGE must be registered in capability catalog');
assert.deepEqual(configManage[2], ['SCHOOL_WIDE'], 'BUSINESS_CONFIGURATION_MANAGE allowed scope must be strictly SCHOOL_WIDE');

// 7. Production registry isolation & multi-validator structure
const operationalFamilyBlock = registrySource.match(
  /export\s+const\s+OPERATIONAL_START_FAMILY_DEFINITION:\s*BusinessPolicyFamilyDefinition\s*=\s*\{([\s\S]*?)\n\};/u
)?.[1] ?? '';
assert.ok(operationalFamilyBlock, 'OPERATIONAL_START_FAMILY_DEFINITION must be exported as BusinessPolicyFamilyDefinition');
assert.match(operationalFamilyBlock, /key:\s*['"]OPERATIONAL_START['"]/);
assert.match(operationalFamilyBlock, /resourceKind:\s*['"]ACADEMIC_YEAR['"]/);
assert.match(operationalFamilyBlock, /currentValidatorVersion:\s*['"]v1['"]/);
assert.match(operationalFamilyBlock, /validators:\s*\[[\s\S]*?OPERATIONAL_START_VALIDATOR_V1[\s\S]*?\]/);
assert.match(operationalFamilyBlock, /publicationEnabled:\s*true/);
assert.match(operationalFamilyBlock, /downstreamAuthority:\s*['"]ADR-049['"]/);

assert.match(registrySource, /export\s+const\s+OPERATIONAL_START_VALIDATOR_V1:\s*BusinessPolicyPayloadValidator/);
assert.match(registrySource, /OPERATIONAL_START_VALIDATOR_V1[\s\S]*?version:\s*['"]v1['"]/);

const productionRegistryBlock = registrySource.match(
  /export\s+const\s+PRODUCTION_BUSINESS_POLICY_FAMILIES:\s*readonly\s+BusinessPolicyFamilyDefinition\[\]\s*=\s*\[([\s\S]*?)\];/u
)?.[1] ?? '';
assert.ok(productionRegistryBlock, 'PRODUCTION_BUSINESS_POLICY_FAMILIES must be exported as readonly BusinessPolicyFamilyDefinition[]');
assert.match(productionRegistryBlock, /OPERATIONAL_START_FAMILY_DEFINITION/);

assert.doesNotMatch(registrySource, /TEST_BOOLEAN_THRESHOLD/);
assert.match(registrySource, /currentValidatorVersion:\s+string;/);
assert.match(registrySource, /validators:\s+readonly\s+BusinessPolicyPayloadValidator\[\];/);
assert.match(registrySource, /export function validatorForVersion/);
assert.match(registrySource, /export function currentValidator/);

// 8. SQL runtime verifier assertions check
const sqlVerifier = fs.readFileSync(path.join(root, 'scripts/ci/verify-business-configuration-schema.sql'), 'utf8');
assert.match(sqlVerifier, /reversing published business policy cannot modify effective_until/);
assert.match(sqlVerifier, /business policy replacement must remain in its stream/);
assert.match(sqlVerifier, /published business policy semantics are immutable/);
assert.match(sqlVerifier, /reversed business policy versions are immutable/);
assert.match(supersessionMigration, /source\.status = 'SUPERSEDED_BEFORE_EFFECTIVE'/);
assert.match(supersessionMigration, /count\(child\.id\) <> 1/);
assert.match(supersessionMigration, /scheduled authority lineage cycle is forbidden/);
assert.doesNotMatch(
  supersessionMigration,
  /\bUPDATE\s+"business_policy_versions"/iu,
  'P1-031A migration must perform zero-row/no-backfill data mutation',
);

console.log('Business Configuration static schema verification PASS.');
