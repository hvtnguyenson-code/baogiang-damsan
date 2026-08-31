[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$DeploymentIdentity,
  [Parameter(Mandatory = $true)][string]$ApiRuntimeIdentity,
  [Parameter(Mandatory = $true)][string]$WebRuntimeIdentity,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ReportPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')

$canonicalRoot = Assert-DedicatedRoot $Root
$canonicalReport = Assert-SafeReadOnlyReportPath -ReportPath $ReportPath -ProductionRoot $canonicalRoot
$report = [pscustomobject][ordered]@{
  schemaVersion = 1
  mode = 'READ_ONLY_ACL_PLAN'
  mutationsPerformed = $false
  policy = Get-ProductionAclPolicy -CanonicalRoot $canonicalRoot -DeploymentIdentity $DeploymentIdentity -ApiRuntimeIdentity $ApiRuntimeIdentity -WebRuntimeIdentity $WebRuntimeIdentity -EnvFile $EnvFile -StartupWrapper $StartupWrapper
}
$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $canonicalReport -Encoding UTF8
$report
