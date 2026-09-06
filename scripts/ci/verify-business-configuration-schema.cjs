const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260906020000_business_configuration_persistence_foundation/migration.sql'), 'utf8');
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
];
for (const token of requiredMigrationTokens) {
  assert.match(migration, new RegExp(token), `Missing migration token: ${token}`);
}

// 6. Capability catalog verification
const configManage = CAPABILITIES.find(([key]) => key === 'BUSINESS_CONFIGURATION_MANAGE');
assert.ok(configManage, 'BUSINESS_CONFIGURATION_MANAGE must be registered in capability catalog');
assert.deepEqual(configManage[2], ['SCHOOL_WIDE'], 'BUSINESS_CONFIGURATION_MANAGE allowed scope must be strictly SCHOOL_WIDE');

// 7. Production registry isolation
assert.match(registrySource, /PRODUCTION_BUSINESS_POLICY_FAMILIES:\s+readonly\s+BusinessPolicyFamilyDefinition\[\]\s+=\s+\[\];/);
assert.doesNotMatch(registrySource, /TEST_BOOLEAN_THRESHOLD/);

console.log('Business Configuration static schema verification PASS.');
