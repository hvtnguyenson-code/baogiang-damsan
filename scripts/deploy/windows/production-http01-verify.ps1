[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$PlanPath,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedPlanSha256,
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
$planFile = Get-CanonicalPath $PlanPath
Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $planFile) -CategoryPrefix 'P6010_PLAN' | Out-Null
if ((Get-PathSecurityClassification -Path $planFile -Kind file).state -ne 'PASS' -or (Get-FileSha256FromBytes $planFile) -ine $ExpectedPlanSha256) { throw 'P6010_PLAN_DIGEST_INVALID' }
$safeReport = Assert-SafeReadOnlyReportPath -ReportPath $ReportPath -ProductionRoot $binding.root -AdditionalProtectedRoot $binding.nginxPrefix -ProtectedLeaf @($planFile,$binding.nginxExe,$binding.nginxConfig,$httpManaged,$tlsManaged,$paths.winAcmeExe,$paths.winAcmeSettings,$paths.renewalHook,$paths.certificate,$paths.privateKey,$authorityCommonPath,$binding.markerPath)
if (Test-PathWithin $safeReport $repository) { throw 'READ_ONLY_REPORT_PATH_CONFLICT' }

$plan = Get-Content -LiteralPath $planFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ([int]$plan.schemaVersion -ne 1 -or [string]$plan.mode -cne 'READ_ONLY_P6_010_HTTP01_PLAN' -or $plan.mutationsPerformed -ne $false) { throw 'P6010_PLAN_SCHEMA_INVALID' }
if ([string]$plan.domain -cne (Get-P6010Domain)) { throw 'P6010_PLAN_DOMAIN_CONFLICT' }
foreach ($pair in @(
  @($plan.binding.root,$binding.root),
  @($plan.binding.nginxExe,$binding.nginxExe),
  @($plan.binding.nginxPrefix,$binding.nginxPrefix),
  @($plan.binding.nginxConfig,$binding.nginxConfig),
  @($plan.binding.managedHttp01Config,$httpManaged),
  @($plan.binding.managedTlsConfig,$tlsManaged),
  @($plan.binding.acmeWebRoot,$paths.acmeWebRoot),
  @($plan.binding.tlsDirectory,$paths.tlsDirectory),
  @($plan.binding.certificate,$paths.certificate),
  @($plan.binding.privateKey,$paths.privateKey),
  @($plan.binding.renewalHook,$paths.renewalHook),
  @($plan.binding.winAcmeExe,$paths.winAcmeExe),
  @($plan.binding.winAcmeSettings,$paths.winAcmeSettings),
  @($plan.binding.winAcmeConfig,$paths.winAcmeConfig),
  @($plan.binding.winAcmeLog,$paths.winAcmeLog),
  @($plan.binding.authorityCommon,$authorityCommonPath)
)) {
  if ((Normalize-ComparablePath ([string]$pair[0])) -ne (Normalize-ComparablePath ([string]$pair[1]))) { throw 'P6010_PLAN_BINDING_CONFLICT' }
}
if ([string]$plan.binding.clientMaxBodySize -cne $ClientMaxBodySize -or [string]$plan.binding.authorityCommonSha256 -ine $ExpectedAuthorityCommonSha256) { throw 'P6010_PLAN_BINDING_CONFLICT' }

$desiredBytes = Get-P6010Http01ManagedBytes -Root $binding.root
$desiredHash = Get-Sha256FromBytes $desiredBytes
if ([string]$plan.desired.sha256 -cne $desiredHash -or [string]$plan.desired.contentBase64 -cne [Convert]::ToBase64String($desiredBytes)) { throw 'P6010_PLAN_DESIRED_CONFLICT' }
if ([string]$plan.state -notin @('READY_FOR_MANUAL_HTTP01_APPLY','HTTP01_ALREADY_APPLIED')) { throw 'P6010_PLAN_NOT_READY' }
if ([string]$plan.prerequisites.state -cne 'PASS') { throw 'P6010_PREREQUISITES_NOT_READY' }

if ((Get-PathSecurityClassification -Path $paths.winAcmeExe -Kind file).state -ne 'PASS') { throw 'P6010_WIN_ACME_EXECUTABLE_MISSING' }
Assert-P6010WinAcmeSettings -Root $binding.root | Out-Null
$hookSource = Get-CanonicalPath (Join-Path $repository 'scripts\deploy\windows\production-tls-renewal-hook.ps1')
if ((Get-PathSecurityClassification -Path $paths.renewalHook -Kind file).state -ne 'PASS' -or (Get-FileSha256FromBytes $paths.renewalHook) -cne (Get-FileSha256FromBytes $hookSource)) { throw 'P6010_RENEWAL_HOOK_CONFLICT' }

if ((Get-PathSecurityClassification -Path $httpManaged -Kind file).state -ne 'PASS') { throw 'P6010_HTTP01_CONFIG_MISSING' }
$actualBytes = [IO.File]::ReadAllBytes($httpManaged)
if ((Get-Sha256FromBytes $actualBytes) -cne $desiredHash -or -not [Linq.Enumerable]::SequenceEqual([byte[]]$actualBytes,[byte[]]$desiredBytes)) { throw 'P6010_HTTP01_CONFIG_BYTES_CONFLICT' }
if ((Get-PathSecurityClassification -Path $tlsManaged -Kind file).state -ne 'MISSING') { throw 'P6010_TLS_CONFIG_MUST_BE_MISSING_BEFORE_FIRST_ISSUE' }

$expectedIssue = Get-P6010WinAcmeIssueCommandPlan -Root $binding.root -NginxExe $binding.nginxExe -NginxPrefix $binding.nginxPrefix -NginxConfig $binding.nginxConfig -ManagedHttp01Config $httpManaged -ManagedTlsConfig $tlsManaged -ClientMaxBodySize $ClientMaxBodySize -AuthorityCommon $authorityCommonPath -ExpectedAuthorityCommonSha256 $ExpectedAuthorityCommonSha256 -AcmeEmail $email
$expectedRenew = Get-P6010WinAcmeRenewCommandPlan -Root $binding.root
if ([string]$plan.commands.firstIssue.executable -cne $expectedIssue.executable -or ((@($plan.commands.firstIssue.arguments) -join "`n") -cne (@($expectedIssue.arguments) -join "`n"))) { throw 'P6010_FIRST_ISSUE_COMMAND_CONFLICT' }
if ([string]$plan.commands.renew.executable -cne $expectedRenew.executable -or ((@($plan.commands.renew.arguments) -join "`n") -cne (@($expectedRenew.arguments) -join "`n"))) { throw 'P6010_RENEW_COMMAND_CONFLICT' }

$graph = Get-NginxEffectiveGraph -NginxPrefix $binding.nginxPrefix -NginxConfig $binding.nginxConfig -PlannedManagedPath $httpManaged
$managedServers = @($graph.servers | Where-Object { (Normalize-ComparablePath $_.file) -eq (Normalize-ComparablePath $httpManaged) })
$port80Claims = @($graph.servers | Where-Object { Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 80 })
$port443Claims = @($graph.servers | Where-Object { Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 443 })
if ($managedServers.Count -ne 1 -or $port80Claims.Count -ne 1 -or (Normalize-ComparablePath $port80Claims[0].file) -ne (Normalize-ComparablePath $httpManaged)) { throw 'P6010_DOMAIN_80_COLLISION' }
if ($port443Claims.Count -ne 0) { throw 'P6010_DOMAIN_443_COLLISION' }
$syntax = Invoke-ReviewedNginxSyntaxTest $binding.nginxExe $binding.nginxPrefix $binding.nginxConfig

$report = [pscustomobject][ordered]@{
  schemaVersion = 1
  mode = 'READ_ONLY_P6_010_HTTP01_VERIFY'
  state = 'PASS'
  category = 'EXACT_HTTP01_AUTHORITY_VERIFIED'
  planSha256 = $ExpectedPlanSha256.ToLowerInvariant()
  domain = Get-P6010Domain
  syntaxTest = $syntax
  firstIssue = $expectedIssue
  renew = $expectedRenew
  mutationsPerformed = $false
  reloadExecuted = $false
  tlsIssuanceExecuted = $false
}
[IO.File]::WriteAllText($safeReport,($report | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
Write-Output ($report | ConvertTo-Json -Depth 12)
