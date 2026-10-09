[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$ParameterFile
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
$propertyNames = @('ReleaseSha','Root','TransferDirectoryName','SourceArchiveName','ExpectedSha256','NodeExe','NpmExe','NpxExe','PsqlExe','PgDumpExe','PgRestoreExe','EnvFile','StartupWrapper','NginxExe','NginxConfig','ExpectedBaseUrl','ServiceKind','ServiceName','ExpectedEntryPoint','MigrationRequested','ProductionMigrationApproved','RollbackCompatibilityApproved','PreMigrationRecoveryApproved','MaintenanceWindow','ReportFileName')
$p = Get-Content -LiteralPath $ParameterFile -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($property in $p.PSObject.Properties.Name) { if ($propertyNames -notcontains $property) { throw 'Deployment parameter JSON contains an unknown property.' } }
foreach ($property in $propertyNames) { if (-not $p.PSObject.Properties.Name.Contains($property)) { throw "Deployment parameter JSON is missing: $property" } }
if ($p.ReleaseSha -notmatch '^[0-9a-f]{40}$' -or $p.ExpectedSha256 -notmatch '^[0-9A-Fa-f]{64}$' -or $p.TransferDirectoryName -notmatch "^control-[0-9]+-[0-9]+-$($p.ReleaseSha)$" -or $p.SourceArchiveName -notmatch "^release-$($p.ReleaseSha)\.zip$" -or $p.ReportFileName -notmatch "^deploy-report-$($p.ReleaseSha)\.json$") { throw 'Deployment parameter JSON has an unsafe transfer/release/checksum/report identity.' }
if ($p.ServiceKind -notin @('scheduled-task','service') -or $p.ExpectedBaseUrl -ne 'https://baogiang.dtnt-damsan.edu.vn') { throw 'Deployment parameter JSON has an unsafe service/domain contract.' }
$canonicalRoot = Assert-DedicatedRoot $p.Root
$identity = Read-DeploymentIdentity -Root $canonicalRoot -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -NodeExe $p.NodeExe -NginxExe $p.NginxExe -NginxConfig $p.NginxConfig
$canonicalRoot = $identity.canonicalRoot
$marker = $identity.marker
Assert-VerifiedRuntimeIdentity -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
Assert-ExecutableContract @{ NodeExe = $p.NodeExe; NpmExe = $p.NpmExe; NpxExe = $p.NpxExe; PsqlExe = $p.PsqlExe; PgDumpExe = $p.PgDumpExe; PgRestoreExe = $p.PgRestoreExe; NginxExe = $p.NginxExe }
$hasCurrentRelease = Test-Path -LiteralPath (Join-Path $canonicalRoot 'current')
Assert-ProductionRuntimeKindSupported -ServiceKind $p.ServiceKind -FirstDeploy:(-not $hasCurrentRelease)
$transfer = Assert-ExactChildPath $canonicalRoot "incoming\$($p.TransferDirectoryName)"
if (-not (Test-Path -LiteralPath $transfer -PathType Container)) { throw 'Verified unique transfer directory is missing.' }
$source = Join-Path $transfer $p.SourceArchiveName
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Exact release archive is missing from the verified transfer directory.' }
$incoming = Assert-ExactChildPath $canonicalRoot "incoming\$($p.SourceArchiveName)"
if (Test-Path -LiteralPath $incoming) { throw 'Incoming release archive already exists; operator must inspect it.' }
$reportHome = Join-Path $transfer $p.ReportFileName
$reportLogs = Join-Path $canonicalRoot "logs\$($p.ReportFileName)"
$report = [ordered]@{ schemaVersion = 1; generatedAtUtc = [DateTime]::UtcNow.ToString('o'); releaseSha = $p.ReleaseSha; previousRelease = $null; backup = $null; maintenanceWindow = $null; quiescence = $null; migration = [ordered]@{ state = 'notStarted' }; capabilityCatalog = [ordered]@{ state = 'notStarted' }; switch = $null; restart = $null; health = $null; rollback = [ordered]@{ state = 'notNeeded' }; errorCategory = $null }
$quiesceAttempted = $false; $quiesced = $false; $quiescenceVerified = $false; $migrationAttempted = $false; $migrationCompleted = $false; $switched = $false; $restartAttempted = $false
try {
  Read-ValidatedProductionEnvironment -EnvFile $p.EnvFile -ExpectedBaseUrl $p.ExpectedBaseUrl | Out-Null
  Invoke-ReviewedNginxSyntaxTest -NginxExe $p.NginxExe -NginxPrefix $marker.foreignIsolation.reviewedNginxPrefix -NginxConfig $p.NginxConfig | Out-Null
  if ($hasCurrentRelease) { $report.previousRelease = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $canonicalRoot 'current') -Root $canonicalRoot) -Leaf }
  Move-Item -LiteralPath $source -Destination $incoming
  & (Join-Path $PSScriptRoot 'install-release.ps1') -ReleaseSha $p.ReleaseSha -Root $canonicalRoot -SourceArchive $incoming -ExpectedSha256 $p.ExpectedSha256 -NpmExe $p.NpmExe -NpxExe $p.NpxExe -NodeExe $p.NodeExe -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName
  $backupJson = & (Join-Path $PSScriptRoot 'backup-database.ps1') -PgDumpExe $p.PgDumpExe -PgRestoreExe $p.PgRestoreExe -Root $canonicalRoot -BackupRoot (Join-Path $canonicalRoot 'backups') -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint | Select-Object -Last 1
  $report.backup = $backupJson | ConvertFrom-Json
  if ($p.MigrationRequested) {
    $mwAuth = Assert-MaintenanceWindowAuthorization -MaintenanceWindow $p.MaintenanceWindow -ExpectedReleaseSha $p.ReleaseSha
    $report.maintenanceWindow = $mwAuth
    Assert-VerifiedRuntimeIdentity -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
    $quiesceAttempted = $true
    $stopResult = Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName
    $quiesced = $true
    $quiescenceCheck = Assert-BaoGiangQuiescence -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName
    $report.quiescence = $quiescenceCheck
    Assert-MaintenanceWindowAuthorization -MaintenanceWindow $p.MaintenanceWindow -ExpectedReleaseSha $p.ReleaseSha | Out-Null
    Assert-BaoGiangQuiescence -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
    $quiescenceVerified = $true

    $migrationAttempted = $true; $report.migration.state = 'attemptedUnknown'
    $migrationJson = & (Join-Path $PSScriptRoot 'run-migrations.ps1') -ReleaseSha $p.ReleaseSha -ReleasePath (Join-Path $canonicalRoot "releases\$($p.ReleaseSha)") -NpxExe $p.NpxExe -PsqlExe $p.PsqlExe -Root $canonicalRoot -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -AllowProductionMigration:$p.ProductionMigrationApproved -BackupVerified -QuiescenceVerified:$quiescenceVerified | Select-Object -Last 1
    $migrationResult = $migrationJson | ConvertFrom-Json
    if (-not $migrationResult.PSObject.Properties.Name.Contains('state') -or $migrationResult.state -ne 'completed') { throw 'Migration completion summary is missing or not completed.' }
    $report.migration = $migrationResult
    $migrationCompleted = $true
  } else {
    $report.migration.state = 'notRequested'
  }
  $report.capabilityCatalog.state = 'attemptedUnknown'
  $catalogJson = & (Join-Path $PSScriptRoot 'sync-capability-catalog.ps1') -ReleaseSha $p.ReleaseSha -ReleasePath (Join-Path $canonicalRoot "releases\$($p.ReleaseSha)") -NodeExe $p.NodeExe -Root $canonicalRoot -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -BackupVerified | Select-Object -Last 1
  $report.capabilityCatalog = $catalogJson | ConvertFrom-Json
  $switchJson = & (Join-Path $PSScriptRoot 'switch-current-release.ps1') -ReleaseSha $p.ReleaseSha -Root $canonicalRoot -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint | Select-Object -Last 1
  $report.switch = $switchJson | ConvertFrom-Json; $switched = $true
  $restartAttempted = $true
  $restartJson = & (Join-Path $PSScriptRoot 'restart-baogiang-api.ps1') -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -NodeExe $p.NodeExe -Root $canonicalRoot -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -AllowScheduledTaskActivation:($p.ServiceKind -eq 'scheduled-task') | Select-Object -Last 1
  $report.restart = $restartJson | ConvertFrom-Json
  $healthJson = & (Join-Path $PSScriptRoot 'test-production-health.ps1') -BaseUrl $p.ExpectedBaseUrl -ExpectedApiPort 3100 | Select-Object -Last 1
  $report.health = $healthJson | ConvertFrom-Json
  Write-RedactedReport -Path $reportLogs -Data $report
  Copy-Item -LiteralPath $reportLogs -Destination $reportHome
  Write-Output ($report | ConvertTo-Json -Depth 12)
} catch {
  $original = $_
  $report.errorCategory = Get-SafeErrorCategory $original
  if ($migrationAttempted -and -not $migrationCompleted) { $report.migration.state = 'attemptedUnknown' }
  $currentPath = Join-Path $canonicalRoot 'current'
  $previousPath = Join-Path $canonicalRoot 'previous'
  $incomingPath = Join-Path $canonicalRoot 'current.next'
  if (Test-Path -LiteralPath $incomingPath) {
    try { Assert-ReleasePointerTarget -PointerPath $incomingPath -Root $canonicalRoot | Out-Null; Remove-Item -LiteralPath $incomingPath -Force } catch { }
  }
  $hasCurrent = Test-Path -LiteralPath $currentPath
  $currentTargetSha = if ($hasCurrent) { try { Split-Path (Assert-ReleasePointerTarget -PointerPath $currentPath -Root $canonicalRoot) -Leaf } catch { $null } } else { $null }
  $hasPrevious = Test-Path -LiteralPath $previousPath
  $previousTargetSha = if ($hasPrevious) { try { Split-Path (Assert-ReleasePointerTarget -PointerPath $previousPath -Root $canonicalRoot) -Leaf } catch { $null } } else { $null }

  if (-not $hasCurrent -and $hasPrevious -and -not [string]::IsNullOrWhiteSpace([string]$report.previousRelease) -and $previousTargetSha -eq $report.previousRelease) {
    try {
      Move-Item -LiteralPath $previousPath -Destination $currentPath -ErrorAction Stop
      $hasCurrent = $true; $currentTargetSha = $report.previousRelease; $hasPrevious = $false; $previousTargetSha = $null
    } catch { }
  }

  $actualSwitched = ($hasCurrent -and $currentTargetSha -eq $p.ReleaseSha)
  $quiescedPriorToMigration = (($quiesceAttempted -or $quiesced) -and -not $migrationAttempted)
  $recoveryNeeded = ($quiesceAttempted -or $quiesced -or $migrationAttempted -or $actualSwitched -or $switched -or $restartAttempted)
  if ($recoveryNeeded) {
    $recoveryDecision = Get-DeploymentFailureRecoveryDecision -HasPreviousRelease:(-not [string]::IsNullOrWhiteSpace([string]$report.previousRelease)) -MigrationAttempted:$migrationAttempted -RollbackCompatibilityApproved:$p.RollbackCompatibilityApproved -MigrationCompleted:$migrationCompleted -QuiescedPriorToMigration:$quiescedPriorToMigration -PreMigrationRecoveryApproved:$p.PreMigrationRecoveryApproved
    if ($recoveryDecision -eq 'FIRST_DEPLOY_SAFE_STOP') {
      try {
        Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
        if ($hasCurrent -and $currentTargetSha -eq $p.ReleaseSha) {
          $quarantine = Quarantine-FailedFirstRelease -Root $canonicalRoot -FailedSha $p.ReleaseSha
          $report.rollback = [ordered]@{ state = 'firstDeployFailedStopped'; failedRelease = $p.ReleaseSha; quarantinePointer = $quarantine.pointer }
        } else {
          $report.rollback = [ordered]@{ state = 'firstDeployFailedStopped'; failedRelease = $p.ReleaseSha }
        }
      } catch { $report.rollback = [ordered]@{ state = 'firstDeployStopFailed'; errorCategory = Get-SafeErrorCategory $_; failedRelease = $p.ReleaseSha } }
    }
    elseif ($recoveryDecision -eq 'COMPATIBILITY_SAFE_STOP') {
      try {
        Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
        $report.rollback = [ordered]@{ state = 'stoppedCompatibilityApprovalRequired' }
      } catch { $report.rollback = [ordered]@{ state = 'stopFailedCompatibilityApprovalRequired'; errorCategory = Get-SafeErrorCategory $_ } }
    }
    elseif ($recoveryDecision -eq 'PRE_MIGRATION_SAFE_STOP') {
      try {
        Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
        $report.rollback = [ordered]@{ state = 'quiescedPreMigrationStopped' }
      } catch { $report.rollback = [ordered]@{ state = 'stopFailedPreMigrationRecoveryRequired'; errorCategory = Get-SafeErrorCategory $_ } }
    }
    elseif ($recoveryDecision -eq 'PRE_MIGRATION_RECOVERY') {
      try {
        if (-not $hasCurrent -or [string]::IsNullOrWhiteSpace($currentTargetSha) -or ($currentTargetSha -cne $report.previousRelease)) {
          try {
            Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
            $report.rollback = [ordered]@{ state = 'unverifiedPointerSafeStopped'; expectedTarget = $report.previousRelease; actualTarget = $currentTargetSha }
          } catch {
            $report.rollback = [ordered]@{ state = 'stopFailedPointerVerificationRequired'; errorCategory = Get-SafeErrorCategory $_; expectedTarget = $report.previousRelease; actualTarget = $currentTargetSha }
          }
        } else {
          if ($p.ServiceKind -eq 'scheduled-task') {
            $rollbackContext = [pscustomobject]@{}
            $lifecycleResult = Invoke-ScheduledTaskRollbackLifecycle -Context $rollbackContext -Restart { param($context) & (Join-Path $PSScriptRoot 'restart-baogiang-api.ps1') -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -NodeExe $p.NodeExe -Root $canonicalRoot -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -AllowScheduledTaskActivation:($p.ServiceKind -eq 'scheduled-task') } -Health {
              param($context)
              $health = & (Join-Path $PSScriptRoot 'test-production-health.ps1') -BaseUrl $p.ExpectedBaseUrl -ExpectedApiPort 3100
              $postTarget = Assert-ReleasePointerTarget -PointerPath $currentPath -Root $canonicalRoot
              $postSha = Split-Path $postTarget -Leaf
              if ($postSha -cne $report.previousRelease) { throw "Current pointer target mutated during recovery: expected $($report.previousRelease), got $postSha" }
              [pscustomobject]@{ Health = ($health -join ''); Target = $postTarget }
            } -SafeStop { param($context) Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null }
            $report.rollback = [ordered]@{ state = 'completed'; currentTarget = $lifecycleResult.Target; health = $lifecycleResult.Health }
          } else {
            $restartCompleted = $false
            try {
              & (Join-Path $PSScriptRoot 'restart-baogiang-api.ps1') -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -NodeExe $p.NodeExe -Root $canonicalRoot -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -AllowScheduledTaskActivation:($p.ServiceKind -eq 'scheduled-task') | Out-Null
              $restartCompleted = $true
              $health = & (Join-Path $PSScriptRoot 'test-production-health.ps1') -BaseUrl $p.ExpectedBaseUrl -ExpectedApiPort 3100
              $postTarget = Assert-ReleasePointerTarget -PointerPath $currentPath -Root $canonicalRoot
              $postSha = Split-Path $postTarget -Leaf
              if ($postSha -cne $report.previousRelease) { throw "Current pointer target mutated during recovery: expected $($report.previousRelease), got $postSha" }
              $report.rollback = [ordered]@{ state = 'completed'; currentTarget = $postTarget; health = ($health -join '') }
            } catch {
              $serviceRecoveryFailure = $_
              if ($restartCompleted) {
                try { Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null }
                catch { throw "ROLLBACK_HEALTH_FAILED_AND_SAFE_STOP_FAILED: primary=$($serviceRecoveryFailure.Exception.GetType().Name); cleanup=$($_.Exception.GetType().Name)" }
              }
              throw $serviceRecoveryFailure
            }
          }
        }
      } catch { $report.rollback = [ordered]@{ state = 'failed'; errorCategory = Get-SafeErrorCategory $_ } }
    }
    else {
      try {
        if (-not $actualSwitched) {
          if (-not $hasCurrent -or [string]::IsNullOrWhiteSpace($currentTargetSha) -or ($currentTargetSha -cne $report.previousRelease)) {
            try {
              Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
              $report.rollback = [ordered]@{ state = 'unverifiedPointerSafeStopped'; expectedTarget = $report.previousRelease; actualTarget = $currentTargetSha }
            } catch {
              $report.rollback = [ordered]@{ state = 'stopFailedPointerVerificationRequired'; errorCategory = Get-SafeErrorCategory $_; expectedTarget = $report.previousRelease; actualTarget = $currentTargetSha }
            }
          } else {
            if ($p.ServiceKind -eq 'scheduled-task') {
              $rollbackContext = [pscustomobject]@{}
              $lifecycleResult = Invoke-ScheduledTaskRollbackLifecycle -Context $rollbackContext -Restart { param($context) & (Join-Path $PSScriptRoot 'restart-baogiang-api.ps1') -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -NodeExe $p.NodeExe -Root $canonicalRoot -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -AllowScheduledTaskActivation:($p.ServiceKind -eq 'scheduled-task') } -Health {
                param($context)
                $health = & (Join-Path $PSScriptRoot 'test-production-health.ps1') -BaseUrl $p.ExpectedBaseUrl -ExpectedApiPort 3100
                $postTarget = Assert-ReleasePointerTarget -PointerPath $currentPath -Root $canonicalRoot
                $postSha = Split-Path $postTarget -Leaf
                if ($postSha -cne $report.previousRelease) { throw "Current pointer target mutated during recovery: expected $($report.previousRelease), got $postSha" }
                [pscustomobject]@{ Health = ($health -join ''); Target = $postTarget }
              } -SafeStop { param($context) Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null }
              $report.rollback = [ordered]@{ state = 'completed'; currentTarget = $lifecycleResult.Target; health = $lifecycleResult.Health }
            } else {
              $restartCompleted = $false
              try {
                & (Join-Path $PSScriptRoot 'restart-baogiang-api.ps1') -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -NodeExe $p.NodeExe -Root $canonicalRoot -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -AllowScheduledTaskActivation:($p.ServiceKind -eq 'scheduled-task') | Out-Null
                $restartCompleted = $true
                $health = & (Join-Path $PSScriptRoot 'test-production-health.ps1') -BaseUrl $p.ExpectedBaseUrl -ExpectedApiPort 3100
                $postTarget = Assert-ReleasePointerTarget -PointerPath $currentPath -Root $canonicalRoot
                $postSha = Split-Path $postTarget -Leaf
                if ($postSha -cne $report.previousRelease) { throw "Current pointer target mutated during recovery: expected $($report.previousRelease), got $postSha" }
                $report.rollback = [ordered]@{ state = 'completed'; currentTarget = $postTarget; health = ($health -join '') }
              } catch {
                $serviceRecoveryFailure = $_
                if ($restartCompleted) {
                  try { Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null }
                  catch { throw "ROLLBACK_HEALTH_FAILED_AND_SAFE_STOP_FAILED: primary=$($serviceRecoveryFailure.Exception.GetType().Name); cleanup=$($_.Exception.GetType().Name)" }
                }
                throw $serviceRecoveryFailure
              }
            }
          }
        } else {
          if (-not $hasPrevious -or [string]::IsNullOrWhiteSpace($previousTargetSha) -or ($previousTargetSha -cne $report.previousRelease)) {
            try {
              Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName | Out-Null
              $report.rollback = [ordered]@{ state = 'unverifiedPointerSafeStopped'; expectedTarget = $report.previousRelease; actualTarget = $previousTargetSha }
            } catch {
              $report.rollback = [ordered]@{ state = 'stopFailedPointerVerificationRequired'; errorCategory = Get-SafeErrorCategory $_; expectedTarget = $report.previousRelease; actualTarget = $previousTargetSha }
            }
          } else {
            $rollbackJson = & (Join-Path $PSScriptRoot 'rollback-release.ps1') -Root $canonicalRoot -ServiceKind $p.ServiceKind -ServiceName $p.ServiceName -NodeExe $p.NodeExe -EnvFile $p.EnvFile -StartupWrapper $p.StartupWrapper -ExpectedEntryPoint $p.ExpectedEntryPoint -ExpectedBaseUrl $p.ExpectedBaseUrl -CompatibilityApproved:$p.RollbackCompatibilityApproved -MigrationAttempted:$migrationAttempted -AllowScheduledTaskActivation:($p.ServiceKind -eq 'scheduled-task') | Select-Object -Last 1
            $report.rollback = $rollbackJson | ConvertFrom-Json
          }
        }
      } catch { $report.rollback = [ordered]@{ state = 'failed'; errorCategory = Get-SafeErrorCategory $_ } }
    }
  }
  try { Write-RedactedReport -Path $reportLogs -Data $report; Copy-Item -LiteralPath $reportLogs -Destination $reportHome -Force } catch { }
  throw $original
}
