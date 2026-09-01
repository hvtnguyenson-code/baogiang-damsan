const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(root, '.github', 'workflows', 'deploy-production.yml');
const firstDeployRunbookPath = path.join(root, 'docs', 'operations', 'PRODUCTION-CD-FIRST-DEPLOY-RUNBOOK.md');
const environmentConfigurationPath = path.join(root, 'docs', 'operations', 'PRODUCTION-ENVIRONMENT-CONFIGURATION.md');
const scriptDir = path.join(root, 'scripts', 'deploy', 'windows');
const required = ['deployment-common.ps1','production-root-acl-plan.ps1','production-root-acl-verify.ps1','production-startup-bundle-plan.ps1','production-startup-bundle-verify.ps1','production-nginx-plan.ps1','production-nginx-verify.ps1','production-preflight-readonly.ps1','production-protected-neighbor-discovery.ps1','install-release.ps1','backup-database.ps1','run-migrations.ps1','sync-capability-catalog.ps1','switch-current-release.ps1','restart-baogiang-api.ps1','start-baogiang-api.ps1','validate-production-environment.ps1','test-production-health.ps1','rollback-release.ps1','invoke-production-deploy.ps1'];
const fail = (message) => { throw new Error(`[deployment-static] ${message}`); };
const read = (file) => fs.readFileSync(file, 'utf8');
if (!fs.existsSync(workflowPath)) fail('workflow is missing');
for (const file of required) if (!fs.existsSync(path.join(scriptDir, file))) fail(`required script is missing: ${file}`);
const workflow = read(workflowPath);
const firstDeployRunbook = read(firstDeployRunbookPath);
const environmentConfiguration = read(environmentConfigurationPath);
const remoteBuilder = read(path.join(root, 'scripts', 'ci', 'build-windows-remote-command.cjs'));
const handshakeEvidence = read(path.join(root, 'scripts', 'ci', 'resolve-startup-bundle-handshake-evidence.cjs'));
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
const preflight = read(path.join(scriptDir, 'production-preflight-readonly.ps1'));
const aclPlan = read(path.join(scriptDir, 'production-root-acl-plan.ps1'));
const aclVerify = read(path.join(scriptDir, 'production-root-acl-verify.ps1'));
const startupBundlePlan = read(path.join(scriptDir, 'production-startup-bundle-plan.ps1'));
const startupBundleVerify = read(path.join(scriptDir, 'production-startup-bundle-verify.ps1'));
const nginxPlan = read(path.join(scriptDir, 'production-nginx-plan.ps1'));
const nginxVerify = read(path.join(scriptDir, 'production-nginx-verify.ps1'));
const p1ReadOnlyReportTools = [['root ACL plan', aclPlan], ['root ACL verifier', aclVerify], ['startup bundle plan', startupBundlePlan], ['startup bundle verifier', startupBundleVerify]];
for (const [label, tool] of p1ReadOnlyReportTools) {
  const guard = tool.indexOf('Assert-SafeReadOnlyReportPath');
  const write = tool.indexOf('Set-Content -LiteralPath $canonicalReport');
  if (guard < 0 || write < 0 || guard >= write) fail(`${label} must authorize the shared report sink before Set-Content`);
}
for (const [label, aclTool] of [['plan', aclPlan], ['verifier', aclVerify]]) {
  if (/\b(Set-Acl|takeown|SetAccessRule|SetAccessRuleProtection|AddAccessRule|RemoveAccessRule|New-Item|Remove-Item)\b/i.test(aclTool)) fail(`ACL ${label} must remain read-only`);
  if (/\bicacls\b/i.test(aclTool)) fail(`ACL ${label} must not invoke icacls`);
  if (!aclTool.includes('mutationsPerformed = $false')) fail(`ACL ${label} must declare read-only evidence`);
  if (!aclTool.includes('Get-ProductionAclPolicy') || /function\s+Get-ProductionAclPolicy/i.test(aclTool)) fail(`ACL ${label} must consume the single shared policy authority`);
}
for (const [label, startupTool] of [['plan', startupBundlePlan], ['verifier', startupBundleVerify]]) {
  if (/\b(Copy-Item|Move-Item|Remove-Item|New-Item|Set-Acl|SetAccessRule|SetAccessRuleProtection|AddAccessRule|RemoveAccessRule)\b/i.test(startupTool)) fail(`startup bundle ${label} must remain read-only`);
  if (/\b(icacls|takeown)\b/i.test(startupTool)) fail(`startup bundle ${label} must not invoke ACL mutation utilities`);
  if (!`${startupTool}\n${label === 'plan' ? common : ''}`.includes('mutationsPerformed = $false')) fail(`startup bundle ${label} must declare read-only evidence`);
}
const startupPlanAuthority = `${startupBundlePlan}\n${common}`;
for (const token of ['READ_ONLY_STARTUP_BUNDLE_PLAN','Get-StartupBundleProvenancePlan','scripts/deploy/windows/start-baogiang-api.ps1','scripts/deploy/windows/deployment-common.ps1']) if (!startupPlanAuthority.includes(token)) fail(`startup provenance plan control missing: ${token}`);
for (const token of ['READ_ONLY_STARTUP_BUNDLE_VERIFY','Assert-StartupBundlePlanSchema','Get-ProductionAclPolicy','Get-ActualAclSnapshot','Compare-AclSnapshotToPolicy','INSTALL_REQUIRED','EXACT_BUNDLE_VERIFIED','PARTIAL_DESTINATION','HASH_MISMATCH','REPARSE_POINT','ACL_MISMATCH','UNEXPECTED_FILE']) if (!startupBundleVerify.includes(token)) fail(`startup bundle verifier control missing: ${token}`);
if (/function\s+(Get-ProductionAclPolicy|Normalize-AclRule|Compare-AclSnapshotToPolicy|Get-ActualAclSnapshot)/i.test(startupBundleVerify)) fail('startup verifier must consume, not duplicate, the shared ACL authority');
if (!common.includes("return @('releases','staging','incoming','shared','logs','backups')")) fail('exact required production-directory authority drifted');
for (const token of ['function Get-ProductionAclPolicy','function Normalize-AclRule','function Compare-AclSnapshotToPolicy','AreAccessRulesProtected','S-1-1-0','S-1-5-11','S-1-5-32-545']) if (!common.includes(token)) fail(`ACL authority control missing: ${token}`);
for (const token of ['function Get-CanonicalStartupBundleLayout','function Get-CanonicalStartupBundleLayoutFromWrapper','function Get-StartupBundleProvenancePlan','function Assert-StartupBundlePlanSchema',"'shared\\startup-bundles'",'cat-file','BaseStream']) if (!common.includes(token)) fail(`startup bundle shared authority control missing: ${token}`);
for (const token of ['function Assert-PathAncestorChainNonReparse','function Assert-SafeReadOnlyReportPath','Assert-PathAncestorChainNonReparse -Directory','Test-PathWithin -Path $canonicalReport','READ_ONLY_REPORT_PATH_CONFLICT','READ_ONLY_REPORT_PARENT_REPARSE_POINT','READ_ONLY_REPORT_ANCESTOR_REPARSE_POINT','READ_ONLY_REPORT_TARGET_REPARSE_POINT','READ_ONLY_REPORT_TARGET_TYPE_MISMATCH']) if (!common.includes(token)) fail(`shared read-only report boundary missing: ${token}`);
const reportGuardStart = common.indexOf('function Assert-SafeReadOnlyReportPath');
const reportGuardEnd = common.indexOf('function Assert-ExactChildPath', reportGuardStart);
if (!(common.indexOf('function Assert-PathAncestorChainNonReparse') < reportGuardStart && common.slice(reportGuardStart, reportGuardEnd).includes('Assert-PathAncestorChainNonReparse -Directory'))) fail('report sink guard must delegate to the shared ancestor-chain authority');
if (!startupBundlePlan.includes('-AdditionalProtectedRoot $canonicalRepository')) fail('startup provenance plan must exclude its source repository from report sinks');
if (!startupBundleVerify.includes('-ProtectedLeaf @($PlanPath)')) fail('startup verifier must protect its reviewed PlanPath from report overwrite');
if ((common.match(/function\s+Get-ProductionAclPolicy/g) || []).length !== 1) fail('ACL desired policy must have exactly one production authority');
for (const [label, nginxTool] of [['plan', nginxPlan], ['verifier', nginxVerify]]) {
  if (/\b(Set-Content|Copy-Item|Move-Item|Remove-Item|New-Item|Stop-Process|Start-Service|Stop-Service|Restart-Service|taskkill)\b/i.test(nginxTool)) fail(`Nginx ${label} contains a forbidden mutation`);
  if (/-s['"\s,]+(?:reload|stop|quit)/i.test(nginxTool)) fail(`Nginx ${label} must not execute a signal command`);
  if (!nginxTool.includes('Assert-SafeReadOnlyReportPath') || nginxTool.indexOf('Assert-SafeReadOnlyReportPath') > nginxTool.indexOf('[IO.File]::WriteAllText')) fail(`Nginx ${label} must guard its report before writing`);
  if (/function\s+(Get-NginxTokens|Read-NginxAst|Get-NginxEffectiveGraph|Get-CanonicalNginxManagedBytes)/i.test(nginxTool)) fail(`Nginx ${label} duplicates shared parser/policy authority`);
}
for (const token of ['function Get-NginxRuntimeBinding','reviewedNginxPrefix','function Get-NginxTokens','function Read-NginxAst','function Get-NginxEffectiveGraph','function Get-CanonicalNginxManagedBytes','function Invoke-ReviewedNginxSyntaxTest',"@('-p'", "'-t'", "'-c'"]) if (!common.includes(token)) fail(`Nginx shared authority missing: ${token}`);
for (const token of ['function Normalize-NginxExactServerName','function Get-NginxServerNameClassification',"kind='EXACT'","kind='WILDCARD'","kind='REGEX'",'ToLowerInvariant()','TrimEnd(\'.\')']) if (!common.includes(token)) fail(`Nginx hostname normalization authority missing: ${token}`);
const collisionAuthority = common.slice(common.indexOf('function Test-NginxServerClaims443Domain'), common.indexOf('function Get-CanonicalNginxManagedBytes'));
if (collisionAuthority.includes('-ccontains $Domain') || !collisionAuthority.includes('Get-NginxServerNameClassification') || !collisionAuthority.includes('normalizedExactName')) fail('Nginx collision authority must use normalized exact-name classification, not raw case-sensitive equality');
for (const token of ['function Assert-NginxPlanSchema','function Assert-NginxRollbackSnapshotEvidence','NGINX_ROLLBACK_SNAPSHOT_PROTECTED_LEAF','NGINX_ROLLBACK_SNAPSHOT_HASH_MISMATCH']) if (!common.includes(token)) fail(`Nginx rollback authority missing: ${token}`);
if ((common.match(/function\s+Assert-NginxPlanSchema/g) || []).length !== 1 || (common.match(/function\s+Assert-NginxRollbackSnapshotEvidence/g) || []).length !== 1) fail('Nginx schema and rollback snapshot must each have exactly one shared authority');
for (const [label, tool] of [['plan', nginxPlan], ['verifier', nginxVerify]]) {
  if (!tool.includes('Assert-NginxPlanSchema') || !tool.includes('Assert-NginxRollbackSnapshotEvidence')) fail(`Nginx ${label} must consume shared schema and rollback authorities`);
}
const snapshotAuthority = common.slice(common.indexOf('function Assert-NginxRollbackSnapshotEvidence'), common.indexOf('function Get-ManagedProductionEnvironmentNames'));
if (snapshotAuthority.indexOf('$TlsPrivateKey') < 0 || snapshotAuthority.indexOf('NGINX_ROLLBACK_SNAPSHOT_PROTECTED_LEAF') < 0 || snapshotAuthority.indexOf('Get-FileSha256FromBytes $snapshot') < 0 || snapshotAuthority.indexOf('$TlsPrivateKey') > snapshotAuthority.indexOf('Get-FileSha256FromBytes $snapshot') || snapshotAuthority.indexOf('NGINX_ROLLBACK_SNAPSHOT_PROTECTED_LEAF') > snapshotAuthority.indexOf('Get-FileSha256FromBytes $snapshot')) fail('snapshot authority must reject TLS private-key aliases before any snapshot byte hash');
if (nginxVerify.indexOf('Assert-NginxRollbackSnapshotEvidence') > nginxVerify.indexOf('Invoke-ReviewedNginxSyntaxTest') || !nginxVerify.includes('-RequireExact')) fail('Desired verifier must revalidate exact rollback material before Nginx syntax testing');
if (/Get-FileSha256FromBytes\s+\$(?:RollbackSnapshot|snapshotPath)/i.test(nginxPlan)) fail('Nginx plan must not bypass the shared rollback snapshot authority');
if (!invoke.includes('Invoke-ReviewedNginxSyntaxTest') || invoke.indexOf('Invoke-ReviewedNginxSyntaxTest') > invoke.indexOf('Move-Item -LiteralPath $source')) fail('controller must run the reviewed prefix-bound syntax test before mutation');
if (/(?:ReadAllBytes|Get-FileSha256FromBytes|Get-Content)\s*\(?(?:\$privateKey|\$TlsPrivateKey|[^\r\n]*\.tlsPrivateKey)/i.test(`${common}\n${nginxPlan}\n${nginxVerify}`)) fail('Nginx authority must never read or hash TLS private-key contents');
if (!(common.indexOf('Assert-ExistingNonReparseDirectory -Path $canonicalRoot -Role PRODUCTION_ROOT') < common.indexOf("$markerPath = Join-Path $canonicalRoot 'shared\\deployment-identity.json'"))) fail('Read-DeploymentIdentity must reject root reparse before reading the marker');
const workflowValidation = workflow.slice(workflow.indexOf('- name: Validate target, pinned SSH identity and environment contract'), workflow.indexOf('- name: Verify exact target CI success'));
if (!workflowValidation.includes('[[ "$PROD_SERVICE_KIND" == "scheduled-task" ]]') || !workflowValidation.includes('Production CD currently supports scheduled-task only.')) fail('production workflow must restrict runtime kind to scheduled-task only');
if (/\bservice\b/.test(workflowValidation)) fail('production workflow validation must not permit service runtime kind');
for (const remoteStep of ['Derive active startup-bundle Git evidence','Prepare pinned SSH files','Read-only marker handshake before transfer','Revalidate authority and prepare unique transfer directory','Upload reviewed transfer bundle through SFTP']) if (workflow.indexOf('[[ "$PROD_SERVICE_KIND" == "scheduled-task" ]]') >= workflow.indexOf(remoteStep)) fail(`scheduled-task-only gate must precede remote step: ${remoteStep}`);
for (const token of ['Get-DeploymentMarkerAuthorityContractVersion','return 1','PRODUCTION_ROOT_ANCESTOR_REPARSE_POINT','PRODUCTION_ROOT_ANCESTOR_UNVERIFIABLE']) if (!common.includes(token)) fail(`P2 shared root/marker authority missing: ${token}`);
for (const token of ['Read-DeploymentIdentity','HANDSHAKE_COMMON_HASH_MISMATCH','. $common','buildPrepareTransfer','BAOGIANG_PREPARE_TRANSFER_PASS','New-Item -ItemType Directory','CLEANUP_REPARSE_POINT','Remove-Item -LiteralPath $candidate']) if (!remoteBuilder.includes(token)) fail(`P2 remote authority missing: ${token}`);
if (remoteBuilder.indexOf('HANDSHAKE_COMMON_HASH_MISMATCH') > remoteBuilder.indexOf('. $common')) fail('common must be hash-verified before dot-source');
if (remoteBuilder.indexOf('Read-DeploymentIdentity') > remoteBuilder.indexOf('New-Item -ItemType Directory')) fail('prepare-transfer must revalidate shared marker authority before New-Item');
if (/Get-Content[^\n]*deployment-identity|ConvertFrom-Json|\$marker\.(?:systemId|canonicalRoot|domain|apiPort|service)/.test(remoteBuilder)) fail('remote command builder must not implement marker semantics');
for (const token of ["spawnSync('git'",'cat-file','encoding, maxBuffer','crypto.createHash(\'sha256\')','rev-list','--first-parent','wrapperGitBlobOid','commonGitBlobOid']) if (!handshakeEvidence.includes(token)) fail(`Git-blob handshake evidence missing: ${token}`);
if (workflow.indexOf('Revalidate authority and prepare unique transfer directory') > workflow.indexOf('Upload reviewed transfer bundle through SFTP')) fail('SFTP must follow prepare-transfer');
if (!common.includes('function Assert-ProductionRuntimeKindSupported') || !common.includes('function Assert-PreflightRuntimeKindSupported') || !common.includes('SERVICE_FIRST_DEPLOY_UNSUPPORTED')) fail('shared first-deploy runtime-kind guards are missing');
if (!common.includes('if ($RequireReviewedIsolation) { Assert-ProductionRuntimeKindSupported -ServiceKind $ServiceKind -FirstDeploy $true }')) fail('preflight runtime-kind guard must invoke the strict guard only for reviewed isolation');
if (!(preflight.indexOf('Assert-PreflightRuntimeKindSupported') < preflight.indexOf('Resolve-ExpectedCandidateRuntimeName'))) fail('preflight must reject unsupported first-deploy runtime kinds before candidate authority');
for (const mutation of ['Move-Item -LiteralPath $source','install-release.ps1','backup-database.ps1','run-migrations.ps1','switch-current-release.ps1']) if (invoke.indexOf('Assert-ProductionRuntimeKindSupported') >= invoke.indexOf(mutation)) fail(`controller first-deploy runtime-kind guard must precede: ${mutation}`);
if (!(common.indexOf('Assert-ScheduledTaskActivationAuthorized') < common.indexOf('& $Enable $Context $task') && restart.indexOf('Enable-ScheduledTask') < restart.indexOf('Start-ScheduledTask'))) fail('Scheduled Task activation must authorize then enable before start');
if (!common.includes('Invoke-ScheduledTaskActivationLifecycle') || !common.includes('Assert-ScheduledTaskHealthyState -Task $finalTask')) fail('Scheduled Task post-activation verification must remain inside the activation lifecycle');
if (!common.includes("Assert-ScheduledTaskHealthyState -Task $finalTask")) fail('final Scheduled Task healthy state must require Running');
if (!(common.indexOf('Disable-ScheduledTask') < common.indexOf('Stop-ScheduledTask'))) fail('Scheduled Task safe-stop must disable before stop');
if (!rollback.includes('-AllowScheduledTaskActivation:$AllowScheduledTaskActivation') || !invoke.includes('-AllowScheduledTaskActivation:($p.ServiceKind -eq \'scheduled-task\')')) fail('controller and rollback must propagate explicit Scheduled Task activation authority');
if (!common.includes('ROLLBACK_HEALTH_FAILED_AND_SAFE_STOP_FAILED') || !rollback.includes('Invoke-ScheduledTaskRollbackLifecycle')) fail('rollback health failure must own Scheduled Task safe-stop');
if (!common.includes('Get-DeploymentFailureRecoveryDecision') || !invoke.includes('COMPATIBILITY_SAFE_STOP')) fail('post-migration compatibility recovery decision is missing');
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
