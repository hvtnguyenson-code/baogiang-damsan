# Windows-only static safety contract. No task/runtime/filesystem mutation.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$target=Join-Path $repo 'scripts\deploy\windows\adopt-stable-startup-shim.ps1'
$source=[IO.File]::ReadAllText($target)
$tok=$null;$errs=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tok,[ref]$errs)
if (@($errs).Count -ne 0) {throw ('CUTOVER_PARSER_FAILED: ' + ($errs -join '; '))}
$blocked=@('Set-ScheduledTask','Register-ScheduledTask','Unregister-ScheduledTask','New-ScheduledTask','Stop-Service','Set-Service','Stop-Process','schtasks.exe')
$commands=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.CommandAst]},$true) | ForEach-Object {$_.GetCommandName()})
foreach($name in $blocked) {if ($commands -icontains $name){throw "UNSAFE_COMMAND_IN_CUTOVER: $name"}}
if ($source -notmatch '(?s)\$shim\s*=\s*@''\r?\n(.*?)\r?\n''@') {throw 'MISSING_FIXED_LAUNCHER_SHIM'}
$shimText=$Matches[1];$shimTok=$null;$shimErr=$null
[void][Management.Automation.Language.Parser]::ParseInput($shimText,[ref]$shimTok,[ref]$shimErr)
if (@($shimErr).Count -ne 0) {throw 'EMBEDDED_SHIM_PARSER_FAILED'}
$required=@(
  'EXPLICIT_ACTIVATION_AND_DOWNTIME_FLAGS_REQUIRED',
  'Assert-LiveTask',
  'BUNDLE_HASH_CONFLICT',
  'Assert-DeploymentMarkerSchema',
  'Assert-VerifiedScheduledTaskContract',
  'Replace-FromStaged -Destination $markerPath',
  'Replace-FromStaged -Destination $launcher',
  'Stop-ScheduledTask -TaskPath $taskPath -TaskName $TaskName',
  'Start-ScheduledTask -TaskPath $taskPath -TaskName $TaskName',
  'Restore-FromBackup -Destination $markerPath',
  'Restore-FromBackup -Destination $launcher',
  'Wait-Api -WantRunning $false',
  'Wait-Api -WantRunning $true',
  'PROTECTED_PROCESS_CHANGED'
)
foreach($token in $required) {if (!$source.Contains($token)){throw "SAFETY_CONTRACT_MISSING: $token"}}
# Startup marker must be reconciled before installed launcher becomes active.
$marker=$source.IndexOf('Replace-FromStaged -Destination $markerPath')
$shim=$source.IndexOf('Replace-FromStaged -Destination $launcher')
$check=$source.IndexOf('Assert-VerifiedScheduledTaskContract -Marker $marker -ServiceName $TaskName')
$stop=$source.IndexOf('Stop-ScheduledTask -TaskPath $taskPath -TaskName $TaskName')
if (!($marker -gt 0 -and $marker -lt $shim -and $shim -lt $check -and $check -lt $stop)){throw 'CUTOVER_PHASE_ORDER_UNSAFE'}
# Execute the exact atomic replacement helper in an isolated Windows TEMP fixture.
$fn=$ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Replace-FromStaged'},$true) | Select-Object -First 1
if ($null -eq $fn) {throw 'ATOMIC_REPLACE_HELPER_MISSING'}
$shared=Join-Path ([IO.Path]::GetTempPath()) ('p6026-replace-'+[guid]::NewGuid().ToString('N'))
New-Item -Path $shared -ItemType Directory -ErrorAction Stop | Out-Null
try {
  $destination=Join-Path $shared 'sample.json'
  [IO.File]::WriteAllText($destination,'before')
  $leafFn=$ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Assert-RegularLeaf'},$true) | Select-Object -First 1
  if ($null -eq $leafFn) {throw 'REGULAR_LEAF_HELPER_MISSING'}
  . ([scriptblock]::Create($leafFn.Extent.Text))
  . ([scriptblock]::Create($fn.Extent.Text))
  Replace-FromStaged -Destination $destination -Text 'after'
  if ([IO.File]::ReadAllText($destination) -cne 'after') {throw 'ATOMIC_REPLACE_CONTENT_MISMATCH'}
  if (@(Get-ChildItem -LiteralPath $shared -File).Count -ne 1) {throw 'ATOMIC_REPLACE_LEFTOVER_TEMP'}
} finally {
  Remove-Item -LiteralPath $shared -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output 'P6-026 STATIC SAFETY CONTRACT PASS (TASK UNTOUCHED)'
