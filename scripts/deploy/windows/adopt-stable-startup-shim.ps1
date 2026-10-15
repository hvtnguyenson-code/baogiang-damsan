# P6-026. One-time credential-preserving adoption of the existing task launcher.
# No Set-ScheduledTask / Register-ScheduledTask, credentials, database, Nginx or foreign runtime mutations.
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [switch]$Apply,
  [switch]$Activate,
  [switch]$AllowBaoGiangInterruption,
  [string]$Root = 'C:\baogiang',
  [string]$TaskName = 'BaoGiangBackendPreDomain'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($Root -cne 'C:\baogiang' -or $TaskName -cne 'BaoGiangBackendPreDomain') { throw 'UNREVIEWED_TARGET' }
if ($Activate -and (-not $Apply -or -not $AllowBaoGiangInterruption)) { throw 'EXPLICIT_ACTIVATION_AND_DOWNTIME_FLAGS_REQUIRED' }

$shared = Join-Path $Root 'shared'
$launcher = Join-Path $shared 'start-api-predomain.ps1'
$markerPath = Join-Path $shared 'deployment-identity.json'
$evidenceRoot = 'C:\ProgramData\BaoGiangCD-Evidence'
$oldArguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\baogiang\shared\start-api-predomain.ps1"'
$taskPath = '\'
$nodeEntrySuffix = '\apps\api\dist\apps\api\src\main.js'
$bundleDir = Join-Path $shared 'startup-bundles'
$report = [ordered]@{ task = $TaskName; phase = 'preflight'; activation = 'notRequested'; rollback = 'notNeeded' }

function Assert-RegularLeaf([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if ($item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {throw 'UNSAFE_REPARSE_OR_DIRECTORY'}
}
function Assert-LiveTask {
  $t = Get-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -ErrorAction Stop
  if ($t.Principal.UserId -cne 'bg_api' -or [string]$t.Principal.LogonType -cne 'Password') {throw 'TASK_PRINCIPAL_CONFLICT'}
  if (@($t.Actions).Count -ne 1) { throw 'TASK_ACTION_COUNT_CONFLICT' }
  $a = $t.Actions[0]
  if ($a.Execute -ine 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -or
      $a.Arguments -cne $oldArguments -or $a.WorkingDirectory -ine $Root) {throw 'TASK_ACTION_CONFLICT'}
  if (@($t.Triggers).Count -ne 1 -or $t.Triggers[0].CimClass.CimClassName -cne 'MSFT_TaskBootTrigger') {throw 'TASK_TRIGGER_CONFLICT'}
  return $t
}
function Get-VerifiedListener {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3100 -ErrorAction SilentlyContinue)
  if ($listeners.Count -eq 0) { return $null }
  if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -cne '127.0.0.1') {throw 'PORT_3100_UNSAFE_LISTENER'}
  $ownerId = [int]$listeners[0].OwningProcess
  $p = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId" -ErrorAction Stop
  if ($null -eq $p -or $p.ExecutablePath -ine $marker.nodeExe) {throw 'PORT_3100_FOREIGN_PROCESS'}
  $cmd = [string]$p.CommandLine
  if ($cmd -notmatch [regex]::Escape($nodeEntrySuffix)) {throw 'PORT_3100_UNEXPECTED_COMMAND_LINE'}
  return $ownerId
}
function Assert-Health {
  $status = Invoke-WebRequest -Uri 'http://127.0.0.1:3100/api/health/ready' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
  if ([int]$status.StatusCode -ne 200) {throw 'BAOGIANG_HEALTH_NOT_READY'}
}
function Wait-Api([bool]$WantRunning,[int]$Attempts = 40) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      $owner = Get-VerifiedListener
      if ($WantRunning -and $null -ne $owner) {
        if ((Assert-LiveTask).State -eq 'Running') {Assert-Health; return $owner}
      } elseif (-not $WantRunning -and $null -eq $owner) {return $true}
    } catch {
      if ($_.Exception.Message -match 'UNSAFE|FOREIGN_PROCESS|UNEXPECTED_COMMAND_LINE|PRINCIPAL_CONFLICT|ACTION_CONFLICT|TRIGGER_CONFLICT') {throw}
    }
    Start-Sleep -Milliseconds 750
  }
  throw $(if ($WantRunning) {'BAOGIANG_START_HEALTH_TIMEOUT'} else {'BAOGIANG_STOP_TIMEOUT'})
}
function Replace-FromStaged([string]$Destination,[string]$Text) {
  Assert-RegularLeaf $Destination
  $staged = Join-Path $shared ([IO.Path]::GetFileName($Destination) + '.' + [guid]::NewGuid().ToString('N') + '.pending')
  try {
    [IO.File]::WriteAllText($staged,$Text,[Text.UTF8Encoding]::new($false))
    [IO.File]::Replace($staged,$Destination,$null)
  } finally {
    if (Test-Path -LiteralPath $staged) {Remove-Item -LiteralPath $staged -Force}
  }
}
function Restore-FromBackup([string]$Destination,[string]$Backup) {
  if (!(Test-Path -LiteralPath $Backup -PathType Leaf)) {throw 'RECOVERY_BACKUP_MISSING'}
  $original = [IO.File]::ReadAllText($Backup)
  Replace-FromStaged -Destination $Destination -Text $original
}

# Bound to the stable launcher path already registered by Windows. Its content can change,
# but the live task principal, action and boot trigger never change.
$shim = @'
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = 'C:\baogiang'
$marker = Get-Content -LiteralPath (Join-Path $root 'shared\deployment-identity.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($marker.systemId -cne 'baogiang-damsan' -or $marker.canonicalRoot -cne $root -or
    $marker.service.name -cne 'BaoGiangBackendPreDomain' -or $marker.service.account -cne 'bg_api') {throw 'STARTUP_MARKER_CONFLICT'}
$bundle = [string]$marker.startupBundle.wrapperPath
$common = [string]$marker.startupBundle.commonPath
if ($bundle -notlike 'C:\baogiang\shared\startup-bundles\*\start-baogiang-api.ps1' -or
    $common -notlike 'C:\baogiang\shared\startup-bundles\*\deployment-common.ps1' -or
    (Split-Path -Parent $bundle) -ine (Split-Path -Parent $common)) {throw 'STARTUP_BUNDLE_PATH_CONFLICT'}
foreach ($f in @(
  @{ path = $bundle; sha = [string]$marker.startupBundle.wrapperSha256 },
  @{ path = $common; sha = [string]$marker.startupBundle.commonSha256 }
)) {
  $item = Get-Item -LiteralPath $f.path -Force -ErrorAction Stop
  if ($item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {throw 'STARTUP_BUNDLE_REPARSE_CONFLICT'}
  if ((Get-FileHash -LiteralPath $f.path -Algorithm SHA256).Hash -ine $f.sha) {throw 'STARTUP_BUNDLE_HASH_CONFLICT'}
}
& $bundle -NodeExe $marker.nodeExe -EnvFile $marker.envFile -Root $root -ExpectedEntryPoint $marker.entryPoint -ExpectedBaseUrl $marker.domain -ServiceKind scheduled-task -ServiceName BaoGiangBackendPreDomain
if (-not $?) {exit 1}
if ($LASTEXITCODE -is [int]) {exit $LASTEXITCODE}
'@

if (!(Test-Path -LiteralPath $evidenceRoot -PathType Container)) {throw 'APPROVED_EVIDENCE_ROOT_MISSING'}
foreach ($file in @($launcher,$markerPath)) {Assert-RegularLeaf $file}
$task = Assert-LiveTask
if ($task.State -ne 'Running') {throw 'TASK_NOT_RUNNING_AT_PREFLIGHT'}
$marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($marker.systemId -cne 'baogiang-damsan' -or $marker.canonicalRoot -cne $Root -or
    $marker.service.kind -cne 'scheduled-task' -or $marker.service.name -cne $TaskName -or
    $marker.service.account -cne 'bg_api' -or $marker.apiPort -ne 3100) {throw 'MARKER_IDENTITY_CONFLICT'}
$expectedBundleArguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $marker.startupBundle.wrapperPath +
  '" -NodeExe "' + $marker.nodeExe + '" -EnvFile "' + $marker.envFile +
  '" -Root "' + $Root + '" -ExpectedEntryPoint "' + $marker.entryPoint +
  '" -ExpectedBaseUrl "' + $marker.domain + '" -ServiceKind scheduled-task -ServiceName ' + $TaskName
if ($marker.service.execute -ine 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -or
    $marker.service.workingDirectory -ine $Root -or $marker.service.taskPath -cne $taskPath -or
    $marker.startupWrapper -cne $marker.startupBundle.wrapperPath) {throw 'MARKER_SERVICE_CONFLICT'}
if ($marker.service.arguments -cne $expectedBundleArguments -and
    $marker.service.arguments -cne $oldArguments) {throw 'MARKER_EXPECTED_BUNDLE_CONFLICT'}
foreach ($p in @($marker.startupBundle.wrapperPath,$marker.startupBundle.commonPath)) {Assert-RegularLeaf $p}
if ((Split-Path -Parent $marker.startupBundle.wrapperPath) -ine (Split-Path -Parent $marker.startupBundle.commonPath)) {throw 'BUNDLE_DIRECTORY_MISMATCH'}
if (-not $marker.startupBundle.wrapperPath.StartsWith($bundleDir + '\',[StringComparison]::OrdinalIgnoreCase)) {throw 'BUNDLE_OUTSIDE_APPROVED_ROOT'}
if ((Get-FileHash -LiteralPath $marker.startupBundle.wrapperPath -Algorithm SHA256).Hash -ine [string]$marker.startupBundle.wrapperSha256 -or
    (Get-FileHash -LiteralPath $marker.startupBundle.commonPath -Algorithm SHA256).Hash -ine [string]$marker.startupBundle.commonSha256) {throw 'BUNDLE_HASH_CONFLICT'}
. ([string]$marker.startupBundle.commonPath)
Assert-DeploymentMarkerSchema -Marker $marker -CanonicalRoot $Root | Out-Null
$preOwner = Get-VerifiedListener
if ($null -eq $preOwner) {throw 'BAOGIANG_NOT_LISTENING'}
Assert-Health
$foreignBefore = @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
$parserTokens = $null; $parserErrors = $null
[void][Management.Automation.Language.Parser]::ParseInput($shim,[ref]$parserTokens,[ref]$parserErrors)
if (@($parserErrors).Count -gt 0) {throw 'SHIM_PARSER_FAILURE'}
$report.phase = 'preflightPass'
if (-not $Apply) {$report | ConvertTo-Json -Compress; return}
if (-not $PSCmdlet.ShouldProcess("$launcher and $markerPath",'Install verified startup shim and reconcile deployment marker')) {return}

$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ')
$backupScript = Join-Path $evidenceRoot "start-api-predomain.before-p6026.$stamp.ps1"
$backupMarker = Join-Path $evidenceRoot "deployment-identity.before-p6026.$stamp.json"
Copy-Item -LiteralPath $launcher -Destination $backupScript -ErrorAction Stop
Copy-Item -LiteralPath $markerPath -Destination $backupMarker -ErrorAction Stop
$scriptInstalled = $false
$markerInstalled = $false
$stopAttempted = $false
try {
  # Reconcile marker's Scheduler contract with the unchanged live task *before*
  # swapping the launcher. Marker startupWrapper/startupBundle remain immutable.
  $marker.service.arguments = $oldArguments
  $reconciled = $marker | ConvertTo-Json -Depth 20
  Replace-FromStaged -Destination $markerPath -Text $reconciled
  $markerInstalled = $true
  Replace-FromStaged -Destination $launcher -Text $shim
  $scriptInstalled = $true
  Assert-LiveTask | Out-Null
  $commonScript = Join-Path (Split-Path -Parent ([string]$marker.startupBundle.wrapperPath)) 'deployment-common.ps1'
  . $commonScript
  Assert-VerifiedScheduledTaskContract -Marker $marker -ServiceName $TaskName | Out-Null
  $report.phase = 'shimAndMarkerInstalled'
  if ($Activate) {
    $stopAttempted = $true
    Stop-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -ErrorAction Stop
    [void](Wait-Api -WantRunning $false -Attempts 40)
    Start-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -ErrorAction Stop
    [void](Wait-Api -WantRunning $true -Attempts 60)
    $report.activation = 'healthPass'
  } else {
    if ((Get-VerifiedListener) -ne $preOwner) {throw 'RUNNING_PROCESS_UNEXPECTEDLY_CHANGED'}
    Assert-Health
    $report.activation = 'deferred'
  }
  $foreignAfter = @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if (($foreignBefore -join ',') -cne ($foreignAfter -join ',')) {throw 'PROTECTED_PROCESS_CHANGED'}
  Assert-LiveTask | Out-Null
  $report.phase = 'success'
  $report.rollback = 'notNeeded'
  $report | ConvertTo-Json -Compress
} catch {
  $originalError = $_
  $report.phase = 'failed'
  $report.errorType = $originalError.Exception.GetType().Name
  $report.errorHResult = $originalError.Exception.HResult
  try {
    # The task definition is untouched. Roll back only the two dedicated files.
    # If activation was attempted, clear the exact task and verify port vacancy first.
    if ($stopAttempted) {
      Stop-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -ErrorAction SilentlyContinue
      [void](Wait-Api -WantRunning $false -Attempts 40)
    }
    if ($scriptInstalled) {Restore-FromBackup -Destination $launcher -Backup $backupScript}
    if ($markerInstalled) {Restore-FromBackup -Destination $markerPath -Backup $backupMarker}
    if ($stopAttempted) {
      Start-ScheduledTask -TaskPath $taskPath -TaskName $TaskName -ErrorAction Stop
      [void](Wait-Api -WantRunning $true -Attempts 60)
    } else {
      Assert-Health
    }
    $report.rollback = 'restoredAndHealthy'
  } catch {
    $report.rollback = 'failedRequiresOperator'
    $report.rollbackErrorType = $_.Exception.GetType().Name
  }
  $report | ConvertTo-Json -Compress
  throw 'BAOGIANG_SHIM_CUTOVER_FAILED'
}
