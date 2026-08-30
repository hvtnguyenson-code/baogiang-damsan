const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(root, '.github', 'workflows', 'deploy-production.yml');
const firstDeployRunbookPath = path.join(root, 'docs', 'operations', 'PRODUCTION-CD-FIRST-DEPLOY-RUNBOOK.md');
const environmentConfigurationPath = path.join(root, 'docs', 'operations', 'PRODUCTION-ENVIRONMENT-CONFIGURATION.md');
const scriptDir = path.join(root, 'scripts', 'deploy', 'windows');
const required = ['deployment-common.ps1','production-preflight-readonly.ps1','production-protected-neighbor-discovery.ps1','install-release.ps1','backup-database.ps1','run-migrations.ps1','sync-capability-catalog.ps1','switch-current-release.ps1','restart-baogiang-api.ps1','start-baogiang-api.ps1','validate-production-environment.ps1','test-production-health.ps1','rollback-release.ps1','invoke-production-deploy.ps1'];
const fail = (message) => { throw new Error(`[deployment-static] ${message}`); };
const read = (file) => fs.readFileSync(file, 'utf8');
if (!fs.existsSync(workflowPath)) fail('workflow is missing');
for (const file of required) if (!fs.existsSync(path.join(scriptDir, file))) fail(`required script is missing: ${file}`);
const workflow = read(workflowPath);
const firstDeployRunbook = read(firstDeployRunbookPath);
const environmentConfiguration = read(environmentConfigurationPath);
if (!/^on:\s*$/m.test(workflow) || !/^\s{2}workflow_dispatch:\s*$/m.test(workflow)) fail('manual workflow_dispatch contract is missing');
if (/^\s{2}(push|pull_request):\s*$/m.test(workflow)) fail('deployment workflow must not have push/pull_request triggers');
for (const token of ['environment: production','cancel-in-progress: false','confirmation:','commit_sha:','StrictHostKeyChecking=yes','rev-list --first-parent origin/main','workflow_runs','.event == "push"','.head_branch == "main"','git -C control-plane archive --format=zip','upload-artifact@v4','if: always()','-EncodedCommand','Read-only marker handshake before transfer','control-$run_id-$TARGET_SHA']) if (!workflow.includes(token)) fail(`workflow gate missing: ${token}`);
const scripts = required.map((file) => read(path.join(scriptDir, file))).join('\n');
if (!workflow.includes('sync-capability-catalog.ps1') || !scripts.includes('sync-capability-catalog.cjs')) fail('capability catalog synchronization contract is missing');
if (/npm\s+run\s+prisma:seed/i.test(scripts)) fail('deployment must not invoke generic Prisma seed');
const forbidden = [
  /StrictHostKeyChecking\s*=\s*no/i, /taskkill\s+\/IM\s+node\.exe/i, /\b(reboot|shutdown)\b/i,
  /Restart-Service[^\r\n]*(postgres|nginx)/i, /Stop-Service[^\r\n]*nginx/i,
  /prisma\s+migrate\s+reset/i, /prisma\s+db\s+push/i, /prisma\s+db\s+seed/i,
  /while\s*\(\s*\$?true\s*\)/i, /sleep\s+\d+\s*$/im,
  /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/i, /postgres(?:ql)?:\/\/[^\s<]+:[^\s<]+@/i,
  /--dbname\s+\$databaseUrl/i, /--connection-string/i
];
for (const pattern of forbidden) if (pattern.test(scripts)) fail(`forbidden deployment construct: ${pattern}`);
for (const token of ['Set-StrictMode -Version Latest','$ErrorActionPreference = \'Stop\'','ValidatePattern','ValidateScript','Expand-Archive','migrate status','migrate deploy','PGPASSWORD','pg_restore','Read-DeploymentIdentity','commandLineSha256','Get-ExactApiProcesses','MigrationAttempted','CompatibilityApproved','start-baogiang-api.ps1']) if (!scripts.includes(token)) fail(`fail-closed control missing: ${token}`);
for (const token of ['Assert-VerifiedScheduledTaskContract','MSFT_TaskBootTrigger','Test-ScheduledTaskTriggerEnabled','Assert-ScheduledTaskActivationAuthorized','Get-ScheduledTaskActivationFailureDisposition','AllowScheduledTaskActivation','Enable-ScheduledTask','Disable-ScheduledTask']) if (!scripts.includes(token)) fail(`Scheduled Task lifecycle control missing: ${token}`);
const restart = read(path.join(scriptDir, 'restart-baogiang-api.ps1'));
const common = read(path.join(scriptDir, 'deployment-common.ps1'));
const rollback = read(path.join(scriptDir, 'rollback-release.ps1'));
const invoke = read(path.join(scriptDir, 'invoke-production-deploy.ps1'));
if (!(restart.indexOf('Assert-ScheduledTaskActivationAuthorized') < restart.indexOf('Enable-ScheduledTask') && restart.indexOf('Enable-ScheduledTask') < restart.indexOf('Start-ScheduledTask'))) fail('Scheduled Task activation must authorize then enable before start');
if (!(common.indexOf('Disable-ScheduledTask') < common.indexOf('Stop-ScheduledTask'))) fail('Scheduled Task safe-stop must disable before stop');
if (!rollback.includes('-AllowScheduledTaskActivation:$AllowScheduledTaskActivation') || !invoke.includes('-AllowScheduledTaskActivation:($p.ServiceKind -eq \'scheduled-task\')')) fail('controller and rollback must propagate explicit Scheduled Task activation authority');
if (/Register-ScheduledTask|Set-ScheduledTask/.test(`${restart}\n${common}\n${rollback}\n${invoke}`)) fail('runtime deployment path must not register or rewrite Scheduled Tasks');
for (const token of ['Assert-DeploymentMarkerSchema','Assert-ExactMarkerProperties',"'schemaVersion'", "'foreignIsolation'", "'startupBundle'", "'scheduled-task'", "'service'"]) if (!scripts.includes(token)) fail(`strict deployment marker schema control missing: ${token}`);
for (const token of ['Get-ManagedProductionEnvironmentNames','Assert-ProductionPositiveInteger','Read-ValidatedProductionEnvironment','Restore-ServerEnvironment','AUTH_SESSION_TTL_SECONDS','BOOTSTRAP_ADMIN_PASSWORD']) if (!scripts.includes(token)) fail(`production environment validation control missing: ${token}`);
if (/marker\.nginxExe\s+-and|marker\.nginxConfig\s+-and|marker\.service\.taskPath\s+-and|if\s*\(\$marker\.nodeExe\)/.test(scripts)) fail('strict marker authority contains a conditional bypass');
for (const token of ['"schemaVersion": 1','no unknown top-level or nested properties','`taskPath`','`pathName`']) if (!environmentConfiguration.includes(token)) fail(`strict marker documentation missing: ${token}`);
for (const token of ['RequireReviewedIsolation','KnownForeignRoot','KnownForeignName','Resolve-DatabaseVerifierExecutable','Get-SshPublicHostKeyEvidence','Get-SshFirewallEvidence']) if (!scripts.includes(token)) fail(`preflight evidence control missing: ${token}`);
for (const token of ['Resolve-ExpectedCandidateRuntimeName','Get-SshDirectConfigEvidence','Get-SshPortEvidence','ACTIVE_INCLUDE_REQUIRES_REVIEW']) if (!scripts.includes(token)) fail(`final preflight fail-closed control missing: ${token}`);
if (!workflow.includes('ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|ssh-rsa') || /rsa-sha2-(256|512)|HostKeyAlgorithms|PubkeyAcceptedAlgorithms/.test(workflow)) fail('known_hosts key-type contract is unsafe or inconsistent');
if (firstDeployRunbook.indexOf('production-protected-neighbor-discovery.ps1') < 0 || firstDeployRunbook.indexOf('production-protected-neighbor-discovery.ps1') >= firstDeployRunbook.indexOf('production-preflight-readonly.ps1')) fail('PASS 1 discovery must precede PASS 2 preflight in the first-deploy runbook');
for (const token of ["'TZ'",'Asia/Ho_Chi_Minh','missing a required variable']) if (!scripts.includes(token)) fail(`timezone contract missing: ${token}`);
if (workflow.includes('scp') && /\$remote:[^.]?\\/.test(workflow)) fail('SCP must use relative SFTP destinations, not unverified Windows backslashes.');
console.log(`[deployment-static] PASS (${required.length} scripts and forbidden-pattern scan)`);
