$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repo 'scripts\deploy\windows\deployment-common.ps1')
$temp = Join-Path ([IO.Path]::GetTempPath()) ("baogiang-deploy-test-" + [guid]::NewGuid().ToString('N'))
try {
  $sha = 'a' * 40
  $root = Join-Path $temp 'root with spaces & unicode Đam San'
  $releases = Join-Path $root 'releases'
  $release = Join-Path $releases $sha
  New-Item -ItemType Directory -Path $release -Force | Out-Null
  Assert-ExactChildPath $root "releases\\$sha" | Out-Null
  if ((Assert-ExistingDirectory $releases) -ne (Get-CanonicalPath $releases)) { throw 'Bootstrapped release parent contract failed.' }
  $pointer = Join-Path $root 'current'
  New-Item -ItemType Junction -Path $pointer -Target $release | Out-Null
  if ((Assert-ReleasePointerTarget -PointerPath $pointer -Root $root) -ne (Get-CanonicalPath $release)) { throw 'Valid release pointer was rejected.' }
  Remove-Item -LiteralPath $pointer -Force
  New-Item -ItemType Junction -Path $pointer -Target $releases | Out-Null
  $rejected = $false; try { Assert-ReleasePointerTarget -PointerPath $pointer -Root $root | Out-Null } catch { $rejected = $true }
  if (-not $rejected) { throw 'Non-release junction target was accepted.' }
  $payload = @{ root = "C:\O'Brien & Đam San"; serviceKind = 'scheduled-task'; serviceName = 'BaoGiangBackend' } | ConvertTo-Json -Compress
  $payload64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
  $command = & node (Join-Path $repo 'scripts\ci\build-windows-remote-command.cjs') handshake-base64 $payload64
  $decoded = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($command))
  if ($decoded -notmatch "O''Brien" -or $decoded -notmatch 'BAOGIANG_HANDSHAKE_PASS') { throw 'Encoded OpenSSH command contract failed.' }
  $global:LASTEXITCODE = 77
  & { [pscustomobject]@{ state = 'completed' } } | Out-Null
  if ($LASTEXITCODE -ne 77) { throw 'Fixture did not preserve stale native exit code.' }
  Write-Output '[deployment-windows] PASS (paths, junction safety, encoded command, stale LASTEXITCODE fixture)'
} finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
