Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-P6010Domain { return 'baogiang.dtnt-damsan.edu.vn' }
function Get-P6010RenewalId { return 'baogiang-damsan' }
function Get-P6010WinAcmeClientName { return 'baogiang-win-acme' }

function Get-P6010CanonicalPaths([Parameter(Mandatory = $true)][string]$Root) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $shared = Assert-ExactChildPath -Root $canonicalRoot -RelativePath 'shared'
  $tlsDirectory = Assert-ExactChildPath -Root $canonicalRoot -RelativePath 'shared\tls'
  $winAcmeRoot = Assert-ExactChildPath -Root $canonicalRoot -RelativePath 'shared\win-acme'
  return [pscustomobject][ordered]@{
    root = $canonicalRoot
    acmeWebRoot = Assert-ExactChildPath -Root $canonicalRoot -RelativePath 'shared\acme-webroot'
    tlsDirectory = $tlsDirectory
    certificate = Get-CanonicalPath (Join-Path $tlsDirectory 'baogiang-chain.pem')
    privateKey = Get-CanonicalPath (Join-Path $tlsDirectory 'baogiang-key.pem')
    renewalHook = Get-CanonicalPath (Join-Path $tlsDirectory 'production-tls-renewal-hook.ps1')
    winAcmeRoot = $winAcmeRoot
    winAcmeExe = Get-CanonicalPath (Join-Path $winAcmeRoot 'wacs.exe')
    winAcmeSettings = Get-CanonicalPath (Join-Path $winAcmeRoot 'settings.json')
    winAcmeConfig = Assert-ExactChildPath -Root $canonicalRoot -RelativePath 'shared\win-acme-config'
    winAcmeLog = Assert-ExactChildPath -Root $canonicalRoot -RelativePath 'logs\win-acme'
    shared = $shared
  }
}

function Assert-P6010ManagedNginxPath(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$NginxPrefix,
  [Parameter(Mandatory = $true)][string]$NginxConfig
) {
  $canonical = Get-CanonicalPath $Path
  $prefix = Get-CanonicalPath $NginxPrefix
  $mainConfig = Get-CanonicalPath $NginxConfig
  if (-not (Test-PathWithin $canonical $prefix) -or (Normalize-ComparablePath $canonical) -eq (Normalize-ComparablePath $mainConfig)) {
    throw 'P6010_NGINX_MANAGED_BOUNDARY_INVALID'
  }
  Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $canonical) -CategoryPrefix 'P6010_MANAGED_NGINX' | Out-Null
  $classification = Get-PathSecurityClassification -Path $canonical -Kind file
  if ($classification.state -notin @('PASS','MISSING')) { throw 'P6010_NGINX_MANAGED_FILE_INVALID' }
  return $canonical
}

function Get-P6010Http01ManagedBytes([Parameter(Mandatory = $true)][string]$Root) {
  $paths = Get-P6010CanonicalPaths -Root $Root
  $webRoot = ConvertTo-NginxPath $paths.acmeWebRoot
  $domain = Get-P6010Domain
  $lines = @(
    'server {'
    '    listen 80;'
    "    server_name $domain;"
    ''
    '    location ^~ /.well-known/acme-challenge/ {'
    '        default_type text/plain;'
    "        root `"$webRoot`";"
    '        try_files $uri =404;'
    '    }'
    ''
    '    location / {'
    '        return 301 https://$host$request_uri;'
    '    }'
    '}'
    ''
  )
  return [Text.UTF8Encoding]::new($false).GetBytes(($lines -join "`n"))
}

function Test-P6010NginxServerClaimsDomainPort(
  [Parameter(Mandatory = $true)][object]$Server,
  [Parameter(Mandatory = $true)][ValidateRange(1,65535)][int]$Port,
  [string]$Domain = (Get-P6010Domain)
) {
  $names = @(Get-NginxDirective $Server.node 'server_name' | ForEach-Object { $_.arguments })
  $listens = @(Get-NginxDirective $Server.node 'listen' | ForEach-Object { $_.arguments -join ' ' })
  $approvedName = Normalize-NginxExactServerName $Domain
  $claimsExactName = @($names | ForEach-Object { Get-NginxServerNameClassification $_ } | Where-Object { $_.kind -ceq 'EXACT' -and $_.normalizedExactName -ceq $approvedName }).Count -gt 0
  $portPattern = "(^|:)$Port(?:\s|$)"
  return $claimsExactName -and @($listens | Where-Object { $_ -match $portPattern }).Count -gt 0
}

function Assert-P6010WinAcmeSettings([Parameter(Mandatory = $true)][string]$Root) {
  $paths = Get-P6010CanonicalPaths -Root $Root
  $classification = Get-PathSecurityClassification -Path $paths.winAcmeSettings -Kind file
  if ($classification.state -ne 'PASS') { throw 'P6010_WIN_ACME_SETTINGS_MISSING_OR_INVALID' }
  Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $paths.winAcmeSettings) -CategoryPrefix 'P6010_WIN_ACME_SETTINGS' | Out-Null
  $settings = Get-Content -LiteralPath $paths.winAcmeSettings -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($null -eq $settings.Client) { throw 'P6010_WIN_ACME_SETTINGS_INVALID' }
  if ([string]$settings.Client.ClientName -cne (Get-P6010WinAcmeClientName)) { throw 'P6010_WIN_ACME_CLIENT_NAME_CONFLICT' }
  if ((Normalize-ComparablePath ([string]$settings.Client.ConfigurationPath)) -ne (Normalize-ComparablePath $paths.winAcmeConfig)) { throw 'P6010_WIN_ACME_CONFIG_PATH_CONFLICT' }
  if ((Normalize-ComparablePath ([string]$settings.Client.LogPath)) -ne (Normalize-ComparablePath $paths.winAcmeLog)) { throw 'P6010_WIN_ACME_LOG_PATH_CONFLICT' }
  return [pscustomobject][ordered]@{
    state = 'PASS'
    clientName = Get-P6010WinAcmeClientName
    configurationPath = $paths.winAcmeConfig
    logPath = $paths.winAcmeLog
  }
}

function Assert-P6010AcmeEmail([Parameter(Mandatory = $true)][string]$Email) {
  if ([string]::IsNullOrWhiteSpace($Email) -or $Email -notmatch '^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$') { throw 'P6010_ACME_EMAIL_INVALID' }
  return $Email
}

function Assert-P6010AuthorityCommonBinding(
  [Parameter(Mandatory = $true)][string]$AuthorityCommon,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedAuthorityCommonSha256
) {
  $common = Get-CanonicalPath $AuthorityCommon
  $classification = Get-PathSecurityClassification -Path $common -Kind file
  if ($classification.state -ne 'PASS') { throw 'P6010_AUTHORITY_COMMON_INVALID' }
  Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $common) -CategoryPrefix 'P6010_AUTHORITY_COMMON' | Out-Null
  if ((Get-FileSha256FromBytes $common) -ine $ExpectedAuthorityCommonSha256) { throw 'P6010_AUTHORITY_COMMON_HASH_CONFLICT' }
  return $common
}

function Get-P6010WinAcmeIssueCommandPlan(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$NginxExe,
  [Parameter(Mandatory = $true)][string]$NginxPrefix,
  [Parameter(Mandatory = $true)][string]$NginxConfig,
  [Parameter(Mandatory = $true)][string]$ManagedHttp01Config,
  [Parameter(Mandatory = $true)][string]$ManagedTlsConfig,
  [Parameter(Mandatory = $true)][string]$ClientMaxBodySize,
  [Parameter(Mandatory = $true)][string]$AuthorityCommon,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedAuthorityCommonSha256,
  [Parameter(Mandatory = $true)][string]$AcmeEmail
) {
  $paths = Get-P6010CanonicalPaths -Root $Root
  $email = Assert-P6010AcmeEmail -Email $AcmeEmail
  $common = Assert-P6010AuthorityCommonBinding -AuthorityCommon $AuthorityCommon -ExpectedAuthorityCommonSha256 $ExpectedAuthorityCommonSha256
  if ($ClientMaxBodySize -notmatch '^[1-9][0-9]*(?:[kKmMgG])?$') { throw 'NGINX_REQUEST_SIZE_INVALID' }
  $domain = Get-P6010Domain
  $expectedHttp01Sha256 = Get-Sha256FromBytes (Get-P6010Http01ManagedBytes -Root $paths.root)
  $scriptParameters = '-Root "{0}" -NginxExe "{1}" -NginxPrefix "{2}" -NginxConfig "{3}" -ManagedHttp01Config "{4}" -ManagedTlsConfig "{5}" -ClientMaxBodySize "{6}" -AuthorityCommon "{7}" -ExpectedAuthorityCommonSha256 "{8}" -ExpectedHttp01Sha256 "{9}"' -f $paths.root,(Get-CanonicalPath $NginxExe),(Get-CanonicalPath $NginxPrefix),(Get-CanonicalPath $NginxConfig),(Get-CanonicalPath $ManagedHttp01Config),(Get-CanonicalPath $ManagedTlsConfig),$ClientMaxBodySize,$common,$ExpectedAuthorityCommonSha256.ToLowerInvariant(),$expectedHttp01Sha256
  return [pscustomobject][ordered]@{
    executable = $paths.winAcmeExe
    arguments = @(
      '--source','manual',
      '--id',(Get-P6010RenewalId),
      '--friendlyname','BaoGiang',
      '--host',$domain,
      '--validation','filesystem',
      '--validationmode','http-01',
      '--webroot',$paths.acmeWebRoot,
      '--store','pemfiles',
      '--pemfilespath',$paths.tlsDirectory,
      '--pemfilesname','baogiang',
      '--installation','script',
      '--script',$paths.renewalHook,
      '--scriptparameters',$scriptParameters,
      '--emailaddress',$email,
      '--accepttos',
      '--notaskscheduler'
    )
    renewalId = Get-P6010RenewalId
    expectedCertificate = $paths.certificate
    expectedPrivateKey = $paths.privateKey
    expectedHttp01Sha256 = $expectedHttp01Sha256
    authorityCommon = $common
    authorityCommonSha256 = $ExpectedAuthorityCommonSha256.ToLowerInvariant()
    scheduledTaskMutationAllowed = $false
  }
}

function Get-P6010WinAcmeRenewCommandPlan([Parameter(Mandatory = $true)][string]$Root) {
  $paths = Get-P6010CanonicalPaths -Root $Root
  return [pscustomobject][ordered]@{
    executable = $paths.winAcmeExe
    arguments = @('--renew','--id',(Get-P6010RenewalId),'--notaskscheduler')
    renewalId = Get-P6010RenewalId
    scheduledTaskMutationAllowed = $false
  }
}

function Get-P6010RenewalTaskContract([Parameter(Mandatory = $true)][string]$Root) {
  $renew = Get-P6010WinAcmeRenewCommandPlan -Root $Root
  return [pscustomobject][ordered]@{
    taskPath = '\BaoGiang\'
    taskName = 'BaoGiangTlsRenewal'
    executable = $renew.executable
    arguments = $renew.arguments
    schedule = 'REVIEW_AFTER_PROTECTED_NEIGHBOR_DISCOVERY'
    createOrChangeAllowedHere = $false
  }
}
