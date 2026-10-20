$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$script=Join-Path $PSScriptRoot '..\deploy\windows\prune-releases.ps1'
$root=Join-Path ([IO.Path]::GetTempPath()) ('baogiang-release-prune-test-'+([guid]::NewGuid().ToString('N')))
$sha=@{current=('a'*40);previous=('b'*40);failed=('c'*40);stale=('d'*40)}
try {
  foreach($sub in @('releases','incoming')){New-Item -ItemType Directory -Path (Join-Path $root $sub) -Force |Out-Null}
  foreach($entry in $sha.GetEnumerator()){
    $p=Join-Path (Join-Path $root 'releases') $entry.Value
    New-Item -ItemType Directory -Path $p -Force|Out-Null
    Set-Content -LiteralPath (Join-Path $p 'marker.txt') -Value $entry.Key
  }
  foreach($role in @('current','previous','failed')){
    New-Item -ItemType Junction -Path (Join-Path $root $(if($role -eq 'failed'){'failed-release'}else{$role})) -Target (Join-Path (Join-Path $root 'releases') $sha[$role]) |Out-Null
  }
  $stale=Join-Path (Join-Path $root 'releases') $sha.stale
  $module=Join-Path $stale 'node_modules\@baogiang'
  New-Item -ItemType Directory -Path $module -Force|Out-Null
  New-Item -ItemType Directory -Path (Join-Path $stale 'apps\api') -Force|Out-Null
  New-Item -ItemType Junction -Path (Join-Path $module 'api') -Target (Join-Path $stale 'apps\api')|Out-Null
  $archive=Join-Path (Join-Path $root 'incoming') ('release-'+$sha.stale+'.zip')
  Set-Content -LiteralPath $archive -Value 'fixture'
  $dry=@(& $script -ExpectedSha $sha.current -Root $root -TestFixture)
  if(-not (Test-Path -LiteralPath $stale) -or -not ($dry -match 'RELEASE_PRUNE_PLAN')){throw 'DRY_RUN_FAILED'}
  $act=@(& $script -ExpectedSha $sha.current -Root $root -TestFixture -Execute)
  if((Test-Path -LiteralPath $stale) -or (Test-Path -LiteralPath $archive)){throw 'STALE_NOT_REMOVED'}
  foreach($role in @('current','previous','failed')) {
    if(-not (Test-Path -LiteralPath (Join-Path (Join-Path $root 'releases') $sha[$role]))){throw "PROTECTED_GONE_$role"}
  }
  if(-not ($act -match 'RELEASE_PRUNE_REMOVED')){throw 'MISSING_RESULT'}
  $wrong='f'*40
  $wrongPath=Join-Path (Join-Path $root 'releases') $wrong
  New-Item -ItemType Directory -Path (Join-Path $wrongPath 'node_modules\@baogiang') -Force|Out-Null
  $outside=Join-Path $root 'outside-protected'
  New-Item -ItemType Directory -Path $outside -Force|Out-Null
  Set-Content -LiteralPath (Join-Path $outside 'preserve.txt') -Value 'safe'
  $badLink=Join-Path $wrongPath 'node_modules\@baogiang\api'
  New-Item -ItemType Junction -Path $badLink -Target $outside|Out-Null
  $rejected=$false
  try { & $script -ExpectedSha $sha.current -Root $root -TestFixture -Execute |Out-Null } catch {
    if($_.Exception.Message -match 'RELEASE_PRUNE_UNSAFE_WORKSPACE_LINK') {$rejected=$true}else{throw}
  }
  if(-not $rejected -or -not(Test-Path -LiteralPath (Join-Path $outside 'preserve.txt'))){throw 'UNSAFE_LINK_WAS_NOT_BLOCKED'}
  [IO.Directory]::Delete($badLink,$false)
  Remove-Item -LiteralPath $wrongPath -Force -Recurse
  $mismatch=$false
  try { & $script -ExpectedSha $sha.previous -Root $root -TestFixture -Execute |Out-Null } catch {
    if($_.Exception.Message -match 'RELEASE_PRUNE_CURRENT_SHA_MISMATCH') {$mismatch=$true}else{throw}
  }
  if(-not $mismatch){throw 'CURRENT_SHA_MISMATCH_NOT_BLOCKED'}
  Write-Output 'RELEASE_RETENTION_FIXTURE PASS: dry-run, stale release/ZIP deletion, 3 protected releases, unsafe junction and wrong current SHA blocked'
} finally {
  foreach($role in @('current','previous','failed-release')){
    $p=Join-Path $root $role
    if(Test-Path -LiteralPath $p){[IO.Directory]::Delete($p,$false)}
  }
  if(Test-Path -LiteralPath $root){Remove-Item -LiteralPath $root -Force -Recurse}
}
