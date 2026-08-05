[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReleaseSha,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$SourceArchive,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedSha256,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NpmExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NodeExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NpxExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$PgDumpExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$EnvFile,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NginxExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NginxConfig,
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$ExpectedBaseUrl,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$ExpectedEntryPoint,
  [switch]$RunMigrations,
  [switch]$ProductionMigrationApproved
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$switched = $false; $migrationApplied = $false
try {
  $allowed = @('NODE_ENV','API_HOST','API_PORT','DATABASE_URL','CORS_ORIGINS','HTTP_TRUST_PROXY_HOPS','AUTH_COOKIE_SECURE','AI_ENABLED','AI_ACTIVE_MODE_ENABLED','AI_PASSIVE_MODE_ENABLED','WEB_PUSH_ENABLED')
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { throw 'Production environment file contains an invalid line.' }
    $name = $Matches[1]; $value = $Matches[2]
    if ($allowed -notcontains $name) { continue }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
  if ($env:NODE_ENV -ne 'production' -or $env:API_HOST -notin @('127.0.0.1','::1','localhost') -or $env:API_PORT -ne '3100' -or $env:HTTP_TRUST_PROXY_HOPS -ne '1' -or $env:AUTH_COOKIE_SECURE -ne 'true' -or $env:AI_ENABLED -ne 'false' -or $env:AI_ACTIVE_MODE_ENABLED -ne 'false' -or $env:AI_PASSIVE_MODE_ENABLED -ne 'false' -or $env:WEB_PUSH_ENABLED -ne 'false' -or [string]::IsNullOrWhiteSpace($env:DATABASE_URL) -or $env:CORS_ORIGINS -notlike "*$ExpectedBaseUrl*") { throw 'Production environment validation failed.' }
  & $NginxExe -t -c $NginxConfig 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Nginx configuration test failed; no reload was attempted.' }
  & (Join-Path $PSScriptRoot 'install-release.ps1') -ReleaseSha $ReleaseSha -Root $Root -SourceArchive $SourceArchive -ExpectedSha256 $ExpectedSha256 -NpmExe $NpmExe -NodeExe $NodeExe
  $backup = & (Join-Path $PSScriptRoot 'backup-database.ps1') -PgDumpExe $PgDumpExe -BackupRoot (Join-Path $Root 'backups') | ConvertFrom-Json
  if ([int64]$backup.bytes -le 0) { throw 'Backup verification failed.' }
  if ($RunMigrations) { & (Join-Path $PSScriptRoot 'run-migrations.ps1') -ReleasePath (Join-Path $Root "releases\$ReleaseSha") -NpxExe $NpxExe -AllowProductionMigration:$ProductionMigrationApproved -BackupVerified; $migrationApplied = $true }
  & (Join-Path $PSScriptRoot 'switch-current-release.ps1') -ReleaseSha $ReleaseSha -Root $Root; $switched = $true
  & (Join-Path $PSScriptRoot 'restart-baogiang-api.ps1') -ServiceKind $ServiceKind -ServiceName $ServiceName -ExpectedEntryPoint $ExpectedEntryPoint -Root $Root
  & (Join-Path $PSScriptRoot 'test-production-health.ps1')
} catch {
  if ($switched) { & (Join-Path $PSScriptRoot 'rollback-release.ps1') -Root $Root -ServiceKind $ServiceKind -ServiceName $ServiceName -ExpectedEntryPoint $ExpectedEntryPoint -MigrationApplied:$migrationApplied }
  throw
}
