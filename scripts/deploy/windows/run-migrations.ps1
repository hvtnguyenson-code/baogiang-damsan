[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$ReleasePath,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NpxExe,
  [switch]$AllowProductionMigration,
  [switch]$BackupVerified,
  [string]$DatabaseUrlEnvironmentVariable = 'DATABASE_URL'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $AllowProductionMigration) { throw 'Production migration is disabled unless explicitly authorized.' }
if (-not $BackupVerified) { throw 'A verified database backup is required before migration.' }
if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($DatabaseUrlEnvironmentVariable))) { throw 'Server-side database environment is missing.' }
$schema = Join-Path $ReleasePath 'prisma\schema.prisma'
if (-not (Test-Path -LiteralPath $schema -PathType Leaf)) { throw 'Prisma schema is missing from release.' }
& $NpxExe prisma migrate status --schema $schema
if ($LASTEXITCODE -ne 0) { throw 'Prisma migration status pre-check failed.' }
& $NpxExe prisma migrate deploy --schema $schema
if ($LASTEXITCODE -ne 0) { throw 'Prisma migration deploy failed.' }
