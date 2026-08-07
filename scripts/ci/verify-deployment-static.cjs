const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(root, '.github', 'workflows', 'deploy-production.yml');
const scriptDir = path.join(root, 'scripts', 'deploy', 'windows');
const required = ['deployment-common.ps1','production-preflight-readonly.ps1','install-release.ps1','backup-database.ps1','run-migrations.ps1','switch-current-release.ps1','restart-baogiang-api.ps1','start-baogiang-api.ps1','test-production-health.ps1','rollback-release.ps1','invoke-production-deploy.ps1'];
const fail = (message) => { throw new Error(`[deployment-static] ${message}`); };
const read = (file) => fs.readFileSync(file, 'utf8');
if (!fs.existsSync(workflowPath)) fail('workflow is missing');
for (const file of required) if (!fs.existsSync(path.join(scriptDir, file))) fail(`required script is missing: ${file}`);
const workflow = read(workflowPath);
if (!/^on:\s*$/m.test(workflow) || !/^\s{2}workflow_dispatch:\s*$/m.test(workflow)) fail('manual workflow_dispatch contract is missing');
if (/^\s{2}(push|pull_request):\s*$/m.test(workflow)) fail('deployment workflow must not have push/pull_request triggers');
for (const token of ['environment: production','cancel-in-progress: false','confirmation:','commit_sha:','StrictHostKeyChecking=yes','merge-base --is-ancestor','workflow_runs','git -C control-plane archive --format=zip','upload-artifact@v4','if: always()','-EncodedCommand','Read-only marker handshake before transfer','control-$run_id-$TARGET_SHA']) if (!workflow.includes(token)) fail(`workflow gate missing: ${token}`);
const scripts = required.map((file) => read(path.join(scriptDir, file))).join('\n');
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
if (workflow.includes('scp') && /\$remote:[^.]?\\/.test(workflow)) fail('SCP must use relative SFTP destinations, not unverified Windows backslashes.');
console.log(`[deployment-static] PASS (${required.length} scripts and forbidden-pattern scan)`);
