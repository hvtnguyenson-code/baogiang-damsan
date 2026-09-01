[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$RepositoryRoot,
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$NginxExe,
  [Parameter(Mandatory=$true)][string]$NginxPrefix,
  [Parameter(Mandatory=$true)][string]$NginxConfig,
  [Parameter(Mandatory=$true)][string]$ManagedConfig,
  [Parameter(Mandatory=$true)][string]$TlsCertificate,
  [Parameter(Mandatory=$true)][string]$TlsPrivateKey,
  [Parameter(Mandatory=$true)][string]$ClientMaxBodySize,
  [string]$RollbackSnapshot = '',
  [Parameter(Mandatory=$true)][string]$ReportPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')

$binding = Get-NginxRuntimeBinding -Root $Root -NginxExe $NginxExe -NginxPrefix $NginxPrefix -NginxConfig $NginxConfig
$repository = Assert-ExistingDirectory $RepositoryRoot
$managed = Get-CanonicalPath $ManagedConfig
if (-not (Test-PathWithin $managed $binding.nginxPrefix) -or (Normalize-ComparablePath $managed) -eq (Normalize-ComparablePath $binding.nginxConfig)) { throw 'NGINX_MANAGED_BOUNDARY_INVALID' }
Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $managed) | Out-Null
$managedClassification = Get-PathSecurityClassification -Path $managed -Kind file
if ($managedClassification.state -notin @('PASS','MISSING')) { throw 'NGINX_MANAGED_FILE_INVALID' }
$certificate = Assert-NginxTlsLeafMetadata $TlsCertificate 'CERTIFICATE'
$privateKey = Assert-NginxTlsLeafMetadata $TlsPrivateKey 'PRIVATE_KEY'
$safeReport = Assert-SafeReadOnlyReportPath -ReportPath $ReportPath -ProductionRoot $binding.root -AdditionalProtectedRoot $binding.nginxPrefix -ProtectedLeaf @($binding.nginxExe,$binding.nginxConfig,$managed,$certificate,$privateKey,$RollbackSnapshot,$binding.markerPath)
if (Test-PathWithin $safeReport $repository) { throw 'READ_ONLY_REPORT_PATH_CONFLICT' }

$desiredBytes = Get-CanonicalNginxManagedBytes -Root $binding.root -CertificatePath $certificate -PrivateKeyPath $privateKey -ClientMaxBodySize $ClientMaxBodySize
$desiredHash = Get-Sha256FromBytes $desiredBytes
$state = 'READY_FOR_MANUAL_APPLY'; $reason = $null
try { $graph = Get-NginxEffectiveGraph -NginxPrefix $binding.nginxPrefix -NginxConfig $binding.nginxConfig -PlannedManagedPath $managed }
catch { $state = if ($_.Exception.Message -match 'BOUNDARY|UNRESOLVED') { 'BLOCKED_INCLUDE_BOUNDARY' } else { 'CONFLICT' }; $reason = $_.Exception.Message; $graph = $null }

$preState = if ($managedClassification.state -eq 'MISSING') { [pscustomobject][ordered]@{state='MISSING';sha256=$null;restoreAction='REMOVE_EXACT_MANAGED_FILE'} } else { [pscustomobject][ordered]@{state='EXISTS';sha256=(Get-FileSha256FromBytes $managed);restoreAction='RESTORE_EXACT_SNAPSHOT_BYTES'} }
$snapshot = [pscustomobject][ordered]@{path=$null;sha256=$null;state=if($preState.state -eq 'MISSING'){'NOT_REQUIRED'}else{'REQUIRED'} }
if ($preState.state -eq 'EXISTS') {
  if ([string]::IsNullOrWhiteSpace($RollbackSnapshot)) { if ($state -eq 'READY_FOR_MANUAL_APPLY') { $state='SNAPSHOT_REQUIRED' } }
  else {
    $snapshot = Assert-NginxRollbackSnapshotEvidence -SnapshotPath $RollbackSnapshot -ProductionRoot $binding.root -NginxPrefix $binding.nginxPrefix -RepositoryRoot $repository -ManagedConfig $managed -NginxExe $binding.nginxExe -NginxConfig $binding.nginxConfig -MarkerPath $binding.markerPath -TlsCertificate $certificate -TlsPrivateKey $privateKey -ReportPath $safeReport -ExpectedSha256 $preState.sha256
    if ($snapshot.state -cne 'EXACT' -and $state -eq 'READY_FOR_MANUAL_APPLY') { $state='SNAPSHOT_REQUIRED' }
  }
}
if ($null -ne $graph) {
  $activates = @($graph.includes | Where-Object { $_.plannedMatch -or @($_.matches | Where-Object { (Normalize-ComparablePath $_) -eq (Normalize-ComparablePath $managed) }).Count -gt 0 }).Count -gt 0
  if (-not $activates) { $state='BLOCKED_INCLUDE_BOUNDARY'; $reason='NGINX_MANAGED_INCLUDE_NOT_ACTIVE' }
  $collisions = @($graph.servers | Where-Object { (Normalize-ComparablePath $_.file) -ne (Normalize-ComparablePath $managed) -and (Test-NginxServerClaims443Domain $_) })
  if ($collisions.Count -gt 0) { $state='CONFLICT'; $reason='NGINX_DOMAIN_443_COLLISION' }
}
$report = [pscustomobject][ordered]@{
  schemaVersion=1; mode='READ_ONLY_NGINX_PLAN'; mutationsPerformed=$false; state=$state; reason=$reason; domain='baogiang.dtnt-damsan.edu.vn'
  binding=[pscustomobject][ordered]@{root=$binding.root;nginxExe=$binding.nginxExe;nginxPrefix=$binding.nginxPrefix;nginxConfig=$binding.nginxConfig;managedConfig=$managed;tlsCertificate=$certificate;tlsPrivateKey=$privateKey;clientMaxBodySize=$ClientMaxBodySize;repositoryRoot=$repository}
  desired=[pscustomobject][ordered]@{encoding='UTF-8_NO_BOM';eol='LF';sha256=$desiredHash;contentBase64=[Convert]::ToBase64String($desiredBytes)}
  preState=$preState; rollbackSnapshot=$snapshot
  neighbors=if($null -ne $graph){@(Get-NginxNeighborSnapshot $graph $managed)}else{@()}
  preGraphFiles=if($null -ne $graph){@($graph.files.path | Sort-Object)}else{@()}
  commands=Get-NginxCommandPlan $binding.nginxExe $binding.nginxPrefix $binding.nginxConfig
  safety=[pscustomobject][ordered]@{configMutationPerformed=$false;reloadExecuted=$false;privateKeyContentRead=$false}
}
Assert-NginxPlanSchema $report | Out-Null
[IO.File]::WriteAllText($safeReport,($report|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
Write-Output ($report|ConvertTo-Json -Depth 12)
