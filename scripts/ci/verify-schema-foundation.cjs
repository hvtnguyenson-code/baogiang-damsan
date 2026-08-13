const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CAPABILITIES } = require('../../prisma/seed.cjs');

const root = path.resolve(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');
const baseline = fs.readFileSync(
  path.join(root, 'prisma', 'migrations', '20260728000000_phase_00_baseline', 'migration.sql'),
  'utf8',
);
const phase01 = fs.readFileSync(
  path.join(
    root,
    'prisma',
    'migrations',
    '20260801000000_phase_01_schema_foundation',
    'migration.sql',
  ),
  'utf8',
);

const requiredModels = [
  'SystemSetting',
  'User',
  'StaffProfile',
  'SubjectGroup',
  'Subject',
  'SubjectGroupMembership',
  'StaffSubject',
  'CapabilityDefinition',
  'CapabilityGrant',
  'AuthSession',
  'AuditEvent',
  'AdditionalDutyDefinition',
  'StaffAdditionalDutyAssignment',
];

for (const model of requiredModels) {
  assert.match(schema, new RegExp(`\\bmodel\\s+${model}\\s+\\{`), `Missing Prisma model ${model}`);
}
assert.doesNotMatch(schema, /\bmodel\s+WorkloadAdjustmentRule\s+\{/);

assert.equal((baseline.match(/CREATE TABLE/gu) ?? []).length, 1);
assert.match(baseline, /CREATE TABLE "system_settings"/u);
assert.doesNotMatch(phase01, /CREATE TABLE "system_settings"/u);

for (const constraint of [
  'subject_group_memberships_no_overlap',
  'staff_subjects_no_overlap',
  'capability_grants_no_active_overlap',
  'staff_duty_assignments_no_overlap',
]) {
  assert.match(phase01, new RegExp(`ADD CONSTRAINT "${constraint}"`));
}

const capabilityKeys = CAPABILITIES.map(([key]) => key);
assert.equal(capabilityKeys.length, 28);
assert.equal(new Set(capabilityKeys).size, capabilityKeys.length);
for (const requiredKey of [
  'USER_MANAGE',
  'SUBJECT_GROUP_MANAGE',
  'SUBJECT_MANAGE',
  'CAPABILITY_GRANT',
  'AUDIT_VIEW',
  'ADDITIONAL_DUTY_CATALOG_MANAGE',
  'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE',
  'ACADEMIC_STRUCTURE_MANAGE',
  'TIMETABLE_MANAGE',
  'PPCT_MANAGE',
]) {
  assert.ok(capabilityKeys.includes(requiredKey), `Missing seeded capability ${requiredKey}`);
}

console.log('Schema foundation static verification PASS.');
