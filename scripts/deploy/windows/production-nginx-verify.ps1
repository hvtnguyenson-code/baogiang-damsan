[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('Desired','Restored')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$PlanPath,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedPlanSha256,
  [Parameter(Mandatory=$true)][string]$RepositoryRoot,
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$NginxExe,
  [Parameter(Mandatory=$true)][string]$NginxPrefix,
  [Parameter(Mandatory=$true)][string]$NginxConfig,
  [Parameter(Mandatory=$true)][string]$ManagedConfig,
  [Parameter(Mandatory=$true)][string]$TlsCertificate,
  [Parameter(Mandatory=$true)][string]$TlsPrivateKey,
  [Parameter(Mandatory=$true)][string]$ClientMaxBodySize,
  [Parameter(Mandatory=$true)][string]$ReportPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')

$binding = Get-NginxRuntimeBinding -Root $Root -NginxExe $NginxExe -NginxPrefix $NginxPrefix -NginxConfig $NginxConfig
$repository = Assert-ExistingDirectory $RepositoryRoot
$planFile = Get-CanonicalPath $PlanPath
Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $planFile) | Out-Null
if ((Get-PathSecurityClassification $planFile file).state -ne 'PASS' -or (Get-FileSha256FromBytes $planFile) -ine $ExpectedPlanSha256) { throw 'NGINX_PLAN_DIGEST_INVALID' }
$safeReport=Assert-SafeReadOnlyReportPath -ReportPath $ReportPath -ProductionRoot $binding.root -AdditionalProtectedRoot $binding.nginxPrefix -ProtectedLeaf @($planFile,$binding.nginxExe,$binding.nginxConfig,$ManagedConfig,$TlsCertificate,$TlsPrivateKey,$binding.markerPath)
if (Test-PathWithin $safeReport $repository) { throw 'READ_ONLY_REPORT_PATH_CONFLICT' }
$plan=Get-Content -LiteralPath $planFile -Raw -Encoding UTF8|ConvertFrom-Json
$expectedTop=@('schemaVersion','mode','mutationsPerformed','state','reason','domain','binding','desired','preState','rollbackSnapshot','neighbors','preGraphFiles','commands','safety')
Assert-StartupBundlePlanObject $plan $expectedTop
if($plan.schemaVersion -ne 1 -or $plan.mode -cne 'READ_ONLY_NGINX_PLAN' -or $plan.mutationsPerformed -ne $false -or $plan.domain -cne 'baogiang.dtnt-damsan.edu.vn'){throw 'NGINX_PLAN_SCHEMA_INVALID'}
Assert-StartupBundlePlanObject $plan.binding @('root','nginxExe','nginxPrefix','nginxConfig','managedConfig','tlsCertificate','tlsPrivateKey','clientMaxBodySize','repositoryRoot')
Assert-StartupBundlePlanObject $plan.desired @('encoding','eol','sha256','contentBase64')
Assert-StartupBundlePlanObject $plan.preState @('state','sha256','restoreAction')
Assert-StartupBundlePlanObject $plan.rollbackSnapshot @('path','sha256','state')
Assert-StartupBundlePlanObject $plan.commands @('syntaxTest','reload')
Assert-StartupBundlePlanObject $plan.commands.syntaxTest @('executable','arguments')
Assert-StartupBundlePlanObject $plan.commands.reload @('executable','arguments','execution')
Assert-StartupBundlePlanObject $plan.safety @('configMutationPerformed','reloadExecuted','privateKeyContentRead')
if($plan.state -notin @('READY_FOR_MANUAL_APPLY','SNAPSHOT_REQUIRED','BLOCKED_INCLUDE_BOUNDARY','CONFLICT') -or ($null -ne $plan.reason -and $plan.reason -isnot [string]) -or $plan.desired.encoding -cne 'UTF-8_NO_BOM' -or $plan.desired.eol -cne 'LF' -or $plan.desired.sha256 -notmatch '^[0-9a-f]{64}$' -or $plan.safety.configMutationPerformed -ne $false -or $plan.safety.reloadExecuted -ne $false -or $plan.safety.privateKeyContentRead -ne $false){throw 'NGINX_PLAN_SCHEMA_INVALID'}
foreach($neighbor in @($plan.neighbors)){Assert-StartupBundlePlanObject $neighbor @('path','sha256');if($neighbor.path -isnot [string] -or $neighbor.sha256 -notmatch '^[0-9a-f]{64}$'){throw 'NGINX_PLAN_SCHEMA_INVALID'}}
$managed=Get-CanonicalPath $ManagedConfig; $certificate=Assert-NginxTlsLeafMetadata $TlsCertificate 'CERTIFICATE'; $privateKey=Assert-NginxTlsLeafMetadata $TlsPrivateKey 'PRIVATE_KEY'
foreach($pair in @(@($plan.binding.root,$binding.root),@($plan.binding.nginxExe,$binding.nginxExe),@($plan.binding.nginxPrefix,$binding.nginxPrefix),@($plan.binding.nginxConfig,$binding.nginxConfig),@($plan.binding.managedConfig,$managed),@($plan.binding.tlsCertificate,$certificate),@($plan.binding.tlsPrivateKey,$privateKey),@($plan.binding.repositoryRoot,$repository))){if((Normalize-ComparablePath $pair[0]) -ne (Normalize-ComparablePath $pair[1])){throw 'NGINX_PLAN_BINDING_CONFLICT'}}
if($plan.binding.clientMaxBodySize -cne $ClientMaxBodySize){throw 'NGINX_PLAN_BINDING_CONFLICT'}
$canonicalDesired=Get-CanonicalNginxManagedBytes -Root $binding.root -CertificatePath $certificate -PrivateKeyPath $privateKey -ClientMaxBodySize $ClientMaxBodySize
if((Get-Sha256FromBytes $canonicalDesired) -cne $plan.desired.sha256 -or [Convert]::ToBase64String($canonicalDesired) -cne $plan.desired.contentBase64){throw 'NGINX_PLAN_DESIRED_CONFLICT'}
$expectedCommands=Get-NginxCommandPlan $binding.nginxExe $binding.nginxPrefix $binding.nginxConfig
if(($plan.commands.syntaxTest.executable -cne $expectedCommands.syntaxTest.executable) -or (($plan.commands.syntaxTest.arguments -join "`n") -cne ($expectedCommands.syntaxTest.arguments -join "`n")) -or ($plan.commands.reload.executable -cne $expectedCommands.reload.executable) -or (($plan.commands.reload.arguments -join "`n") -cne ($expectedCommands.reload.arguments -join "`n")) -or $plan.commands.reload.execution -cne 'MANUAL_ONLY'){throw 'NGINX_PLAN_COMMAND_CONFLICT'}
$graph=Get-NginxEffectiveGraph -NginxPrefix $binding.nginxPrefix -NginxConfig $binding.nginxConfig -PlannedManagedPath $managed
Assert-NginxNeighborSnapshot @($plan.neighbors) $graph $managed
$resultCategory=''
if($Mode -eq 'Desired'){
  if($plan.state -cne 'READY_FOR_MANUAL_APPLY'){throw 'NGINX_PLAN_NOT_READY'}
  if((Get-PathSecurityClassification $managed file).state -ne 'PASS'){throw 'NGINX_MANAGED_FILE_INVALID'}
  $actualBytes=[IO.File]::ReadAllBytes($managed); $expectedBytes=[Convert]::FromBase64String([string]$plan.desired.contentBase64)
  if((Get-Sha256FromBytes $actualBytes) -cne $plan.desired.sha256 -or (Get-Sha256FromBytes $expectedBytes) -cne $plan.desired.sha256 -or -not [Linq.Enumerable]::SequenceEqual([byte[]]$actualBytes,[byte[]]$expectedBytes)){throw 'NGINX_DESIRED_BYTES_CONFLICT'}
  $managedServers=@($graph.servers|Where-Object{(Normalize-ComparablePath $_.file)-eq(Normalize-ComparablePath $managed)})
  $claims=@($graph.servers|Where-Object{Test-NginxServerClaims443Domain $_})
  if($managedServers.Count -ne 1 -or $claims.Count -ne 1 -or (Normalize-ComparablePath $claims[0].file)-ne(Normalize-ComparablePath $managed)){throw 'NGINX_DOMAIN_443_COLLISION'}
  $resultCategory='EXACT_NGINX_AUTHORITY_VERIFIED'
} else {
  if($plan.preState.state -ceq 'MISSING'){if(Test-Path -LiteralPath $managed){throw 'NGINX_RESTORE_CONFLICT'}}
  elseif($plan.preState.state -ceq 'EXISTS'){if((Get-PathSecurityClassification $managed file).state -ne 'PASS' -or (Get-FileSha256FromBytes $managed) -ine $plan.preState.sha256){throw 'NGINX_RESTORE_CONFLICT'}}
  else{throw 'NGINX_PLAN_SCHEMA_INVALID'}
  $actualFiles=@($graph.files.path|Sort-Object); $expectedFiles=@($plan.preGraphFiles|Sort-Object)
  if(($actualFiles -join "`n") -cne ($expectedFiles -join "`n")){throw 'NGINX_RESTORE_GRAPH_CONFLICT'}
  $resultCategory='RESTORE_VERIFIED'
}
$syntax=Invoke-ReviewedNginxSyntaxTest $binding.nginxExe $binding.nginxPrefix $binding.nginxConfig
$report=[pscustomobject][ordered]@{schemaVersion=1;mode=$Mode;state='PASS';category=$resultCategory;planSha256=$ExpectedPlanSha256.ToLowerInvariant();syntaxTest=$syntax;mutationsPerformed=$false;reloadExecuted=$false}
[IO.File]::WriteAllText($safeReport,($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false));Write-Output($report|ConvertTo-Json -Depth 8)
