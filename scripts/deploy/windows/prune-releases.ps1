[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedSha,
  [Parameter(Mandatory=$true)][string]$Root,
  [switch]$Execute,
  [switch]$TestFixture
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

# Only the dedicated Bao giang release store may be pruned. Fail closed.
$canonicalRoot=[IO.Path]::GetFullPath($Root).TrimEnd('\')
if($TestFixture) {
  $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  if(-not $canonicalRoot.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or
     (Split-Path $canonicalRoot -Leaf) -cnotmatch '^baogiang-release-prune-test-[0-9a-f]{32}$') {
    throw 'RELEASE_PRUNE_FIXTURE_ROOT_NOT_AUTHORIZED'
  }
} elseif ($canonicalRoot -ine 'C:\baogiang') {
  throw 'RELEASE_PRUNE_ROOT_NOT_AUTHORIZED'
}
$releaseRoot=Join-Path $Root 'releases'
$incoming=Join-Path $Root 'incoming'
foreach($path in @($Root,$releaseRoot,$incoming)) {
  $item=Get-Item -LiteralPath $path -Force -ErrorAction Stop
  if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'RELEASE_PRUNE_UNSAFE_DIRECTORY'
  }
}
$shaRegex='^[0-9a-f]{40}$'
$protected=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach($name in @('current','previous','failed-release')) {
  $ptr=Join-Path $Root $name
  $item=Get-Item -LiteralPath $ptr -Force -ErrorAction Stop
  $expectedPrefix=$releaseRoot+'\'
  $target=[string]@($item.Target)[0]
  if($item.LinkType -ne 'Junction' -or -not $target.StartsWith($expectedPrefix,[StringComparison]::OrdinalIgnoreCase)) {
    throw "RELEASE_PRUNE_INVALID_POINTER_$name"
  }
  $id=$target.Substring($expectedPrefix.Length)
  if($id -cnotmatch $shaRegex -or -not (Test-Path -LiteralPath $target -PathType Container)) {
    throw "RELEASE_PRUNE_INVALID_POINTER_TARGET_$name"
  }
  [void]$protected.Add($id)
}
if(-not $protected.Contains($ExpectedSha)) { throw 'RELEASE_PRUNE_EXPECTED_SHA_NOT_PROTECTED' }
$current=(Get-Item -LiteralPath (Join-Path $Root 'current') -Force).Target
if((Split-Path ([string]@($current)[0]) -Leaf) -cne $ExpectedSha) {
  throw 'RELEASE_PRUNE_CURRENT_SHA_MISMATCH'
}

$procs=if($TestFixture){@()}else{@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {$_.CommandLine})}
$plan=@()
foreach($dir in @(Get-ChildItem -LiteralPath $releaseRoot -Force -ErrorAction Stop)) {
  if(-not $dir.PSIsContainer -or ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $dir.Name -cnotmatch $shaRegex) {
    throw 'RELEASE_PRUNE_UNKNOWN_RELEASE_ENTRY'
  }
  if($protected.Contains($dir.Name)) { continue }
  foreach($p in $procs) {
    if($p.CommandLine.IndexOf($dir.FullName,[StringComparison]::OrdinalIgnoreCase) -ge 0) {
      throw 'RELEASE_PRUNE_PROCESS_REFERENCE'
    }
  }
  # npm workspace junctions must point strictly INSIDE this same release.
  $workspace=Join-Path $dir.FullName 'node_modules\@baogiang'
  $links=@()
  if(Test-Path -LiteralPath $workspace -PathType Container) {
    $links=@(Get-ChildItem -LiteralPath $workspace -Force -ErrorAction Stop)
    foreach($link in $links) {
      $t=[string]@($link.Target)[0]
      if($link.LinkType -ne 'Junction' -or -not $t.StartsWith($dir.FullName+'\',[StringComparison]::OrdinalIgnoreCase)) {
        throw 'RELEASE_PRUNE_UNSAFE_WORKSPACE_LINK'
      }
    }
  }
  $archive=Join-Path $incoming ('release-'+$dir.Name+'.zip')
  if(Test-Path -LiteralPath $archive) {
    $z=Get-Item -LiteralPath $archive -Force
    if($z.PSIsContainer -or ($z.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'RELEASE_PRUNE_UNSAFE_ARCHIVE'
    }
  }
  $plan+= [pscustomobject]@{Sha=$dir.Name;Path=$dir.FullName;Archive=$archive;Links=$links}
}
# Do not delete orphan ZIPs without a matching, safely validated release directory.
foreach($p in $plan) {
  if(-not $Execute) { Write-Output "RELEASE_PRUNE_PLAN sha=$($p.Sha)"; continue }
  foreach($link in $p.Links) { [IO.Directory]::Delete($link.FullName,$false) }
  # Long-path-safe, literal Windows directory removal. Exit code and absence required.
  $long='\\?\'+$p.Path
  & cmd.exe /d /c ('rmdir /s /q "'+$long+'"')
  if($LASTEXITCODE -ne 0 -or (Test-Path -LiteralPath $p.Path)) { throw 'RELEASE_PRUNE_RMDIR_FAILED' }
  if(Test-Path -LiteralPath $p.Archive) { Remove-Item -LiteralPath $p.Archive -Force -ErrorAction Stop }
  Write-Output "RELEASE_PRUNE_REMOVED sha=$($p.Sha)"
}
Write-Output "RELEASE_PRUNE_OK removed=$($(if($Execute){$plan.Count}else{0})) planned=$($plan.Count)"
