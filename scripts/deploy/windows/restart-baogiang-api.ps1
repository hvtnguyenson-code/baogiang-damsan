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
  [ValidateRange(1,10)][int]$MaxAttempts = 6,
  [ValidateRange(1,60)][int]$DelaySeconds = 2
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
$canonicalRoot = Assert-DedicatedRoot $Root
$identity = Read-DeploymentIdentity -Root $canonicalRoot -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint
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
function Assert-TaskContract {
  $task = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -ceq $ServiceName })
  if ($task.Count -ne 1) { throw 'Exact Scheduled Task identity is missing or ambiguous.' }
  if ($marker.service.taskPath -and $task[0].TaskPath -cne $marker.service.taskPath) { throw 'Scheduled Task path mismatch.' }
  if ($task[0].Principal.UserId -cne $marker.service.account) { throw 'Scheduled Task account mismatch.' }
  $actions = @($task[0].Actions)
  if ($actions.Count -ne 1) { throw 'Scheduled Task must have exactly one startup action.' }
  $action = $actions[0]
  if ((Normalize-ComparablePath $action.Execute) -ne (Normalize-ComparablePath $marker.service.execute)) { throw 'Scheduled Task executable mismatch.' }
  if (($action.Arguments -replace '\s+',' ').Trim() -cne ($marker.service.arguments -replace '\s+',' ').Trim()) { throw 'Scheduled Task arguments/wrapper mismatch.' }
  if ((Normalize-ComparablePath $action.WorkingDirectory) -ne (Normalize-ComparablePath $marker.service.workingDirectory)) { throw 'Scheduled Task working directory mismatch.' }
  return $task[0]
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
  $task = Assert-TaskContract
  if ($task.State -eq 'Running') { Stop-ScheduledTask -TaskName $ServiceName -TaskPath $task.TaskPath }
} else {
  $service = Assert-ServiceContract
  if ($service.State -eq 'Running') { Stop-Service -Name $ServiceName -Force }
}
$startedAt = [DateTime]::UtcNow
if ($ServiceKind -eq 'scheduled-task') { Start-ScheduledTask -TaskName $ServiceName -TaskPath $task.TaskPath } else { Start-Service -Name $ServiceName }
$found = $null
for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  Start-Sleep -Seconds $DelaySeconds
  $found = Get-StartedProcess $startedAt
  if ($found) { $found.attempts = $attempt; break }
}
if (-not $found) { throw 'Restart completed but exactly one expected API process did not own port 3100 within the bounded wait.' }
$found | ConvertTo-Json -Compress
