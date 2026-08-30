[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NodeExe,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ExpectedEntryPoint,
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$ExpectedBaseUrl,
  [switch]$AllowScheduledTaskActivation,
  [ValidateRange(1,10)][int]$MaxAttempts = 6,
  [ValidateRange(1,60)][int]$DelaySeconds = 2
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
$canonicalRoot = Assert-DedicatedRoot $Root
$identity = Read-DeploymentIdentity -Root $canonicalRoot -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint -NodeExe $NodeExe
$canonicalRoot = $identity.canonicalRoot
$marker = $identity.marker
Assert-ExistingLeaf $NodeExe 'Node executable' | Out-Null
$entry = Get-CanonicalPath $ExpectedEntryPoint
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { throw 'Expected current API entry point is missing.' }

function Get-ExactApiProcesses {
  $expectedExe = Normalize-ComparablePath $NodeExe
  $expectedEntry = (Get-CanonicalPath $entry).ToLowerInvariant().Replace('/','\')
  @((Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    (Normalize-ComparablePath $_.ExecutablePath) -eq $expectedExe -and (Normalize-ProcessCommandLine $_.CommandLine) -like "*$expectedEntry*"
  }))
}
function Assert-ServiceContract {
  $service = @(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object { $_.Name -ceq $ServiceName })
  if ($service.Count -ne 1) { throw 'Exact Windows Service identity is missing or ambiguous.' }
  if ($service[0].StartName -cne $marker.service.account -or $service[0].PathName -cne $marker.service.pathName) { throw 'Windows Service host/action/account mismatch.' }
  return $service[0]
}
function Assert-PortIdentity {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3100 -ErrorAction SilentlyContinue)
  $processes = @(Get-ExactApiProcesses)
  foreach ($listener in $listeners) { if (-not ($processes.ProcessId -contains $listener.OwningProcess)) { throw 'Port 3100 is occupied by a non-Báo giảng process.' } }
}
function Get-StartedProcess([DateTime]$StartedAtUtc) {
  $processes = @(Get-ExactApiProcesses)
  if ($processes.Count -ne 1) { return $null }
  $process = Get-Process -Id $processes[0].ProcessId -ErrorAction Stop
  if ($process.StartTime.ToUniversalTime() -lt $StartedAtUtc) { return $null }
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3100 -ErrorAction SilentlyContinue)
  if ($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $processes[0].ProcessId) { return $null }
  return [ordered]@{ pid = [int]$processes[0].ProcessId; executablePath = $processes[0].ExecutablePath; commandLineSha256 = (Get-NormalizedProcessIdentity $processes[0]).commandLineSha256; port = 3100; attempts = 0 }
}

Assert-PortIdentity
if ($ServiceKind -eq 'scheduled-task') {
  $activationContext = [pscustomobject]@{ StartedAtUtc = $null }
  Invoke-ScheduledTaskActivationLifecycle -AllowScheduledTaskActivation:$AllowScheduledTaskActivation -Context $activationContext -Verify { param($context,$phase) Assert-VerifiedScheduledTaskContract -Marker $marker -ServiceName $ServiceName } -Enable { param($context,$task) if ($task.State -eq 'Running') { Stop-ScheduledTask -TaskName $ServiceName -TaskPath $task.TaskPath -ErrorAction Stop }; Enable-ScheduledTask -TaskName $ServiceName -TaskPath $task.TaskPath -ErrorAction Stop | Out-Null } -Start { param($context,$task) $context.StartedAtUtc = [DateTime]::UtcNow; Start-ScheduledTask -TaskName $ServiceName -TaskPath $task.TaskPath -ErrorAction Stop } -RuntimeCheck { param($context) $found = $null; for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) { Start-Sleep -Seconds $DelaySeconds; $found = Get-StartedProcess $context.StartedAtUtc; if ($found) { $found.attempts = $attempt; break } }; $found } -FinalVerify { param($context) Assert-VerifiedScheduledTaskContract -Marker $marker -ServiceName $ServiceName } -SafeStop { param($context) Stop-ExactBaoGiangRuntime -Marker $marker -ServiceKind $ServiceKind -ServiceName $ServiceName -MaxAttempts $MaxAttempts -DelaySeconds $DelaySeconds | Out-Null } -Success { param($context,$found) [ordered]@{ runtimeKind = 'scheduled-task'; activationState = 'enabled-running'; taskEnabled = $true; runtimeRunning = $true; rebootPersistence = $true; triggerKind = 'Boot'; process = $found } | ConvertTo-Json -Compress }
} else {
  $service = Assert-ServiceContract
  if ($service.State -eq 'Running') { Stop-Service -Name $ServiceName -Force }
  $startedAt = [DateTime]::UtcNow
  Start-Service -Name $ServiceName
  $found = $null
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Start-Sleep -Seconds $DelaySeconds
    $found = Get-StartedProcess $startedAt
    if ($found) { $found.attempts = $attempt; break }
  }
  if (-not $found) { throw 'Restart completed but exactly one expected API process did not own port 3100 within the bounded wait.' }
  $found | ConvertTo-Json -Compress
}
