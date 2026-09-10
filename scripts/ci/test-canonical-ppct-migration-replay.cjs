const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..');
const PSQL_BIN = process.env.PSQL_PATH || (process.platform === 'win32' && fs.existsSync('D:\\PostgreSQL\\bin\\psql.exe') ? 'D:\\PostgreSQL\\bin\\psql.exe' : 'psql');

let adminUser = process.env.POSTGRES_ADMIN_USER || 'postgres';
let adminPassword = process.env.POSTGRES_ADMIN_PASSWORD || 'ci_password_only';
let pgHost = process.env.MIGRATION_DB_HOST || '127.0.0.1';
let pgPort = process.env.MIGRATION_DB_PORT || '5432';
let adminDb = 'postgres';

if (process.env.POSTGRES_ADMIN_URL) {
  try {
    const parsed = new URL(process.env.POSTGRES_ADMIN_URL);
    if (parsed.username) adminUser = decodeURIComponent(parsed.username);
    if (parsed.password) adminPassword = decodeURIComponent(parsed.password);
    if (parsed.hostname) pgHost = parsed.hostname;
    if (parsed.port) pgPort = parsed.port;
    if (parsed.pathname && parsed.pathname.length > 1) {
      adminDb = decodeURIComponent(parsed.pathname.slice(1));
    }
  } catch (err) {
    console.warn(`[replay-test] Could not parse POSTGRES_ADMIN_URL: ${err.message}`);
  }
}

const TEST_USER = process.env.MIGRATION_DB_USER || 'baogiang_dev_user';
const TEST_PASSWORD = process.env.MIGRATION_DB_PASSWORD || 'ci_dev_pass_only';
const DISPOSABLE_DB = process.env.REPLAY_TEST_DB || process.env.REPLAY_PPCT_MIGRATION_DB || 'baogiang_migration_replay_ppct';

const SAFE_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
if (!SAFE_IDENTIFIER_REGEX.test(DISPOSABLE_DB)) {
  throw new Error(`[replay-test] Invalid PostgreSQL database identifier: "${DISPOSABLE_DB}"`);
}
if (!SAFE_IDENTIFIER_REGEX.test(TEST_USER)) {
  throw new Error(`[replay-test] Invalid PostgreSQL user identifier: "${TEST_USER}"`);
}

function runPsql(database, user, password, args, input = null) {
  const fullArgs = [
    '-h', pgHost,
    '-p', pgPort,
    '-U', user,
    '-d', database,
    '-v', 'ON_ERROR_STOP=1',
    ...args,
  ];
  return execFileSync(PSQL_BIN, fullArgs, {
    cwd: rootDir,
    input: input || undefined,
    env: { ...process.env, PGPASSWORD: password },
    encoding: 'utf8',
  });
}

function runAdminPsql(args, input = null) {
  if (process.env.POSTGRES_ADMIN_URL) {
    const fullArgs = [
      '-d', process.env.POSTGRES_ADMIN_URL,
      '-v', 'ON_ERROR_STOP=1',
      ...args,
    ];
    return execFileSync(PSQL_BIN, fullArgs, {
      cwd: rootDir,
      input: input || undefined,
      encoding: 'utf8',
    });
  }
  return runPsql(adminDb, adminUser, adminPassword, args, input);
}

function queryJson(database, user, password, sql) {
  const wrappedSql = `SELECT json_agg(t)::text FROM (${sql}) t;`;
  const result = runPsql(database, user, password, ['-t', '-A', '-c', wrappedSql]);
  const trimmed = result.trim();
  if (!trimmed || trimmed === '') return [];
  return JSON.parse(trimmed);
}

function runSqlFile(database, user, password, filePath) {
  return runPsql(database, user, password, ['-f', filePath]);
}

console.log(`[replay-test] Step 1: Starting from empty disposable PostgreSQL database: ${DISPOSABLE_DB}`);
runAdminPsql([
  '-c', `DROP DATABASE IF EXISTS "${DISPOSABLE_DB}" WITH (FORCE);`,
]);
runAdminPsql([
  '-c', `CREATE DATABASE "${DISPOSABLE_DB}" OWNER "${TEST_USER}";`,
]);
runAdminPsql([
  '-c', `GRANT ALL PRIVILEGES ON DATABASE "${DISPOSABLE_DB}" TO "${TEST_USER}";`,
]);

console.log('[replay-test] Step 2: Applying repository migration history through migration preceding 20260910010000_ppct_component_persistence_foundation');
const migrationsDir = path.join(rootDir, 'prisma', 'migrations');
const allEntries = fs.readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{14}_/.test(d.name))
  .map((d) => d.name)
  .sort();

const targetMigrationName = '20260910010000_ppct_component_persistence_foundation';
const targetIndex = allEntries.indexOf(targetMigrationName);
assert.ok(targetIndex > 0, `Target migration ${targetMigrationName} not found or has no predecessor`);

const predecessorMigrations = allEntries.slice(0, targetIndex);
console.log(`[replay-test] Applying ${predecessorMigrations.length} predecessor migrations:`);
for (const migration of predecessorMigrations) {
  const sqlPath = path.join(migrationsDir, migration, 'migration.sql');
  console.log(`  - ${migration}`);
  runSqlFile(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, sqlPath);
}

console.log('[replay-test] Step 3: Inserting representative LEGACY PPCT data (pre-P2-002 shape without component column)');
const seedPrereqSql = `
INSERT INTO "academic_years" ("id", "code", "name") VALUES
    ('11111111-0000-0000-0000-000000000001', 'REPLAY-2026-2027', 'Replay Academic Year 2026-2027');

INSERT INTO "subjects" ("id", "code", "name") VALUES
    ('22222222-0000-0000-0000-000000000001', 'REPLAY_TOAN_10', 'Replay Toan 10');

INSERT INTO "classes" ("id", "academic_year_id", "code", "name", "grade_level") VALUES
    ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'REPLAY_10A1', 'Replay Lop 10A1', 10);

INSERT INTO "users" ("id", "username", "password_hash", "status", "must_change_password") VALUES
    ('44444444-0000-0000-0000-000000000001', 'replay.creator', 'hash_creator', 'ACTIVE', false),
    ('44444444-0000-0000-0000-000000000002', 'replay.publisher', 'hash_publisher', 'ACTIVE', false);
`;
runPsql(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, ['-c', seedPrereqSql]);

const seedLegacyPpctSql = `
-- PpctPlan
INSERT INTO "ppct_plans" ("id", "academic_year_id", "subject_id", "grade_level") VALUES
    ('55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 10);

-- PpctVersions (v1 PUBLISHED, v2 DRAFT)
INSERT INTO "ppct_versions" ("id", "ppct_plan_id", "version_number", "status", "published_at", "created_by_user_id", "published_by_user_id") VALUES
    ('66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 1, 'PUBLISHED', TIMESTAMPTZ '2026-08-15 08:00:00+07', '44444444-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002'),
    ('66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001', 2, 'DRAFT', NULL, '44444444-0000-0000-0000-000000000001', NULL);

-- PpctItems
INSERT INTO "ppct_items" ("id", "ppct_plan_id") VALUES
    ('77777777-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001'),
    ('77777777-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001'),
    ('77777777-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000001');

-- PpctItemRevisions
INSERT INTO "ppct_item_revisions" ("id", "ppct_version_id", "ppct_plan_id", "ppct_item_id", "sequence", "title", "lesson_type", "created_at") VALUES
    ('88888888-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', 1, 'Bai 1: Menh de', 'LY_THUYET', TIMESTAMPTZ '2026-08-15 08:10:00+07'),
    ('88888888-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000002', 2, 'Bai 2: Tap hop', 'LY_THUYET', TIMESTAMPTZ '2026-08-15 08:11:00+07'),
    ('88888888-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', 1, 'Bai 1: Menh de toan hoc (Sua doi)', 'LY_THUYET', TIMESTAMPTZ '2026-08-20 09:00:00+07'),
    ('88888888-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000003', 2, 'Bai 3: Cac phep toan tap hop', 'THUC_HANH', TIMESTAMPTZ '2026-08-20 09:05:00+07');

-- PpctItemLineage (v1 item 1 -> v2 item 3)
INSERT INTO "ppct_item_lineage" ("id", "ppct_plan_id", "predecessor_version_id", "predecessor_item_id", "successor_version_id", "successor_item_id", "created_at") VALUES
    ('99999999-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000003', TIMESTAMPTZ '2026-08-20 09:10:00+07');

-- PpctClassAssociation
INSERT INTO "ppct_class_associations" ("id", "academic_year_id", "school_class_id", "subject_id", "grade_level", "ppct_plan_id", "ppct_version_id", "effective_from", "effective_until", "created_by_user_id", "created_at", "updated_at") VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 10, '55555555-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', DATE '2026-09-01', DATE '2027-01-15', '44444444-0000-0000-0000-000000000001', TIMESTAMPTZ '2026-08-15 08:30:00+07', TIMESTAMPTZ '2026-08-15 08:30:00+07'),
    ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 10, '55555555-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', DATE '2027-01-16', NULL, '44444444-0000-0000-0000-000000000001', TIMESTAMPTZ '2026-08-15 08:35:00+07', TIMESTAMPTZ '2026-08-15 08:35:00+07');
`;
runPsql(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, ['-c', seedLegacyPpctSql]);

console.log('[replay-test] Step 4: Recording exact pre-migration UUIDs, business values, and timestamps');
const preItems = queryJson(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, 'SELECT id, ppct_plan_id FROM ppct_items ORDER BY id');
const preRevisions = queryJson(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, 'SELECT id, ppct_version_id, ppct_plan_id, ppct_item_id, sequence, title, lesson_type, created_at FROM ppct_item_revisions ORDER BY id');
const preLineages = queryJson(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, 'SELECT id, ppct_plan_id, predecessor_version_id, predecessor_item_id, successor_version_id, successor_item_id, created_at FROM ppct_item_lineage ORDER BY id');
const preAssociations = queryJson(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, 'SELECT id, academic_year_id, school_class_id, subject_id, grade_level, ppct_plan_id, ppct_version_id, effective_from::text, effective_until::text, created_by_user_id, created_at, updated_at FROM ppct_class_associations ORDER BY id');

console.log(`[replay-test] Recorded: ${preItems.length} items, ${preRevisions.length} revisions, ${preLineages.length} lineages, ${preAssociations.length} associations`);

console.log('[replay-test] Step 5: Applying target migration 20260910010000_ppct_component_persistence_foundation');
const targetSqlPath = path.join(migrationsDir, targetMigrationName, 'migration.sql');
runSqlFile(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, targetSqlPath);
console.log('[replay-test] Step 6: Target migration applied successfully without manual intervention');

console.log('[replay-test] Step 7: Verifying backfill values (component = CORE, curricular_profile = CORE_ONLY)');
const postItems = queryJson(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, 'SELECT id, ppct_plan_id, component FROM ppct_items ORDER BY id');
const postRevisions = queryJson(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, 'SELECT id, ppct_version_id, ppct_plan_id, ppct_item_id, component, sequence, title, lesson_type, created_at FROM ppct_item_revisions ORDER BY id');
const postLineages = queryJson(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, 'SELECT id, ppct_plan_id, component, predecessor_version_id, predecessor_item_id, successor_version_id, successor_item_id, created_at FROM ppct_item_lineage ORDER BY id');
const postAssociations = queryJson(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, 'SELECT id, academic_year_id, school_class_id, subject_id, grade_level, ppct_plan_id, ppct_version_id, curricular_profile, effective_from::text, effective_until::text, created_by_user_id, created_at, updated_at FROM ppct_class_associations ORDER BY id');

for (const row of postItems) {
  assert.equal(row.component, 'CORE', `Item ${row.id} component was not backfilled to CORE`);
}
for (const row of postRevisions) {
  assert.equal(row.component, 'CORE', `Revision ${row.id} component was not backfilled to CORE`);
}
for (const row of postLineages) {
  assert.equal(row.component, 'CORE', `Lineage ${row.id} component was not backfilled to CORE`);
}
for (const row of postAssociations) {
  assert.equal(row.curricular_profile, 'CORE_ONLY', `Association ${row.id} profile was not backfilled to CORE_ONLY`);
}

console.log('[replay-test] Step 8: Verifying every recorded UUID, sequence, title, lessonType, version identity, association identity, date bounds, and timestamps remains unchanged');
assert.equal(postItems.length, preItems.length);
for (let i = 0; i < preItems.length; i++) {
  assert.equal(postItems[i].id, preItems[i].id);
  assert.equal(postItems[i].ppct_plan_id, preItems[i].ppct_plan_id);
}

assert.equal(postRevisions.length, preRevisions.length);
for (let i = 0; i < preRevisions.length; i++) {
  assert.equal(postRevisions[i].id, preRevisions[i].id);
  assert.equal(postRevisions[i].ppct_version_id, preRevisions[i].ppct_version_id);
  assert.equal(postRevisions[i].ppct_plan_id, preRevisions[i].ppct_plan_id);
  assert.equal(postRevisions[i].ppct_item_id, preRevisions[i].ppct_item_id);
  assert.equal(postRevisions[i].sequence, preRevisions[i].sequence);
  assert.equal(postRevisions[i].title, preRevisions[i].title);
  assert.equal(postRevisions[i].lesson_type, preRevisions[i].lesson_type);
  assert.equal(postRevisions[i].created_at, preRevisions[i].created_at);
}

assert.equal(postLineages.length, preLineages.length);
for (let i = 0; i < preLineages.length; i++) {
  assert.equal(postLineages[i].id, preLineages[i].id);
  assert.equal(postLineages[i].ppct_plan_id, preLineages[i].ppct_plan_id);
  assert.equal(postLineages[i].predecessor_version_id, preLineages[i].predecessor_version_id);
  assert.equal(postLineages[i].predecessor_item_id, preLineages[i].predecessor_item_id);
  assert.equal(postLineages[i].successor_version_id, preLineages[i].successor_version_id);
  assert.equal(postLineages[i].successor_item_id, preLineages[i].successor_item_id);
  assert.equal(postLineages[i].created_at, preLineages[i].created_at);
}

assert.equal(postAssociations.length, preAssociations.length);
for (let i = 0; i < preAssociations.length; i++) {
  assert.equal(postAssociations[i].id, preAssociations[i].id);
  assert.equal(postAssociations[i].academic_year_id, preAssociations[i].academic_year_id);
  assert.equal(postAssociations[i].school_class_id, preAssociations[i].school_class_id);
  assert.equal(postAssociations[i].subject_id, preAssociations[i].subject_id);
  assert.equal(postAssociations[i].grade_level, preAssociations[i].grade_level);
  assert.equal(postAssociations[i].ppct_plan_id, preAssociations[i].ppct_plan_id);
  assert.equal(postAssociations[i].ppct_version_id, preAssociations[i].ppct_version_id);
  assert.equal(postAssociations[i].effective_from, preAssociations[i].effective_from);
  assert.equal(postAssociations[i].effective_until, preAssociations[i].effective_until);
  assert.equal(postAssociations[i].created_by_user_id, preAssociations[i].created_by_user_id);
  assert.equal(postAssociations[i].created_at, preAssociations[i].created_at);
  assert.equal(postAssociations[i].updated_at, preAssociations[i].updated_at);
}

console.log('[replay-test] Step 9: Querying PostgreSQL catalogs and proving physical invariants');
// Check indexes on ppct_item_revisions
const indexes = queryJson(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, `
  SELECT indexname, indexdef FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'ppct_item_revisions'
`);
const indexNames = new Set(indexes.map((r) => r.indexname));

// 9.1: Old version-wide sequence index is absent
assert.ok(!indexNames.has('ppct_item_revisions_version_sequence_key'), 'ppct_item_revisions_version_sequence_key must be absent');

// 9.2: New version/component/sequence unique index exists
assert.ok(indexNames.has('ppct_item_revisions_version_component_sequence_key'), 'ppct_item_revisions_version_component_sequence_key must exist');

// 9.3: Required old provenance unique indexes still exist
assert.ok(indexNames.has('ppct_item_revisions_provenance_key'), 'ppct_item_revisions_provenance_key must exist for MakeupTeachingSchedule');
assert.ok(indexNames.has('ppct_item_revisions_execution_provenance_key'), 'ppct_item_revisions_execution_provenance_key must exist for CurricularTeachingExecution');

// Check foreign keys on ppct_item_revisions and ppct_item_lineage
const constraints = queryJson(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, `
  SELECT
    c.conname,
    c.contype,
    c.confupdtype,
    c.confdeltype,
    cl.relname AS table_name,
    clf.relname AS foreign_table_name,
    pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  LEFT JOIN pg_class clf ON clf.oid = c.confrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  WHERE n.nspname = 'public'
    AND cl.relname IN ('ppct_item_revisions', 'ppct_item_lineage', 'ppct_class_associations')
`);

const constraintMap = new Map(constraints.map((c) => [c.conname, c]));

// 9.4: Old pre-component revision -> item FK is absent
assert.ok(!constraintMap.has('ppct_item_revisions_item_plan_fkey'), 'Old ppct_item_revisions_item_plan_fkey must be absent');

// 9.5: Component-aware revision -> item FK exists with RESTRICT
const revItemFk = constraintMap.get('ppct_item_revisions_item_plan_component_fkey');
assert.ok(revItemFk, 'ppct_item_revisions_item_plan_component_fkey must exist');
assert.ok(['r', 'a'].includes(revItemFk.confupdtype), `revItemFk confupdtype must be RESTRICT/NO ACTION, got ${revItemFk.confupdtype}`);
assert.ok(['r', 'a'].includes(revItemFk.confdeltype), `revItemFk confdeltype must be RESTRICT/NO ACTION, got ${revItemFk.confdeltype}`);
assert.match(revItemFk.def, /\(ppct_item_id,\s*ppct_plan_id,\s*component\) REFERENCES ppct_items\(id,\s*ppct_plan_id,\s*component\)/u);

// 9.6: Component-aware lineage predecessor FK exists with RESTRICT
const predFk = constraintMap.get('ppct_item_lineage_predecessor_revision_fkey');
assert.ok(predFk, 'ppct_item_lineage_predecessor_revision_fkey must exist');
assert.ok(['r', 'a'].includes(predFk.confupdtype), `predFk confupdtype must be RESTRICT/NO ACTION, got ${predFk.confupdtype}`);
assert.ok(['r', 'a'].includes(predFk.confdeltype), `predFk confdeltype must be RESTRICT/NO ACTION, got ${predFk.confdeltype}`);
assert.match(predFk.def, /\(predecessor_version_id,\s*predecessor_item_id,\s*ppct_plan_id,\s*component\) REFERENCES ppct_item_revisions\(ppct_version_id,\s*ppct_item_id,\s*ppct_plan_id,\s*component\)/u);

// 9.7: Component-aware lineage successor FK exists with RESTRICT
const succFk = constraintMap.get('ppct_item_lineage_successor_revision_fkey');
assert.ok(succFk, 'ppct_item_lineage_successor_revision_fkey must exist');
assert.ok(['r', 'a'].includes(succFk.confupdtype), `succFk confupdtype must be RESTRICT/NO ACTION, got ${succFk.confupdtype}`);
assert.ok(['r', 'a'].includes(succFk.confdeltype), `succFk confdeltype must be RESTRICT/NO ACTION, got ${succFk.confdeltype}`);
assert.match(succFk.def, /\(successor_version_id,\s*successor_item_id,\s*ppct_plan_id,\s*component\) REFERENCES ppct_item_revisions\(ppct_version_id,\s*ppct_item_id,\s*ppct_plan_id,\s*component\)/u);

// 9.8: ppct_class_associations_no_overlap still exists
const noOverlap = constraintMap.get('ppct_class_associations_no_overlap');
assert.ok(noOverlap, 'ppct_class_associations_no_overlap exclusion constraint must exist');
assert.equal(noOverlap.contype, 'x', 'ppct_class_associations_no_overlap must be an exclusion constraint');

console.log('[replay-test] Step 10: Running Prisma schema validation and PPCT SQL verification against migrated database');
const dbUrl = `postgresql://${TEST_USER}:${TEST_PASSWORD}@${pgHost}:${pgPort}/${DISPOSABLE_DB}?schema=public`;
execFileSync('npx', [
  'prisma', 'validate',
  '--schema', path.join(rootDir, 'prisma', 'schema.prisma'),
], {
  cwd: rootDir,
  encoding: 'utf8',
  shell: true,
  env: { ...process.env, DATABASE_URL: dbUrl },
});
console.log('[replay-test] Prisma validate PASS.');

const verifySqlPath = path.join(rootDir, 'scripts', 'ci', 'verify-ppct-schema.sql');
runSqlFile(DISPOSABLE_DB, TEST_USER, TEST_PASSWORD, verifySqlPath);
console.log('[replay-test] scripts/ci/verify-ppct-schema.sql PASS against migrated database.');

console.log(`[replay-test] Step 11: Cleaning up disposable database: ${DISPOSABLE_DB}`);
runAdminPsql([
  '-c', `DROP DATABASE IF EXISTS "${DISPOSABLE_DB}" WITH (FORCE);`,
]);

console.log('CANONICAL PPCT MIGRATION REPLAY PASS: All gates successfully verified on fresh disposable database.');
