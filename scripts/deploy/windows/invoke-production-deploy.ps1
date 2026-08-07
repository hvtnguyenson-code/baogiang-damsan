[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$ParameterFile
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
$propertyNames = @('ReleaseSha','Root','TransferDirectoryName','SourceArchiveName','ExpectedSha256','NodeExe','NpmExe','NpxExe','PsqlExe','PgDumpExe','PgRestoreExe','EnvFile','StartupWrapper','NginxExe','NginxConfig','ExpectedBaseUrl','ServiceKind','ServiceName','ExpectedEntryPoint','MigrationRequested','ProductionMigrationApproved','RollbackCompatibilityApproved','ReportFileName')
$p = Get-Content -LiteralPath $ParameterFile -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($property in $p.PSObject.Properties.Name) { if ($propertyNames -notcontains $property) { throw 'Deployment parameter JSON contains an unknown property.' } }
foreach ($property in $propertyNames) { if (-not $p.PSObject.Properties.Name.Contains($property)) { throw "Deployment parameter JSON is missing: $property" } }
if ($p.ReleaseSha -notmatch '^[0-9a-f]{40}$' -or $p.ExpectedSha256 -notmatch '^[0-9A-Fa-f]{64}$' -or $p.TransferDirectoryName -notmatch "^control-[0-9]+-[0-9]+-$($p.ReleaseSha)$" -or $p.SourceArchiveName -notmatch "^release-$($p.ReleaseSha)\.zip$" -or $p.ReportFileName -notmatch "^deploy-report-$($p.ReleaseSha)\.json$") { throw 'Deployment parameter JSON has an unsafe transfer/release/checksum/report identity.' }
if ($p.ServiceKind -notin @('scheduled-task','service') -or $p.ExpectedBaseUrl -ne 'https://baogiang.dtnt-damsan.edu.vn') { throw 'Deployment parameter JSON has an unsafe service/domain contract.' }
$canonicalRoot = Assert-DedicatedRoot $p.Root
$identity = Read-DeploymentIdentity -Root $canonicalRoot -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint
$canonicalRoot = $identity.canonicalRoot
$marker = $identity.marker
Assert-VerifiedRuntimeIdentity -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
if ($marker.nginxExe -and (Normalize-ComparablePath $marker.nginxExe) -ne (Normalize-ComparablePath $p.NginxExe)) { throw 'Nginx executable does not match the deployment marker.' }
if ($marker.nginxConfig -and (Normalize-ComparablePath $marker.nginxConfig) -ne (Normalize-ComparablePath $p.NginxConfig)) { throw 'Nginx config does not match the deployment marker.' }
Assert-ExecutableContract @{ NodeExe = $p.NodeExe; NpmExe = $p.NpmExe; NpxExe = $p.NpxExe; PsqlExe = $p.PsqlExe; PgDumpExe = $p.PgDumpExe; PgRestoreExe = $p.PgRestoreExe; NginxExe = $p.NginxExe }
$transfer = Assert-ExactChildPath $canonicalRoot "incoming\$($p.TransferDirectoryName)"
if (-not (Test-Path -LiteralPath $transfer -PathType Container)) { throw 'Verified unique transfer directory is missing.' }
$source = Join-Path $transfer $p.SourceArchiveName
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Exact release archive is missing from the verified transfer directory.' }
$incoming = Assert-ExactChildPath $canonicalRoot "incoming\$($p.SourceArchiveName)"
if (Test-Path -LiteralPath $incoming) { throw 'Incoming release archive already exists; operator must inspect it.' }
$reportHome = Join-Path $transfer $p.ReportFileName
$reportLogs = Join-Path $canonicalRoot "logs\$($p.ReportFileName)"
$report = [ordered]@{ schemaVersion = 1; generatedAtUtc = [DateTime]::UtcNow.ToString('o'); releaseSha = $p.ReleaseSha; previousRelease = $null; backup = $null; migration = [ordered]@{ state = 'notStarted' }; switch = $null; restart = $null; health = $null; rollback = [ordered]@{ state = 'notNeeded' }; errorCategory = $null }
$migrationAttempted = $false; $switched = $false; $restartAttempted = $false
try {
  Import-ServerEnvironment -EnvFile $p.EnvFile -ExpectedBaseUrl $p.ExpectedBaseUrl | Out-Null
  Invoke-NativeChecked $p.NginxExe @('-t','-c',$p.NginxConfig) 'nginx configuration test' | Out-Null
  if (Test-Path -LiteralPath (Join-Path $canonicalRoot 'current')) { $report.previousRelease = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $canonicalRoot 'current') -Root $canonicalRoot) -Leaf }
  Move-Item -LiteralPath $source -Destination $incoming
  & (Join-Path $PSScriptRoot 'install-release.ps1') -ReleaseSha $p.ReleaseSha -Root $canonicalRoot -SourceArchive $incoming -ExpectedSha256 $p.ExpectedSha256 -NpmExe $p.NpmExe -NpxExe $p.NpxExe -NodeExe $p.NodeExe -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName
  $backupJson = & (Join-Path $PSScriptRoot 'backup-database.ps1') -PgDumpExe $p.PgDumpExe -PgRestoreExe $p.PgRestoreExe -Root $canonicalRoot -BackupRoot (Join-Path $canonicalRoot 'backups') -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint | Select-Object -Last 1
  $report.backup = $backupJson | ConvertFrom-Json
  if ($p.MigrationRequested) {
    $migrationAttempted = $true; $report.migration.state = 'attemptedUnknown'
    $migrationJson = & (Join-Path $PSScriptRoot 'run-migrations.ps1') -ReleasePath (Join-Path $canonicalRoot "releases\$($p.ReleaseSha)") -NpxExe $p.NpxExe -PsqlExe $p.PsqlExe -Root $canonicalRoot -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -AllowProductionMigration:$p.ProductionMigrationApproved -BackupVerified | Select-Object -Last 1
    $report.migration = $migrationJson | ConvertFrom-Json
  }
  $switchJson = & (Join-Path $PSScriptRoot 'switch-current-release.ps1') -ReleaseSha $p.ReleaseSha -Root $canonicalRoot -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint | Select-Object -Last 1
  $report.switch = $switchJson | ConvertFrom-Json; $switched = $true
  $restartAttempted = $true
  $restartJson = & (Join-Path $PSScriptRoot 'restart-baogiang-api.ps1') -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -NodeExe $p.NodeExe -Root $canonicalRoot -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl | Select-Object -Last 1
  $report.restart = $restartJson | ConvertFrom-Json
  $healthJson = & (Join-Path $PSScriptRoot 'test-production-health.ps1') -BaseUrl $p.ExpectedBaseUrl -ExpectedApiPort 3100 | Select-Object -Last 1
  $report.health = $healthJson | ConvertFrom-Json
  $report.migration.state = if ($p.MigrationRequested) { 'completed' } else { 'notRequested' }
  Write-RedactedReport -Path $reportLogs -Data $report
  Copy-Item -LiteralPath $reportLogs -Destination $reportHome
  Write-Output ($report | ConvertTo-Json -Depth 12)
} catch {
  $original = $_
  $report.errorCategory = Get-SafeErrorCategory $original
  if ($migrationAttempted) { $report.migration.state = 'attemptedUnknown' }
  if ($switched -or $restartAttempted) {
    if (-not $report.previousRelease) {
      try {
        Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
        $report.rollback = [ordered]@{ state = 'firstDeployFailedStopped'; failedRelease = $p.ReleaseSha }
      } catch { $report.rollback = [ordered]@{ state = 'firstDeployStopFailed'; errorCategory = Get-SafeErrorCategory $_; failedRelease = $p.ReleaseSha } }
    }
    elseif ($migrationAttempted -and -not $p.RollbackCompatibilityApproved) { $report.rollback = [ordered]@{ state = 'stoppedCompatibilityApprovalRequired' } }
    else {
      try {
        $rollbackJson = & (Join-Path $PSScriptRoot 'rollback-release.ps1') -Root $canonicalRoot -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -NodeExe $p.NodeExe -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -CompatibilityApproved:$p.RollbackCompatibilityApproved -MigrationAttempted:$migrationAttempted | Select-Object -Last 1
        $report.rollback = $rollbackJson | ConvertFrom-Json
      } catch { $report.rollback = [ordered]@{ state = 'failed'; errorCategory = Get-SafeErrorCategory $_ } }
    }
  }
  try { Write-RedactedReport -Path $reportLogs -Data $report; Copy-Item -LiteralPath $reportLogs -Destination $reportHome -Force } catch { }
  throw $original
}
