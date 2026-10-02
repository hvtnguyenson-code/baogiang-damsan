[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$NginxExe,
  [Parameter(Mandatory=$true)][string]$NginxPrefix,
  [Parameter(Mandatory=$true)][string]$NginxConfig,
  [Parameter(Mandatory=$true)][string]$ManagedHttp01Config,
  [Parameter(Mandatory=$true)][string]$ManagedTlsConfig,
  [Parameter(Mandatory=$true)][string]$ClientMaxBodySize,
  [Parameter(Mandatory=$true)][string]$AuthorityCommon,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedAuthorityCommonSha256,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedHttp01Sha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($AuthorityCommon) -or -not [IO.Path]::IsPathRooted($AuthorityCommon)) { throw 'P6010_AUTHORITY_COMMON_INVALID' }
$commonPath = [IO.Path]::GetFullPath($AuthorityCommon).TrimEnd('\')
$commonItem = Get-Item -LiteralPath $commonPath -Force -ErrorAction Stop
if ($commonItem.PSIsContainer -or ($commonItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'P6010_AUTHORITY_COMMON_INVALID' }
$stream = [IO.FileStream]::new($commonPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
$memory = [IO.MemoryStream]::new()
try {
  $stream.CopyTo($memory)
  $commonBytes = $memory.ToArray()
} finally {
  $memory.Dispose()
  $stream.Dispose()
}
$digest = [Security.Cryptography.SHA256]::Create().ComputeHash($commonBytes)
$actualHash = ([BitConverter]::ToString($digest)).Replace('-','').ToLowerInvariant()
if ($actualHash -cne $ExpectedAuthorityCommonSha256.ToLowerInvariant()) { throw 'P6010_AUTHORITY_COMMON_HASH_CONFLICT' }
try { $commonText = [Text.UTF8Encoding]::new($false,$true).GetString($commonBytes) } catch { throw 'P6010_AUTHORITY_COMMON_UTF8_INVALID' }
$trustedCommon = [ScriptBlock]::Create($commonText)
. $trustedCommon

Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $commonPath) -CategoryPrefix 'P6010_AUTHORITY_COMMON' | Out-Null
if ((Get-FileSha256FromBytes $commonPath) -cne $ExpectedAuthorityCommonSha256.ToLowerInvariant()) { throw 'P6010_AUTHORITY_COMMON_POSTLOAD_CONFLICT' }

$rootPath = Assert-DedicatedRoot $Root
$expectedHook = Get-CanonicalPath (Join-Path $rootPath 'shared\tls\production-tls-renewal-hook.ps1')
if ([string]::IsNullOrWhiteSpace($PSCommandPath) -or (Normalize-ComparablePath $PSCommandPath) -ne (Normalize-ComparablePath $expectedHook)) { throw 'P6010_RENEWAL_HOOK_PATH_CONFLICT' }
$binding = Get-NginxRuntimeBinding -Root $rootPath -NginxExe $NginxExe -NginxPrefix $NginxPrefix -NginxConfig $NginxConfig
$httpManaged = Get-CanonicalPath $ManagedHttp01Config
$tlsManaged = Get-CanonicalPath $ManagedTlsConfig
foreach ($managedPath in @($httpManaged,$tlsManaged)) {
  if (-not (Test-PathWithin $managedPath $binding.nginxPrefix) -or (Normalize-ComparablePath $managedPath) -eq (Normalize-ComparablePath $binding.nginxConfig)) { throw 'P6010_MANAGED_CONFIG_BOUNDARY_CONFLICT' }
  Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $managedPath) -CategoryPrefix 'P6010_MANAGED_NGINX' | Out-Null
}
if ((Normalize-ComparablePath $httpManaged) -eq (Normalize-ComparablePath $tlsManaged)) { throw 'P6010_MANAGED_CONFIG_ALIAS' }
if ((Get-PathSecurityClassification -Path $httpManaged -Kind file).state -ne 'PASS') { throw 'P6010_HTTP01_CONFIG_MISSING' }
if ((Get-FileSha256FromBytes $httpManaged) -cne $ExpectedHttp01Sha256.ToLowerInvariant()) { throw 'P6010_HTTP01_CONFIG_BYTES_CONFLICT' }

$certificate = Assert-NginxTlsLeafMetadata (Join-Path $rootPath 'shared\tls\baogiang-chain.pem') 'CERTIFICATE'
$privateKey = Assert-NginxTlsLeafMetadata (Join-Path $rootPath 'shared\tls\baogiang-key.pem') 'PRIVATE_KEY'
$tlsState = Get-PathSecurityClassification -Path $tlsManaged -Kind file
if ($tlsState.state -eq 'MISSING') {
  $result = [pscustomobject][ordered]@{
    schemaVersion = 1
    state = 'PASS'
    category = 'FIRST_ISSUE_CERT_READY_NO_RELOAD'
    domain = 'baogiang.dtnt-damsan.edu.vn'
    certificate = $certificate
    privateKey = $privateKey
    nginxReloadExecuted = $false
    configMutationPerformed = $false
  }
  Write-Output ($result | ConvertTo-Json -Depth 6)
  exit 0
}
if ($tlsState.state -ne 'PASS') { throw 'P6010_TLS_CONFIG_INVALID' }

$expectedTlsBytes = Get-CanonicalNginxManagedBytes -Root $rootPath -CertificatePath $certificate -PrivateKeyPath $privateKey -ClientMaxBodySize $ClientMaxBodySize
$actualTlsBytes = [IO.File]::ReadAllBytes($tlsManaged)
if ((Get-Sha256FromBytes $actualTlsBytes) -cne (Get-Sha256FromBytes $expectedTlsBytes) -or -not [Linq.Enumerable]::SequenceEqual([byte[]]$actualTlsBytes,[byte[]]$expectedTlsBytes)) { throw 'P6010_TLS_CONFIG_BYTES_CONFLICT' }

$graph = Get-NginxEffectiveGraph -NginxPrefix $binding.nginxPrefix -NginxConfig $binding.nginxConfig -PlannedManagedPath $tlsManaged
$managedServers = @($graph.servers | Where-Object { (Normalize-ComparablePath $_.file) -eq (Normalize-ComparablePath $tlsManaged) })
$claims = @($graph.servers | Where-Object { Test-NginxServerClaims443Domain $_ })
if ($managedServers.Count -ne 1 -or $claims.Count -ne 1 -or (Normalize-ComparablePath $claims[0].file) -ne (Normalize-ComparablePath $tlsManaged)) { throw 'P6010_DOMAIN_443_COLLISION' }

$syntax = Invoke-ReviewedNginxSyntaxTest $binding.nginxExe $binding.nginxPrefix $binding.nginxConfig
$commands = Get-NginxCommandPlan $binding.nginxExe $binding.nginxPrefix $binding.nginxConfig
if ($commands.reload.execution -cne 'MANUAL_ONLY') { throw 'P6010_NGINX_RELOAD_VECTOR_INVALID' }
$reloadArgumentList = @($commands.reload.arguments)
& $commands.reload.executable @reloadArgumentList *> $null
if ($LASTEXITCODE -ne 0) { throw 'P6010_NGINX_RELOAD_FAILED' }

$result = [pscustomobject][ordered]@{
  schemaVersion = 1
  state = 'PASS'
  category = 'RENEWED_CERTIFICATE_RELOAD_VERIFIED'
  domain = 'baogiang.dtnt-damsan.edu.vn'
  syntaxTest = $syntax
  nginxReloadExecuted = $true
  configMutationPerformed = $false
}
Write-Output ($result | ConvertTo-Json -Depth 6)
