const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(root, '.github', 'workflows', 'deploy-production.yml');
const scriptDir = path.join(root, 'scripts', 'deploy', 'windows');
const required = ['production-preflight-readonly.ps1','install-release.ps1','backup-database.ps1','run-migrations.ps1','switch-current-release.ps1','restart-baogiang-api.ps1','test-production-health.ps1','rollback-release.ps1','invoke-production-deploy.ps1'];
const fail = (message) => { throw new Error(`[deployment-static] ${message}`); };
const read = (file) => fs.readFileSync(file, 'utf8');
if (!fs.existsSync(workflowPath)) fail('workflow is missing');
for (const file of required) if (!fs.existsSync(path.join(scriptDir, file))) fail(`required script is missing: ${file}`);
const workflow = read(workflowPath);
if (!/workflow_dispatch:/.test(workflow) || /(^|\n)\s+(push|pull_request):/.test(workflow)) fail('deployment trigger must be workflow_dispatch only');
for (const token of ['environment: production','cancel-in-progress: false','confirmation:','commit_sha:','StrictHostKeyChecking=yes','merge-base --is-ancestor','workflow_runs']) if (!workflow.includes(token)) fail(`workflow gate missing: ${token}`);
const scripts = required.map((file) => read(path.join(scriptDir, file))).join('\n');
const forbidden = [
  /StrictHostKeyChecking\s*=\s*no/i, /taskkill\s+\/IM\s+node\.exe/i, /\b(reboot|shutdown)\b/i,
  /Restart-Service[^\r\n]*(postgres|nginx)/i, /Stop-Service[^\r\n]*nginx/i,
  /prisma\s+migrate\s+reset/i, /prisma\s+db\s+push/i, /prisma\s+db\s+seed/i,
  /while\s*\(\s*\$?true\s*\)/i, /sleep\s+\d+\s*$/im,
  /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/i, /postgres(?:ql)?:\/\/[^\s<]+:[^\s<]+@/i
];
for (const pattern of forbidden) if (pattern.test(scripts)) fail(`forbidden deployment construct: ${pattern}`);
for (const token of ['Set-StrictMode -Version Latest','$ErrorActionPreference = \'Stop\'','ValidatePattern','ValidateScript','migrate status','migrate deploy','BackupVerified','ExpectedEntryPoint','MaxAttempts']) if (!scripts.includes(token)) fail(`fail-closed control missing: ${token}`);
console.log(`[deployment-static] PASS (${required.length} scripts, workflow and forbidden-pattern scan)`);
