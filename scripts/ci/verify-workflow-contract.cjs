const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', '..', '.github', 'workflows', 'deploy-production.yml');
const text = fs.readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/).filter((line) => !/^\s*#/.test(line));
const topKeys = lines.filter((line) => /^[A-Za-z0-9_-]+:\s*$/.test(line)).map((line) => line.trim().slice(0, -1));
assert.deepEqual(topKeys.filter((key) => key === 'on'), ['on']);
assert.ok(topKeys.includes('permissions') && topKeys.includes('concurrency') && topKeys.includes('jobs'));
assert.match(text, /^  workflow_dispatch:\s*$/m); assert.doesNotMatch(text, /^  (push|pull_request):\s*$/m);
assert.match(text, /^      commit_sha:\s*$/m); assert.match(text, /^      confirmation:\s*$/m); assert.match(text, /^      run_migrations:\s*$/m);
assert.match(text, /^  deploy:\s*$/m); assert.match(text, /^    environment: production$/m); assert.match(text, /^    timeout-minutes: 30$/m);
assert.match(text, /^  cancel-in-progress: false$/m); assert.match(text, /contents: read/); assert.match(text, /actions: read/);
for (const required of ['PROD_NODE_EXE','PROD_NPM_EXE','PROD_NPX_EXE','PROD_PSQL_EXE','PROD_PG_DUMP_EXE','PROD_PG_RESTORE_EXE','PROD_STARTUP_WRAPPER','PROD_API_ENTRYPOINT']) assert.match(text, new RegExp(required));
assert.match(text, /StrictHostKeyChecking=yes/g); assert.doesNotMatch(text, /StrictHostKeyChecking=no/i); assert.doesNotMatch(text, /:.*\\\\incoming/);
assert.match(text, /powershell\.exe -NoProfile -NonInteractive -EncodedCommand/); assert.doesNotMatch(text, /powershell\.exe -NoProfile -NonInteractive -Command/); assert.match(text, /Read-only marker handshake before transfer/);
assert.match(text, /sync-capability-catalog\.ps1/);
assert.match(text, /git -C control-plane rev-list --first-parent origin\/main/); assert.doesNotMatch(text, /merge-base --is-ancestor/);
for (const ciProvenance of ['.name == "CI"','.head_sha ==','.status == "completed"','.event == "push"','.head_branch == "main"']) assert.ok(text.includes(ciProvenance), `exact CI provenance gate is missing: ${ciProvenance}`);
function isCanonicalSuccessfulCiRun(run, targetSha) { return run.name === 'CI' && run.head_sha === targetSha && run.status === 'completed' && run.conclusion === 'success' && run.event === 'push' && run.head_branch === 'main'; }
const targetSha = 'a'.repeat(40);
assert.equal(isCanonicalSuccessfulCiRun({ name: 'CI', head_sha: targetSha, status: 'completed', conclusion: 'success', event: 'pull_request', head_branch: 'feature' }, targetSha), false);
assert.equal(isCanonicalSuccessfulCiRun({ name: 'CI', head_sha: targetSha, status: 'completed', conclusion: 'success', event: 'push', head_branch: 'feature' }, targetSha), false);
assert.equal(isCanonicalSuccessfulCiRun({ name: 'CI', head_sha: targetSha, status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main' }, targetSha), true);
const stepBlocks = text.split(/^      - name:/m).slice(1);
function assertStepEnvSources(block) {
  const envNames = new Set([...block.matchAll(/^          (PROD_[A-Z0-9_]+):/gm)].map((m) => m[1]));
  const shellRefs = new Set([...block.matchAll(/\$\{?(PROD_[A-Z0-9_]+)/g)].map((m) => m[1]));
  for (const name of shellRefs) assert.ok(envNames.has(name), `step shell references ${name} without a step env source`);
}
for (const block of stepBlocks) { const envCount = (block.match(/^        env:\s*$/gm) || []).length; assert.ok(envCount <= 1, 'a workflow step has duplicate env mappings'); assertStepEnvSources(block); }
assert.throws(() => assertStepEnvSources('        run: |\n          echo "$PROD_BAOGIANG_ROOT"'), /without a step env source/);
assert.match(text, /if: always\(\)/); assert.match(text, /deploy-report-\$\{\{ inputs\.commit_sha \}\}\.json/);
console.log('[workflow-contract] PASS (parsed trigger/job/permissions/concurrency/inputs/environment/transfer/report structure)');
