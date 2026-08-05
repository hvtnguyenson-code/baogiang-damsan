[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$ExpectedEntryPoint,
  [switch]$MigrationApplied
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($Root); $current = Join-Path $root 'current'; $previous = Join-Path $root 'previous'; $temp = Join-Path $root 'rollback.next'
if (-not (Test-Path $previous)) { throw 'No previous release pointer exists; rollback is unavailable.' }
$failed = Join-Path $root 'failed-release'
if (Test-Path $failed) { throw 'A failed-release pointer already exists; operator must inspect it before retrying rollback.' }
if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Force -Recurse }
New-Item -ItemType Junction -Path $temp -Target (Get-Item $previous).Target | Out-Null
if (Test-Path $current) { Move-Item -LiteralPath $current -Destination $failed }
Move-Item -LiteralPath $temp -Destination $current
& (Join-Path $PSScriptRoot 'restart-baogiang-api.ps1') -ServiceKind $ServiceKind -ServiceName $ServiceName -ExpectedEntryPoint $ExpectedEntryPoint -Root $Root
if ($MigrationApplied) { Write-Error 'Code rollback completed, but database migration rollback is not automatic; inspect migration state and stop.'; exit 2 }
