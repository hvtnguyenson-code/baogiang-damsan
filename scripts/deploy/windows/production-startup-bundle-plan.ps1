[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReviewedCommitSha,
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$ReportPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')

$canonicalRoot = Assert-DedicatedRoot $Root
$canonicalRepository = Assert-ExistingDirectory $RepositoryRoot
$canonicalReport = Assert-SafeReadOnlyReportPath -ReportPath $ReportPath -ProductionRoot $canonicalRoot -AdditionalProtectedRoot $canonicalRepository
$report = Get-StartupBundleProvenancePlan -RepositoryRoot $canonicalRepository -ReviewedCommitSha $ReviewedCommitSha -Root $canonicalRoot
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $canonicalReport -Encoding UTF8
$report
