[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$ExpectedEntryPoint,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Assert-ProcessIdentity { $matches = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$ExpectedEntryPoint*" }); if ($matches.Count -gt 1) { throw 'More than one matching Báo giảng process exists; refusing to restart ambiguously.' } }
if ($ServiceKind -eq 'service') {
  $service = Get-CimInstance Win32_Service -Filter "Name = '$ServiceName'"; if (-not $service) { throw 'Named service is missing.' }
  if ($service.PathName -notlike "*$Root*" -and $service.PathName -notlike "*$ExpectedEntryPoint*") { throw 'Service identity does not match the approved Báo giảng root/entry point.' }
  Stop-Service -Name $ServiceName -Force; Start-Service -Name $ServiceName
} else {
  $task = Get-ScheduledTask -TaskName $ServiceName -ErrorAction Stop
  $actionText = ($task.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments) $($_.WorkingDirectory)" }) -join ' '
  if ($actionText -notlike "*$Root*" -and $actionText -notlike "*$ExpectedEntryPoint*") { throw 'Scheduled Task identity does not match the approved Báo giảng root/entry point.' }
  Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue; Start-ScheduledTask -TaskName $ServiceName
}
Start-Sleep -Seconds 2
Assert-ProcessIdentity
