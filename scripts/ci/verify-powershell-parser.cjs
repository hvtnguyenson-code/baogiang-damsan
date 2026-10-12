const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const command = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const script = `
$root = $env:DEPLOY_REPO_ROOT
$errors = @()
Get-ChildItem -LiteralPath (Join-Path $root 'scripts/deploy/windows') -Filter '*.ps1' | ForEach-Object {
  $tokens = $null; $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
  foreach ($parseError in @($parseErrors)) { $errors += ('{0}:{1}:{2} {3}' -f $_.Name, $parseError.Extent.StartLineNumber, $parseError.Extent.StartColumnNumber, $parseError.Message) }
}
if ($errors.Count -gt 0) { Write-Error ($errors -join ', '); exit 1 }
Write-Output 'PowerShell parser PASS'
`;
const result = spawnSync(command, ['-NoLogo','-NoProfile','-NonInteractive','-Command',script], { cwd: root, env: { ...process.env, DEPLOY_REPO_ROOT: root }, encoding: 'utf8' });
if (result.error) throw new Error(`[powershell-parser] ${result.error.message}`);
process.stdout.write(result.stdout); process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status || 1);
