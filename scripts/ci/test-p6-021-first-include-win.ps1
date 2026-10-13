# P6-021 Windows CI-only fixture. Must never execute on the production VPS.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repo 'scripts\deploy\windows\deployment-common.ps1')
. (Join-Path $repo 'scripts\deploy\windows\p6-010-http01-tls-common.ps1')
function Check([bool]$Condition,[string]$Name) {
  if (-not $Condition) { throw ('P6_021_' + $Name + '_FAILED') }
  Write-Output ('PASS ' + $Name)
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('pg16-nginx-test-' + [guid]::NewGuid().ToString('N'))
try {
  $prefix = Join-Path $root 'nginx'
  $conf = Join-Path $prefix 'conf'
  $managedDir = Join-Path $conf 'baogiang-managed'
  $app = Join-Path $root 'baogiang'
  foreach($dir in @($prefix,$conf,$managedDir,$app)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $main = Join-Path $conf 'nginx.conf'
  $managed = Join-Path $managedDir 'baogiang-http01.conf'
  $enc = [Text.UTF8Encoding]::new($false)
  $crlf = [string][char]13 + [string][char]10
  $original = (@(
    'worker_processes 1;'
    'events { worker_connections 1024; }'
    'http {'
    '  server { listen 80; server_name dtnt-damsan.edu.vn www.dtnt-damsan.edu.vn; }'
    '  server { listen 443 ssl; server_name dtnt-damsan.edu.vn www.dtnt-damsan.edu.vn; }'
    '}'
    ''
  ) -join $crlf)
  [IO.File]::WriteAllText($main,$original,$enc)
  $hash = Get-FileSha256FromBytes $main
  $initial = Get-NginxEffectiveGraph $prefix $main
  Check (@($initial.servers).Count -eq 2) 'INITIAL_TWO_NEIGHBORS'
  [IO.File]::WriteAllBytes($managed,(Get-P6010Http01ManagedBytes -Root $app))
  $orphan = Get-NginxEffectiveGraph $prefix $main
  Check (@($orphan.servers).Count -eq 2) 'ORPHAN_HTTP01_NOT_ACTIVE'
  Check ((Get-FileSha256FromBytes $main) -ceq $hash) 'ORIGINAL_BYTES_PRESERVED'
  $absoluteGlob = (Join-Path $managedDir '*.conf').Replace('\','/')
  $addition = '  include ' + $absoluteGlob + ';' + $crlf
  $desired = $original.Replace('http {' + $crlf,'http {' + $crlf + $addition)
  Check ($desired.Replace($addition,'') -ceq $original) 'EXACT_INCLUDE_REVERTIBLE'
  [IO.File]::WriteAllText($main,$desired,$enc)
  $graph = Get-NginxEffectiveGraph $prefix $main
  $matching = @($graph.servers | Where-Object { Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 80 })
  Check (@($graph.servers).Count -eq 3) 'THREE_SERVERS_WITH_FIRST_INCLUDE'
  Check ($matching.Count -eq 1) 'ONE_BAOGIANG_HTTP01'
  Check (@($graph.servers | Where-Object { Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 443 }).Count -eq 0) 'NO_BAOGIANG_443'
  $copy = Join-Path $managedDir 'duplicate.conf'
  [IO.File]::Copy($managed,$copy)
  $dups = Get-NginxEffectiveGraph $prefix $main
  Check (@($dups.servers | Where-Object { Test-P6010NginxServerClaimsDomainPort -Server $_ -Port 80 }).Count -eq 2) 'DUPLICATE_DETECTED'
  Remove-Item -LiteralPath $copy -Force
  Remove-Item -LiteralPath $managed -Force
  $rejected=$false
  try { Get-NginxEffectiveGraph $prefix $main | Out-Null } catch { $rejected=$true }
  Check $rejected 'MISSING_LEAF_REJECTED'
  [IO.File]::WriteAllText($main,$original,$enc)
  Check ((Get-FileSha256FromBytes $main) -ceq $hash) 'BYTE_EXACT_ROLLBACK'
  Write-Output '[P6-021 nginx first include] PASS (offline fixture only)'
} finally {
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
