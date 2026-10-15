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
const runtimeContract = text.slice(text.indexOf('- name: Validate target, pinned SSH identity and environment contract'), text.indexOf('- name: Verify exact target CI success'));
for (const required of ['runtime_prefix=', 'shared\\runtimes', 'PROD_NODE_EXE must be the dedicated Báo giảng runtime', 'PROD_NPM_EXE must accompany dedicated node.exe', 'PROD_NPX_EXE must accompany dedicated node.exe', 'node_dir=']) assert.ok(runtimeContract.includes(required), `Isolated Node22 production-path check missing: ${required}`);
assert.match(text, /StrictHostKeyChecking=yes/g); assert.doesNotMatch(text, /StrictHostKeyChecking=no/i); assert.doesNotMatch(text, /:.*\\\\incoming/);
const knownHostKeyTypes = 'ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|ssh-rsa';
assert.ok(text.includes(`case "$known_type" in ${knownHostKeyTypes})`), 'known_hosts public-key type allowlist drifted');
assert.doesNotMatch(text, /rsa-sha2-(256|512)/); assert.doesNotMatch(text, /HostKeyAlgorithms|PubkeyAcceptedAlgorithms/);
assert.match(text, /powershell\.exe -NoProfile -NonInteractive -EncodedCommand/); assert.doesNotMatch(text, /powershell\.exe -NoProfile -NonInteractive -Command/); assert.match(text, /Read-only marker handshake before transfer/);
assert.match(text, /\[\[ "\$PROD_SERVICE_KIND" == "scheduled-task" \]\] \|\| \{ echo "Production CD currently supports scheduled-task only\." >&2; exit 1; \}/); assert.doesNotMatch(text, /\[\[ "\$PROD_SERVICE_KIND" == "scheduled-task" \|\| "\$PROD_SERVICE_KIND" == "service" \]\]/);
const validationBlock = text.slice(text.indexOf('- name: Validate target, pinned SSH identity and environment contract'), text.indexOf('- name: Verify exact target CI success')); assert.doesNotMatch(validationBlock, /\bservice\b/);
for (const remoteStep of ['Derive active startup-bundle Git evidence','Prepare pinned SSH files','Read-only marker handshake before transfer','Revalidate authority and prepare unique transfer directory','Upload reviewed transfer bundle through SFTP']) assert.ok(text.indexOf('[[ "$PROD_SERVICE_KIND" == "scheduled-task" ]]') < text.indexOf(remoteStep), `scheduled-task-only gate must precede ${remoteStep}`);
assert.match(text, /sync-capability-catalog\.ps1/);
assert.match(text, /notify-operator-telegram\.ps1/, 'Production transfer must include verified operator notifier');
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

const remoteCommand = require('./build-windows-remote-command.cjs');
const stageName = 'bg-command-handshake-38724422199-1-' + 'a'.repeat(40) + '.ps1';
const staged = remoteCommand.buildStagedInvocation('C:\\baogiang',stageName,'b'.repeat(64));
assert.ok(staged.length < 7000, 'staged invocation must fit Windows command-line limits');
const stagedSource = Buffer.from(staged,'base64').toString('utf16le');
for (const required of ['Get-FileHash','STAGED_COMMAND_HASH_MISMATCH','STAGED_COMMAND_UNSAFE','-ExecutionPolicy Bypass','C:\\baogiang']) assert.ok(stagedSource.includes(required), 'missing staged execution guard: ' + required);
assert.throws(() => remoteCommand.buildStagedInvocation('C:\\baogiang','../unsafe.ps1','b'.repeat(64)),/Unsafe staged/);
assert.throws(() => remoteCommand.buildStagedInvocation('C:\\baogiang',stageName,'not-a-hash'),/Invalid staged/);
for (const required of ["staged-invoke", "sha256sum", "bg-command-handshake-", "bg-command-prepare-", "Read-only marker handshake before transfer", "Revalidate authority and prepare unique transfer directory", "printf 'put", "printf 'rm"]) assert.ok(text.includes(required), 'missing staged SSH workflow control: ' + required);
assert.doesNotMatch(text,/stdin-bootstrap|ReadToEnd|ReadLine/);
assert.match(text,/timeout 120 ssh .* -EncodedCommand "\$invoke"/);
assert.match(text,/timeout 120 ssh .* -EncodedCommand "\$encoded"/);


const active = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'deploy-vps.yml'), 'utf8');
const automatic = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'auto-deploy-production.yml'), 'utf8');
const stable = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'windows', 'auto-deploy-code-only.ps1'), 'utf8');
assert.ok(automatic.includes('gh workflow run deploy-vps.yml'));
assert.match(active, /workflow_dispatch:/);
assert.match(active, /environment: production/);
assert.ok(active.includes('ssh -n -i'));
assert.match(active, /StrictHostKeyChecking=yes/);
assert.match(active, /PROD_SSH_PRIVATE_KEY/);
assert.ok(active.includes('auto-deploy-code-only.ps1'));
assert.match(active, /RUN_MIGRATIONS.*== 'false'/);
assert.doesNotMatch(active, /git clone|npm install|npm ci|migrate deploy|restart-service|Stop-Service/i);
for (const required of ['Assert-Http200 $neighborHealthUrl', 'MigrationRequested = $false', 'RollbackCompatibilityApproved = $false', 'invoke-production-deploy.ps1', 'PROTECTED_NEIGHBOR_PROCESS_CHANGED', 'BAOGIANG_DEPLOY_VERIFIED']) {
  assert.ok(stable.includes(required), 'missing isolated VPS guard: ' + required);
}
assert.ok(!stable.includes('DamSanV5') && !stable.includes('C:'+'\\\\'+'damsan'));
assert.ok(stable.includes('main -cne '));
assert.match(stable, /Get-FileHash.*SHA256/);
assert.match(stable, /SourceArchiveName/);

console.log('[workflow-contract] PASS (parsed trigger/job/permissions/concurrency/inputs/environment/transfer/report structure)');
