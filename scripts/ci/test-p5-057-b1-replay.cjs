/* Local B1 evidence runner. Starts no server; accepts only the two task-owned loopback ports.
 * Creates NEW isolated databases, never drops or connects to an existing application DB.
 * Usage: B1_TEST_PORT=55461 B1_OBSERVATION_PATH=... node scripts/ci/test-p5-057-b1-replay.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const port = process.env.B1_TEST_PORT;
assert(['55461', '55471'].includes(port), 'Use only a task-owned isolated B1 cluster');
const output = process.env.B1_OBSERVATION_PATH;
assert(output, 'Explicit observation output is required');
const psql = process.env.B1_PSQL || 'psql';
const migration = '20261105150000_p5_057_b1_provenance_foundation';
const base = '85c406572400789fab5d3ec693a67d05528a9fec';
const prefix = `p5057_b1_test_${Date.now()}`;
function sql(db, query) {
  return execFileSync(psql, ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'b1_test', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { encoding: 'utf8', maxBuffer: 8e6 }).trim();
}
function cli(schema, db, command = 'deploy') {
  const result = execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'),
    'migrate', command, '--schema', schema], { cwd: root, encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: `postgresql://b1_test@127.0.0.1:${port}/${db}` }, maxBuffer: 8e6 });
  assert(!result.includes('Error'), 'Migration command failed');
}
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'p5057-b1-replay-'));
const baselineSchema = path.join(scratch, 'schema.prisma');
fs.writeFileSync(baselineSchema, execFileSync('git', ['show', `${base}:prisma/schema.prisma`], { cwd: root }));
fs.mkdirSync(path.join(scratch, 'migrations'));
for (const entry of fs.readdirSync(path.join(root, 'prisma/migrations'))) {
  if (entry === migration) continue;
  fs.cpSync(path.join(root, 'prisma/migrations', entry), path.join(scratch, 'migrations', entry), { recursive: true });
}
const currentSchema = path.join(root, 'prisma/schema.prisma');
const fresh = `${prefix}_fresh`, upgrade = `${prefix}_upgrade`;
sql('postgres', `CREATE DATABASE "${fresh}"`);
sql('postgres', `CREATE DATABASE "${upgrade}"`);
cli(currentSchema, fresh);
cli(currentSchema, fresh);
cli(baselineSchema, upgrade);
function drift(schema, db) {
  return execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff',
    '--from-url', `postgresql://b1_test@127.0.0.1:${port}/${db}`, '--to-schema-datamodel', schema],
  { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
}
const baselineDrift = drift(baselineSchema, upgrade);
// Non-secret synthetic fixture; no seed, real account or appointment is provisioned.
sql(upgrade, `
INSERT INTO users(id,username,password_hash,status,must_change_password,updated_at)
 VALUES ('b1000000-0000-4000-8000-000000000001','b1-fixture','isolated-test-only','ACTIVE',false,now());
INSERT INTO staff_profiles(id,user_id,display_name,is_teaching_staff,updated_at)
 VALUES ('b1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','B1 fixture',true,now());
INSERT INTO capability_definitions(key,description,allowed_scope_types,updated_at)
 VALUES ('TEACHER_BASE','B1 fixture',ARRAY['PERSONAL'],now());
INSERT INTO capability_grants(id,user_id,capability_key,scope_type,valid_from,updated_at)
 VALUES ('b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','TEACHER_BASE','PERSONAL','2026-01-01Z',now());
`);
const tables = JSON.parse(sql(upgrade, `SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables
 WHERE schemaname='public' AND tablename <> '_prisma_migrations'`));
function dataSnapshot(db) {
  return Object.fromEntries(tables.map(table => [table, sql(db, `SELECT md5(COALESCE(string_agg(v::text,'' ORDER BY v::text),'')) FROM
    (SELECT to_jsonb(t) - ${table === 'capability_grants' ? "'coordinate_id'" : "'__no_column__'"} AS v FROM "${table}" t) s`)]));
}
const rights = `SELECT COALESCE(json_agg(g.id ORDER BY g.id),'[]'::json) FROM capability_grants g
 JOIN users u ON u.id=g.user_id JOIN capability_definitions d ON d.key=g.capability_key
 WHERE u.status='ACTIVE' AND (u.locked_until IS NULL OR u.locked_until <= '2026-11-05Z')
 AND d.is_active AND g.scope_type=ANY(d.allowed_scope_types) AND g.revoked_at IS NULL
 AND g.valid_from <= '2026-11-05Z' AND (g.valid_until IS NULL OR g.valid_until > '2026-11-05Z')`;
const before = dataSnapshot(upgrade), beforeRights = sql(upgrade, rights);
const oldConstraints = sql(upgrade, `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='capability_grants_no_active_overlap'`);
const oldIndex = sql(upgrade, `SELECT indexdef FROM pg_indexes WHERE indexname='capability_grants_exact_key'`);
cli(currentSchema, upgrade);
cli(currentSchema, upgrade);
assert.deepEqual(dataSnapshot(upgrade), before, 'Existing data changed');
assert.equal(sql(upgrade, rights), beforeRights, 'Effective fixture rights changed');
assert.equal(sql(upgrade, `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='capability_grants_no_active_overlap'`), oldConstraints);
assert.equal(sql(upgrade, `SELECT indexdef FROM pg_indexes WHERE indexname='capability_grants_exact_key'`), oldIndex);
assert.equal(sql(upgrade, 'SELECT count(*) FROM capability_grants WHERE coordinate_id IS NOT NULL'), '0');
const newTables = ['authorization_states','access_commands','access_coordinates','authority_seats','role_appointments',
  'grant_sources','grant_source_revisions','grant_projection_revisions','grant_projection_slices','grant_supports'];
for (const db of [fresh, upgrade]) for (const table of newTables) assert.equal(sql(db, `SELECT count(*) FROM ${table}`), '0');
const inspector = fs.readFileSync(path.join(root, 'apps/api/src/users/user-delete-schema.ts'), 'utf8');
const fingerprintSql = inspector.match(/SELECT md5[\s\S]*?AND NOT a\.attisdropped/)[0];
const fkSql = inspector.match(/SELECT ns\.nspname AS schema[\s\S]*?c\.conname COLLATE "C"/)[0];
function observe(db) {
  return { schema: JSON.parse(sql(db, `SELECT row_to_json(x) FROM (${fingerprintSql}) x`)),
    inventory: JSON.parse(sql(db, `SELECT COALESCE(json_agg(x),'[]') FROM (${fkSql}) x`)) };
}
const observed = observe(fresh);
assert.deepEqual(observe(upgrade), observed, 'Fresh and upgrade schema proofs differ');
const diff = drift(currentSchema, fresh);
assert.equal(diff, baselineDrift, 'B1 introduced incremental Prisma schema drift');
fs.writeFileSync(output, JSON.stringify({ version: sql('postgres', 'SHOW server_version'), port, fresh, upgrade,
  observed, dataParity: true, rightsParity: true, oldConstraintsPreserved: true, newTablesEmpty: true,
  incrementalPrismaDrift: false, baselinePrismaDriftPresent: !baselineDrift.includes('No difference'), existingTableCount: tables.length }, null, 2));
console.log(JSON.stringify({ version: sql('postgres', 'SHOW server_version'), fresh, upgrade,
  fingerprint: observed.schema.fingerprint, foreignKeys: observed.inventory.length,
  existingTableCount: tables.length, result: 'PASS: fresh, upgrade, replay, data/rights parity, unchanged indexes, empty foundation, no incremental schema drift' }));
