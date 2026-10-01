$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repo 'scripts\deploy\windows\deployment-common.ps1')
. (Join-Path $repo 'scripts\deploy\windows\p6-010-http01-tls-common.ps1')

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("baogiang-p6010-" + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  $productionRoot = Join-Path $tempRoot 'baogiang'
  foreach ($relative in @('shared','shared\acme-webroot','shared\tls','shared\win-acme','shared\win-acme-config','logs','logs\win-acme')) {
    New-Item -ItemType Directory -Path (Join-Path $productionRoot $relative) -Force | Out-Null
  }

  $paths = Get-P6010CanonicalPaths -Root $productionRoot
  if ($paths.certificate -cne (Get-CanonicalPath (Join-Path $productionRoot 'shared\tls\baogiang-chain.pem'))) { throw 'P6010-T01 certificate path drift' }
  if ($paths.privateKey -cne (Get-CanonicalPath (Join-Path $productionRoot 'shared\tls\baogiang-key.pem'))) { throw 'P6010-T01 private-key path drift' }
  if ($paths.acmeWebRoot -cne (Get-CanonicalPath (Join-Path $productionRoot 'shared\acme-webroot'))) { throw 'P6010-T01 webroot path drift' }

  $httpText = [Text.UTF8Encoding]::new($false).GetString((Get-P6010Http01ManagedBytes -Root $productionRoot))
  foreach ($required in @('listen 80;','server_name baogiang.dtnt-damsan.edu.vn;','location ^~ /.well-known/acme-challenge/','try_files $uri =404;','return 301 https://$host$request_uri;')) {
    if (-not $httpText.Contains($required)) { throw "P6010-T02 missing HTTP-01 token: $required" }
  }
  foreach ($forbidden in @('listen 443','ssl_certificate','proxy_pass http://127.0.0.1:3100')) {
    if ($httpText.Contains($forbidden)) { throw "P6010-T02 HTTP-01 authority leaked TLS/API token: $forbidden" }
  }

  $nginxPrefix = Join-Path $tempRoot 'nginx'
  $nginxConf = Join-Path $nginxPrefix 'conf'
  $nginxConfD = Join-Path $nginxConf 'conf.d'
  New-Item -ItemType Directory -Path $nginxConfD -Force | Out-Null
  $nginxMain = Join-Path $nginxConf 'nginx.conf'
  $httpManaged = Join-Path $nginxConfD 'baogiang-http01.conf'
  $tlsManaged = Join-Path $nginxConfD 'baogiang.conf'
  [IO.File]::WriteAllText($nginxMain,"events {}`nhttp {`n    include conf.d/*.conf;`n}`n",[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllBytes($httpManaged,(Get-P6010Http01ManagedBytes -Root $productionRoot))

  $graph = Get-NginxEffectiveGraph -NginxPrefix $nginxPrefix -NginxConfig $nginxMain -PlannedManagedPath $httpManaged
  $port80Claims = @($graph.servers | Where-Object { Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 80 })
  $port443Claims = @($graph.servers | Where-Object { Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 443 })
  if ($port80Claims.Count -ne 1 -or $port443Claims.Count -ne 0) { throw 'P6010-T03 domain-port classifier failed' }

  $collision80 = Join-Path $nginxConfD 'neighbor-80.conf'
  [IO.File]::WriteAllText($collision80,"server {`n listen 80;`n server_name baogiang.dtnt-damsan.edu.vn;`n}`n",[Text.UTF8Encoding]::new($false))
  $collisionGraph = Get-NginxEffectiveGraph -NginxPrefix $nginxPrefix -NginxConfig $nginxMain -PlannedManagedPath $httpManaged
  if (@($collisionGraph.servers | Where-Object { Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 80 }).Count -ne 2) { throw 'P6010-T04 port 80 collision was not detected' }
  Remove-Item -LiteralPath $collision80 -Force

  $collision443 = Join-Path $nginxConfD 'neighbor-443.conf'
  [IO.File]::WriteAllText($collision443,"server {`n listen 443 ssl;`n server_name BAOGIANG.DTNT-DAMSAN.EDU.VN.;`n}`n",[Text.UTF8Encoding]::new($false))
  $collisionGraph443 = Get-NginxEffectiveGraph -NginxPrefix $nginxPrefix -NginxConfig $nginxMain -PlannedManagedPath $httpManaged
  if (@($collisionGraph443.servers | Where-Object { Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 443 }).Count -ne 1) { throw 'P6010-T05 normalized port 443 collision was not detected' }
  Remove-Item -LiteralPath $collision443 -Force

  [IO.File]::WriteAllText($paths.winAcmeExe,'fixture',[Text.UTF8Encoding]::new($false))
  $settings = [pscustomobject]@{ Client = [pscustomobject]@{ ClientName='baogiang-win-acme'; ConfigurationPath=$paths.winAcmeConfig; LogPath=$paths.winAcmeLog } }
  [IO.File]::WriteAllText($paths.winAcmeSettings,($settings | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  $settingsResult = Assert-P6010WinAcmeSettings -Root $productionRoot
  if ($settingsResult.state -cne 'PASS') { throw 'P6010-T06 dedicated win-acme settings were rejected' }
  $settings.Client.ClientName = 'foreign-win-acme'
  [IO.File]::WriteAllText($paths.winAcmeSettings,($settings | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  $settingsRejected = $false
  try { Assert-P6010WinAcmeSettings -Root $productionRoot | Out-Null } catch { if ($_.Exception.Message -match 'P6010_WIN_ACME_CLIENT_NAME_CONFLICT') { $settingsRejected = $true } }
  if (-not $settingsRejected) { throw 'P6010-T07 foreign win-acme client name was accepted' }
  $settings.Client.ClientName = 'baogiang-win-acme'
  [IO.File]::WriteAllText($paths.winAcmeSettings,($settings | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))

  $authorityCommon = Join-Path $repo 'scripts\deploy\windows\deployment-common.ps1'
  $authorityHash = Get-FileSha256FromBytes $authorityCommon
  $fakeNginx = Join-Path $nginxPrefix 'nginx.exe'
  [IO.File]::WriteAllText($fakeNginx,'fixture',[Text.UTF8Encoding]::new($false))
  $issue = Get-P6010WinAcmeIssueCommandPlan -Root $productionRoot -NginxExe $fakeNginx -NginxPrefix $nginxPrefix -NginxConfig $nginxMain -ManagedHttp01Config $httpManaged -ManagedTlsConfig $tlsManaged -ClientMaxBodySize '20m' -AuthorityCommon $authorityCommon -ExpectedAuthorityCommonSha256 $authorityHash -AcmeEmail 'admin@example.test'
  $issueArgs = @($issue.arguments)
  foreach ($requiredPair in @(
    @('--id','baogiang-damsan'),
    @('--validation','filesystem'),
    @('--validationmode','http-01'),
    @('--store','pemfiles'),
    @('--pemfilesname','baogiang'),
    @('--installation','script')
  )) {
    $index = [Array]::IndexOf($issueArgs,$requiredPair[0])
    if ($index -lt 0 -or ($index + 1) -ge $issueArgs.Count -or $issueArgs[$index + 1] -cne $requiredPair[1]) { throw "P6010-T08 issue vector missing $($requiredPair -join ' ')" }
  }
  if ($issueArgs -notcontains '--notaskscheduler') { throw 'P6010-T08 issue vector may mutate win-acme global scheduler' }
  if (($issueArgs -join ' ') -notmatch 'ExpectedAuthorityCommonSha256' -or ($issueArgs -join ' ') -notmatch [regex]::Escape($authorityHash)) { throw 'P6010-T08 issue vector did not pin renewal hook authority hash' }

  $renew = Get-P6010WinAcmeRenewCommandPlan -Root $productionRoot
  if ((@($renew.arguments) -join "`n") -cne (@('--renew','--id','baogiang-damsan','--notaskscheduler') -join "`n")) { throw 'P6010-T09 renew vector drifted' }
  $task = Get-P6010RenewalTaskContract -Root $productionRoot
  if ($task.taskPath -cne '\BaoGiang\' -or $task.taskName -cne 'BaoGiangTlsRenewal' -or $task.createOrChangeAllowedHere -ne $false -or $task.schedule -cne 'REVIEW_AFTER_PROTECTED_NEIGHBOR_DISCOVERY') { throw 'P6010-T10 renewal task isolation contract drifted' }

  $hookPath = Join-Path $repo 'scripts\deploy\windows\production-tls-renewal-hook.ps1'
  $hookText = Get-Content -LiteralPath $hookPath -Raw -Encoding UTF8
  foreach ($requiredHookToken in @('P6010_AUTHORITY_COMMON_HASH_CONFLICT','[ScriptBlock]::Create($commonText)','Get-CanonicalNginxManagedBytes','Test-NginxServerClaims443Domain','Invoke-ReviewedNginxSyntaxTest','FIRST_ISSUE_CERT_READY_NO_RELOAD','RENEWED_CERTIFICATE_RELOAD_VERIFIED')) {
    if (-not $hookText.Contains($requiredHookToken)) { throw "P6010-T11 renewal hook missing token: $requiredHookToken" }
  }
  $hashCheck = $hookText.IndexOf('P6010_AUTHORITY_COMMON_HASH_CONFLICT')
  $scriptBlockCreate = $hookText.IndexOf('[ScriptBlock]::Create($commonText)')
  $syntaxCheck = $hookText.IndexOf('Invoke-ReviewedNginxSyntaxTest')
  $reloadExecution = $hookText.IndexOf('& $commands.reload.executable')
  if ($hashCheck -lt 0 -or $scriptBlockCreate -lt 0 -or $hashCheck -gt $scriptBlockCreate) { throw 'P6010-T11 common authority is executed before hash verification' }
  if ($syntaxCheck -lt 0 -or $reloadExecution -lt 0 -or $syntaxCheck -gt $reloadExecution) { throw 'P6010-T11 reload is reachable before syntax verification' }
  foreach ($forbidden in @('Set-Content','Copy-Item','Move-Item','New-ScheduledTask','Register-ScheduledTask','Set-ScheduledTask','Enable-ScheduledTask','Disable-ScheduledTask')) {
    if ($hookText -match [regex]::Escape($forbidden)) { throw "P6010-T11 renewal hook contains forbidden mutation: $forbidden" }
  }
  if ($hookText -match '(?i)(ReadAllBytes|Get-Content|Get-FileHash)[^\r\n]*(privateKey|baogiang-key\.pem)') { throw 'P6010-T11 renewal hook reads private-key content' }

  foreach ($readOnlyPath in @('production-http01-plan.ps1','production-http01-verify.ps1')) {
    $readOnlyText = Get-Content -LiteralPath (Join-Path $repo "scripts\deploy\windows\$readOnlyPath") -Raw -Encoding UTF8
    foreach ($forbidden in @('Register-ScheduledTask','Set-ScheduledTask','Enable-ScheduledTask','Disable-ScheduledTask','Start-ScheduledTask','Stop-ScheduledTask','-s reload')) {
      if ($readOnlyText -match [regex]::Escape($forbidden)) { throw "P6010-T12 read-only authority contains forbidden execution token: $readOnlyPath / $forbidden" }
    }
    if (-not $readOnlyText.Contains('mutationsPerformed = $false')) { throw "P6010-T12 read-only authority missing mutation declaration: $readOnlyPath" }
  }

  Write-Output 'P6-010 Windows HTTP-01/TLS authority fixtures PASS'
} finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
