[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$PgDumpExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$PgRestoreExe,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$BackupRoot,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ExpectedEntryPoint,
  [string]$DatabaseUrlEnvironmentVariable = 'DATABASE_URL'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
Read-DeploymentIdentity -Root $Root -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint | Out-Null
Assert-ExecutableContract @{ PgDumpExe = $PgDumpExe; PgRestoreExe = $PgRestoreExe }
if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) { throw 'Backup directory must be bootstrapped and ACL-reviewed before deploy.' }
$databaseUrl = [Environment]::GetEnvironmentVariable($DatabaseUrlEnvironmentVariable)
if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw 'Server-side database environment is missing.' }
$parts = Set-PostgresProcessEnvironment -DatabaseUrl $databaseUrl -ExpectedPort 5433
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupPath = Join-Path (Get-CanonicalPath $BackupRoot) "baogiang-$stamp.dump"
try {
  Invoke-NativeChecked $PgDumpExe @('--format=custom','--file',$backupPath,'--host',$parts.host,'--port',[string]$parts.port,'--username',$parts.user,'--dbname',$parts.database) 'pg_dump' | Out-Null
  $item = Get-Item -LiteralPath $backupPath
  if ($item.Length -le 0) { throw 'Database backup is empty.' }
  Invoke-NativeChecked $PgRestoreExe @('--list',$backupPath) 'pg_restore --list verification' | Out-Null
  $hash = Get-FileHash -LiteralPath $backupPath -Algorithm SHA256
  [ordered]@{ path = $backupPath; bytes = $item.Length; sha256 = $hash.Hash; format = 'custom'; restoreList = 'PASS'; createdAtUtc = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress
} finally { Clear-PostgresProcessEnvironment }
