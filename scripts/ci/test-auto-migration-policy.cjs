'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { decide, diffRows, classify } = require('./classify-production-migrations.cjs');
const path = 'prisma/migrations/20261105150000_p5_057_b1_provenance_foundation/migration.sql';
const sql = Buffer.from('CREATE TABLE provenance_fixture (id UUID);\n');
const digest = crypto.createHash('sha256').update(sql).digest('hex');
const approved = { schemaVersion: 1, entries: [{ path, sha256: digest, category: 'QUIESCED_ADDITIVE' }] };
const good = { changes: [{ status: 'A', path }], approved, readTarget: () => sql };
function blocked(input, reason) { assert.throws(() => decide({ ...good, ...input }), new RegExp(reason)); }
test('no migration remains code-only', () => {
  assert.deepEqual(decide({ changes: [], protectedChanges: ['.github/workflows/ci.yml'] }), { mode: 'code-only', migrations: [] });
});
test('prior approved exact SQL can use controlled migration path', () => {
  assert.deepEqual(decide(good), { mode: 'approved-migration', migrations: [path], approvalDigest: digest });
});
test('policy missing or target-only approval denied', () => blocked({ approved: null }, 'APPROVAL_POLICY_MISSING'));
test('unapproved migration denied', () => blocked({ approved: { schemaVersion: 1, entries: [] } }, 'MIGRATION_NOT_PREAPPROVED'));
test('two migrations require operator review', () => blocked({ changes: [{ status: 'A', path }, { status: 'A', path }] }, 'SINGLE_NEW_SQL'));
test('changed old migration denied', () => blocked({ changes: [{ status: 'M', path }] }, 'NON_ADDITIVE'));
test('deleted migration denied', () => blocked({ changes: [{ status: 'D', path }] }, 'NON_ADDITIVE'));
test('unexpected filename denied', () => blocked({ changes: [{ status: 'A', path: 'prisma/migrations/attack.sql' }] }, 'NON_ADDITIVE'));
test('SQL content hash mismatch denied', () => blocked({ readTarget: () => Buffer.from('DELETE FROM users;') }, 'HASH_MISMATCH'));
test('control plane changed together with schema denied', () => blocked({ protectedChanges: ['.github/workflows/auto-deploy-production.yml'] }, 'CONTROL_PLANE_CHANGE'));
test('policy cannot switch migration category at runtime', () => blocked({ approved: { schemaVersion: 1, entries: [{ path, sha256: digest, category: 'OTHER' }] } }, 'POLICY_INVALID'));
test('duplicate whitelist records rejected', () => blocked({ approved: { schemaVersion: 1, entries: [approved.entries[0], approved.entries[0]] } }, 'MIGRATION_NOT_PREAPPROVED'));
test('exact Git NUL-delimited status parsing', () => {
  assert.deepEqual(diffRows(Buffer.from('A\0' + path + '\0')), [{ status: 'A', path }]);
  assert.throws(() => diffRows(Buffer.from('A\0')), /MALFORMED/);
});

const fs = require('node:fs');
test('committed auto-migration approval has unique explicit content hashes', () => {
  const policy = JSON.parse(fs.readFileSync('docs/operations/approved-automatic-migrations.json','utf8'));
  assert.equal(policy.schemaVersion, 1);
  assert.ok(Array.isArray(policy.entries) && policy.entries.length > 0);
  const paths = new Set();
  for (const entry of policy.entries) {
    assert.match(entry.path, /^prisma\/migrations\/[0-9]{14}_[a-z0-9_]+\/migration\.sql$/);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.equal(entry.category, 'QUIESCED_ADDITIVE');
    assert.ok(!paths.has(entry.path));
    paths.add(entry.path);
    if (fs.existsSync(entry.path)) {
      const actual = crypto.createHash('sha256').update(fs.readFileSync(entry.path)).digest('hex');
      assert.equal(actual, entry.sha256, 'Committed migration bytes must match the prior approval.');
    }
  }
});

const BASE_SHA = 'a'.repeat(40);
const TARGET_SHA = 'b'.repeat(40);
const POLICY_PATH = 'docs/operations/approved-automatic-migrations.json';
function fakeGit({ sqlPaths = [path], policy = approved, sqlBody = sql, controls = [], isAncestor = true } = {}) {
  const calls = [];
  const run = args => {
    calls.push(args);
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
      if (!isAncestor) throw new Error('NOT_ANCESTOR');
      return Buffer.alloc(0);
    }
    if (args[0] === 'diff' && args.includes('--name-status')) {
      return Buffer.from(sqlPaths.map(p => 'A\0' + p + '\0').join(''));
    }
    if (args[0] === 'diff' && args.includes('--name-only')) {
      return Buffer.from(controls.map(p => p + '\0').join(''));
    }
    if (args[0] === 'show' && args[1] === BASE_SHA + ':' + POLICY_PATH) {
      if (policy === null) throw new Error('NO_DEPLOYED_POLICY');
      return Buffer.from(JSON.stringify(policy));
    }
    if (args[0] === 'show' && args[1] === TARGET_SHA + ':' + path) return sqlBody;
    if (args[0] === 'show' && args[1] === TARGET_SHA + ':' + POLICY_PATH) {
      throw new Error('TARGET_POLICY_MUST_NEVER_BE_READ');
    }
    throw new Error('UNEXPECTED_GIT_COMMAND: ' + args.join(' '));
  };
  return { run, calls };
}
test('multi-commit lag: one previously approved migration is eligible from deployed baseline', () => {
  const f=fakeGit();
  assert.equal(classify(BASE_SHA,TARGET_SHA,f.run).mode,'approved-migration');
  assert.ok(f.calls.some(x => x[0] === 'show' && x[1] === BASE_SHA + ':' + POLICY_PATH));
  assert.ok(!f.calls.some(x => x[0] === 'show' && x[1] === TARGET_SHA + ':' + POLICY_PATH));
});
test('policy added only after deployed baseline cannot authorize SQL', () => {
  const f=fakeGit({ policy:null });
  assert.throws(() => classify(BASE_SHA,TARGET_SHA,f.run),/APPROVAL_MISSING/);
});
test('target cannot override an incorrect deployed SQL hash', () => {
  const f=fakeGit({ policy:{ schemaVersion:1, entries:[{ path, sha256:'f'.repeat(64), category:'QUIESCED_ADDITIVE' }] } });
  assert.throws(() => classify(BASE_SHA,TARGET_SHA,f.run),/HASH_MISMATCH/);
});
test('two outstanding SQL migrations across skipped releases are blocked', () => {
  const f=fakeGit({ sqlPaths:[path,'prisma/migrations/20261106120000_other/migration.sql'] });
  assert.throws(() => classify(BASE_SHA,TARGET_SHA,f.run),/SINGLE_NEW_SQL/);
});
test('control-plane change plus pending migration across lag is blocked', () => {
  const f=fakeGit({ controls:['.github/workflows/auto-deploy-production.yml'] });
  assert.throws(() => classify(BASE_SHA,TARGET_SHA,f.run),/CONTROL_PLANE_CHANGE/);
});
test('policy changed with pending SQL is blocked (including lagged main releases)', () => {
  const f = fakeGit({ controls: [POLICY_PATH] });
  assert.throws(() => classify(BASE_SHA, TARGET_SHA, f.run), /CONTROL_PLANE_CHANGE/);
  assert.ok(f.calls.some(args => args[0] === 'diff' && args.includes(POLICY_PATH)),
    'Classifier must include deployed migration policy in protected diff pathspec.');
});
test('policy-only change is code-only (no new deploy mechanism)', () => {
  const f = fakeGit({ sqlPaths: [], controls: [POLICY_PATH] });
  assert.equal(classify(BASE_SHA, TARGET_SHA, f.run).mode, 'code-only');
});
test('unrelated or divergent deployed SHA is blocked before approval', () => {
  const f=fakeGit({ isAncestor:false });
  assert.throws(() => classify(BASE_SHA,TARGET_SHA,f.run),/NOT_ANCESTOR/);
});
test('ordinary multi-commit code-only lag stays code-only', () => {
  const f=fakeGit({ sqlPaths:[] });
  assert.equal(classify(BASE_SHA,TARGET_SHA,f.run).mode,'code-only');
});
test('GitHub workflow reads real deployed SHA first and preserves fail-closed SSH identity', () => {
  const yaml=require('js-yaml').load(fs.readFileSync('.github/workflows/auto-deploy-production.yml','utf8'));
  const job=yaml.jobs.dispatch;
  assert.equal(job.environment,'production');
  const ssh=job.steps.findIndex(x=>x.id==='predecessor');
  const classifier=job.steps.findIndex(x=>x.id==='classification');
  assert.ok(ssh>0 && classifier>ssh);
  const probe=job.steps[ssh].run;
  assert.match(probe,/WRONG_SYSTEM/);
  assert.match(probe,/UNVERIFIED_CURRENT_POINTER/);
  assert.match(probe,/BAOGIANG_CURRENT_SHA=\[0-9a-f\]\{40\}/);
  assert.match(probe,/GITHUB_OUTPUT/);
  assert.match(probe,/StrictHostKeyChecking=yes/);
  assert.ok(probe.includes(String.raw`[[ "$HOST_KEY" != *$'\n'* && "$HOST_KEY" != *$'\r'* ]]`));
  assert.ok(probe.includes(String.raw`[[ "$HOST_KEY" != *'*'* && "$HOST_KEY" != *'?'* && "$HOST_KEY" != *'@cert-authority'* && "$HOST_KEY" != \|* ]]`));
  assert.match(probe,/base64 --decode/);
  assert.match(job.steps[classifier].run,/\$DEPLOYED_SHA/);
  assert.match(job.steps[classifier].run,/already-current/);
  const dispatch=job.steps.find(x=>x.name==='Dispatch according to reviewed migration policy').run;
  assert.match(dispatch,/run_migrations=false/);
  assert.match(dispatch,/run_migrations=true/);
  assert.match(dispatch,/already-current\)/);
});

test('production worker checks deployed migration baseline before stopping BaoGiang', () => {
  const worker=fs.readFileSync('scripts/deploy/windows/invoke-production-deploy.ps1','utf8');
  const gate=worker.indexOf('BAOGIANG_PRE_MIGRATION_BASELINE_VERIFIED');
  const stop=worker.indexOf('Stop-ExactBaoGiangRuntime');
  assert.ok(gate>0 && stop>gate);
  assert.match(worker,/PRE_MIGRATION_BASELINE_DRIFT_BLOCKED/);
  assert.match(worker,/ReleaseSha \$report\.previousRelease/);
  assert.match(worker,/databasePort -ne 5434/);
});