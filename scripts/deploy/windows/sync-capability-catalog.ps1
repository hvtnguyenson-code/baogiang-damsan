[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReleaseSha,
  [Parameter(Mandatory = $true)][string]$ReleasePath,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NodeExe,
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][string]$ServiceName,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ExpectedEntryPoint,
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$ExpectedBaseUrl,
  [Parameter(Mandatory = $true)][switch]$BackupVerified
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
if (-not $BackupVerified) { throw 'A verified database backup is required before capability catalog synchronization.' }
$identity = Read-DeploymentIdentity -Root $Root -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint -NodeExe $NodeExe
$canonicalRoot = $identity.canonicalRoot
$release = Assert-ExactReleasePath -Root $canonicalRoot -ReleaseSha $ReleaseSha -ReleasePath $ReleasePath
Assert-ExecutableContract @{ NodeExe = $NodeExe }
$environmentSnapshot = Import-ServerEnvironment -EnvFile $EnvFile -ExpectedBaseUrl $ExpectedBaseUrl
try {
  $cli = Join-Path $release 'scripts\deploy\node\sync-capability-catalog.cjs'
  if (-not (Test-Path -LiteralPath $cli -PathType Leaf) -or -not (Test-PathWithin (Get-CanonicalPath $cli) $release)) { throw 'Capability catalog CLI is missing from the exact release.' }
  $output = @(& $NodeExe $cli)
  if ($LASTEXITCODE -ne 0) { throw "Capability catalog synchronization failed with exit code $LASTEXITCODE." }
  $summary = $output | Select-Object -Last 1 | ConvertFrom-Json
  if ($summary.state -ne 'completed' -or [int]$summary.expectedDefinitionCount -ne [int]$summary.verifiedDefinitionCount) { throw 'Capability catalog synchronization returned an invalid summary.' }
  Write-Output ($summary | ConvertTo-Json -Compress)
} finally { Restore-ServerEnvironment -Snapshot $environmentSnapshot }
