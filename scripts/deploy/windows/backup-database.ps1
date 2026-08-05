[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$PgDumpExe,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$BackupRoot,
  [string]$DatabaseUrlEnvironmentVariable = 'DATABASE_URL'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$databaseUrl = [Environment]::GetEnvironmentVariable($DatabaseUrlEnvironmentVariable)
if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw "Server-side environment variable is missing: $DatabaseUrlEnvironmentVariable" }
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupPath = Join-Path ([IO.Path]::GetFullPath($BackupRoot)) "baogiang-$stamp.dump"
& $PgDumpExe --format=custom --file $backupPath --dbname $databaseUrl 2>$null
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }
$item = Get-Item -LiteralPath $backupPath
if ($item.Length -le 0) { throw 'Database backup is empty.' }
$hash = Get-FileHash -LiteralPath $backupPath -Algorithm SHA256
[ordered]@{ path = $backupPath; bytes = $item.Length; sha256 = $hash.Hash; createdAtUtc = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
