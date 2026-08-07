[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReleaseSha,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ExpectedEntryPoint
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
$identity = Read-DeploymentIdentity -Root $Root -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint
$canonicalRoot = $identity.canonicalRoot
$release = Join-Path $canonicalRoot "releases\$ReleaseSha"; $current = Join-Path $canonicalRoot 'current'; $previous = Join-Path $canonicalRoot 'previous'; $incoming = Join-Path $canonicalRoot 'current.next'
if (-not (Test-Path -LiteralPath $release -PathType Container)) { throw 'Target release does not exist.' }
$previousTarget = $null
if (Test-Path -LiteralPath $current) { $previousTarget = Assert-ReleasePointerTarget -PointerPath $current -Root $canonicalRoot }
if (Test-Path -LiteralPath $previous) { Assert-ReleasePointerTarget -PointerPath $previous -Root $canonicalRoot | Out-Null }
if (Test-Path -LiteralPath $incoming) { Assert-ReleasePointerTarget -PointerPath $incoming -Root $canonicalRoot | Out-Null; Remove-Item -LiteralPath $incoming -Force }
New-Item -ItemType Junction -Path $incoming -Target $release | Out-Null
try {
  if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Force }
  if (Test-Path -LiteralPath $current) { Move-Item -LiteralPath $current -Destination $previous }
  Move-Item -LiteralPath $incoming -Destination $current
} catch {
  if (Test-Path -LiteralPath $incoming) { Remove-Item -LiteralPath $incoming -Force -ErrorAction SilentlyContinue }
  throw
}
[ordered]@{ currentRelease = $ReleaseSha; previousRelease = if ($previousTarget) { Split-Path $previousTarget -Leaf } else { $null } } | ConvertTo-Json -Compress
