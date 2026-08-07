[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$ReleasePath,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NpxExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$PsqlExe,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ExpectedEntryPoint,
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$ExpectedBaseUrl,
  [Parameter(Mandatory = $true)][switch]$AllowProductionMigration,
  [Parameter(Mandatory = $true)][switch]$BackupVerified,
  [string]$DatabaseUrlEnvironmentVariable = 'DATABASE_URL'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
if (-not $AllowProductionMigration) { throw 'Production migration is disabled unless explicitly authorized.' }
if (-not $BackupVerified) { throw 'A verified database backup is required before migration.' }
Read-DeploymentIdentity -Root $Root -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint | Out-Null
Import-ServerEnvironment -EnvFile $EnvFile -ExpectedBaseUrl $ExpectedBaseUrl | Out-Null
Assert-ExecutableContract @{ NpxExe = $NpxExe; PsqlExe = $PsqlExe }
$schema = Join-Path $ReleasePath 'prisma\schema.prisma'
if (-not (Test-Path -LiteralPath $schema -PathType Leaf)) { throw 'Prisma schema is missing from release.' }
$databaseUrl = [Environment]::GetEnvironmentVariable($DatabaseUrlEnvironmentVariable)
$parts = Set-PostgresProcessEnvironment -DatabaseUrl $databaseUrl -ExpectedPort 5433
function Get-MigrationState([string]$Phase) {
  $existsQuery = "SELECT CASE WHEN to_regclass('public._prisma_migrations') IS NULL THEN 'NOT_PRESENT' ELSE 'PRESENT' END;"
  try {
    $exists = @(& $PsqlExe '--tuples-only','--no-align','--command',$existsQuery,'--host',$parts.host,'--port',[string]$parts.port,'--username',$parts.user,'--dbname',$parts.database 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'psql migration-table state query failed.' }
    $tableState = ($exists -join '').Trim()
    if ($tableState -eq 'NOT_PRESENT') { return [ordered]@{ phase = $Phase; state = 'NOT_PRESENT' } }
    $rowsQuery = "SELECT COALESCE(string_agg(migration_name || ':' || CASE WHEN finished_at IS NULL THEN 'UNFINISHED' ELSE 'FINISHED' END || ':' || CASE WHEN rolled_back_at IS NULL THEN 'NOT_ROLLED_BACK' ELSE 'ROLLED_BACK' END, ',' ORDER BY started_at), 'EMPTY') FROM public._prisma_migrations;"
    $rows = @(& $PsqlExe '--tuples-only','--no-align','--command',$rowsQuery,'--host',$parts.host,'--port',[string]$parts.port,'--username',$parts.user,'--dbname',$parts.database 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'psql migration-row state query failed.' }
    return [ordered]@{ phase = $Phase; state = ($rows -join '').Trim() }
  } catch { throw }
}
try {
  $before = Get-MigrationState 'before'
  $statusOutput = @(& $NpxExe 'prisma','migrate','status','--schema',$schema 2>&1)
  $statusExit = $LASTEXITCODE
  $statusClass = 'clean'
  if ($statusExit -ne 0) {
    $joinedStatus = ($statusOutput -join ' ')
    if ($joinedStatus -match '(?i)not yet applied|pending|not in sync|following migration') { $statusClass = 'pending' } else { throw 'Prisma migrate status failed for a reason other than expected pending migrations.' }
  }
  Write-Output ([ordered]@{ precheck = $statusClass; migrationState = $before } | ConvertTo-Json -Compress)
  Invoke-NativeChecked $NpxExe @('prisma','migrate','deploy','--schema',$schema) 'prisma migrate deploy' | Out-Null
  $after = Get-MigrationState 'after-deploy'
  Invoke-NativeChecked $NpxExe @('prisma','migrate','status','--schema',$schema) 'prisma migrate status after deploy' | Out-Null
  [ordered]@{ state = 'completed'; before = $before; after = $after } | ConvertTo-Json -Compress
} finally { Clear-PostgresProcessEnvironment }
