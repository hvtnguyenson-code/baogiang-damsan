[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NodeExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$EnvFile,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$ExpectedEntryPoint,
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$ExpectedBaseUrl,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
$canonicalRoot = Assert-DedicatedRoot $Root
$wrapper = Get-CanonicalPath $PSCommandPath
$identity = Read-DeploymentIdentity -Root $canonicalRoot -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $wrapper -ExpectedEntryPoint $ExpectedEntryPoint -NodeExe $NodeExe
$canonicalRoot = $identity.canonicalRoot
$marker = $identity.marker
$environmentSnapshot = Import-ServerEnvironment -EnvFile $EnvFile -ExpectedBaseUrl $ExpectedBaseUrl
$exitCode = 1
try {
  $entry = Get-CanonicalPath $ExpectedEntryPoint
  if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { throw 'Current API entry point is missing.' }
  if ((Normalize-ComparablePath $entry) -notlike "$(Normalize-ComparablePath (Join-Path $canonicalRoot 'current'))*") { throw 'API entry point is outside the current release pointer.' }
  & $NodeExe $entry
  $exitCode = $LASTEXITCODE
} finally { Restore-ServerEnvironment -Snapshot $environmentSnapshot; Clear-PostgresProcessEnvironment }
exit $exitCode
