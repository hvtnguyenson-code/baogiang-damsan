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

$canonicalReport = Get-CanonicalPath $ReportPath
Assert-ExistingDirectory (Split-Path -Parent $canonicalReport) | Out-Null
function Write-AclVerificationReport([string]$State,[string]$CanonicalRoot,[object[]]$Results) {
  $report = [pscustomobject][ordered]@{
    schemaVersion = 1
    mode = 'READ_ONLY_ACL_VERIFY'
    mutationsPerformed = $false
    canonicalRoot = $CanonicalRoot
    state = $State
    results = @($Results)
    limitation = 'DACL shape only; reviewed nested local/domain group membership remains operator evidence.'
  }
  $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $canonicalReport -Encoding UTF8
  return $report
}

$canonicalRoot = Assert-DedicatedRoot $Root
$rootClassification = Get-PathSecurityClassification -Path $canonicalRoot -Kind directory
if ($rootClassification.state -ne 'PASS') {
  Write-AclVerificationReport -State FAIL -CanonicalRoot $canonicalRoot -Results @([pscustomobject][ordered]@{ path = $canonicalRoot; kind = 'directory'; state = $rootClassification.state; issues = @($rootClassification.state); broadPrincipalDetected = $false }) | Out-Null
  throw 'PRODUCTION_ROOT_ACL_VERIFY_FAILED'
}
$directoryGateResults = [Collections.Generic.List[object]]::new()
foreach ($name in Get-ProductionRequiredDirectoryNames) {
  $requiredPath = Join-Path $canonicalRoot $name
  $classification = Get-PathSecurityClassification -Path $requiredPath -Kind directory
  $directoryGateResults.Add([pscustomobject][ordered]@{ path = $requiredPath; kind = 'directory'; state = $classification.state; issues = if ($classification.state -eq 'PASS') { @() } else { @($classification.state) }; broadPrincipalDetected = $false })
}
if (@($directoryGateResults | Where-Object { $_.state -ne 'PASS' }).Count -gt 0) {
  Write-AclVerificationReport -State FAIL -CanonicalRoot $canonicalRoot -Results @($directoryGateResults) | Out-Null
  throw 'PRODUCTION_ROOT_ACL_VERIFY_FAILED'
}

$policy = Get-ProductionAclPolicy -CanonicalRoot $Root -DeploymentIdentity $DeploymentIdentity -ApiRuntimeIdentity $ApiRuntimeIdentity -WebRuntimeIdentity $WebRuntimeIdentity -EnvFile $EnvFile -StartupWrapper $StartupWrapper
$results = [Collections.Generic.List[object]]::new()
$broadSids = @('S-1-1-0','S-1-5-11','S-1-5-32-545')
foreach ($policyPath in $policy.protectedPaths) {
  $classification = Get-PathSecurityClassification -Path $policyPath.path -Kind $policyPath.kind
  if ($classification.state -ne 'PASS') {
    $results.Add([pscustomobject][ordered]@{ path = $policyPath.path; kind = $policyPath.kind; state = $classification.state; issues = @($classification.state); broadPrincipalDetected = $false })
    continue
  }
  try {
    $snapshot = Get-ActualAclSnapshot -Path $policyPath.path
    $comparison = Compare-AclSnapshotToPolicy -PolicyPath $policyPath -Snapshot $snapshot
    $broadDetected = @($snapshot.access | Where-Object { $_.sid -in $broadSids }).Count -gt 0
    $results.Add([pscustomobject][ordered]@{
      path = $policyPath.path
      kind = $policyPath.kind
      state = $comparison.state
      issues = @($comparison.issues)
      broadPrincipalDetected = $broadDetected
      inheritanceProtected = $snapshot.inheritanceProtected
      actualAces = @($snapshot.access)
    })
  } catch {
    $results.Add([pscustomobject][ordered]@{ path = $policyPath.path; kind = $policyPath.kind; state = 'ACL_READ_FAILED'; issues = @('ACL_READ_FAILED'); broadPrincipalDetected = $false })
  }
}

$overallState = if (@($results | Where-Object { $_.state -ne 'PASS' }).Count -eq 0) { 'PASS' } else { 'FAIL' }
$report = Write-AclVerificationReport -State $overallState -CanonicalRoot $policy.canonicalRoot -Results @($results)
if ($overallState -ne 'PASS') { throw 'PRODUCTION_ROOT_ACL_VERIFY_FAILED' }
$report
