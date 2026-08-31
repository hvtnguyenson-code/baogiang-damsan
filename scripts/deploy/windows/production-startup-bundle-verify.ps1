[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PlanPath,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedPlanSha256,
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$DeploymentIdentity,
  [Parameter(Mandatory = $true)][string]$ApiRuntimeIdentity,
  [Parameter(Mandatory = $true)][string]$WebRuntimeIdentity,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$ReportPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')

$canonicalRoot = Assert-DedicatedRoot $Root
$canonicalReport = Assert-SafeReadOnlyReportPath -ReportPath $ReportPath -ProductionRoot $canonicalRoot -ProtectedLeaf @($PlanPath)
function Write-StartupBundleVerification([string]$State,[string]$Category,[object[]]$Checks) {
  $report = [pscustomobject][ordered]@{
    schemaVersion = 1
    mode = 'READ_ONLY_STARTUP_BUNDLE_VERIFY'
    mutationsPerformed = $false
    canonicalRoot = $canonicalRoot
    state = $State
    category = $Category
    checks = @($Checks)
  }
  $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $canonicalReport -Encoding UTF8
  return $report
}

$planValidationPhase = 'PLAN_PATH'
try {
  $planClassification = Get-PathSecurityClassification -Path $PlanPath -Kind file
  if ($planClassification.state -ne 'PASS') { throw 'STARTUP_BUNDLE_PLAN_INVALID' }
  $planValidationPhase = 'PLAN_DIGEST'
  $actualPlanSha256 = Get-Sha256FromBytes -Bytes ([System.IO.File]::ReadAllBytes($PlanPath))
  if ($actualPlanSha256 -ine $ExpectedPlanSha256) { throw 'STARTUP_BUNDLE_PLAN_INVALID' }
  $planValidationPhase = 'PLAN_JSON'
  $plan = Get-Content -LiteralPath $PlanPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $planValidationPhase = 'PLAN_SCHEMA'
  Assert-StartupBundlePlanSchema -Plan $plan -Root $canonicalRoot | Out-Null
} catch {
  Write-StartupBundleVerification -State CONFLICT -Category PLAN_INVALID -Checks @([pscustomobject]@{ state = $planValidationPhase }) | Out-Null
  throw 'STARTUP_BUNDLE_VERIFY_FAILED'
}

$layout = $plan.destination
$bundleRootState = Get-PathSecurityClassification -Path $layout.bundleRoot -Kind directory
if ($bundleRootState.state -eq 'MISSING') { return Write-StartupBundleVerification -State INSTALL_REQUIRED -Category DESTINATION_MISSING -Checks @($bundleRootState) }
if ($bundleRootState.state -eq 'REPARSE_POINT') { Write-StartupBundleVerification -State CONFLICT -Category REPARSE_POINT -Checks @($bundleRootState) | Out-Null; throw 'STARTUP_BUNDLE_VERIFY_FAILED' }
if ($bundleRootState.state -ne 'PASS') { Write-StartupBundleVerification -State CONFLICT -Category LAYOUT_CONFLICT -Checks @($bundleRootState) | Out-Null; throw 'STARTUP_BUNDLE_VERIFY_FAILED' }

$versionState = Get-PathSecurityClassification -Path $layout.versionDirectory -Kind directory
if ($versionState.state -eq 'MISSING') { return Write-StartupBundleVerification -State INSTALL_REQUIRED -Category DESTINATION_MISSING -Checks @($bundleRootState,$versionState) }
if ($versionState.state -eq 'REPARSE_POINT') { Write-StartupBundleVerification -State CONFLICT -Category REPARSE_POINT -Checks @($bundleRootState,$versionState) | Out-Null; throw 'STARTUP_BUNDLE_VERIFY_FAILED' }
if ($versionState.state -ne 'PASS') { Write-StartupBundleVerification -State CONFLICT -Category LAYOUT_CONFLICT -Checks @($bundleRootState,$versionState) | Out-Null; throw 'STARTUP_BUNDLE_VERIFY_FAILED' }

$entries = @(Get-ChildItem -LiteralPath $layout.versionDirectory -Force -ErrorAction Stop)
$expectedNames = @('start-baogiang-api.ps1','deployment-common.ps1')
$unexpected = @($entries | Where-Object { -not ($expectedNames -ccontains $_.Name) })
if ($unexpected.Count -gt 0 -or $entries.Count -gt 2) { Write-StartupBundleVerification -State CONFLICT -Category UNEXPECTED_FILE -Checks @($bundleRootState,$versionState) | Out-Null; throw 'STARTUP_BUNDLE_VERIFY_FAILED' }
if ($entries.Count -ne 2) { Write-StartupBundleVerification -State CONFLICT -Category PARTIAL_DESTINATION -Checks @($bundleRootState,$versionState) | Out-Null; throw 'STARTUP_BUNDLE_VERIFY_FAILED' }

$fileChecks = [Collections.Generic.List[object]]::new()
foreach ($fileSpec in @(
  @{ path = $layout.wrapperPath; sha256 = $plan.source.wrapper.sha256 },
  @{ path = $layout.commonPath; sha256 = $plan.source.common.sha256 }
)) {
  $classification = Get-PathSecurityClassification -Path $fileSpec.path -Kind file
  $fileChecks.Add($classification)
  if ($classification.state -eq 'REPARSE_POINT') { Write-StartupBundleVerification -State CONFLICT -Category REPARSE_POINT -Checks (@($bundleRootState,$versionState) + @($fileChecks)) | Out-Null; throw 'STARTUP_BUNDLE_VERIFY_FAILED' }
  if ($classification.state -ne 'PASS') { Write-StartupBundleVerification -State CONFLICT -Category LAYOUT_CONFLICT -Checks (@($bundleRootState,$versionState) + @($fileChecks)) | Out-Null; throw 'STARTUP_BUNDLE_VERIFY_FAILED' }
  $actualFileSha256 = Get-Sha256FromBytes -Bytes ([System.IO.File]::ReadAllBytes($fileSpec.path))
  if ($actualFileSha256 -ine $fileSpec.sha256) { Write-StartupBundleVerification -State CONFLICT -Category HASH_MISMATCH -Checks (@($bundleRootState,$versionState) + @($fileChecks)) | Out-Null; throw 'STARTUP_BUNDLE_VERIFY_FAILED' }
}

$aclPolicy = Get-ProductionAclPolicy -CanonicalRoot $canonicalRoot -DeploymentIdentity $DeploymentIdentity -ApiRuntimeIdentity $ApiRuntimeIdentity -WebRuntimeIdentity $WebRuntimeIdentity -EnvFile $EnvFile -StartupWrapper $layout.wrapperPath
$startupPaths = @(@($layout.bundleRoot,$layout.versionDirectory,$layout.wrapperPath,$layout.commonPath) | ForEach-Object { Normalize-ComparablePath $_ })
$aclChecks = [Collections.Generic.List[object]]::new()
foreach ($policyPath in @($aclPolicy.protectedPaths | Where-Object { $startupPaths -contains (Normalize-ComparablePath $_.path) })) {
  try {
    $comparison = Compare-AclSnapshotToPolicy -PolicyPath $policyPath -Snapshot (Get-ActualAclSnapshot -Path $policyPath.path)
    $aclChecks.Add([pscustomobject]@{ path = $policyPath.path; state = $comparison.state; issues = @($comparison.issues) })
  } catch { $aclChecks.Add([pscustomobject]@{ path = $policyPath.path; state = 'ACL_READ_FAILED'; issues = @('ACL_READ_FAILED') }) }
}
if ($aclChecks.Count -ne 4 -or @($aclChecks | Where-Object { $_.state -ne 'PASS' }).Count -gt 0) { Write-StartupBundleVerification -State CONFLICT -Category ACL_MISMATCH -Checks (@($bundleRootState,$versionState) + @($fileChecks) + @($aclChecks)) | Out-Null; throw 'STARTUP_BUNDLE_VERIFY_FAILED' }

Write-StartupBundleVerification -State PASS -Category EXACT_BUNDLE_VERIFIED -Checks (@($bundleRootState,$versionState) + @($fileChecks) + @($aclChecks))
