[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$RepositoryRoot,
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$NginxExe,
  [Parameter(Mandatory=$true)][string]$NginxPrefix,
  [Parameter(Mandatory=$true)][string]$NginxConfig,
  [Parameter(Mandatory=$true)][string]$ManagedHttp01Config,
  [Parameter(Mandatory=$true)][string]$ManagedTlsConfig,
  [Parameter(Mandatory=$true)][string]$ClientMaxBodySize,
  [Parameter(Mandatory=$true)][string]$AuthorityCommon,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedAuthorityCommonSha256,
  [Parameter(Mandatory=$true)][string]$AcmeEmail,
  [Parameter(Mandatory=$true)][string]$ReportPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
. (Join-Path $PSScriptRoot 'p6-010-http01-tls-common.ps1')

$binding = Get-NginxRuntimeBinding -Root $Root -NginxExe $NginxExe -NginxPrefix $NginxPrefix -NginxConfig $NginxConfig
$repository = Assert-ExistingDirectory $RepositoryRoot
$httpManaged = Assert-P6010ManagedNginxPath -Path $ManagedHttp01Config -NginxPrefix $binding.nginxPrefix -NginxConfig $binding.nginxConfig
$tlsManaged = Assert-P6010ManagedNginxPath -Path $ManagedTlsConfig -NginxPrefix $binding.nginxPrefix -NginxConfig $binding.nginxConfig
if ((Normalize-ComparablePath $httpManaged) -eq (Normalize-ComparablePath $tlsManaged)) { throw 'P6010_MANAGED_CONFIG_ALIAS' }
$paths = Get-P6010CanonicalPaths -Root $binding.root
$email = Assert-P6010AcmeEmail -Email $AcmeEmail
$authorityCommonPath = Assert-P6010AuthorityCommonBinding -AuthorityCommon $AuthorityCommon -ExpectedAuthorityCommonSha256 $ExpectedAuthorityCommonSha256

$safeReport = Assert-SafeReadOnlyReportPath -ReportPath $ReportPath -ProductionRoot $binding.root -AdditionalProtectedRoot $binding.nginxPrefix -ProtectedLeaf @($binding.nginxExe,$binding.nginxConfig,$httpManaged,$tlsManaged,$paths.winAcmeExe,$paths.winAcmeSettings,$paths.renewalHook,$paths.certificate,$paths.privateKey,$authorityCommonPath,$binding.markerPath)
if (Test-PathWithin $safeReport $repository) { throw 'READ_ONLY_REPORT_PATH_CONFLICT' }

$desiredBytes = Get-P6010Http01ManagedBytes -Root $binding.root
$desiredHash = Get-Sha256FromBytes $desiredBytes
$httpClassification = Get-PathSecurityClassification -Path $httpManaged -Kind file
$tlsClassification = Get-PathSecurityClassification -Path $tlsManaged -Kind file
$winAcmeClassification = Get-PathSecurityClassification -Path $paths.winAcmeExe -Kind file
$settingsClassification = Get-PathSecurityClassification -Path $paths.winAcmeSettings -Kind file
$hookClassification = Get-PathSecurityClassification -Path $paths.renewalHook -Kind file
$hookSource = Get-CanonicalPath (Join-Path $repository 'scripts\deploy\windows\production-tls-renewal-hook.ps1')
$hookSourceClassification = Get-PathSecurityClassification -Path $hookSource -Kind file
if ($hookSourceClassification.state -ne 'PASS') { throw 'P6010_RENEWAL_HOOK_SOURCE_MISSING' }
$hookSourceHash = Get-FileSha256FromBytes $hookSource

$state = 'READY_FOR_MANUAL_HTTP01_APPLY'
$reason = $null
if ($tlsClassification.state -eq 'PASS') { $state = 'CONFLICT'; $reason = 'P6010_TLS_CONFIG_ALREADY_PRESENT' }
elseif ($tlsClassification.state -ne 'MISSING') { $state = 'CONFLICT'; $reason = 'P6010_TLS_CONFIG_INVALID' }

if ($state -ne 'CONFLICT') {
  if ($httpClassification.state -eq 'PASS') {
    if ((Get-FileSha256FromBytes $httpManaged) -ceq $desiredHash) { $state = 'HTTP01_ALREADY_APPLIED' }
    else { $state = 'CONFLICT'; $reason = 'P6010_HTTP01_CONFIG_BYTES_CONFLICT' }
  } elseif ($httpClassification.state -ne 'MISSING') {
    $state = 'CONFLICT'; $reason = 'P6010_HTTP01_CONFIG_INVALID'
  }
}

$prerequisiteState = 'PASS'
$prerequisiteReason = $null
if ($winAcmeClassification.state -ne 'PASS') { $prerequisiteState = 'INSTALL_REQUIRED'; $prerequisiteReason = 'P6010_WIN_ACME_EXECUTABLE_REQUIRED' }
elseif ($settingsClassification.state -ne 'PASS') { $prerequisiteState = 'INSTALL_REQUIRED'; $prerequisiteReason = 'P6010_WIN_ACME_SETTINGS_REQUIRED' }
elseif ($hookClassification.state -ne 'PASS') { $prerequisiteState = 'INSTALL_REQUIRED'; $prerequisiteReason = 'P6010_RENEWAL_HOOK_INSTALL_REQUIRED' }
else {
  Assert-P6010WinAcmeSettings -Root $binding.root | Out-Null
  if ((Get-FileSha256FromBytes $paths.renewalHook) -cne $hookSourceHash) { $prerequisiteState = 'CONFLICT'; $prerequisiteReason = 'P6010_RENEWAL_HOOK_HASH_CONFLICT' }
}
if ($state -notin @('CONFLICT') -and $prerequisiteState -ne 'PASS') { $state = 'PREREQUISITE_INSTALL_REQUIRED'; $reason = $prerequisiteReason }

$graph = $null
try { $graph = Get-NginxEffectiveGraph -NginxPrefix $binding.nginxPrefix -NginxConfig $binding.nginxConfig -PlannedManagedPath $httpManaged }
catch { $state = 'CONFLICT'; $reason = $_.Exception.Message }
if ($null -ne $graph) {
  $activates = @($graph.includes | Where-Object { $_.plannedMatch -or @($_.matches | Where-Object { (Normalize-ComparablePath $_) -eq (Normalize-ComparablePath $httpManaged) }).Count -gt 0 }).Count -gt 0
  if (-not $activates) { $state = 'CONFLICT'; $reason = 'P6010_HTTP01_INCLUDE_NOT_ACTIVE' }
  $port80Collisions = @($graph.servers | Where-Object { (Normalize-ComparablePath $_.file) -ne (Normalize-ComparablePath $httpManaged) -and (Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 80) })
  $port443Collisions = @($graph.servers | Where-Object { (Normalize-ComparablePath $_.file) -ne (Normalize-ComparablePath $tlsManaged) -and (Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 443) })
  if ($port80Collisions.Count -gt 0) { $state = 'CONFLICT'; $reason = 'P6010_DOMAIN_80_COLLISION' }
  if ($port443Collisions.Count -gt 0) { $state = 'CONFLICT'; $reason = 'P6010_DOMAIN_443_COLLISION' }
}

$issueCommand = Get-P6010WinAcmeIssueCommandPlan -Root $binding.root -NginxExe $binding.nginxExe -NginxPrefix $binding.nginxPrefix -NginxConfig $binding.nginxConfig -ManagedHttp01Config $httpManaged -ManagedTlsConfig $tlsManaged -ClientMaxBodySize $ClientMaxBodySize -AuthorityCommon $authorityCommonPath -ExpectedAuthorityCommonSha256 $ExpectedAuthorityCommonSha256 -AcmeEmail $email
$renewCommand = Get-P6010WinAcmeRenewCommandPlan -Root $binding.root
$renewalTask = Get-P6010RenewalTaskContract -Root $binding.root
$nginxCommands = Get-NginxCommandPlan $binding.nginxExe $binding.nginxPrefix $binding.nginxConfig

$report = [pscustomobject][ordered]@{
  schemaVersion = 1
  mode = 'READ_ONLY_P6_010_HTTP01_PLAN'
  mutationsPerformed = $false
  state = $state
  reason = $reason
  domain = Get-P6010Domain
  binding = [pscustomobject][ordered]@{
    root = $binding.root
    nginxExe = $binding.nginxExe
    nginxPrefix = $binding.nginxPrefix
    nginxConfig = $binding.nginxConfig
    managedHttp01Config = $httpManaged
    managedTlsConfig = $tlsManaged
    clientMaxBodySize = $ClientMaxBodySize
    acmeWebRoot = $paths.acmeWebRoot
    tlsDirectory = $paths.tlsDirectory
    certificate = $paths.certificate
    privateKey = $paths.privateKey
    renewalHook = $paths.renewalHook
    winAcmeExe = $paths.winAcmeExe
    winAcmeSettings = $paths.winAcmeSettings
    winAcmeConfig = $paths.winAcmeConfig
    winAcmeLog = $paths.winAcmeLog
    authorityCommon = $authorityCommonPath
    authorityCommonSha256 = $ExpectedAuthorityCommonSha256.ToLowerInvariant()
  }
  desired = [pscustomobject][ordered]@{ encoding='UTF-8_NO_BOM'; eol='LF'; sha256=$desiredHash; contentBase64=[Convert]::ToBase64String($desiredBytes) }
  prerequisites = [pscustomobject][ordered]@{
    state = $prerequisiteState
    reason = $prerequisiteReason
    winAcmeExeState = $winAcmeClassification.state
    winAcmeSettingsState = $settingsClassification.state
    renewalHookState = $hookClassification.state
    renewalHookSourceSha256 = $hookSourceHash
  }
  commands = [pscustomobject][ordered]@{
    nginxSyntaxTest = $nginxCommands.syntaxTest
    nginxReload = $nginxCommands.reload
    firstIssue = $issueCommand
    renew = $renewCommand
    renewalTask = $renewalTask
  }
  safety = [pscustomobject][ordered]@{
    configMutationPerformed = $false
    tlsIssuanceExecuted = $false
    nginxReloadExecuted = $false
    scheduledTaskMutationPerformed = $false
    privateKeyContentRead = $false
  }
}
[IO.File]::WriteAllText($safeReport,($report | ConvertTo-Json -Depth 14),[Text.UTF8Encoding]::new($false))
Write-Output ($report | ConvertTo-Json -Depth 14)
