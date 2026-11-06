'use strict';
// P5-057: classify the exact *deployed-to-target* migration delta.
// A migration can be auto-dispatched only if its SHA-256 was approved in the
// ALREADY DEPLOYED baseline. The target cannot approve its own SQL.
const crypto = require('node:crypto');
const cp = require('node:child_process');
const fs = require('node:fs');
const POLICY = 'docs/operations/approved-automatic-migrations.json';
const MIGRATION = /^prisma\/migrations\/[0-9]{14}_[a-z0-9_]+\/migration\.sql$/;
const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const PROTECTED = /^(?:\.github\/workflows\/|scripts\/deploy\/windows\/|scripts\/ci\/classify-production-migrations\.cjs$|docs\/operations\/approved-automatic-migrations\.json$)/;

function git(args) {
  return cp.execFileSync('git', args, { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
}
function diffRows(buffer) {
  const raw = buffer.toString('utf8').split('\0');
  if (raw.at(-1) === '') raw.pop();
  if (raw.length % 2) throw new Error('MIGRATION_DIFF_MALFORMED');
  return Array.from({ length: raw.length / 2 }, (_, i) => ({ status: raw[2 * i], path: raw[2 * i + 1] }));
}
function decide({ changes, protectedChanges = [], approved, readTarget }) {
  if (!Array.isArray(changes) || !Array.isArray(protectedChanges)) throw new Error('INVALID_DIFF');
  if (changes.length === 0) return { mode: 'code-only', migrations: [] };
  if (protectedChanges.length) throw new Error('MIGRATION_WITH_CONTROL_PLANE_CHANGE');
  if (changes.length !== 1) throw new Error('AUTO_MIGRATION_REQUIRES_SINGLE_NEW_SQL');
  const [{ status, path }] = changes;
  if (status !== 'A' || !MIGRATION.test(path)) throw new Error('NON_ADDITIVE_MIGRATION_CHANGE');
  if (!approved || approved.schemaVersion !== 1 || !Array.isArray(approved.entries)) throw new Error('APPROVAL_POLICY_MISSING');
  const matches = approved.entries.filter(x => x.path === path);
  if (matches.length !== 1) throw new Error('MIGRATION_NOT_PREAPPROVED');
  const item = matches[0];
  if (item.category !== 'QUIESCED_ADDITIVE' || !HASH.test(item.sha256)) throw new Error('MIGRATION_POLICY_INVALID');
  const sql = readTarget(path);
  if (!Buffer.isBuffer(sql)) throw new Error('MIGRATION_CONTENT_INVALID');
  const digest = crypto.createHash('sha256').update(sql).digest('hex');
  if (digest !== item.sha256) throw new Error('MIGRATION_HASH_MISMATCH');
  return { mode: 'approved-migration', migrations: [path], approvalDigest: digest };
}
function classify(base, target, runGit = git) {
  if (!SHA.test(base) || !SHA.test(target) || base === target) throw new Error('INVALID_RELEASE_SHA');
  runGit(['merge-base', '--is-ancestor', base, target]);
  const rows = diffRows(runGit(['diff', '--name-status', '--no-renames', '-z', base, target, '--', 'prisma/migrations']));
  const controls = runGit(['diff', '--name-only', '-z', base, target, '--', '.github/workflows', 'scripts/deploy/windows', 'scripts/ci/classify-production-migrations.cjs', POLICY])
    .toString('utf8').split('\0').filter(Boolean).filter(x => PROTECTED.test(x));
  // Approval is read ONLY from the actually deployed baseline. A newer
  // commit (even target's first parent) cannot authorize its own SQL.
  let approved = null;
  if (rows.length) {
    try { approved = JSON.parse(runGit(['show', base + ':' + POLICY]).toString('utf8')); }
    catch { throw new Error('DEPLOYED_POLICY_APPROVAL_MISSING'); }
  }
  return decide({ changes: rows, protectedChanges: controls, approved,
    readTarget: path => runGit(['show', target + ':' + path]) });
}
function run() {
  const [base, target] = process.argv.slice(2);
  const result = classify(base, target);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'mode=' + result.mode + '\n');
  process.stdout.write('BAOGIANG_AUTO_DEPLOY_CLASSIFIED ' + JSON.stringify(result) + '\n');
}
if (require.main === module) {
  try { run(); } catch (e) {
    process.stderr.write('BAOGIANG_AUTO_DEPLOY_BLOCKED: ' + (e.message || String(e)) + '\n');
    process.exitCode = 1;
  }
}
module.exports = { decide, diffRows, classify };
