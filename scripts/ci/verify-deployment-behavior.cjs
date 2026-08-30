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
const catalog = read('scripts/deploy/windows/sync-capability-catalog.ps1');
const discovery = read('scripts/deploy/windows/production-protected-neighbor-discovery.ps1');
const preflight = read('scripts/deploy/windows/production-preflight-readonly.ps1');
const validator = read('scripts/deploy/windows/validate-production-environment.ps1');
const firstDeployRunbook = read('docs/operations/PRODUCTION-CD-FIRST-DEPLOY-RUNBOOK.md');
const remote = require('./build-windows-remote-command.cjs');

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
  assert.equal(fields[0], expectedHost); assert.match(fields[1], /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521))$/);
  assert.match(fields[2], /^[A-Za-z0-9+/]+={0,2}$/);
  const decoded = Buffer.from(fields[2], 'base64'); assert.ok(decoded.length > 0); assert.equal(decoded.toString('base64').replace(/=+$/, ''), fields[2].replace(/=+$/, '')); return true;
}
function toRelativeScpPath(name) { assert.match(name, /^[A-Za-z0-9._-]+$/); return `./${name}`; }

const hostile = 'postgresql://' + 'deploy' + ':' + 'superSecret' + '@db.internal:5433/baogiang PASS' + 'WORD=' + 'hunter2 Bearer abc.private TOK' + 'EN=' + 'xyz';
const redacted = redact(hostile);
assert.equal(redacted.includes('superSecret'), false); assert.equal(redacted.includes('hunter2'), false); assert.equal(redacted.includes('abc.private'), false); assert.equal(redacted.includes('xyz'), false);
assert.equal(validateKnownHost('vps.example.test ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA==','vps.example.test'), true);
assert.equal(validateKnownHost('vps.example.test ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ==','vps.example.test'), true);
assert.throws(() => validateKnownHost('vps.example.test rsa-sha2-256 AAAA==','vps.example.test'));
assert.throws(() => validateKnownHost('* ssh-ed25519 AAAA==','vps.example.test'));
assert.equal(toRelativeScpPath('release-' + 'a'.repeat(40) + '.zip').startsWith('./'), true);
assert.throws(() => toRelativeScpPath('C:\\Windows\\bad.zip'));
assert.equal(remote.windowsRootToSftp('C:\\baogiang'), '/C:/baogiang');
assert.throws(() => remote.windowsRootToSftp('C:\\Báo giảng Đam San'));
assert.throws(() => remote.windowsRootToSftp('C:\\bad"root'));
assert.throws(() => remote.windowsRootToSftp('relative\\root'));
assert.throws(() => remote.buildCleanup('C:\\baogiang', ''));
assert.throws(() => remote.buildCleanup('C:\\baogiang', 'incoming'));

assert.match(workflow, /git -C control-plane archive --format=zip/); assert.match(workflow, /release-\$TARGET_SHA\.zip/); assert.doesNotMatch(workflow, /tar\s+--/i);
assert.match(install, /Expand-Archive/); assert.match(install, /Invoke-NativeChecked/); assert.doesNotMatch(install, /--ignore-scripts/); assert.match(install, /argon2 native runtime smoke check/);
assert.match(common, /PGPASSWORD/); assert.match(backup, /pg_restore/); assert.doesNotMatch(backup, /--dbname\s+\$databaseUrl/); assert.match(backup, /format=custom/);
assert.match(common, /'TZ'/); assert.match(common, /Asia\/Ho_Chi_Minh/); assert.match(common, /foreach \(\$name in \$required\)/);
assert.match(common, /commandLineSha256/); assert.doesNotMatch(common, /commandLineRedacted/); assert.match(inventory, /Get-NormalizedProcessIdentity/); assert.doesNotMatch(inventory, /Get-ListenerSnapshot 22/);
assert.match(invoke, /Read-DeploymentIdentity/); assert.ok(invoke.indexOf('Read-DeploymentIdentity') < invoke.indexOf('Move-Item -LiteralPath $source'));
assert.match(common, /function Get-ManagedProductionEnvironmentNames/); assert.match(common, /function Invoke-WithServerEnvironment/); assert.match(common, /\$private:snapshot/); assert.match(common, /function Restore-ServerEnvironment/); assert.match(common, /StringComparer\]::OrdinalIgnoreCase/); assert.match(common, /foreach \(\$name in \$required\)/); assert.match(common, /foreach \(\$name in Get-ManagedProductionEnvironmentNames\)/); assert.match(common, /& \$ScriptBlock/); assert.doesNotMatch(common, /return \$snapshot/); assert.ok(common.indexOf('Read-ValidatedProductionEnvironment') < common.indexOf('SetEnvironmentVariable'));
assert.match(common, /function Assert-ProductionPositiveInteger/); assert.match(common, /\^\[1-9\]\[0-9\]\*\$/); assert.match(common, /double\]::TryParse/i); assert.match(common, /double\]::IsInfinity/i); assert.match(common, /AUTH_COOKIE_NAME.*\^\[A-Za-z0-9_-\]\+\$/); assert.match(common, /AUTH_COOKIE_PATH.*StartsWith\('\/'\)/); assert.match(common, /AUTH_COOKIE_SAME_SITE.*ToLowerInvariant/); assert.doesNotMatch(backup, /DatabaseUrlEnvironmentVariable/); assert.doesNotMatch(migration, /DatabaseUrlEnvironmentVariable/); assert.match(backup, /GetEnvironmentVariable\('DATABASE_URL','Process'\)/); assert.match(migration, /GetEnvironmentVariable\('DATABASE_URL','Process'\)/);
assert.match(invoke, /Read-ValidatedProductionEnvironment/); assert.doesNotMatch(invoke, /Import-ServerEnvironment -EnvFile \$p\.EnvFile/); assert.match(validator, /Read-ValidatedProductionEnvironment/); assert.doesNotMatch(validator, /ValidateScript|ValidatePattern|Read-DeploymentIdentity|NodeExe|ExpectedEntryPoint|Start-ScheduledTask|Start-Service/); assert.match(validator, /VALIDATION_FAILED/);
for (const runtimeScript of [read('scripts/deploy/windows/start-baogiang-api.ps1'), backup, migration, catalog]) { assert.match(runtimeScript, /Invoke-WithServerEnvironment/); assert.doesNotMatch(runtimeScript, /environmentSnapshot|Import-ServerEnvironment|Restore-ServerEnvironment/); }
assert.match(read('scripts/deploy/windows/start-baogiang-api.ps1'), /\$nodeState\.exitCode = \$LASTEXITCODE/); assert.match(read('scripts/deploy/windows/start-baogiang-api.ps1'), /exit \$nodeState\.exitCode/); assert.ok(read('scripts/deploy/windows/start-baogiang-api.ps1').indexOf('Invoke-WithServerEnvironment') < read('scripts/deploy/windows/start-baogiang-api.ps1').lastIndexOf('exit $nodeState.exitCode'));
assert.match(common, /function Assert-DeploymentMarkerSchema/); assert.match(common, /schemaVersion must be integer 1/); assert.match(common, /foreignRoots must be a non-empty JSON array/); assert.match(common, /reviewed Nginx prefix overlaps/); assert.match(common, /startupBundle\.\$hashField/); assert.match(common, /StringComparer\]::Ordinal/); assert.match(common, /\$kind -ceq 'scheduled-task'/); assert.match(common, /\$kind -ceq 'service'/);
assert.match(invoke, /-NodeExe \$p\.NodeExe -NginxExe \$p\.NginxExe -NginxConfig \$p\.NginxConfig/); assert.doesNotMatch(invoke, /marker\.nginxExe\s+-and|marker\.nginxConfig\s+-and/);
assert.doesNotMatch(restart, /marker\.service\.taskPath\s+-and/); assert.doesNotMatch(common, /marker\.service\.taskPath\s+-and|if \(\$marker\.nodeExe\)/);
assert.match(common, /function Assert-VerifiedScheduledTaskContract/); assert.match(common, /MSFT_TaskBootTrigger/); assert.match(common, /function Assert-ScheduledTaskActivationAuthorized/); assert.match(common, /function Get-ScheduledTaskActivationFailureDisposition/);
assert.match(common, /function Assert-ScheduledTaskHealthyState/); assert.match(common, /function Invoke-ScheduledTaskActivationLifecycle/); assert.match(restart, /AllowScheduledTaskActivation/); assert.match(restart, /Invoke-ScheduledTaskActivationLifecycle/); assert.ok(restart.indexOf('Enable-ScheduledTask') < restart.indexOf('Start-ScheduledTask')); assert.match(common, /Assert-ScheduledTaskHealthyState -Task \$finalTask/);
assert.ok(common.indexOf('Disable-ScheduledTask') < common.indexOf('Stop-ScheduledTask'));
assert.match(rollback, /AllowScheduledTaskActivation/); assert.match(invoke, /AllowScheduledTaskActivation:\(\$p\.ServiceKind -eq 'scheduled-task'\)/);
assert.match(rollback, /Invoke-ScheduledTaskRollbackLifecycle/); assert.match(common, /ROLLBACK_HEALTH_FAILED_AND_SAFE_STOP_FAILED/); assert.match(common, /function Get-DeploymentFailureRecoveryDecision/); assert.match(invoke, /COMPATIBILITY_SAFE_STOP/);
assert.match(restart, /Count -ne 1/); assert.match(restart, /LocalPort 3100/); assert.match(restart, /Get-ExactApiProcesses/);
assert.match(migration, /Get-MigrationState/); assert.match(invoke, /migrationAttempted = \$true/); assert.match(invoke, /\$migrationCompleted = \$false/); assert.match(invoke, /\$migrationAttempted -and -not \$migrationCompleted/); assert.match(invoke, /Migration completion summary is missing or not completed/); assert.match(invoke, /migrationResult\.state -ne 'completed'/); assert.match(rollback, /test-production-health/); assert.match(rollback, /CompatibilityApproved/);
assert.match(migration, /ReleaseSha/); assert.match(migration, /Assert-ExactReleasePath/); assert.match(migration, /Test-PathWithin \$schema \$release/); assert.match(invoke, /-ReleaseSha \$p\.ReleaseSha/);
assert.ok(migration.indexOf('Assert-ExactReleasePath') < migration.indexOf('Invoke-WithServerEnvironment')); assert.ok(migration.indexOf("Test-Path -LiteralPath $schema -PathType Leaf") < migration.indexOf('Invoke-WithServerEnvironment'));
const compatibilityStart = invoke.indexOf("elseif ($recoveryDecision -eq 'COMPATIBILITY_SAFE_STOP')");
const approvedRollbackStart = invoke.indexOf('\n    else {', compatibilityStart);
assert.ok(compatibilityStart >= 0 && approvedRollbackStart > compatibilityStart, 'compatibility recovery branch is missing');
const compatibilityBranch = invoke.slice(compatibilityStart, approvedRollbackStart);
assert.match(compatibilityBranch, /Stop-ExactBaoGiangRuntime/); assert.ok(compatibilityBranch.indexOf('Stop-ExactBaoGiangRuntime') < compatibilityBranch.indexOf('stoppedCompatibilityApprovalRequired'));
assert.match(compatibilityBranch, /stopFailedCompatibilityApprovalRequired/); assert.match(compatibilityBranch, /Get-SafeErrorCategory/); assert.doesNotMatch(compatibilityBranch, /rollback-release\.ps1/);
assert.match(invoke, /firstDeployFailedStopped/); assert.match(invoke, /firstDeployStopFailed/); assert.match(invoke, /rollback-release\.ps1/);
assert.match(catalog, /ReleaseSha/); assert.match(catalog, /Assert-ExactReleasePath/); assert.match(catalog, /BackupVerified/); assert.match(catalog, /sync-capability-catalog\.cjs/); assert.match(invoke, /capabilityCatalog/); assert.ok(invoke.indexOf('backup-database.ps1') < invoke.indexOf('run-migrations.ps1')); assert.ok(invoke.indexOf('run-migrations.ps1') < invoke.indexOf('sync-capability-catalog.ps1')); assert.ok(invoke.indexOf('sync-capability-catalog.ps1') < invoke.indexOf('switch-current-release.ps1')); assert.doesNotMatch(invoke, /prisma:seed/);
assert.match(workflow, /rev-list --first-parent origin\/main/); assert.doesNotMatch(workflow, /merge-base --is-ancestor/); assert.match(workflow, /\.event == "push"/); assert.match(workflow, /\.head_branch == "main"/);
assert.match(workflow, /Read-only marker handshake before transfer/); assert.match(workflow, /-EncodedCommand/); assert.doesNotMatch(workflow, /powershell\.exe -NoProfile -NonInteractive -Command/); assert.match(workflow, /Retrieve redacted deploy report/); assert.match(workflow, /if-no-files-found: error/); assert.match(workflow, /upload-artifact@v4/); assert.match(workflow, /if: always\(\)/);
assert.match(discovery, /mode='READ_ONLY_DISCOVERY'/); assert.match(discovery, /mutationsPerformed=\$false/); assert.match(discovery, /databaseAuthenticationAttempted=\$false/); assert.match(discovery, /conclusion='REQUIRES_REVIEW'/);
assert.ok(firstDeployRunbook.indexOf('production-protected-neighbor-discovery.ps1') < firstDeployRunbook.indexOf('production-preflight-readonly.ps1'));
assert.match(preflight, /RequireReviewedIsolation/); assert.match(preflight, /Get-ProtectedNeighborIsolationEvidence/); assert.match(preflight, /Get-SshPublicHostKeyEvidence/); assert.match(preflight, /Get-SshFirewallEvidence/);
assert.match(preflight, /Resolve-ExpectedCandidateRuntimeName/); assert.match(preflight, /Get-SshDirectConfigEvidence/); assert.match(preflight, /Get-SshPortEvidence/); assert.match(preflight, /-SshPort @\(\$portEvidence\.agreedPorts\)/); assert.doesNotMatch(preflight, /\$ports \+ \$listeningPorts/);
assert.match(preflight, /Resolve-DatabaseVerifierExecutable/); assert.doesNotMatch(preflight, /Get-Command\s+psql\b/i); assert.match(preflight, /& \$databaseVerifier --tuples-only/);
assert.doesNotMatch(preflight, /argumentsRedacted|pathNameRedacted/); assert.match(preflight, /argumentsSha256/); assert.match(preflight, /pathNameSha256/);
console.log('[deployment-behavior] PASS (redaction, identity, preflight evidence, artifact, migration, rollback and transfer fixtures)');
