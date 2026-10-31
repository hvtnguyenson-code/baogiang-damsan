[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReleaseSha,
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$NodeExe,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][string]$ServiceName,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ExpectedEntryPoint,
  [Parameter(Mandatory = $true)][string]$ExpectedBaseUrl
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
$identity = Read-DeploymentIdentity -Root $Root -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint -NodeExe $NodeExe
$release = Assert-ExactReleasePath -Root $identity.canonicalRoot -ReleaseSha $ReleaseSha -ReleasePath (Join-Path $identity.canonicalRoot "releases\$ReleaseSha")
$verifier = Get-CanonicalPath (Join-Path $release 'scripts\deploy\node\verify-release-schema.cjs')
if (-not (Test-PathWithin $verifier $release) -or -not (Test-Path -LiteralPath $verifier -PathType Leaf)) { throw 'Exact release schema verifier is missing.' }
Assert-ExecutableContract @{ NodeExe = $NodeExe }
Invoke-WithServerEnvironment -EnvFile $EnvFile -ExpectedBaseUrl $ExpectedBaseUrl -ScriptBlock {
  try {
    $databaseUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL','Process')
    $parts = Set-PostgresProcessEnvironment -DatabaseUrl $databaseUrl -ExpectedPort 5434
    if ($parts.host -notin @('127.0.0.1','localhost','::1')) { throw 'Release schema verification requires the isolated loopback database.' }
    Invoke-NativeChecked $NodeExe @($verifier) 'exact release schema verification' | Out-Null
    [ordered]@{ state = 'verifiedSchema'; releaseSha = $ReleaseSha } | ConvertTo-Json -Compress
  } finally { Clear-PostgresProcessEnvironment }
}
