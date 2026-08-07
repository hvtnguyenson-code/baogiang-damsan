const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const workflow = read('.github/workflows/deploy-production.yml');
const common = read('scripts/deploy/windows/deployment-common.ps1');
const inventory = read('scripts/deploy/windows/production-preflight-readonly.ps1');
const install = read('scripts/deploy/windows/install-release.ps1');
const backup = read('scripts/deploy/windows/backup-database.ps1');
const invoke = read('scripts/deploy/windows/invoke-production-deploy.ps1');
const restart = read('scripts/deploy/windows/restart-baogiang-api.ps1');
const rollback = read('scripts/deploy/windows/rollback-release.ps1');
const migration = read('scripts/deploy/windows/run-migrations.ps1');

function redact(text) {
  return text
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, '$1<redacted>@')
    .replace(/(bearer\s+)[^\s,;]+/gi, '$1<redacted>')
    .replace(/(DATABASE_URL|PGPASSWORD|PASSWORD|TOKEN|SECRET|PRIVATE_KEY)\s*[=:]\s*[^\s,;]+/gi, '$1=<redacted>')
    .replace(/(-password|-token|-secret|-privatekey)\s+[^\s,;]+/gi, '$1 <redacted>');
}
function validateKnownHost(value, expectedHost) {
  assert.equal(value.includes('\n'), false); assert.equal(value.includes('\r'), false);
  const fields = value.split(/\s+/); assert.equal(fields.length, 3);
  assert.equal(fields[0], expectedHost); assert.match(fields[1], /^(ssh-ed25519|ecdsa-sha2-nistp256|rsa-sha2-(256|512))$/);
  assert.match(fields[2], /^[A-Za-z0-9+/]+={0,2}$/); return true;
}
function toRelativeScpPath(name) { assert.match(name, /^[A-Za-z0-9._-]+$/); return `./${name}`; }

const hostile = 'postgresql://' + 'deploy' + ':' + 'superSecret' + '@db.internal:5433/baogiang PASS' + 'WORD=' + 'hunter2 Bearer abc.private TOK' + 'EN=' + 'xyz';
const redacted = redact(hostile);
assert.equal(redacted.includes('superSecret'), false); assert.equal(redacted.includes('hunter2'), false); assert.equal(redacted.includes('abc.private'), false); assert.equal(redacted.includes('xyz'), false);
assert.equal(validateKnownHost('vps.example.test ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA==','vps.example.test'), true);
assert.throws(() => validateKnownHost('* ssh-ed25519 AAAA==','vps.example.test'));
assert.equal(toRelativeScpPath('release-' + 'a'.repeat(40) + '.zip').startsWith('./'), true);
assert.throws(() => toRelativeScpPath('C:\\Windows\\bad.zip'));

assert.match(workflow, /git -C control-plane archive --format=zip/); assert.match(workflow, /release-\$TARGET_SHA\.zip/); assert.doesNotMatch(workflow, /tar\s+--/i);
assert.match(install, /Expand-Archive/); assert.match(install, /Invoke-NativeChecked/); assert.doesNotMatch(install, /--ignore-scripts/); assert.match(install, /argon2 native runtime smoke check/);
assert.match(common, /PGPASSWORD/); assert.match(backup, /pg_restore/); assert.doesNotMatch(backup, /--dbname\s+\$databaseUrl/); assert.match(backup, /format=custom/);
assert.match(common, /commandLineSha256/); assert.doesNotMatch(common, /commandLineRedacted/); assert.match(inventory, /Get-NormalizedProcessIdentity/); assert.doesNotMatch(inventory, /Get-ListenerSnapshot 22/);
assert.match(invoke, /Read-DeploymentIdentity/); assert.ok(invoke.indexOf('Read-DeploymentIdentity') < invoke.indexOf('Move-Item -LiteralPath $source'));
assert.match(restart, /Count -ne 1/); assert.match(restart, /LocalPort 3100/); assert.match(restart, /Get-ExactApiProcesses/);
assert.match(migration, /Get-MigrationState/); assert.match(invoke, /migrationAttempted = \$true/); assert.match(rollback, /test-production-health/); assert.match(rollback, /CompatibilityApproved/);
assert.match(workflow, /Read-only marker handshake before transfer/); assert.match(workflow, /-EncodedCommand/); assert.doesNotMatch(workflow, /powershell\.exe -NoProfile -NonInteractive -Command/); assert.match(workflow, /Retrieve redacted deploy report/); assert.match(workflow, /if-no-files-found: error/); assert.match(workflow, /upload-artifact@v4/); assert.match(workflow, /if: always\(\)/);
console.log('[deployment-behavior] PASS (redaction, identity, artifact, native-command, migration, rollback and transfer fixtures)');
