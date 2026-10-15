[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReleaseSha,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$ReleasePath,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NpxExe,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ExpectedEntryPoint,
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$ExpectedBaseUrl
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
$identity = Read-DeploymentIdentity -Root $Root -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint
$release = Assert-ExactReleasePath -Root $identity.canonicalRoot -ReleaseSha $ReleaseSha -ReleasePath $ReleasePath
$schema = Get-CanonicalPath (Join-Path $release 'prisma\schema.prisma')
if (-not (Test-Path -LiteralPath $schema -PathType Leaf) -or -not (Test-PathWithin $schema $release)) { throw 'Exact release Prisma schema is missing.' }
$migrations = Get-CanonicalPath (Join-Path $release 'prisma\migrations')
if (-not (Test-Path -LiteralPath $migrations -PathType Container) -or -not (Test-PathWithin $migrations $release)) { throw 'Exact release Prisma migration directory is missing.' }
if (@(Get-ChildItem -LiteralPath $migrations -Directory -ErrorAction Stop).Count -eq 0) { throw 'Exact release has no migration history; code-only deployment is blocked.' }
Assert-ExecutableContract @{ NpxExe = $NpxExe }
Invoke-WithServerEnvironment -EnvFile $EnvFile -ExpectedBaseUrl $ExpectedBaseUrl -ScriptBlock {
  try {
    $databaseUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL','Process')
    if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw 'Production database environment is missing.' }
    # Port 5434 belongs to Báo giảng; port 5433 belongs to protected Nội trú.
    $parts = Set-PostgresProcessEnvironment -DatabaseUrl $databaseUrl -ExpectedPort 5434
    if ($parts.host -notin @('127.0.0.1','localhost','::1')) { throw 'Code-only migration status must use the isolated loopback PostgreSQL host.' }
    Push-Location -LiteralPath $release
    try {
      $previousNativePreference = $ErrorActionPreference
      try {
        $ErrorActionPreference = 'Continue'
        $statusOutput = @(& $NpxExe --no-install prisma migrate status --schema $schema 2>&1)
        $prismaExitCode = $LASTEXITCODE
      } finally { $ErrorActionPreference = $previousNativePreference }
    } finally { Pop-Location }
    if ($prismaExitCode -ne 0) { throw 'Code-only deployment blocked: Prisma migration status is not clean.' }
    $statusText = ($statusOutput -join ' ')
    if ($statusText -notmatch '(?i)database schema is up to date') { throw 'Code-only deployment blocked: Prisma did not confirm an up-to-date schema.' }
    [ordered]@{ state = 'verifiedNoPending'; releaseSha = $ReleaseSha; databasePort = 5434 } | ConvertTo-Json -Compress
  } finally { Clear-PostgresProcessEnvironment }
}
