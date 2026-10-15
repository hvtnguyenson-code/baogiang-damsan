# P6-026: credential-preserving Scheduled Task startup shim adoption.
# Runs only on BaoGiangBackendPreDomain. Never modifies task principal, credentials or registration.
[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='High')]
param(
  [switch]$Apply,
  [switch]$Activate,
  [ValidateNotNullOrEmpty()][string]$Root = 'C:\baogiang',
  [ValidateNotNullOrEmpty()][string]$TaskName = 'BaoGiangBackendPreDomain'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($Root -cne 'C:\baogiang' -or $TaskName -cne 'BaoGiangBackendPreDomain') { throw 'UNREVIEWED_TARGET' }
$shared=Join-Path $Root 'shared'
$launcher=Join-Path $shared 'start-api-predomain.ps1'
$markerPath=Join-Path $shared 'deployment-identity.json'
$expectedOld='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\baogiang\shared\start-api-predomain.ps1"'
$evidenceRoot='C:\ProgramData\BaoGiangCD-Evidence'
if (!(Test-Path -LiteralPath $evidenceRoot -PathType Container)) {throw 'MISSING_APPROVED_EVIDENCE_ROOT'}
$task=Get-ScheduledTask -TaskPath '\' -TaskName $TaskName -ErrorAction Stop
if ($task.Principal.UserId -cne 'bg_api' -or [string]$task.Principal.LogonType -cne 'Password' -or @($task.Actions).Count -ne 1) {throw 'TASK_PRINCIPAL_CONFLICT'}
$a=$task.Actions[0]
if ($a.Execute -cne 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -or $a.Arguments -cne $expectedOld -or $a.WorkingDirectory -cne $Root) {throw 'TASK_ACTION_CONFLICT'}
$marker=Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
if ($marker.systemId -cne 'baogiang-damsan' -or $marker.canonicalRoot -cne $Root -or $marker.service.name -cne $TaskName -or $marker.service.account -cne 'bg_api') {throw 'MARKER_CONFLICT'}
$wrapper=[string]$marker.startupBundle.wrapperPath
$common=[string]$marker.startupBundle.commonPath
foreach($file in @($wrapper,$common,$launcher)) {if (!(Test-Path -LiteralPath $file -PathType Leaf)){throw "REQUIRED_FILE_MISSING: $file"}}
if ((Get-FileHash -LiteralPath $wrapper -Algorithm SHA256).Hash -cne ([string]$marker.startupBundle.wrapperSha256).ToUpperInvariant()) {throw 'WRAPPER_HASH_MISMATCH'}
if ((Get-FileHash -LiteralPath $common -Algorithm SHA256).Hash -cne ([string]$marker.startupBundle.commonSha256).ToUpperInvariant()) {throw 'COMMON_HASH_MISMATCH'}
if ($wrapper -notlike "$shared\startup-bundles\*\start-baogiang-api.ps1" -or $common -notlike "$shared\startup-bundles\*\deployment-common.ps1") {throw 'BUNDLE_PATH_CONFLICT'}
$port=@(Get-NetTCPConnection -State Listen -LocalPort 3100 -ErrorAction SilentlyContinue)
if ($port.Count -ne 1 -or $port[0].LocalAddress -cne '127.0.0.1') {throw 'PORT_IDENTITY_NOT_VERIFIED'}
$proc=Get-CimInstance Win32_Process -Filter ("ProcessId="+$port[0].OwningProcess)
if ([string]$proc.ExecutablePath -cne [string]$marker.nodeExe) {throw 'NODE_IDENTITY_CONFLICT'}
# The shim is deliberately constant across releases. The verified marker binds its immutable bundle.
$body=@'
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\baogiang'
$marker=Get-Content -LiteralPath (Join-Path $root 'shared\deployment-identity.json') -Raw | ConvertFrom-Json
if ($marker.systemId -cne 'baogiang-damsan' -or $marker.canonicalRoot -cne $root -or $marker.service.name -cne 'BaoGiangBackendPreDomain' -or $marker.service.account -cne 'bg_api') {throw 'STARTUP_MARKER_CONFLICT'}
$bundle=[string]$marker.startupBundle.wrapperPath
$common=[string]$marker.startupBundle.commonPath
foreach($pair in @(@($bundle,[string]$marker.startupBundle.wrapperSha256),@($common,[string]$marker.startupBundle.commonSha256))){
  if (!(Test-Path -LiteralPath $pair[0] -PathType Leaf)) {throw 'STARTUP_BUNDLE_MISSING'}
  if ((Get-FileHash -LiteralPath $pair[0] -Algorithm SHA256).Hash -cne $pair[1].ToUpperInvariant()) {throw 'STARTUP_BUNDLE_HASH_MISMATCH'}
}
if ($bundle -notlike 'C:\baogiang\shared\startup-bundles\*\start-baogiang-api.ps1' -or $common -notlike 'C:\baogiang\shared\startup-bundles\*\deployment-common.ps1') {throw 'STARTUP_BUNDLE_PATH_CONFLICT'}
& $bundle -NodeExe $marker.nodeExe -EnvFile $marker.envFile -Root $root -ExpectedEntryPoint $marker.entryPoint -ExpectedBaseUrl $marker.domain -ServiceKind 'scheduled-task' -ServiceName 'BaoGiangBackendPreDomain'
if ($LASTEXITCODE -is [int]) {exit $LASTEXITCODE}
'@
$preflight=[ordered]@{task=$TaskName; taskState=[string]$task.State; principal=[string]$task.Principal.UserId; launchPath=$launcher; proposedBundle=$wrapper; apply=$Apply.IsPresent; activate=$Activate.IsPresent; result='PREFLIGHT_PASS'}
if (-not $Apply) {$preflight | ConvertTo-Json -Compress; return}
if (-not $PSCmdlet.ShouldProcess($launcher,'Adopt immutable bundle shim without altering Scheduled Task registration')) {return}
# Do not alter a live task until the shim has passed parser validation.
$tokens=$null;$parseErrors=$null
[void][System.Management.Automation.Language.Parser]::ParseInput($body,[ref]$tokens,[ref]$parseErrors)
if (@($parseErrors).Count) {throw 'SHIM_PARSE_FAILED'}
$stamp=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ')
$backup=Join-Path $evidenceRoot ("start-api-predomain.before-p6026.$stamp.ps1")
$stage=Join-Path $shared ("start-api-predomain.$stamp.pending")
Copy-Item -LiteralPath $launcher -Destination $backup -ErrorAction Stop
try {
  [System.IO.File]::WriteAllText($stage,$body,(New-Object System.Text.UTF8Encoding($false)))
  # Same-volume atomic file replacement. Existing task continues until deliberate restart.
  [System.IO.File]::Replace($stage,$launcher,$null)
  $newTask=Get-ScheduledTask -TaskPath '\' -TaskName $TaskName -ErrorAction Stop
  if ($newTask.Actions[0].Arguments -cne $expectedOld -or $newTask.Principal.UserId -cne 'bg_api') {throw 'POST_REPLACE_TASK_DRIFT'}
  if ($Activate) {
    # No implicit activation: production restart requires separate reviewed maintenance procedure.
    throw 'ACTIVATION_REQUIRES_SEPARATE_REVIEWED_PROCEDURE'
  }
  [ordered]@{result='SHIM_INSTALLED_TASK_UNCHANGED';backup=$backup;activation='NOT_PERFORMED';runningProcess='UNCHANGED'} | ConvertTo-Json -Compress
} catch {
  if (Test-Path -LiteralPath $stage){Remove-Item -LiteralPath $stage -Force -ErrorAction SilentlyContinue}
  if (Test-Path -LiteralPath $backup){Copy-Item -LiteralPath $backup -Destination $launcher -Force -ErrorAction Stop}
  throw
}
