[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReleaseSha,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($Root); $release = Join-Path $root "releases\$ReleaseSha"; $current = Join-Path $root 'current'; $previous = Join-Path $root 'previous'; $incoming = Join-Path $root 'current.next'
if (-not (Test-Path $release -PathType Container)) { throw 'Target release does not exist.' }
if (Test-Path $incoming) { Remove-Item -LiteralPath $incoming -Force -Recurse }
New-Item -ItemType Junction -Path $incoming -Target $release | Out-Null
if (Test-Path $previous) { Remove-Item -LiteralPath $previous -Force }
if (Test-Path $current) { Move-Item -LiteralPath $current -Destination $previous }
Move-Item -LiteralPath $incoming -Destination $current
Write-Output "Current release switched to $ReleaseSha; previous pointer preserved when one existed."
