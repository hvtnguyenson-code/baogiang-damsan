$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repo 'scripts\deploy\windows\deployment-common.ps1')

Assert-ProductionRuntimeKindSupported -ServiceKind 'scheduled-task' -FirstDeploy $true
$rejected = $false
try { Assert-ProductionRuntimeKindSupported -ServiceKind 'service' -FirstDeploy $true } catch { if ($_.Exception.Message -match 'SERVICE_FIRST_DEPLOY_UNSUPPORTED') { $rejected = $true } }
if (-not $rejected) { throw 'Service first-deploy runtime kind was not rejected categorically.' }
Assert-ProductionRuntimeKindSupported -ServiceKind 'service' -FirstDeploy $false
Assert-ProductionRuntimeKindSupported -ServiceKind 'scheduled-task' -FirstDeploy $false
Assert-PreflightRuntimeKindSupported -RequireReviewedIsolation:$false
Assert-PreflightRuntimeKindSupported -RequireReviewedIsolation:$false -ServiceKind 'service'
Assert-PreflightRuntimeKindSupported -RequireReviewedIsolation:$true -ServiceKind 'scheduled-task'
$preflightServiceRejected = $false
try { Assert-PreflightRuntimeKindSupported -RequireReviewedIsolation:$true -ServiceKind 'service' } catch { if ($_.Exception.Message -match 'SERVICE_FIRST_DEPLOY_UNSUPPORTED') { $preflightServiceRejected = $true } }
if (-not $preflightServiceRejected) { throw 'Verified first-deploy Service was not rejected categorically by the preflight guard.' }

$reservedVariableNames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
Get-Variable | Where-Object {
  (($_.Options -band [System.Management.Automation.ScopedItemOptions]::ReadOnly) -ne 0) -or
  (($_.Options -band [System.Management.Automation.ScopedItemOptions]::Constant) -ne 0)
} | ForEach-Object { [void]$reservedVariableNames.Add($_.Name) }

function Get-VariableWriteRecords([System.Management.Automation.Language.Ast]$RootAst) {
  $records = [System.Collections.Generic.List[object]]::new()

  foreach ($parameterNode in $RootAst.FindAll({ param($candidateAst) $candidateAst -is [System.Management.Automation.Language.ParameterAst] }, $true)) {
    $records.Add([pscustomobject]@{ name = $parameterNode.Name.VariablePath.UserPath; context = 'ParameterAst'; line = $parameterNode.Extent.StartLineNumber })
  }

  foreach ($assignmentNode in $RootAst.FindAll({ param($candidateAst) $candidateAst -is [System.Management.Automation.Language.AssignmentStatementAst] }, $true)) {
    foreach ($variableNode in $assignmentNode.Left.FindAll({ param($candidateAst) $candidateAst -is [System.Management.Automation.Language.VariableExpressionAst] }, $true)) {
      $records.Add([pscustomobject]@{ name = $variableNode.VariablePath.UserPath; context = 'AssignmentStatementAst'; line = $variableNode.Extent.StartLineNumber })
    }
  }

  foreach ($forEachNode in $RootAst.FindAll({ param($candidateAst) $candidateAst -is [System.Management.Automation.Language.ForEachStatementAst] }, $true)) {
    if ($forEachNode.Variable) {
      $records.Add([pscustomobject]@{ name = $forEachNode.Variable.VariablePath.UserPath; context = 'ForEachStatementAst'; line = $forEachNode.Variable.Extent.StartLineNumber })
    }
  }

  foreach ($unaryNode in $RootAst.FindAll({
    param($candidateAst)
    $candidateAst -is [System.Management.Automation.Language.UnaryExpressionAst] -and
    $candidateAst.TokenKind -in @(
      [System.Management.Automation.Language.TokenKind]::PlusPlus,
      [System.Management.Automation.Language.TokenKind]::MinusMinus
    )
  }, $true)) {
    foreach ($variableNode in $unaryNode.Child.FindAll({ param($candidateAst) $candidateAst -is [System.Management.Automation.Language.VariableExpressionAst] }, $true)) {
      $records.Add([pscustomobject]@{ name = $variableNode.VariablePath.UserPath; context = 'UnaryExpressionAst'; line = $variableNode.Extent.StartLineNumber })
    }
  }

  return @($records)
}

function Get-ReservedVariableWriteCollisions([System.Management.Automation.Language.Ast]$RootAst) {
  return @(Get-VariableWriteRecords $RootAst | Where-Object { $reservedVariableNames.Contains($_.name) })
}

function Parse-PowerShellText([string]$SourceText,[string]$Label) {
  $parseTokens = $null
  $parseErrors = $null
  $parsedAst = [System.Management.Automation.Language.Parser]::ParseInput($SourceText, [ref]$parseTokens, [ref]$parseErrors)
  if (@($parseErrors).Count -gt 0) { throw "PowerShell AST fixture did not parse: $Label" }
  return $parsedAst
}

foreach ($fixture in @(
  @{ label = 'parameter PID'; source = 'function BadParameter([int]$Pid) { }'; shouldReject = $true },
  @{ label = 'assignment pid'; source = '$pid = 123'; shouldReject = $true },
  @{ label = 'foreach pid'; source = 'foreach ($pid in @(1)) { }'; shouldReject = $true },
  @{ label = 'safe processId'; source = '$processId = 123'; shouldReject = $false }
)) {
  $fixtureAst = Parse-PowerShellText -SourceText $fixture.source -Label $fixture.label
  $fixtureCollisions = @(Get-ReservedVariableWriteCollisions $fixtureAst)
  if ($fixture.shouldReject -and $fixtureCollisions.Count -eq 0) { throw "Reserved-variable write fixture was not rejected: $($fixture.label)" }
  if (-not $fixture.shouldReject -and $fixtureCollisions.Count -ne 0) { throw "Safe variable fixture was rejected: $($fixture.label)" }
}

$powerShellFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $repo 'scripts\deploy\windows') -Filter '*.ps1' -File
  Get-ChildItem -LiteralPath (Join-Path $repo 'scripts\ci') -Filter '*.ps1' -File
)
foreach ($scriptFile in $powerShellFiles) {
  $parseTokens = $null
  $parseErrors = $null
  $scriptAst = [System.Management.Automation.Language.Parser]::ParseFile($scriptFile.FullName, [ref]$parseTokens, [ref]$parseErrors)
  if (@($parseErrors).Count -gt 0) { throw "PowerShell parser errors in $($scriptFile.FullName): $($parseErrors[0].Message)" }
  $collisions = @(Get-ReservedVariableWriteCollisions $scriptAst)
  if ($collisions.Count -gt 0) {
    $firstCollision = $collisions[0]
    throw "Reserved/constant PowerShell variable write collision: $($scriptFile.FullName):$($firstCollision.line) $($firstCollision.name) $($firstCollision.context)"
  }
}

$catalogSyncPath = Join-Path $repo 'scripts\deploy\windows\sync-capability-catalog.ps1'
$catalogSyncText = Get-Content -LiteralPath $catalogSyncPath -Raw -Encoding UTF8
foreach ($requiredCatalogSyncToken in @('Set-StrictMode -Version Latest',"`$ErrorActionPreference = 'Stop'",'Read-DeploymentIdentity','Invoke-WithServerEnvironment','Assert-ExecutableContract','BackupVerified','ReleaseSha','Assert-ExactReleasePath','sync-capability-catalog.cjs')) {
  if ($catalogSyncText -notmatch [regex]::Escape($requiredCatalogSyncToken)) { throw "Capability catalog sync wrapper is missing required safety token: $requiredCatalogSyncToken" }
}
if ($catalogSyncText -match 'npm run prisma:seed|prisma db seed') { throw 'Capability catalog sync wrapper must not invoke generic seed.' }

$migrationPath = Join-Path $repo 'scripts\deploy\windows\run-migrations.ps1'
$migrationText = Get-Content -LiteralPath $migrationPath -Raw -Encoding UTF8
foreach ($requiredMigrationToken in @('ReleaseSha','Assert-ExactReleasePath','prisma\schema.prisma','Test-PathWithin $schema $release')) {
  if ($migrationText -notmatch [regex]::Escape($requiredMigrationToken)) { throw "Migration wrapper is missing exact-release safety token: $requiredMigrationToken" }
}
if ($migrationText.IndexOf('Assert-ExactReleasePath') -gt $migrationText.IndexOf('Invoke-WithServerEnvironment') -or $migrationText.IndexOf('Test-Path -LiteralPath $schema -PathType Leaf') -gt $migrationText.IndexOf('Invoke-WithServerEnvironment')) { throw 'Exact release and schema checks must precede environment/database mutation.' }

$preflightPath = Join-Path $repo 'scripts\deploy\windows\production-preflight-readonly.ps1'
$preflightText = Get-Content -LiteralPath $preflightPath -Raw -Encoding UTF8
$forbiddenPreflightMutations = @(
  'Register-ScheduledTask','Set-ScheduledTask','Start-ScheduledTask','Stop-ScheduledTask','Disable-ScheduledTask','Enable-ScheduledTask','Unregister-ScheduledTask',
  'Start-Service','Stop-Service','Restart-Service','Set-Service','Stop-Process','taskkill','prisma migrate'
)
foreach ($forbiddenMutation in $forbiddenPreflightMutations) {
  if ($preflightText -match [regex]::Escape($forbiddenMutation)) { throw "Read-only production preflight contains forbidden mutation token: $forbiddenMutation" }
}
foreach ($requiredPreflightToken in @('RequireReviewedIsolation','Resolve-ExpectedCandidateRuntimeName','Resolve-DatabaseVerifierExecutable','Get-ProtectedNeighborIsolationEvidence','Get-SshDirectConfigEvidence','Get-SshPortEvidence','Get-SshPublicHostKeyEvidence','Get-SshFirewallEvidence','-SshPort @($portEvidence.agreedPorts)','& $databaseVerifier --tuples-only','argumentsSha256','pathNameSha256')) {
  if ($preflightText -notmatch [regex]::Escape($requiredPreflightToken)) { throw "Production preflight is missing required evidence token: $requiredPreflightToken" }
}
if ($preflightText -match 'Get-Command\s+psql\b|argumentsRedacted|pathNameRedacted') { throw 'Production preflight contains a PATH-based DB verifier or unsafe raw command evidence.' }

$neighborDiscoveryPath = Join-Path $repo 'scripts\deploy\windows\production-protected-neighbor-discovery.ps1'
$neighborDiscoveryText = Get-Content -LiteralPath $neighborDiscoveryPath -Raw -Encoding UTF8
foreach ($forbiddenMutation in @('Register-ScheduledTask','Set-ScheduledTask','Start-ScheduledTask','Stop-ScheduledTask','Disable-ScheduledTask','Enable-ScheduledTask','Unregister-ScheduledTask','Start-Service','Stop-Service','Restart-Service','Set-Service','Stop-Process','Start-Process','taskkill','New-Item','Remove-Item','Move-Item','Copy-Item','Set-Content','Add-Content','Out-File','Set-NetFirewall','New-NetFirewall','Remove-NetFirewall','prisma migrate')) {
  if ($neighborDiscoveryText -match [regex]::Escape($forbiddenMutation)) { throw "Protected-neighbor discovery contains forbidden mutation token: $forbiddenMutation" }
}
if ($neighborDiscoveryText -notmatch '\[IO\.File\]::WriteAllText' -or $neighborDiscoveryText -notmatch 'READ_ONLY_DISCOVERY') { throw 'Protected-neighbor discovery write/schema contract is missing.' }
if ($preflightText -match '(?i)nginx(?:\.exe)?[^\r\n]*-s\s+(?:reload|stop|quit)' -or $preflightText -match '(?im)^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b') {
  throw 'Read-only production preflight contains forbidden Nginx or PostgreSQL mutation syntax.'
}

if (-not (Get-Command Stop-ExactBaoGiangRuntime -ErrorAction SilentlyContinue)) { throw 'Safe-stop helper is not exported by deployment-common.ps1.' }
$taskContractMarker = [pscustomobject]@{ service = [pscustomobject]@{ taskPath = '\BaoGiang\'; account = 'fixture-account'; execute = 'C:\fixture\WindowsPowerShell.exe'; arguments = '-File start-baogiang-api.ps1'; workingDirectory = 'C:\fixture\shared' } }
function New-ScheduledTaskContractFixture([object[]]$Triggers,[string]$State = 'Disabled') {
  return [pscustomobject]@{
    TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = $State
    Principal = [pscustomobject]@{ UserId = 'fixture-account' }
    Actions = @([pscustomobject]@{ Execute = 'C:\fixture\WindowsPowerShell.exe'; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = 'C:\fixture\shared' })
    Triggers = $Triggers
  }
}
function New-ScheduledTaskTriggerFixture([string]$ClassName,[bool]$Enabled = $true) { return [pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = $ClassName }; Enabled = $Enabled } }
$bootTrigger = New-ScheduledTaskTriggerFixture -ClassName 'MSFT_TaskBootTrigger'
$validDisabledTask = New-ScheduledTaskContractFixture -Triggers @($bootTrigger) -State 'Disabled'
Assert-VerifiedScheduledTaskContract -Marker $taskContractMarker -ServiceName 'BaoGiangBackend' -Task $validDisabledTask | Out-Null
Assert-ScheduledTaskDisabledState -Task $validDisabledTask | Out-Null
foreach ($triggerFixture in @(
  @{ label = 'zero trigger'; task = (New-ScheduledTaskContractFixture -Triggers @()) },
  @{ label = 'two Boot triggers'; task = (New-ScheduledTaskContractFixture -Triggers @($bootTrigger,(New-ScheduledTaskTriggerFixture -ClassName 'MSFT_TaskBootTrigger'))) },
  @{ label = 'Boot plus Time trigger'; task = (New-ScheduledTaskContractFixture -Triggers @($bootTrigger,(New-ScheduledTaskTriggerFixture -ClassName 'MSFT_TaskTimeTrigger'))) },
  @{ label = 'Logon-only trigger'; task = (New-ScheduledTaskContractFixture -Triggers @((New-ScheduledTaskTriggerFixture -ClassName 'MSFT_TaskLogonTrigger'))) },
  @{ label = 'disabled Boot trigger'; task = (New-ScheduledTaskContractFixture -Triggers @((New-ScheduledTaskTriggerFixture -ClassName 'MSFT_TaskBootTrigger' -Enabled:$false))) }
)) {
  $rejected = $false; try { Assert-VerifiedScheduledTaskContract -Marker $taskContractMarker -ServiceName 'BaoGiangBackend' -Task $triggerFixture.task | Out-Null } catch { $rejected = $true }
  if (-not $rejected) { throw "Scheduled Task trigger contract accepted: $($triggerFixture.label)" }
}
$activationRejected = $false; try { Assert-ScheduledTaskActivationAuthorized | Out-Null } catch { $activationRejected = $true }
if (-not $activationRejected) { throw 'Scheduled Task activation gate accepted a missing explicit authorization.' }
Assert-ScheduledTaskActivationAuthorized -AllowScheduledTaskActivation | Out-Null
$preMutationFailure = Get-ScheduledTaskActivationFailureDisposition -ActivationAttempted:$false
$activationFailure = Get-ScheduledTaskActivationFailureDisposition -ActivationAttempted:$true
if ($preMutationFailure.state -ne 'PROPAGATE_ONLY' -or $activationFailure.state -ne 'SAFE_STOP_REQUIRED' -or $activationFailure.taskEnabled -ne $false -or $activationFailure.runtimeRunning -ne $false) { throw 'Scheduled Task activation-failure safe-stop disposition fixture failed.' }
foreach ($activationFixture in @(
  @{ label = 'A2 post-enable reverify failure'; state = 'SAFE_STOP_REQUIRED' }, @{ label = 'A3 no process'; state = 'SAFE_STOP_REQUIRED' }, @{ label = 'A4 runtime exception'; state = 'SAFE_STOP_REQUIRED' }, @{ label = 'A5 final Ready'; state = 'SAFE_STOP_REQUIRED' }
)) { if ((Get-ScheduledTaskActivationFailureDisposition -ActivationAttempted:$true).state -ne $activationFixture.state) { throw "Scheduled Task orchestration fixture failed: $($activationFixture.label)" } }
$readyRejected = $false; try { Assert-ScheduledTaskHealthyState -Task (New-ScheduledTaskContractFixture -Triggers @($bootTrigger) -State 'Ready') | Out-Null } catch { $readyRejected = $true }
if (-not $readyRejected) { throw 'A5 final Ready task was accepted as healthy.' }
Assert-ScheduledTaskHealthyState -Task (New-ScheduledTaskContractFixture -Triggers @($bootTrigger) -State 'Running') | Out-Null
function Invoke-ActivationLifecycleFixture([Parameter(Mandatory = $true)][ValidateSet('A1','A2','A3','A4','A5','A6')][string]$Case) {
  $context = [pscustomobject]@{ Case = $Case; Trace = [Collections.Generic.List[string]]::new(); SafeStopCount = 0; StartCount = 0; SuccessCount = 0; Task = [pscustomobject]@{ State = 'Ready' } }
  $failure = $null; $result = $null
  try {
    $result = Invoke-ScheduledTaskActivationLifecycle -AllowScheduledTaskActivation:($Case -ne 'A1') -Context $context -Verify { param($context,$phase) $eventName = if ($phase -eq 'initial') { 'verify' } else { 'reverify' }; [void]$context.Trace.Add($eventName); if ($context.Case -eq 'A2' -and $phase -eq 'post-enable') { throw 'fixture post-enable reverify failure' }; $context.Task } -Enable { param($context,$task) [void]$context.Trace.Add('enable') } -Start { param($context,$task) [void]$context.Trace.Add('start'); $context.StartCount++ } -RuntimeCheck { param($context) [void]$context.Trace.Add('runtime-check'); if ($context.Case -eq 'A3') { return $null }; if ($context.Case -eq 'A4') { throw 'fixture runtime verifier failure' }; [pscustomobject]@{ pid = 1; port = 3100 } } -FinalVerify { param($context) [void]$context.Trace.Add('final-verify'); [pscustomobject]@{ State = if ($context.Case -eq 'A5') { 'Ready' } else { 'Running' } } } -SafeStop { param($context) [void]$context.Trace.Add('safe-stop'); $context.SafeStopCount++ } -Success { param($context,$runtime) [void]$context.Trace.Add('success'); $context.SuccessCount++; [pscustomobject]@{ taskEnabled = $true; runtimeRunning = $true; rebootPersistence = $true } }
  } catch { $failure = $_ }
  return [pscustomobject]@{ Context = $context; Failure = $failure; Result = $result }
}
function Assert-ExactFixtureTrace([string]$Label,$Fixture,[string[]]$Expected) {
  $actual = @($Fixture.Context.Trace)
  if ($actual.Count -ne $Expected.Count -or ($actual -join ',') -cne ($Expected -join ',')) { throw "$Label trace mismatch: expected=$($Expected -join ','); actual=$($actual -join ',')" }
}
$a1 = Invoke-ActivationLifecycleFixture A1; Assert-ExactFixtureTrace A1 $a1 @(); if ($null -eq $a1.Failure -or $a1.Context.SafeStopCount -ne 0 -or $a1.Context.StartCount -ne 0 -or $a1.Context.SuccessCount -ne 0) { throw 'A1 authorization fixture failed.' }
$a2 = Invoke-ActivationLifecycleFixture A2; Assert-ExactFixtureTrace A2 $a2 @('verify','enable','reverify','safe-stop'); if ($a2.Failure.Exception.Message -notmatch 'fixture post-enable reverify failure' -or $a2.Context.SafeStopCount -ne 1 -or $a2.Context.StartCount -ne 0 -or $a2.Context.SuccessCount -ne 0) { throw 'A2 reverify failure fixture failed.' }
$a3 = Invoke-ActivationLifecycleFixture A3; Assert-ExactFixtureTrace A3 $a3 @('verify','enable','reverify','start','runtime-check','safe-stop'); if ($null -eq $a3.Failure -or $a3.Context.SafeStopCount -ne 1 -or $a3.Context.StartCount -ne 1 -or $a3.Context.SuccessCount -ne 0) { throw 'A3 no-process fixture failed.' }
$a4 = Invoke-ActivationLifecycleFixture A4; Assert-ExactFixtureTrace A4 $a4 @('verify','enable','reverify','start','runtime-check','safe-stop'); if ($a4.Failure.Exception.Message -notmatch 'fixture runtime verifier failure' -or $a4.Context.SafeStopCount -ne 1 -or $a4.Context.StartCount -ne 1 -or $a4.Context.SuccessCount -ne 0) { throw 'A4 throwing runtime verifier fixture failed.' }
$a5 = Invoke-ActivationLifecycleFixture A5; Assert-ExactFixtureTrace A5 $a5 @('verify','enable','reverify','start','runtime-check','final-verify','safe-stop'); if ($null -eq $a5.Failure -or $a5.Context.SafeStopCount -ne 1 -or $a5.Context.SuccessCount -ne 0) { throw 'A5 Ready-state fixture failed.' }
$a6 = Invoke-ActivationLifecycleFixture A6; Assert-ExactFixtureTrace A6 $a6 @('verify','enable','reverify','start','runtime-check','final-verify','success'); if ($null -ne $a6.Failure -or $a6.Context.SafeStopCount -ne 0 -or $a6.Context.StartCount -ne 1 -or $a6.Context.SuccessCount -ne 1 -or -not $a6.Result.taskEnabled -or -not $a6.Result.runtimeRunning -or -not $a6.Result.rebootPersistence) { throw 'A6 healthy fixture failed.' }

function Invoke-RollbackLifecycleFixture([Parameter(Mandatory = $true)][ValidateSet('B1','B2','B3')][string]$Case) {
  $context = [pscustomobject]@{ Case = $Case; Trace = [Collections.Generic.List[string]]::new(); SafeStopCount = 0 }
  $failure = $null; $result = $null
  try { $result = Invoke-ScheduledTaskRollbackLifecycle -Context $context -Restart { param($context) [void]$context.Trace.Add('restart') } -Health { param($context) [void]$context.Trace.Add('health'); if ($context.Case -in @('B2','B3')) { throw 'fixture rollback health failure' }; 'PASS' } -SafeStop { param($context) [void]$context.Trace.Add('safe-stop'); $context.SafeStopCount++; if ($context.Case -eq 'B3') { throw 'fixture rollback cleanup failure' } } } catch { $failure = $_ }
  return [pscustomobject]@{ Context = $context; Failure = $failure; Result = $result }
}
$b1 = Invoke-RollbackLifecycleFixture B1; Assert-ExactFixtureTrace B1 $b1 @('restart','health'); if ($null -ne $b1.Failure -or $b1.Result -ne 'PASS' -or $b1.Context.SafeStopCount -ne 0) { throw 'B1 rollback success fixture failed.' }
$b2 = Invoke-RollbackLifecycleFixture B2; Assert-ExactFixtureTrace B2 $b2 @('restart','health','safe-stop'); if ($b2.Failure.Exception.Message -notmatch 'fixture rollback health failure' -or $b2.Context.SafeStopCount -ne 1) { throw 'B2 throwing health fixture failed.' }
$b3 = Invoke-RollbackLifecycleFixture B3; Assert-ExactFixtureTrace B3 $b3 @('restart','health','safe-stop'); if ($b3.Failure.Exception.Message -notmatch 'ROLLBACK_HEALTH_FAILED_AND_SAFE_STOP_FAILED' -or $b3.Context.SafeStopCount -ne 1) { throw 'B3 throwing cleanup fixture failed.' }
$b4Context = [pscustomobject]@{ Trace = [Collections.Generic.List[string]]::new(); RollbackActivationCount = 0; EnableCount = 0; SafeStopCount = 0 }
$b4Decision = Get-DeploymentFailureRecoveryDecision -HasPreviousRelease:$true -MigrationAttempted:$true -RollbackCompatibilityApproved:$false
if ($b4Decision -eq 'COMPATIBILITY_SAFE_STOP') { [void]$b4Context.Trace.Add('safe-stop'); $b4Context.SafeStopCount++ } elseif ($b4Decision -eq 'ROLLBACK_RELEASE') { $b4Context.RollbackActivationCount++; $b4Context.EnableCount++ }
if ($b4Decision -ne 'COMPATIBILITY_SAFE_STOP' -or (@($b4Context.Trace) -join ',') -ne 'safe-stop' -or $b4Context.SafeStopCount -ne 1 -or $b4Context.RollbackActivationCount -ne 0 -or $b4Context.EnableCount -ne 0) { throw 'B4 compatibility recovery routing fixture failed.' }
$wait = Get-SafeStopPollingDecision -ExactProcessId @(3100) -Listeners @([pscustomobject]@{ OwningProcess = 3100 })
if ($wait.state -ne 'WAIT') { throw 'Exact Báo giảng listener should wait during shutdown grace period.' }
$pass = Get-SafeStopPollingDecision -ExactProcessId @() -Listeners @()
if ($pass.state -ne 'PASS') { throw 'Zero process/listener should pass safe-stop polling.' }
$conflict = Get-SafeStopPollingDecision -ExactProcessId @(3100) -Listeners @([pscustomobject]@{ OwningProcess = 9999 })
if ($conflict.state -ne 'CONFLICT') { throw 'Foreign listener owner was not classified as conflict.' }
$orphanWait = Get-SafeStopPollingDecision -ExactProcessId @(3100) -Listeners @()
if ($orphanWait.state -ne 'WAIT') { throw 'Exact process without listener should remain bounded wait.' }
$missingMigrations = Get-DatabaseEvidenceClassification -ActualDatabase 'baogiang' -ExpectedDatabase 'baogiang' -ActualRole 'baogiang_app' -ExpectedRole 'baogiang_app' -ActualExtensions @('btree_gist') -RequiredExtensions @('btree_gist') -MigrationTablePresent $false
if ($missingMigrations.state -ne 'PARTIAL' -or $missingMigrations.migrationState -ne 'NOT_APPLIED') { throw 'Greenfield migration-table classification failed.' }
$cleanMigrations = Get-DatabaseEvidenceClassification -ActualDatabase 'baogiang' -ExpectedDatabase 'baogiang' -ActualRole 'baogiang_app' -ExpectedRole 'baogiang_app' -ActualExtensions @('btree_gist') -RequiredExtensions @('btree_gist') -MigrationTablePresent $true -MigrationSummaryVerified $true
if ($cleanMigrations.state -ne 'EXISTS AND VERIFIED') { throw 'Clean migration classification failed.' }
$unfinished = Get-DatabaseEvidenceClassification -ActualDatabase 'baogiang' -ExpectedDatabase 'baogiang' -ActualRole 'baogiang_app' -ExpectedRole 'baogiang_app' -ActualExtensions @('btree_gist') -RequiredExtensions @('btree_gist') -MigrationTablePresent $true -MigrationSummaryVerified $true -UnfinishedMigrations 1
if ($unfinished.state -ne 'CONFLICT') { throw 'Unfinished migration classification failed.' }
$identityConflict = Get-DatabaseEvidenceClassification -ActualDatabase 'other' -ExpectedDatabase 'baogiang' -ActualRole 'baogiang_app' -ExpectedRole 'baogiang_app' -ActualExtensions @('btree_gist') -RequiredExtensions @('btree_gist') -MigrationTablePresent $false
if ($identityConflict.state -ne 'CONFLICT') { throw 'Database identity conflict classification failed.' }
$absentPlan = @(Get-DatabaseEvidenceQueryPlan -MigrationTablePresent:$false)
$presentPlan = @(Get-DatabaseEvidenceQueryPlan -MigrationTablePresent:$true)
if ($absentPlan.Count -ne 1 -or $absentPlan[0].sql -match 'FROM _prisma_migrations') { throw 'Greenfield query plan must not run migration summary SQL.' }
if ($presentPlan.Count -ne 2 -or $presentPlan[1].sql -notmatch 'FROM _prisma_migrations') { throw 'Present-table query plan must include summary SQL.' }
$summaryUnavailable = Get-DatabaseEvidenceClassification -ActualDatabase 'baogiang' -ExpectedDatabase 'baogiang' -ActualRole 'baogiang_app' -ExpectedRole 'baogiang_app' -ActualExtensions @('btree_gist') -RequiredExtensions @('btree_gist') -MigrationTablePresent $true -MigrationSummaryVerified $false
if ($summaryUnavailable.state -ne 'PARTIAL' -or $summaryUnavailable.migrationState -ne 'NOT_VERIFIED') { throw 'Unavailable migration summary classification failed.' }
$emptyIsolationRejected = $false
try { Get-ProtectedNeighborIsolationEvidence -CandidateRoot 'C:\baogiang' -RequireReviewedInputs | Out-Null } catch { $emptyIsolationRejected = $true }
if (-not $emptyIsolationRejected) { throw 'Verified first-deploy isolation accepted empty reviewed inputs.' }
$missingCandidateRejected = $false
try { Get-ProtectedNeighborIsolationEvidence -CandidateRoot 'C:\baogiang' -KnownForeignRoot @('C:\DamSanV5') -KnownForeignName @('DamSanV5Backend') -RequireReviewedInputs | Out-Null } catch { $missingCandidateRejected = $true }
if (-not $missingCandidateRejected) { throw 'I1 verified isolation accepted an empty candidate runtime name.' }
$missingKindRejected = $false
try { Resolve-ExpectedCandidateRuntimeName -ExpectedTaskName 'BaoGiangBackend' -RequireReviewedIsolation | Out-Null } catch { $missingKindRejected = $true }
if (-not $missingKindRejected) { throw 'I2 verified isolation accepted a missing ServiceKind.' }
$missingTaskNameRejected = $false
try { Resolve-ExpectedCandidateRuntimeName -ServiceKind 'scheduled-task' -RequireReviewedIsolation | Out-Null } catch { $missingTaskNameRejected = $true }
if (-not $missingTaskNameRejected) { throw 'I3 scheduled-task isolation accepted a missing ExpectedTaskName.' }
$missingServiceNameRejected = $false
try { Resolve-ExpectedCandidateRuntimeName -ServiceKind 'service' -RequireReviewedIsolation | Out-Null } catch { $missingServiceNameRejected = $true }
if (-not $missingServiceNameRejected) { throw 'I4 service isolation accepted a missing ExpectedServiceName.' }
$ambiguousCandidateRejected = $false
try { Resolve-ExpectedCandidateRuntimeName -ServiceKind 'scheduled-task' -ExpectedTaskName 'BaoGiangBackend' -ExpectedServiceName 'BaoGiangService' -RequireReviewedIsolation | Out-Null } catch { $ambiguousCandidateRejected = $true }
if (-not $ambiguousCandidateRejected) { throw 'Verified isolation accepted an ambiguous candidate runtime identity.' }
$unsafeCandidateRejected = $false
try { Resolve-ExpectedCandidateRuntimeName -ServiceKind 'scheduled-task' -ExpectedTaskName 'Bao Giang Backend' -RequireReviewedIsolation | Out-Null } catch { $unsafeCandidateRejected = $true }
if (-not $unsafeCandidateRejected) { throw 'Verified isolation accepted an unsafe candidate runtime name.' }
$candidateRuntimeName = Resolve-ExpectedCandidateRuntimeName -ServiceKind 'scheduled-task' -ExpectedTaskName 'BaoGiangBackend' -RequireReviewedIsolation
$nameConflictIsolation = Get-ProtectedNeighborIsolationEvidence -CandidateRoot 'C:\baogiang' -KnownForeignRoot @('C:\DamSanV5') -CandidateName @($candidateRuntimeName) -KnownForeignName @('baogiangbackend') -RequireReviewedInputs
if ($nameConflictIsolation.status -ne 'CONFLICT' -or $nameConflictIsolation.conflictType -ne 'NAME_OVERLAP') { throw 'I5 case-insensitive exact runtime-name overlap was not classified as conflict.' }
$reviewedIsolation = Get-ProtectedNeighborIsolationEvidence -CandidateRoot 'C:\baogiang' -KnownForeignRoot @('C:\DamSanV5') -CandidateName @('BaoGiangBackend') -KnownForeignName @('DamSanV5Backend') -RequireReviewedInputs
if ($reviewedIsolation.status -ne 'EXISTS AND VERIFIED') { throw 'I6 reviewed protected-neighbor inputs were not accepted.' }
$nonFuzzyIsolation = Get-ProtectedNeighborIsolationEvidence -CandidateRoot 'C:\baogiang' -KnownForeignRoot @('C:\DamSanV5') -CandidateName @('BaoGiangBackend') -KnownForeignName @('BaoGiangBackendOld') -RequireReviewedInputs
if ($nonFuzzyIsolation.status -ne 'EXISTS AND VERIFIED') { throw 'Distinct runtime names were incorrectly fuzzy-matched.' }
$overlapIsolation = Get-ProtectedNeighborIsolationEvidence -CandidateRoot 'C:\baogiang' -KnownForeignRoot @('C:\baogiang\legacy') -CandidateName @('BaoGiangBackend') -KnownForeignName @('DamSanV5Backend') -RequireReviewedInputs
if ($overlapIsolation.status -ne 'CONFLICT' -or $overlapIsolation.conflictType -ne 'PATH_OVERLAP') { throw 'Protected-neighbor path overlap was not classified as conflict.' }
$hostileTaskArguments = 'C:\apps\baogiang\server.js --token arbitrary-secret-value --password another-secret'
$safeTaskEvidence = [ordered]@{ argumentsSha256 = Get-SensitiveTextHash $hostileTaskArguments; safePathHints = @(Get-SafePathHints $hostileTaskArguments) } | ConvertTo-Json
if ($safeTaskEvidence -match 'arbitrary-secret-value|another-secret|--token|--password' -or $safeTaskEvidence -notmatch 'server\.js') { throw 'Task/service arbitrary-argument privacy fixture failed.' }
$temp = Join-Path ([IO.Path]::GetTempPath()) ("baogiang-deploy-test-" + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  $aclRoot = Join-Path $temp 'acl-authority-root'
  $aclShared = Join-Path $aclRoot 'shared'
  foreach ($directory in @(Get-ProductionRequiredDirectoryNames)) { New-Item -ItemType Directory -Path (Join-Path $aclRoot $directory) -Force | Out-Null }
  $aclBundleSha = 'a' * 40
  $aclBundleRoot = Join-Path $aclShared 'startup-bundles'
  $aclVersionDirectory = Join-Path $aclBundleRoot $aclBundleSha
  New-Item -ItemType Directory -Path $aclVersionDirectory -Force | Out-Null
  $aclEnv = Join-Path $aclShared 'production.env'
  $aclWrapper = Join-Path $aclVersionDirectory 'start-baogiang-api.ps1'
  $aclCommon = Join-Path $aclVersionDirectory 'deployment-common.ps1'
  $aclMarker = Join-Path $aclShared 'deployment-identity.json'
  foreach ($leaf in @($aclEnv,$aclWrapper,$aclCommon,$aclMarker)) { Set-Content -LiteralPath $leaf -Value 'fixture' -Encoding UTF8 }
  $aclInputs = @{
    CanonicalRoot = $aclRoot
    DeploymentIdentity = 'S-1-5-21-100-200-300-1001'
    ApiRuntimeIdentity = 'S-1-5-21-100-200-300-1002'
    WebRuntimeIdentity = 'S-1-5-21-100-200-300-1003'
    EnvFile = $aclEnv
    StartupWrapper = $aclWrapper
  }
  $aclPolicyA = Get-ProductionAclPolicy @aclInputs
  $aclPolicyB = Get-ProductionAclPolicy @aclInputs
  if (($aclPolicyA | ConvertTo-Json -Depth 12 -Compress) -cne ($aclPolicyB | ConvertTo-Json -Depth 12 -Compress)) { throw 'ACL-P1 deterministic policy generation failed.' }
  function Assert-AclPolicyPath([string]$Path,[string]$Kind,[hashtable]$ExpectedRights) {
    $policyPath = @($aclPolicyA.protectedPaths | Where-Object { (Normalize-ComparablePath $_.path) -eq (Normalize-ComparablePath $Path) })
    if ($policyPath.Count -ne 1 -or $policyPath[0].kind -ne $Kind -or -not $policyPath[0].inheritanceProtected) { throw "ACL-P1 protected path shape mismatch: $Path" }
    if (@($policyPath[0].desiredAces).Count -ne $ExpectedRights.Count) { throw "ACL-P1 ACE count mismatch: $Path" }
    $expectedInheritance = if ($Kind -eq 'directory') { [int]([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit) } else { [int][Security.AccessControl.InheritanceFlags]::None }
    foreach ($ace in @($policyPath[0].desiredAces)) {
      if (-not $ExpectedRights.ContainsKey($ace.role) -or $ace.sid -ne $aclPolicyA.identities[$ace.role] -or [int64]$ace.rightsValue -ne [int64]$ExpectedRights[$ace.role] -or $ace.accessControlType -ne 'Allow' -or [int]$ace.inheritanceFlagsValue -ne $expectedInheritance -or [int]$ace.propagationFlagsValue -ne 0 -or [bool]$ace.isInherited) { throw "ACL-P1 exact ACE mismatch: $Path" }
    }
  }
  $aclFull = [Security.AccessControl.FileSystemRights]::FullControl
  $aclModify = [Security.AccessControl.FileSystemRights]::Modify
  $aclReadExecute = [Security.AccessControl.FileSystemRights]::ReadAndExecute
  $aclRead = [Security.AccessControl.FileSystemRights]::Read
  $rootRights = @{ SYSTEM = $aclFull; Administrators = $aclFull; DeploymentIdentity = $aclModify; ApiRuntimeIdentity = $aclReadExecute; WebRuntimeIdentity = $aclReadExecute }
  $deploymentOnlyRights = @{ SYSTEM = $aclFull; Administrators = $aclFull; DeploymentIdentity = $aclModify }
  $apiReadExecuteRights = @{ SYSTEM = $aclFull; Administrators = $aclFull; DeploymentIdentity = $aclModify; ApiRuntimeIdentity = $aclReadExecute }
  Assert-AclPolicyPath -Path $aclRoot -Kind directory -ExpectedRights $rootRights
  Assert-AclPolicyPath -Path (Join-Path $aclRoot 'releases') -Kind directory -ExpectedRights $rootRights
  foreach ($directory in @('staging','incoming','backups')) { Assert-AclPolicyPath -Path (Join-Path $aclRoot $directory) -Kind directory -ExpectedRights $deploymentOnlyRights }
  Assert-AclPolicyPath -Path (Join-Path $aclRoot 'shared') -Kind directory -ExpectedRights $apiReadExecuteRights
  Assert-AclPolicyPath -Path (Join-Path $aclRoot 'logs') -Kind directory -ExpectedRights @{ SYSTEM = $aclFull; Administrators = $aclFull; DeploymentIdentity = $aclModify; ApiRuntimeIdentity = $aclModify }
  foreach ($directory in @($aclBundleRoot,$aclVersionDirectory)) { Assert-AclPolicyPath -Path $directory -Kind directory -ExpectedRights $apiReadExecuteRights }
  foreach ($leaf in @($aclMarker,$aclEnv)) { Assert-AclPolicyPath -Path $leaf -Kind file -ExpectedRights @{ SYSTEM = $aclFull; Administrators = $aclFull; DeploymentIdentity = $aclModify; ApiRuntimeIdentity = $aclRead } }
  foreach ($leaf in @($aclWrapper,$aclCommon)) { Assert-AclPolicyPath -Path $leaf -Kind file -ExpectedRights $apiReadExecuteRights }
  $aclPlanScript = Join-Path $repo 'scripts\deploy\windows\production-root-acl-plan.ps1'
  $aclPlanReportA = Join-Path $temp 'acl-plan-a.json'
  $aclPlanReportB = Join-Path $temp 'acl-plan-b.json'
  foreach ($planReport in @($aclPlanReportA,$aclPlanReportB)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $aclPlanScript -Root $aclRoot -DeploymentIdentity $aclInputs.DeploymentIdentity -ApiRuntimeIdentity $aclInputs.ApiRuntimeIdentity -WebRuntimeIdentity $aclInputs.WebRuntimeIdentity -EnvFile $aclEnv -StartupWrapper $aclWrapper -ReportPath $planReport | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'ACL-P1 standalone plan invocation failed.' }
  }
  if ((Get-Content -LiteralPath $aclPlanReportA -Raw) -cne (Get-Content -LiteralPath $aclPlanReportB -Raw)) { throw 'ACL-P1 standalone JSON plan was not deterministic.' }
  $aclVerifyScript = Join-Path $repo 'scripts\deploy\windows\production-root-acl-verify.ps1'
  $aclReportCollisionSentinel = $aclMarker
  $aclReportCollisionHash = Get-Sha256FromBytes ([IO.File]::ReadAllBytes($aclReportCollisionSentinel))
  foreach ($aclReadOnlyTool in @($aclPlanScript,$aclVerifyScript)) {
    $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $aclCollisionOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $aclReadOnlyTool -Root $aclRoot -DeploymentIdentity $aclInputs.DeploymentIdentity -ApiRuntimeIdentity $aclInputs.ApiRuntimeIdentity -WebRuntimeIdentity $aclInputs.WebRuntimeIdentity -EnvFile $aclEnv -StartupWrapper $aclWrapper -ReportPath $aclReportCollisionSentinel 2>&1 | Out-String)
    $aclCollisionExit = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
    if ($aclCollisionExit -eq 0 -or $aclCollisionOutput -notmatch 'READ_ONLY_REPORT_PATH_CONFLICT' -or (Get-Sha256FromBytes ([IO.File]::ReadAllBytes($aclReportCollisionSentinel))) -ne $aclReportCollisionHash) { throw "RPT-P6 root ACL report collision was not rejected safely: $aclReadOnlyTool" }
  }
  $aclPolicyPath = $aclPolicyA.protectedPaths | Where-Object { (Normalize-ComparablePath $_.path) -eq (Normalize-ComparablePath (Join-Path $aclRoot 'releases')) } | Select-Object -First 1
  $exactAclSnapshot = [pscustomobject]@{ inheritanceProtected = $true; access = @($aclPolicyPath.desiredAces | ForEach-Object { Normalize-AclRule $_ }) }

  $missingAclSnapshot = [pscustomobject]@{ inheritanceProtected = $true; access = @($exactAclSnapshot.access | Select-Object -Skip 1) }
  if ((Compare-AclSnapshotToPolicy $aclPolicyPath $missingAclSnapshot).state -ne 'MISSING_ACE') { throw 'ACL-P2 missing required ACE did not fail.' }

  $broadAclRule = New-ProductionAclRule -Role 'UnexpectedBroadPrincipal' -Sid 'S-1-5-32-545' -Rights ([Security.AccessControl.FileSystemRights]::ReadAndExecute) -InheritanceFlags ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit)
  $broadAclSnapshot = [pscustomobject]@{ inheritanceProtected = $true; access = @($exactAclSnapshot.access) + @(Normalize-AclRule $broadAclRule) }
  if ((Compare-AclSnapshotToPolicy $aclPolicyPath $broadAclSnapshot).state -ne 'UNEXPECTED_ACE') { throw 'ACL-P3 unexpected broad ACE did not fail.' }

  $denyAclRule = Normalize-AclRule $aclPolicyPath.desiredAces[0]
  $denyAclRule.accessControlTypeValue = [int][Security.AccessControl.AccessControlType]::Deny
  $denyAclSnapshot = [pscustomobject]@{ inheritanceProtected = $true; access = @($exactAclSnapshot.access) + @($denyAclRule) }
  if ((Compare-AclSnapshotToPolicy $aclPolicyPath $denyAclSnapshot).state -ne 'DENY_ACE') { throw 'ACL-P4 explicit DENY did not fail.' }

  $wrongRights = @($exactAclSnapshot.access | ForEach-Object { $_ | Select-Object * })
  $wrongRights[0].rightsValue = [int64][Security.AccessControl.FileSystemRights]::Read
  $wrongRightsSnapshot = [pscustomobject]@{ inheritanceProtected = $true; access = $wrongRights }
  if ((Compare-AclSnapshotToPolicy $aclPolicyPath $wrongRightsSnapshot).state -ne 'RIGHTS_MISMATCH') { throw 'ACL-P5 wrong rights did not fail.' }

  $wrongInheritanceSnapshot = [pscustomobject]@{ inheritanceProtected = $false; access = @($exactAclSnapshot.access) }
  if ((Compare-AclSnapshotToPolicy $aclPolicyPath $wrongInheritanceSnapshot).state -ne 'INHERITANCE_MISMATCH') { throw 'ACL-P6 wrong inheritance protection did not fail.' }

  $equivalentRights = @($aclPolicyPath.desiredAces | ForEach-Object { $_ | Select-Object * })
  foreach ($rule in $equivalentRights) { $rule.rights = 'Equivalent composite representation ignored by authority' }
  $equivalentSnapshot = [pscustomobject]@{ inheritanceProtected = $true; access = $equivalentRights }
  if ((Compare-AclSnapshotToPolicy $aclPolicyPath $equivalentSnapshot).state -ne 'PASS') { throw 'ACL-P7 numeric equivalent rights representation did not pass.' }
  if ((Compare-AclSnapshotToPolicy $aclPolicyPath $exactAclSnapshot).state -ne 'PASS') { throw 'ACL-P8 exact desired DACL snapshot did not pass.' }

  $pathTarget = Join-Path $temp 'path-target'
  New-Item -ItemType Directory -Path $pathTarget -Force | Out-Null
  $pathRootJunction = Join-Path $temp 'path-root-junction'
  New-Item -ItemType Junction -Path $pathRootJunction -Target $pathTarget | Out-Null
  $pathRejected = $false
  try { Assert-ExistingNonReparseDirectory -Path $pathRootJunction -Role PRODUCTION_ROOT | Out-Null } catch { if ($_.Exception.Message -eq 'PRODUCTION_ROOT_REPARSE_POINT') { $pathRejected = $true } }
  if (-not $pathRejected) { throw 'PATH-P1 root reparse point did not fail categorically.' }

  $pathFixtureRoot = Join-Path $temp 'path-fixture-root'
  New-Item -ItemType Directory -Path $pathFixtureRoot -Force | Out-Null
  foreach ($directory in @('staging','incoming','shared','logs','backups')) { New-Item -ItemType Directory -Path (Join-Path $pathFixtureRoot $directory) -Force | Out-Null }
  $pathReleases = Join-Path $pathFixtureRoot 'releases'
  New-Item -ItemType Junction -Path $pathReleases -Target $pathTarget | Out-Null
  $pathRejected = $false
  try { Assert-ExistingNonReparseDirectory -Path $pathReleases -Role PRODUCTION_SUBDIRECTORY | Out-Null } catch { if ($_.Exception.Message -eq 'PRODUCTION_SUBDIRECTORY_REPARSE_POINT') { $pathRejected = $true } }
  if (-not $pathRejected) { throw 'PATH-P2 required subdirectory reparse point did not fail categorically.' }
  Remove-Item -LiteralPath $pathReleases -Force
  New-Item -ItemType Directory -Path $pathReleases | Out-Null
  foreach ($directory in Get-ProductionRequiredDirectoryNames) { Assert-ExistingNonReparseDirectory -Path (Join-Path $pathFixtureRoot $directory) -Role PRODUCTION_SUBDIRECTORY | Out-Null }

  $sbRepo = Join-Path $temp 'startup-bundle-source-repo'
  New-Item -ItemType Directory -Path $sbRepo -Force | Out-Null
  & git -C $sbRepo init --quiet
  & git -C $sbRepo config user.email 'fixture@example.invalid'
  & git -C $sbRepo config user.name 'Startup Bundle Fixture'
  & git -C $sbRepo config core.autocrlf false
  & git -C $sbRepo commit --allow-empty --quiet -m empty
  if ($LASTEXITCODE -ne 0) { throw 'SB-P3 fixture repository initialization failed.' }
  $sbEmptyCommit = (& git -C $sbRepo rev-parse HEAD).Trim()
  $sbSourceDirectory = Join-Path $sbRepo 'scripts\deploy\windows'
  New-Item -ItemType Directory -Path $sbSourceDirectory -Force | Out-Null
  $sbSourceWrapper = Join-Path $sbSourceDirectory 'start-baogiang-api.ps1'
  $sbSourceCommon = Join-Path $sbSourceDirectory 'deployment-common.ps1'
  [byte[]]$sbWrapperABytes = [Text.Encoding]::UTF8.GetBytes("wrapper-A`r`nexact-blob`n")
  [byte[]]$sbCommonABytes = [Text.Encoding]::UTF8.GetBytes("common-A`nexact-blob-without-working-tree-authority")
  [IO.File]::WriteAllBytes($sbSourceWrapper,$sbWrapperABytes)
  [IO.File]::WriteAllBytes($sbSourceCommon,$sbCommonABytes)
  & git -C $sbRepo add -- scripts/deploy/windows/start-baogiang-api.ps1 scripts/deploy/windows/deployment-common.ps1
  & git -C $sbRepo commit --quiet -m bundle-a
  if ($LASTEXITCODE -ne 0) { throw 'SB-P1 fixture commit A failed.' }
  $sbCommitA = (& git -C $sbRepo rev-parse HEAD).Trim()
  $sbRoot = Join-Path $temp 'startup-bundle-production-root'
  $sbPlanScript = Join-Path $repo 'scripts\deploy\windows\production-startup-bundle-plan.ps1'
  $sbVerifyScript = Join-Path $repo 'scripts\deploy\windows\production-startup-bundle-verify.ps1'
  $sbPlanA1 = Join-Path $temp 'startup-plan-a1.json'
  $sbPlanA2 = Join-Path $temp 'startup-plan-a2.json'
  foreach ($planReport in @($sbPlanA1,$sbPlanA2)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitA -Root $sbRoot -ReportPath $planReport | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'SB-P1 exact-commit provenance plan failed.' }
  }
  if (-not (Test-Path -LiteralPath $sbPlanA1 -PathType Leaf) -or (Test-PathWithin -Path $sbPlanA1 -Parent $sbRoot) -or (Test-PathWithin -Path $sbPlanA1 -Parent $sbRepo)) { throw 'RPT-P1 safe external report was not created outside protected roots.' }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitA -Root $sbRoot -ReportPath $sbPlanA1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'RPT-P1 prior ordinary external report could not be safely replaced.' }
  $sbPlanA = Get-Content -LiteralPath $sbPlanA1 -Raw | ConvertFrom-Json
  $sbPlanARepeat = Get-Content -LiteralPath $sbPlanA2 -Raw | ConvertFrom-Json
  if (($sbPlanA | ConvertTo-Json -Depth 10 -Compress) -cne ($sbPlanARepeat | ConvertTo-Json -Depth 10 -Compress) -or $sbPlanA.source.wrapper.sha256 -ne (Get-Sha256FromBytes $sbWrapperABytes) -or $sbPlanA.source.common.sha256 -ne (Get-Sha256FromBytes $sbCommonABytes) -or $sbPlanA.source.wrapper.gitBlobOid -notmatch '^[0-9a-f]{40,64}$' -or $sbPlanA.source.common.gitBlobOid -notmatch '^[0-9a-f]{40,64}$') { throw 'SB-P1 deterministic Git-blob provenance failed.' }

  [IO.File]::WriteAllBytes($sbSourceWrapper,[Text.Encoding]::UTF8.GetBytes('dirty wrapper must not be authoritative'))
  [IO.File]::WriteAllBytes($sbSourceCommon,[Text.Encoding]::UTF8.GetBytes('dirty common must not be authoritative'))
  $sbDirtyPlan = Join-Path $temp 'startup-plan-dirty-worktree.json'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitA -Root $sbRoot -ReportPath $sbDirtyPlan | Out-Null
  $sbDirtyAuthority = Get-Content -LiteralPath $sbDirtyPlan -Raw | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $sbDirtyAuthority.source.wrapper.sha256 -ne $sbPlanA.source.wrapper.sha256 -or $sbDirtyAuthority.source.common.sha256 -ne $sbPlanA.source.common.sha256 -or $sbDirtyAuthority.source.wrapper.gitBlobOid -ne $sbPlanA.source.wrapper.gitBlobOid -or $sbDirtyAuthority.source.common.gitBlobOid -ne $sbPlanA.source.common.gitBlobOid) { throw 'SB-P2 dirty working tree changed provenance authority.' }
  $sourceSentinelHash = Get-Sha256FromBytes ([IO.File]::ReadAllBytes($sbSourceWrapper))
  $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $sourceCollisionOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitA -Root $sbRoot -ReportPath $sbSourceWrapper 2>&1 | Out-String)
  $sourceCollisionExit = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
  if ($sourceCollisionExit -eq 0 -or $sourceCollisionOutput -notmatch 'READ_ONLY_REPORT_PATH_CONFLICT' -or (Get-Sha256FromBytes ([IO.File]::ReadAllBytes($sbSourceWrapper))) -ne $sourceSentinelHash) { throw 'RPT-P3 source repository report collision was not rejected without mutation.' }

  $invalidPlanReport = Join-Path $temp 'startup-plan-invalid.json'
  $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbEmptyCommit -Root $sbRoot -ReportPath $invalidPlanReport 2>&1 | Out-Null
  $invalidPlanExitCode = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
  if ($invalidPlanExitCode -eq 0 -or (Test-Path -LiteralPath $invalidPlanReport)) { throw 'SB-P3 missing exact-commit source paths did not fail closed.' }
  $expectedLayoutA = Get-CanonicalStartupBundleLayout -Root $sbRoot -ReviewedCommitSha $sbCommitA
  if ((Normalize-ComparablePath $sbPlanA.destination.versionDirectory) -ne (Normalize-ComparablePath $expectedLayoutA.versionDirectory) -or (Split-Path -Leaf $sbPlanA.destination.versionDirectory) -cne $sbCommitA) { throw 'SB-P4 canonical version layout mismatch.' }
  foreach ($invalidWrapper in @(
    (Join-Path $sbRoot 'shared\start-baogiang-api.ps1'),
    (Join-Path $sbRoot "shared\other-parent\$sbCommitA\start-baogiang-api.ps1"),
    (Join-Path $sbRoot ("shared\startup-bundles\" + ('f' * 39) + '\start-baogiang-api.ps1')),
    (Join-Path $sbRoot "shared\startup-bundles\$sbCommitA\..\start-baogiang-api.ps1")
  )) {
    $layoutRejected = $false
    try { Get-CanonicalStartupBundleLayoutFromWrapper -Root $sbRoot -StartupWrapper $invalidWrapper | Out-Null } catch { $layoutRejected = $true }
    if (-not $layoutRejected) { throw "SB-P4 invalid wrapper layout was accepted: $invalidWrapper" }
  }

  $sbDeploymentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $sbApiSid = 'S-1-5-19'
  $sbWebSid = 'S-1-5-20'
  $sbEnv = Join-Path $sbRoot 'shared\production.env'
  $sbVerifyReport = Join-Path $temp 'startup-verify.json'
  function Assert-StartupVerifierState([string]$PlanPath,[string]$ExpectedState,[string]$ExpectedCategory,[bool]$ShouldFail,[string]$ExpectedDigest = '') {
    $digest = if ([string]::IsNullOrWhiteSpace($ExpectedDigest)) { Get-Sha256FromBytes ([IO.File]::ReadAllBytes($PlanPath)) } else { $ExpectedDigest }
    if (Test-Path -LiteralPath $sbVerifyReport) { Remove-Item -LiteralPath $sbVerifyReport -Force }
    $savedPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $verifyOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbVerifyScript -PlanPath $PlanPath -ExpectedPlanSha256 $digest -Root $sbRoot -DeploymentIdentity $sbDeploymentSid -ApiRuntimeIdentity $sbApiSid -WebRuntimeIdentity $sbWebSid -EnvFile $sbEnv -ReportPath $sbVerifyReport 2>&1 | Out-String)
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $savedPreference
    if (-not (Test-Path -LiteralPath $sbVerifyReport -PathType Leaf)) { throw "Startup verifier did not emit a report. Exit=$exitCode Output=$verifyOutput" }
    $report = Get-Content -LiteralPath $sbVerifyReport -Raw | ConvertFrom-Json
    if ($report.state -cne $ExpectedState -or $report.category -cne $ExpectedCategory -or ($ShouldFail -and $exitCode -eq 0) -or (-not $ShouldFail -and $exitCode -ne 0)) { throw "Startup verifier state mismatch: expected $ExpectedState/$ExpectedCategory/fail=$ShouldFail; actual $($report.state)/$($report.category)/exit=$exitCode/check=$(@($report.checks | Select-Object -First 1).state). Checks=$($report.checks | ConvertTo-Json -Depth 5 -Compress) Output=$verifyOutput" }
    return $report
  }
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState INSTALL_REQUIRED -ExpectedCategory DESTINATION_MISSING -ShouldFail $false | Out-Null
  if (Test-Path -LiteralPath $sbRoot) { throw 'SB-P5 verifier created the missing production destination.' }

  $tamperedPlan = $sbPlanA | ConvertTo-Json -Depth 10 | ConvertFrom-Json
  $tamperedPlan.destination.versionDirectory = Join-Path $sbRoot ('shared\startup-bundles\' + ('f' * 40))
  $tamperedPlanPath = Join-Path $temp 'startup-plan-tampered.json'
  $tamperedPlan | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $tamperedPlanPath -Encoding UTF8
  Assert-StartupVerifierState -PlanPath $tamperedPlanPath -ExpectedState CONFLICT -ExpectedCategory PLAN_INVALID -ShouldFail $true | Out-Null

  $sbShared = Join-Path $sbRoot 'shared'
  New-Item -ItemType Directory -Path $sbShared -Force | Out-Null
  $productionReportSentinel = Join-Path $sbShared 'deployment-identity.json'
  [IO.File]::WriteAllBytes($productionReportSentinel,[Text.Encoding]::UTF8.GetBytes('production report collision sentinel'))
  $productionReportSentinelHash = Get-Sha256FromBytes ([IO.File]::ReadAllBytes($productionReportSentinel))
  $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $productionCollisionOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitA -Root $sbRoot -ReportPath $productionReportSentinel 2>&1 | Out-String)
  $productionCollisionExit = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
  if ($productionCollisionExit -eq 0 -or $productionCollisionOutput -notmatch 'READ_ONLY_REPORT_PATH_CONFLICT' -or (Get-Sha256FromBytes ([IO.File]::ReadAllBytes($productionReportSentinel))) -ne $productionReportSentinelHash) { throw 'RPT-P2 production-root report collision was not rejected without mutation.' }

  $reportJunctionTarget = Join-Path $sbRoot 'report-junction-target'
  New-Item -ItemType Directory -Path $reportJunctionTarget -Force | Out-Null
  $reportParentJunction = Join-Path $temp 'report-parent-junction'
  New-Item -ItemType Junction -Path $reportParentJunction -Target $reportJunctionTarget | Out-Null
  $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $reportParentOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitA -Root $sbRoot -ReportPath (Join-Path $reportParentJunction 'report.json') 2>&1 | Out-String)
  $reportParentExit = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
  if ($reportParentExit -eq 0 -or $reportParentOutput -notmatch 'READ_ONLY_REPORT_PARENT_REPARSE_POINT' -or (Test-Path -LiteralPath (Join-Path $reportJunctionTarget 'report.json'))) { throw 'RPT-P7 reparse report parent was followed or not rejected categorically.' }
  Remove-Item -LiteralPath $reportParentJunction -Force
  $reportTargetJunction = Join-Path $temp 'report-target-reparse.json'
  New-Item -ItemType Junction -Path $reportTargetJunction -Target $reportJunctionTarget | Out-Null
  $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $reportTargetOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitA -Root $sbRoot -ReportPath $reportTargetJunction 2>&1 | Out-String)
  $reportTargetExit = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
  if ($reportTargetExit -eq 0 -or $reportTargetOutput -notmatch 'READ_ONLY_REPORT_TARGET_REPARSE_POINT') { throw 'RPT-P7 reparse report target was not rejected categorically.' }
  Remove-Item -LiteralPath $reportTargetJunction -Force
  $reportTargetDirectory = Join-Path $temp 'report-target-directory.json'
  New-Item -ItemType Directory -Path $reportTargetDirectory -Force | Out-Null
  $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $reportTypeOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitA -Root $sbRoot -ReportPath $reportTargetDirectory 2>&1 | Out-String)
  $reportTypeExit = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
  if ($reportTypeExit -eq 0 -or $reportTypeOutput -notmatch 'READ_ONLY_REPORT_TARGET_TYPE_MISMATCH') { throw 'RPT-P7 report target directory was not rejected categorically.' }
  Remove-Item -LiteralPath $reportTargetDirectory -Force

  $nestedProductionReportTarget = Join-Path $sbShared 'report-target\nested'
  New-Item -ItemType Directory -Path $nestedProductionReportTarget -Force | Out-Null
  $nestedProductionSentinel = Join-Path $nestedProductionReportTarget 'sentinel.txt'
  [IO.File]::WriteAllBytes($nestedProductionSentinel,[Text.Encoding]::UTF8.GetBytes('nested production sentinel'))
  $nestedProductionSentinelHash = Get-Sha256FromBytes ([IO.File]::ReadAllBytes($nestedProductionSentinel))
  $externalProductionBridgeRoot = Join-Path $temp 'external-production-bridge'
  New-Item -ItemType Directory -Path $externalProductionBridgeRoot -Force | Out-Null
  $externalProductionBridge = Join-Path $externalProductionBridgeRoot 'bridge'
  New-Item -ItemType Junction -Path $externalProductionBridge -Target (Split-Path -Parent $nestedProductionReportTarget) | Out-Null
  $nestedProductionReport = Join-Path $externalProductionBridge 'nested\report.json'
  $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $nestedProductionOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitA -Root $sbRoot -ReportPath $nestedProductionReport 2>&1 | Out-String)
  $nestedProductionExit = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
  if ($nestedProductionExit -eq 0 -or $nestedProductionOutput -notmatch 'READ_ONLY_REPORT_ANCESTOR_REPARSE_POINT' -or (Test-Path -LiteralPath (Join-Path $nestedProductionReportTarget 'report.json')) -or (Get-Sha256FromBytes ([IO.File]::ReadAllBytes($nestedProductionSentinel))) -ne $nestedProductionSentinelHash) { throw 'RPT-P8 nested ancestor junction into production root was not rejected without mutation.' }
  [IO.Directory]::Delete($externalProductionBridge)

  $nestedRepositoryReportTarget = Join-Path $sbRepo 'report-source-target\nested'
  New-Item -ItemType Directory -Path $nestedRepositoryReportTarget -Force | Out-Null
  $repositoryStatusBefore = (& git -C $sbRepo status --porcelain=v1) -join "`n"
  $repositorySourceHashBefore = Get-Sha256FromBytes ([IO.File]::ReadAllBytes($sbSourceWrapper))
  $externalRepositoryBridgeRoot = Join-Path $temp 'external-repository-bridge'
  New-Item -ItemType Directory -Path $externalRepositoryBridgeRoot -Force | Out-Null
  $externalRepositoryBridge = Join-Path $externalRepositoryBridgeRoot 'bridge'
  New-Item -ItemType Junction -Path $externalRepositoryBridge -Target (Split-Path -Parent $nestedRepositoryReportTarget) | Out-Null
  $nestedRepositoryReport = Join-Path $externalRepositoryBridge 'nested\report.json'
  $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $nestedRepositoryOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitA -Root $sbRoot -ReportPath $nestedRepositoryReport 2>&1 | Out-String)
  $nestedRepositoryExit = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
  $repositoryStatusAfter = (& git -C $sbRepo status --porcelain=v1) -join "`n"
  if ($nestedRepositoryExit -eq 0 -or $nestedRepositoryOutput -notmatch 'READ_ONLY_REPORT_ANCESTOR_REPARSE_POINT' -or (Test-Path -LiteralPath (Join-Path $nestedRepositoryReportTarget 'report.json')) -or (Get-Sha256FromBytes ([IO.File]::ReadAllBytes($sbSourceWrapper))) -ne $repositorySourceHashBefore -or $repositoryStatusAfter -cne $repositoryStatusBefore) { throw 'RPT-P9 nested ancestor junction into source repository was not rejected without mutation.' }
  [IO.Directory]::Delete($externalRepositoryBridge)
  $sbReparseTarget = Join-Path $temp 'startup-bundle-reparse-target'
  New-Item -ItemType Directory -Path $sbReparseTarget -Force | Out-Null
  New-Item -ItemType Junction -Path $expectedLayoutA.bundleRoot -Target $sbReparseTarget | Out-Null
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState CONFLICT -ExpectedCategory REPARSE_POINT -ShouldFail $true | Out-Null
  Remove-Item -LiteralPath $expectedLayoutA.bundleRoot -Force
  New-Item -ItemType Directory -Path $expectedLayoutA.bundleRoot -Force | Out-Null
  New-Item -ItemType Junction -Path $expectedLayoutA.versionDirectory -Target $sbReparseTarget | Out-Null
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState CONFLICT -ExpectedCategory REPARSE_POINT -ShouldFail $true | Out-Null
  Remove-Item -LiteralPath $expectedLayoutA.versionDirectory -Force
  New-Item -ItemType Directory -Path $expectedLayoutA.versionDirectory -Force | Out-Null
  $sbFileSymlinkTarget = Join-Path $temp 'startup-wrapper-symlink-target.ps1'
  [IO.File]::WriteAllBytes($sbFileSymlinkTarget,$sbWrapperABytes)
  try {
    New-Item -ItemType SymbolicLink -Path $expectedLayoutA.wrapperPath -Target $sbFileSymlinkTarget -ErrorAction Stop | Out-Null
  } catch {
    $sbFileReparseTarget = Join-Path $temp 'startup-wrapper-reparse-target'
    New-Item -ItemType Directory -Path $sbFileReparseTarget -Force | Out-Null
    New-Item -ItemType Junction -Path $expectedLayoutA.wrapperPath -Target $sbFileReparseTarget | Out-Null
  }
  [IO.File]::WriteAllBytes($expectedLayoutA.commonPath,$sbCommonABytes)
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState CONFLICT -ExpectedCategory REPARSE_POINT -ShouldFail $true | Out-Null
  Remove-Item -LiteralPath $expectedLayoutA.wrapperPath -Force
  Remove-Item -LiteralPath $expectedLayoutA.commonPath -Force

  [IO.File]::WriteAllBytes($expectedLayoutA.wrapperPath,$sbWrapperABytes)
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState CONFLICT -ExpectedCategory PARTIAL_DESTINATION -ShouldFail $true | Out-Null
  [IO.File]::WriteAllBytes($expectedLayoutA.commonPath,$sbCommonABytes)
  [IO.File]::WriteAllBytes($expectedLayoutA.wrapperPath,[Text.Encoding]::UTF8.GetBytes('wrong installed bytes'))
  $sbInstalledEntryNames = @(Get-ChildItem -LiteralPath $expectedLayoutA.versionDirectory -Force | ForEach-Object { $_.Name })
  if ($sbInstalledEntryNames.Count -ne 2 -or -not ($sbInstalledEntryNames -ccontains 'start-baogiang-api.ps1') -or -not ($sbInstalledEntryNames -ccontains 'deployment-common.ps1')) { throw "SB-P7 fixture did not contain the exact bundle pair: $($sbInstalledEntryNames -join ',')." }
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState CONFLICT -ExpectedCategory HASH_MISMATCH -ShouldFail $true | Out-Null
  [IO.File]::WriteAllBytes($expectedLayoutA.wrapperPath,$sbWrapperABytes)
  $sbExtraFile = Join-Path $expectedLayoutA.versionDirectory 'unexpected.ps1'
  [IO.File]::WriteAllText($sbExtraFile,'unexpected')
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState CONFLICT -ExpectedCategory UNEXPECTED_FILE -ShouldFail $true | Out-Null
  Remove-Item -LiteralPath $sbExtraFile -Force

  function Set-DisposableAclFromPolicy([Parameter(Mandatory = $true)]$PolicyPath) {
    $security = if ($PolicyPath.kind -eq 'directory') { [Security.AccessControl.DirectorySecurity]::new() } else { [Security.AccessControl.FileSecurity]::new() }
    $security.SetAccessRuleProtection($true,$false)
    foreach ($ace in @($PolicyPath.desiredAces)) {
      $rule = [Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($ace.sid),[Security.AccessControl.FileSystemRights]$ace.rightsValue,[Security.AccessControl.InheritanceFlags]$ace.inheritanceFlagsValue,[Security.AccessControl.PropagationFlags]$ace.propagationFlagsValue,[Security.AccessControl.AccessControlType]::Allow)
      [void]$security.AddAccessRule($rule)
    }
    if ($PolicyPath.kind -eq 'directory') { [IO.Directory]::SetAccessControl($PolicyPath.path,$security) } else { [IO.File]::SetAccessControl($PolicyPath.path,$security) }
  }
  function Get-StartupPolicyPaths([string]$WrapperPath) {
    $policy = Get-ProductionAclPolicy -CanonicalRoot $sbRoot -DeploymentIdentity $sbDeploymentSid -ApiRuntimeIdentity $sbApiSid -WebRuntimeIdentity $sbWebSid -EnvFile $sbEnv -StartupWrapper $WrapperPath
    $layout = Get-CanonicalStartupBundleLayoutFromWrapper -Root $sbRoot -StartupWrapper $WrapperPath
    $paths = @(@($layout.bundleRoot,$layout.versionDirectory,$layout.wrapperPath,$layout.commonPath) | ForEach-Object { Normalize-ComparablePath $_ })
    return @($policy.protectedPaths | Where-Object { $paths -contains (Normalize-ComparablePath $_.path) })
  }
  $sbPolicyAPaths = @(Get-StartupPolicyPaths $expectedLayoutA.wrapperPath)
  foreach ($policyPath in $sbPolicyAPaths) { Set-DisposableAclFromPolicy $policyPath }
  foreach ($policyPath in $sbPolicyAPaths) {
    $fixtureAclSnapshot = Get-ActualAclSnapshot $policyPath.path
    $fixtureAclComparison = Compare-AclSnapshotToPolicy $policyPath $fixtureAclSnapshot
    if ($fixtureAclComparison.state -ne 'PASS') { throw "SB-P10 fixture ACL setup mismatch. Policy=$($policyPath.desiredAces | ConvertTo-Json -Depth 4 -Compress) Actual=$($fixtureAclSnapshot.access | ConvertTo-Json -Depth 4 -Compress)" }
  }
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState PASS -ExpectedCategory EXACT_BUNDLE_VERIFIED -ShouldFail $false | Out-Null
  $rptWrapperHash = Get-Sha256FromBytes ([IO.File]::ReadAllBytes($expectedLayoutA.wrapperPath))
  $rptCommonHash = Get-Sha256FromBytes ([IO.File]::ReadAllBytes($expectedLayoutA.commonPath))
  $planDigestA = Get-Sha256FromBytes ([IO.File]::ReadAllBytes($sbPlanA1))
  $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $wrapperCollisionOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbVerifyScript -PlanPath $sbPlanA1 -ExpectedPlanSha256 $planDigestA -Root $sbRoot -DeploymentIdentity $sbDeploymentSid -ApiRuntimeIdentity $sbApiSid -WebRuntimeIdentity $sbWebSid -EnvFile $sbEnv -ReportPath $expectedLayoutA.wrapperPath 2>&1 | Out-String)
  $wrapperCollisionExit = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
  if ($wrapperCollisionExit -eq 0 -or $wrapperCollisionOutput -notmatch 'READ_ONLY_REPORT_PATH_CONFLICT' -or (Get-Sha256FromBytes ([IO.File]::ReadAllBytes($expectedLayoutA.wrapperPath))) -ne $rptWrapperHash -or (Get-Sha256FromBytes ([IO.File]::ReadAllBytes($expectedLayoutA.commonPath))) -ne $rptCommonHash) { throw 'RPT-P4 verifier overwrote or accepted the installed wrapper report sink.' }
  $savedErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $planCollisionOutput = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbVerifyScript -PlanPath $sbPlanA1 -ExpectedPlanSha256 $planDigestA -Root $sbRoot -DeploymentIdentity $sbDeploymentSid -ApiRuntimeIdentity $sbApiSid -WebRuntimeIdentity $sbWebSid -EnvFile $sbEnv -ReportPath $sbPlanA1 2>&1 | Out-String)
  $planCollisionExit = $LASTEXITCODE; $ErrorActionPreference = $savedErrorActionPreference
  if ($planCollisionExit -eq 0 -or $planCollisionOutput -notmatch 'READ_ONLY_REPORT_PATH_CONFLICT' -or (Get-Sha256FromBytes ([IO.File]::ReadAllBytes($sbPlanA1))) -ne $planDigestA) { throw 'RPT-P5 verifier overwrote or accepted its reviewed PlanPath.' }
  $sbAWrapperHashBefore = Get-Sha256FromBytes ([IO.File]::ReadAllBytes($expectedLayoutA.wrapperPath))
  $sbACommonHashBefore = Get-Sha256FromBytes ([IO.File]::ReadAllBytes($expectedLayoutA.commonPath))
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState PASS -ExpectedCategory EXACT_BUNDLE_VERIFIED -ShouldFail $false | Out-Null
  if ((Get-Sha256FromBytes ([IO.File]::ReadAllBytes($expectedLayoutA.wrapperPath))) -ne $sbAWrapperHashBefore -or (Get-Sha256FromBytes ([IO.File]::ReadAllBytes($expectedLayoutA.commonPath))) -ne $sbACommonHashBefore) { throw 'SB-P11 idempotent verification mutated exact bundle bytes.' }

  $startupLeafPolicy = $sbPolicyAPaths | Where-Object { (Normalize-ComparablePath $_.path) -eq (Normalize-ComparablePath $expectedLayoutA.wrapperPath) } | Select-Object -First 1
  if (@($startupLeafPolicy.desiredAces | Where-Object { $_.role -eq 'ApiRuntimeIdentity' -and $_.rightsValue -eq [int64][Security.AccessControl.FileSystemRights]::ReadAndExecute }).Count -ne 1 -or @($startupLeafPolicy.desiredAces | Where-Object { $_.role -eq 'DeploymentIdentity' -and $_.rightsValue -eq [int64][Security.AccessControl.FileSystemRights]::Modify }).Count -ne 1 -or @($startupLeafPolicy.desiredAces | Where-Object { $_.role -match 'WebRuntimeIdentity' }).Count -ne 0) { throw 'SB-P13 startup ACL role matrix mismatch.' }
  $startupExactSnapshot = [pscustomobject]@{ inheritanceProtected = $true; access = @($startupLeafPolicy.desiredAces | ForEach-Object { Normalize-AclRule $_ }) }
  $startupBroad = New-ProductionAclRule -Role UnexpectedBroad -Sid 'S-1-5-32-545' -Rights ([Security.AccessControl.FileSystemRights]::Read)
  if ((Compare-AclSnapshotToPolicy $startupLeafPolicy ([pscustomobject]@{ inheritanceProtected = $true; access = @($startupExactSnapshot.access) + @(Normalize-AclRule $startupBroad) })).state -ne 'UNEXPECTED_ACE') { throw 'SB-P13 broad ACL mismatch passed.' }
  $startupDeny = Normalize-AclRule $startupLeafPolicy.desiredAces[0]; $startupDeny.accessControlTypeValue = [int][Security.AccessControl.AccessControlType]::Deny
  if ((Compare-AclSnapshotToPolicy $startupLeafPolicy ([pscustomobject]@{ inheritanceProtected = $true; access = @($startupExactSnapshot.access) + @($startupDeny) })).state -ne 'DENY_ACE' -or (Compare-AclSnapshotToPolicy $startupLeafPolicy ([pscustomobject]@{ inheritanceProtected = $false; access = @($startupExactSnapshot.access) })).state -ne 'INHERITANCE_MISMATCH') { throw 'SB-P13 DENY/inheritance mismatch passed.' }
  $wrongStartupRights = @($startupExactSnapshot.access | ForEach-Object { $_ | Select-Object * }); $wrongStartupRights[0].rightsValue = [int64][Security.AccessControl.FileSystemRights]::Read
  if ((Compare-AclSnapshotToPolicy $startupLeafPolicy ([pscustomobject]@{ inheritanceProtected = $true; access = $wrongStartupRights })).state -ne 'RIGHTS_MISMATCH') { throw 'SB-P13 wrong rights passed.' }

  $wrapperSecurity = [IO.File]::GetAccessControl($expectedLayoutA.wrapperPath)
  $wrapperSecurity.SetAccessRuleProtection($false,$true)
  [IO.File]::SetAccessControl($expectedLayoutA.wrapperPath,$wrapperSecurity)
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState CONFLICT -ExpectedCategory ACL_MISMATCH -ShouldFail $true | Out-Null
  Set-DisposableAclFromPolicy $startupLeafPolicy
  Assert-StartupVerifierState -PlanPath $sbPlanA1 -ExpectedState PASS -ExpectedCategory EXACT_BUNDLE_VERIFIED -ShouldFail $false | Out-Null

  [byte[]]$sbWrapperBBytes = [Text.Encoding]::UTF8.GetBytes("wrapper-B`nnew-version")
  [byte[]]$sbCommonBBytes = [Text.Encoding]::UTF8.GetBytes("common-B`r`nnew-version")
  [IO.File]::WriteAllBytes($sbSourceWrapper,$sbWrapperBBytes)
  [IO.File]::WriteAllBytes($sbSourceCommon,$sbCommonBBytes)
  & git -C $sbRepo add -- scripts/deploy/windows/start-baogiang-api.ps1 scripts/deploy/windows/deployment-common.ps1
  & git -C $sbRepo commit --quiet -m bundle-b
  if ($LASTEXITCODE -ne 0) { throw 'SB-P12 fixture commit B failed.' }
  $sbCommitB = (& git -C $sbRepo rev-parse HEAD).Trim()
  $sbPlanBPath = Join-Path $temp 'startup-plan-b.json'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sbPlanScript -RepositoryRoot $sbRepo -ReviewedCommitSha $sbCommitB -Root $sbRoot -ReportPath $sbPlanBPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'SB-P12 provenance plan B failed.' }
  $sbPlanB = Get-Content -LiteralPath $sbPlanBPath -Raw | ConvertFrom-Json
  if ((Normalize-ComparablePath $sbPlanB.destination.versionDirectory) -eq (Normalize-ComparablePath $sbPlanA.destination.versionDirectory)) { throw 'SB-P12 commit B reused commit A directory.' }
  Assert-StartupVerifierState -PlanPath $sbPlanBPath -ExpectedState INSTALL_REQUIRED -ExpectedCategory DESTINATION_MISSING -ShouldFail $false | Out-Null
  New-Item -ItemType Directory -Path $sbPlanB.destination.versionDirectory -Force | Out-Null
  [IO.File]::WriteAllBytes($sbPlanB.destination.wrapperPath,$sbWrapperBBytes)
  [IO.File]::WriteAllBytes($sbPlanB.destination.commonPath,$sbCommonBBytes)
  foreach ($policyPath in @(Get-StartupPolicyPaths $sbPlanB.destination.wrapperPath)) { Set-DisposableAclFromPolicy $policyPath }
  Assert-StartupVerifierState -PlanPath $sbPlanBPath -ExpectedState PASS -ExpectedCategory EXACT_BUNDLE_VERIFIED -ShouldFail $false | Out-Null
  if ((Get-Sha256FromBytes ([IO.File]::ReadAllBytes($expectedLayoutA.wrapperPath))) -ne $sbAWrapperHashBefore -or (Get-Sha256FromBytes ([IO.File]::ReadAllBytes($expectedLayoutA.commonPath))) -ne $sbACommonHashBefore) { throw 'SB-P12 update changed prior bundle A.' }

  $schemaRoot = 'C:\fixture\baogiang'
  $validMarker = [pscustomobject]@{
    schemaVersion = [long]1; systemId = 'baogiang-damsan'; canonicalRoot = $schemaRoot; domain = 'https://baogiang.dtnt-damsan.edu.vn'; apiPort = [long]3100
    nodeExe = 'C:\fixture\node.exe'; envFile = 'C:\fixture\production.env'; startupWrapper = 'C:\fixture\shared\start-baogiang-api.ps1'; entryPoint = 'C:\fixture\baogiang\current\apps\api\dist\apps\api\src\main.js'; nginxExe = 'C:\fixture\nginx.exe'; nginxConfig = 'C:\fixture\nginx.conf'
    foreignIsolation = [pscustomobject]@{ reviewedNginxPrefix = 'C:\fixture\nginx'; reviewedNginxConfig = 'C:\fixture\nginx.conf'; foreignRoots = @('C:\fixture\DamSanV5','C:\fixture\boarding'); bootstrapReportReference = 'reviewed-report-reference' }
    startupBundle = [pscustomobject]@{ wrapperPath = 'C:\fixture\shared\start-baogiang-api.ps1'; wrapperSha256 = ('a' * 64); commonPath = 'C:\fixture\shared\deployment-common.ps1'; commonSha256 = ('b' * 64) }
    service = [pscustomobject]@{ kind = 'scheduled-task'; name = 'BaoGiangBackend'; taskPath = '\BaoGiang\'; account = 'fixture-account'; execute = 'C:\fixture\WindowsPowerShell.exe'; arguments = '-File start-baogiang-api.ps1'; workingDirectory = 'C:\fixture\shared' }
  }
  Assert-DeploymentMarkerSchema -Marker $validMarker -CanonicalRoot $schemaRoot | Out-Null
  foreach ($fixture in @(
    @{ label = 'missing schemaVersion'; mutate = { param($m) $m.PSObject.Properties.Remove('schemaVersion') } },
    @{ label = 'wrong-case SchemaVersion'; mutate = { param($m) $value = $m.schemaVersion; $m.PSObject.Properties.Remove('schemaVersion'); $m | Add-Member -NotePropertyName SchemaVersion -NotePropertyValue $value } },
    @{ label = 'unsupported schemaVersion'; mutate = { param($m) $m.schemaVersion = [long]2 } },
    @{ label = 'wrong type version'; mutate = { param($m) $m.schemaVersion = '1' } },
    @{ label = 'wrong type apiPort'; mutate = { param($m) $m.apiPort = '3100' } },
    @{ label = 'unknown top-level'; mutate = { param($m) $m | Add-Member -NotePropertyName extra -NotePropertyValue 'x' } },
    @{ label = 'missing nodeExe'; mutate = { param($m) $m.PSObject.Properties.Remove('nodeExe') } },
    @{ label = 'wrong-case NodeExe'; mutate = { param($m) $value = $m.nodeExe; $m.PSObject.Properties.Remove('nodeExe'); $m | Add-Member -NotePropertyName NodeExe -NotePropertyValue $value } },
    @{ label = 'empty nodeExe'; mutate = { param($m) $m.nodeExe = '' } },
    @{ label = 'wrong type nodeExe'; mutate = { param($m) $m.nodeExe = 7 } },
    @{ label = 'empty nginxExe'; mutate = { param($m) $m.nginxExe = '' } },
    @{ label = 'empty nginxConfig'; mutate = { param($m) $m.nginxConfig = '' } },
    @{ label = 'empty foreignIsolation'; mutate = { param($m) $m.foreignIsolation = [pscustomobject]@{} } },
    @{ label = 'missing Nginx prefix'; mutate = { param($m) $m.foreignIsolation.PSObject.Properties.Remove('reviewedNginxPrefix') } },
    @{ label = 'wrong-case reviewed Nginx config'; mutate = { param($m) $value = $m.foreignIsolation.reviewedNginxConfig; $m.foreignIsolation.PSObject.Properties.Remove('reviewedNginxConfig'); $m.foreignIsolation | Add-Member -NotePropertyName ReviewedNginxConfig -NotePropertyValue $value } },
    @{ label = 'missing Nginx config'; mutate = { param($m) $m.foreignIsolation.PSObject.Properties.Remove('reviewedNginxConfig') } },
    @{ label = 'missing foreignRoots'; mutate = { param($m) $m.foreignIsolation.PSObject.Properties.Remove('foreignRoots') } },
    @{ label = 'missing report reference'; mutate = { param($m) $m.foreignIsolation.PSObject.Properties.Remove('bootstrapReportReference') } },
    @{ label = 'empty foreignRoots'; mutate = { param($m) $m.foreignIsolation.foreignRoots = @() } },
    @{ label = 'wrong type foreignRoots'; mutate = { param($m) $m.foreignIsolation.foreignRoots = 'C:\foreign' } },
    @{ label = 'empty foreign root'; mutate = { param($m) $m.foreignIsolation.foreignRoots = @('') } },
    @{ label = 'duplicate foreign roots'; mutate = { param($m) $m.foreignIsolation.foreignRoots = @('C:\fixture\DamSanV5','c:\FIXTURE\damsanv5') } },
    @{ label = 'foreign root overlap'; mutate = { param($m) $m.foreignIsolation.foreignRoots = @('C:\fixture\baogiang\other') } },
    @{ label = 'Nginx prefix overlap'; mutate = { param($m) $m.foreignIsolation.reviewedNginxPrefix = 'C:\fixture\baogiang\nginx' } },
    @{ label = 'reviewed config mismatch'; mutate = { param($m) $m.foreignIsolation.reviewedNginxConfig = 'C:\fixture\different.conf' } },
    @{ label = 'missing startup field'; mutate = { param($m) $m.startupBundle.PSObject.Properties.Remove('commonPath') } },
    @{ label = 'empty startup wrapperPath'; mutate = { param($m) $m.startupBundle.wrapperPath = '' } },
    @{ label = 'wrong-case startup wrapperPath'; mutate = { param($m) $value = $m.startupBundle.wrapperPath; $m.startupBundle.PSObject.Properties.Remove('wrapperPath'); $m.startupBundle | Add-Member -NotePropertyName WrapperPath -NotePropertyValue $value } },
    @{ label = 'invalid startup hash'; mutate = { param($m) $m.startupBundle.wrapperSha256 = 'bad' } },
    @{ label = 'unknown startup field'; mutate = { param($m) $m.startupBundle | Add-Member -NotePropertyName extra -NotePropertyValue 'x' } },
    @{ label = 'missing taskPath'; mutate = { param($m) $m.service.PSObject.Properties.Remove('taskPath') } },
    @{ label = 'wrong-case taskPath'; mutate = { param($m) $value = $m.service.taskPath; $m.service.PSObject.Properties.Remove('taskPath'); $m.service | Add-Member -NotePropertyName TaskPath -NotePropertyValue $value } },
    @{ label = 'empty taskPath'; mutate = { param($m) $m.service.taskPath = '' } },
    @{ label = 'empty task account'; mutate = { param($m) $m.service.account = '' } },
    @{ label = 'empty task execute'; mutate = { param($m) $m.service.execute = '' } },
    @{ label = 'empty task arguments'; mutate = { param($m) $m.service.arguments = '' } },
    @{ label = 'empty task workingDirectory'; mutate = { param($m) $m.service.workingDirectory = '' } },
    @{ label = 'unknown task field'; mutate = { param($m) $m.service | Add-Member -NotePropertyName pathName -NotePropertyValue 'x' } }
  )) {
    $candidate = $validMarker | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    & $fixture.mutate $candidate
    $rejected = $false; try { Assert-DeploymentMarkerSchema -Marker $candidate -CanonicalRoot $schemaRoot | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "Marker schema hostile fixture was accepted: $($fixture.label)" }
  }
  foreach ($wrongCaseKind in @('SCHEDULED-TASK','SERVICE')) { $candidate = $validMarker | ConvertTo-Json -Depth 8 | ConvertFrom-Json; $candidate.service.kind = $wrongCaseKind; $rejected = $false; try { Assert-DeploymentMarkerSchema -Marker $candidate -CanonicalRoot $schemaRoot | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw "Wrong-case service.kind was accepted: $wrongCaseKind" } }
  $serviceMarker = $validMarker | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $serviceMarker.service = [pscustomobject]@{ kind = 'service'; name = 'BaoGiangService'; account = 'fixture-account'; pathName = 'C:\fixture\service-host.exe --run' }
  Assert-DeploymentMarkerSchema -Marker $serviceMarker -CanonicalRoot $schemaRoot | Out-Null
  foreach ($field in @('account','pathName')) { $candidate = $serviceMarker | ConvertTo-Json -Depth 8 | ConvertFrom-Json; $candidate.service.PSObject.Properties.Remove($field); $rejected = $false; try { Assert-DeploymentMarkerSchema $candidate $schemaRoot | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw "Service marker missing $field was accepted." } }
  $serviceWithTaskField = $serviceMarker | ConvertTo-Json -Depth 8 | ConvertFrom-Json; $serviceWithTaskField.service | Add-Member -NotePropertyName taskPath -NotePropertyValue '\\'; $rejected = $false; try { Assert-DeploymentMarkerSchema $serviceWithTaskField $schemaRoot | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw 'Service marker carrying Scheduled Task fields was accepted.' }
  $firstDeployRoot = Join-Path $temp 'first-deploy-root'
  foreach ($directory in @('releases','staging','incoming','shared','logs','backups')) { New-Item -ItemType Directory -Path (Join-Path $firstDeployRoot $directory) -Force | Out-Null }
  $firstDeployShared = Join-Path $firstDeployRoot 'shared'
  $firstDeployBundle = Get-CanonicalStartupBundleLayout -Root $firstDeployRoot -ReviewedCommitSha ('b' * 40)
  New-Item -ItemType Directory -Path $firstDeployBundle.versionDirectory -Force | Out-Null
  $firstDeployWrapper = $firstDeployBundle.wrapperPath; $firstDeployCommon = $firstDeployBundle.commonPath
  $firstDeployNode = Join-Path $temp 'first-deploy-node.exe'; $firstDeployEnv = Join-Path $temp 'first-deploy.env'; $firstDeployNginx = Join-Path $temp 'first-deploy-nginx.exe'; $firstDeployConfig = Join-Path $temp 'first-deploy-nginx.conf'; $firstDeployTaskExe = Join-Path $temp 'first-deploy-powershell.exe'
  foreach ($leaf in @($firstDeployWrapper,$firstDeployCommon,$firstDeployNode,$firstDeployEnv,$firstDeployNginx,$firstDeployConfig,$firstDeployTaskExe)) { [IO.File]::WriteAllText($leaf, "fixture $leaf") }
  $firstDeployMarker = [pscustomobject]@{
    schemaVersion = [long]1; systemId = 'baogiang-damsan'; canonicalRoot = (Get-CanonicalPath $firstDeployRoot); domain = 'https://baogiang.dtnt-damsan.edu.vn'; apiPort = [long]3100
    nodeExe = $firstDeployNode; envFile = $firstDeployEnv; startupWrapper = $firstDeployWrapper; entryPoint = (Join-Path $firstDeployRoot 'current\apps\api\dist\apps\api\src\main.js'); nginxExe = $firstDeployNginx; nginxConfig = $firstDeployConfig
    foreignIsolation = [pscustomobject]@{ reviewedNginxPrefix = (Join-Path $temp 'reviewed-nginx'); reviewedNginxConfig = $firstDeployConfig; foreignRoots = @((Join-Path $temp 'foreign-one')); bootstrapReportReference = 'fixture-reference' }
    startupBundle = [pscustomobject]@{ wrapperPath = $firstDeployWrapper; wrapperSha256 = (Get-SensitiveTextHash ([IO.File]::ReadAllText($firstDeployWrapper))); commonPath = $firstDeployCommon; commonSha256 = (Get-SensitiveTextHash ([IO.File]::ReadAllText($firstDeployCommon))) }
    service = [pscustomobject]@{ kind = 'scheduled-task'; name = 'BaoGiangBackend'; taskPath = '\BaoGiang\'; account = 'fixture-account'; execute = $firstDeployTaskExe; arguments = '-File start-baogiang-api.ps1'; workingDirectory = $firstDeployShared }
  }
  $firstDeployMarker | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $firstDeployShared 'deployment-identity.json') -Encoding UTF8
  if (Test-Path -LiteralPath $firstDeployMarker.entryPoint -PathType Leaf) { throw 'Pre-first-deploy fixture unexpectedly has a current entry point.' }
  function Get-FileHash([string]$LiteralPath,[string]$Algorithm) { [pscustomobject]@{ Hash = Get-SensitiveTextHash ([IO.File]::ReadAllText($LiteralPath)) } }
  Read-DeploymentIdentity -Root $firstDeployRoot -ServiceKind scheduled-task -ServiceName BaoGiangBackend -EnvFile $firstDeployEnv -StartupWrapper $firstDeployWrapper -ExpectedEntryPoint $firstDeployMarker.entryPoint -NodeExe $firstDeployNode -NginxExe $firstDeployNginx -NginxConfig $firstDeployConfig | Out-Null
  foreach ($markerBindingFixture in @(
    @{ label = 'wrapper path'; mutate = { param($m) $m.startupBundle.wrapperPath = Join-Path $firstDeployBundle.versionDirectory 'other-wrapper.ps1' } },
    @{ label = 'common path'; mutate = { param($m) $m.startupBundle.commonPath = Join-Path $firstDeployBundle.versionDirectory 'other-common.ps1' } },
    @{ label = 'wrapper hash'; mutate = { param($m) $m.startupBundle.wrapperSha256 = 'c' * 64 } },
    @{ label = 'common hash'; mutate = { param($m) $m.startupBundle.commonSha256 = 'd' * 64 } }
  )) {
    $candidateMarker = $firstDeployMarker | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    & $markerBindingFixture.mutate $candidateMarker
    $candidateMarker | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $firstDeployShared 'deployment-identity.json') -Encoding UTF8
    $rejected = $false
    try { Read-DeploymentIdentity -Root $firstDeployRoot -ServiceKind scheduled-task -ServiceName BaoGiangBackend -EnvFile $firstDeployEnv -StartupWrapper $firstDeployWrapper -ExpectedEntryPoint $firstDeployMarker.entryPoint -NodeExe $firstDeployNode -NginxExe $firstDeployNginx -NginxConfig $firstDeployConfig | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "SB-P14 active marker $($markerBindingFixture.label) mismatch was accepted." }
  }
  $firstDeployMarker | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $firstDeployShared 'deployment-identity.json') -Encoding UTF8
  $identityRootJunction = Join-Path $temp 'identity-root-junction'
  New-Item -ItemType Junction -Path $identityRootJunction -Target $firstDeployRoot | Out-Null
  $identityReparseRejected = $false
  try { Read-DeploymentIdentity -Root $identityRootJunction -ServiceKind scheduled-task -ServiceName BaoGiangBackend -EnvFile $firstDeployEnv -StartupWrapper $firstDeployWrapper -ExpectedEntryPoint $firstDeployMarker.entryPoint | Out-Null } catch { if ($_.Exception.Message -eq 'PRODUCTION_ROOT_REPARSE_POINT') { $identityReparseRejected = $true } }
  if (-not $identityReparseRejected) { throw 'Read-DeploymentIdentity accepted a reparse production root.' }
  $identityReparseTarget = Join-Path $temp 'identity-subdirectory-target'
  New-Item -ItemType Directory -Path $identityReparseTarget | Out-Null
  $identityBackups = Join-Path $firstDeployRoot 'backups'
  Remove-Item -LiteralPath $identityBackups -Force
  New-Item -ItemType Junction -Path $identityBackups -Target $identityReparseTarget | Out-Null
  $identityReparseRejected = $false
  try { Read-DeploymentIdentity -Root $firstDeployRoot -ServiceKind scheduled-task -ServiceName BaoGiangBackend -EnvFile $firstDeployEnv -StartupWrapper $firstDeployWrapper -ExpectedEntryPoint $firstDeployMarker.entryPoint | Out-Null } catch { if ($_.Exception.Message -eq 'PRODUCTION_SUBDIRECTORY_REPARSE_POINT') { $identityReparseRejected = $true } }
  if (-not $identityReparseRejected) { throw 'Read-DeploymentIdentity accepted a reparse required subdirectory.' }
  Remove-Item -LiteralPath $identityBackups -Force
  New-Item -ItemType Directory -Path $identityBackups | Out-Null
  foreach ($bindingFixture in @(
    @{ label = 'Node expected-value mismatch'; node = (Join-Path $temp 'other-node.exe'); nginx = $firstDeployNginx; config = $firstDeployConfig },
    @{ label = 'Nginx executable mismatch'; node = $firstDeployNode; nginx = (Join-Path $temp 'other-nginx.exe'); config = $firstDeployConfig },
    @{ label = 'Nginx config mismatch'; node = $firstDeployNode; nginx = $firstDeployNginx; config = (Join-Path $temp 'other-nginx.conf') }
  )) { $rejected = $false; try { Read-DeploymentIdentity -Root $firstDeployRoot -ServiceKind scheduled-task -ServiceName BaoGiangBackend -EnvFile $firstDeployEnv -StartupWrapper $firstDeployWrapper -ExpectedEntryPoint $firstDeployMarker.entryPoint -NodeExe $bindingFixture.node -NginxExe $bindingFixture.nginx -NginxConfig $bindingFixture.config | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw "Marker binding fixture was accepted: $($bindingFixture.label)" } }
  Remove-Item Function:\Get-FileHash -Force
  foreach ($invalidPsqlFixture in @(
    @{ label = 'missing argument'; path = $null },
    @{ label = 'relative path'; path = 'psql.exe' },
    @{ label = 'missing leaf'; path = (Join-Path $temp 'missing\psql.exe') }
  )) {
    $invalidPsqlRejected = $false
    try { Resolve-DatabaseVerifierExecutable -VerifyDatabase -PsqlExe $invalidPsqlFixture.path | Out-Null } catch { $invalidPsqlRejected = $true }
    if (-not $invalidPsqlRejected) { throw "Invalid authenticated DB verifier was accepted: $($invalidPsqlFixture.label)" }
  }
  $wrongPsqlPath = Join-Path $temp 'postgres-client.exe'
  [IO.File]::WriteAllText($wrongPsqlPath, '')
  $wrongPsqlRejected = $false; try { Resolve-DatabaseVerifierExecutable -VerifyDatabase -PsqlExe $wrongPsqlPath | Out-Null } catch { $wrongPsqlRejected = $true }
  if (-not $wrongPsqlRejected) { throw 'Wrong authenticated DB verifier filename was accepted.' }
  $exactPsqlPath = Join-Path $temp 'psql.exe'
  [IO.File]::WriteAllText($exactPsqlPath, '')
  if ((Resolve-DatabaseVerifierExecutable -VerifyDatabase -PsqlExe $exactPsqlPath) -ne (Get-CanonicalPath $exactPsqlPath)) { throw 'Exact psql.exe fixture was rejected.' }

  function New-PublicKeyLine([string]$KeyAlgorithm,[byte[]]$KeyMaterial) {
    $algorithmBytes = [Text.Encoding]::ASCII.GetBytes($KeyAlgorithm)
    $lengthBytes = [BitConverter]::GetBytes([Net.IPAddress]::HostToNetworkOrder([int]$algorithmBytes.Length))
    $blob = [byte[]]@($lengthBytes + $algorithmBytes + $KeyMaterial)
    return "$KeyAlgorithm $([Convert]::ToBase64String($blob)) fixture-comment-must-not-be-reported"
  }
  $sshFixtureRoot = Join-Path $temp 'ssh evidence'
  New-Item -ItemType Directory -Path $sshFixtureRoot -Force | Out-Null
  $simpleSshConfig = Join-Path $sshFixtureRoot 'sshd_config_simple'
  [IO.File]::WriteAllText($simpleSshConfig, 'Port 2222')
  $simpleConfigEvidence = Get-SshDirectConfigEvidence -ConfigPath $simpleSshConfig
  $matchingPortEvidence = Get-SshPortEvidence -EffectiveConfigState $simpleConfigEvidence.effectiveConfigState -ConfiguredPort @($simpleConfigEvidence.configuredPorts) -ListeningPort @(2222) -ServiceRunning
  if ($simpleConfigEvidence.effectiveConfigState -ne 'DISCOVERED' -or $matchingPortEvidence.state -ne 'DISCOVERED' -or $matchingPortEvidence.agreedPorts[0] -ne 2222) { throw 'S1 exact configured/listening SSH port fixture failed.' }
  $mismatchedPortEvidence = Get-SshPortEvidence -EffectiveConfigState 'DISCOVERED' -ConfiguredPort @(22) -ListeningPort @(2222) -ServiceRunning
  if ($mismatchedPortEvidence.state -ne 'CONFLICT' -or @($mismatchedPortEvidence.agreedPorts).Count -ne 0) { throw 'S2 configured/listening SSH port mismatch was not rejected.' }
  $unavailableListenerEvidence = Get-SshPortEvidence -EffectiveConfigState 'DISCOVERED' -ConfiguredPort @(2222) -ListeningPort @() -ServiceRunning
  if ($unavailableListenerEvidence.state -ne 'NOT_VERIFIED' -or @($unavailableListenerEvidence.agreedPorts).Count -ne 0) { throw 'Known SSH config with unavailable actual listener was incorrectly verified.' }
  $multiplePortEvidence = Get-SshPortEvidence -EffectiveConfigState 'DISCOVERED' -ConfiguredPort @(2222,2200) -ListeningPort @(2200,2222) -ServiceRunning
  if ($multiplePortEvidence.state -ne 'DISCOVERED' -or @($multiplePortEvidence.agreedPorts).Count -ne 2) { throw 'Exact multiple SSH port sets were not accepted.' }
  $includedSshConfig = Join-Path $sshFixtureRoot 'sshd_config_include'
  [IO.File]::WriteAllText($includedSshConfig, 'Include sshd_config.d\*.conf')
  $includedConfigEvidence = Get-SshDirectConfigEvidence -ConfigPath $includedSshConfig
  $includedHostKeyEvidence = Get-SshPublicHostKeyEvidence -ConfigPath $includedSshConfig -EffectiveConfigVerified:$false
  if ($includedConfigEvidence.effectiveConfigState -ne 'NOT_VERIFIED' -or $includedConfigEvidence.reason -ne 'ACTIVE_INCLUDE_REQUIRES_REVIEW' -or @($includedConfigEvidence.configuredPorts).Count -ne 0 -or $includedConfigEvidence.defaultPortApplied -ne $false -or $includedHostKeyEvidence.state -ne 'NOT_VERIFIED' -or @($includedHostKeyEvidence.keys).Count -ne 0) { throw 'S3 active SSH Include synthesized false effective evidence.' }
  $commentedIncludeConfig = Join-Path $sshFixtureRoot 'sshd_config_commented_include'
  [IO.File]::WriteAllLines($commentedIncludeConfig, @('# Include sshd_config.d\*.conf','Port 2222'))
  $commentedIncludeEvidence = Get-SshDirectConfigEvidence -ConfigPath $commentedIncludeConfig
  if ($commentedIncludeEvidence.effectiveConfigState -ne 'DISCOVERED' -or $commentedIncludeEvidence.configuredPorts[0] -ne 2222) { throw 'S4 commented SSH Include incorrectly blocked direct config evidence.' }
  $defaultPortConfig = Join-Path $sshFixtureRoot 'sshd_config_default_port'
  [IO.File]::WriteAllText($defaultPortConfig, '# no active Include or Port')
  $defaultPortEvidence = Get-SshDirectConfigEvidence -ConfigPath $defaultPortConfig
  if ($defaultPortEvidence.effectiveConfigState -ne 'DISCOVERED' -or $defaultPortEvidence.defaultPortApplied -ne $true -or $defaultPortEvidence.configuredPorts[0] -ne 22) { throw 'S5 safe OpenSSH default-port evidence fixture failed.' }
  $edPrivatePath = Join-Path $sshFixtureRoot 'ssh_host_ed25519_key'
  $rsaPrivatePath = Join-Path $sshFixtureRoot 'ssh_host_rsa_key'
  [IO.File]::WriteAllText($edPrivatePath, 'PRIVATE_KEY_SENTINEL_DO_NOT_REPORT')
  [IO.File]::WriteAllText($rsaPrivatePath, 'SECOND_PRIVATE_KEY_SENTINEL_DO_NOT_REPORT')
  [IO.File]::WriteAllText("$edPrivatePath.pub", (New-PublicKeyLine 'ssh-ed25519' ([byte[]](1..32))))
  [IO.File]::WriteAllText("$rsaPrivatePath.pub", (New-PublicKeyLine 'ssh-rsa' ([byte[]](33..64))))
  $sshdConfigPath = Join-Path $sshFixtureRoot 'sshd_config'
  [IO.File]::WriteAllLines($sshdConfigPath, @("HostKey `"$edPrivatePath`"", "HostKey `"$rsaPrivatePath`""))
  $hostKeyEvidence = Get-SshPublicHostKeyEvidence -ConfigPath $sshdConfigPath
  if ($hostKeyEvidence.state -ne 'DISCOVERED' -or @($hostKeyEvidence.keys).Count -ne 2 -or @($hostKeyEvidence.keys | Where-Object { $_.fingerprint -match '^SHA256:[A-Za-z0-9+/]+$' }).Count -ne 2) { throw 'Valid or multiple SSH HostKey evidence fixture failed.' }
  $hostKeyJson = $hostKeyEvidence | ConvertTo-Json -Depth 8
  if ($hostKeyJson -match 'PRIVATE_KEY_SENTINEL|fixture-comment-must-not-be-reported') { throw 'SSH evidence leaked private-key content or public-key comment.' }
  $missingPublicConfig = Join-Path $sshFixtureRoot 'sshd_config_missing_pub'
  $missingPublicPrivatePath = Join-Path $sshFixtureRoot 'missing_key'
  [IO.File]::WriteAllText($missingPublicPrivatePath, 'MISSING_PUBLIC_PRIVATE_SENTINEL')
  [IO.File]::WriteAllText($missingPublicConfig, "HostKey `"$missingPublicPrivatePath`"")
  $missingPublicEvidence = Get-SshPublicHostKeyEvidence -ConfigPath $missingPublicConfig
  if ($missingPublicEvidence.state -ne 'PARTIAL' -or $missingPublicEvidence.keys[0].state -ne 'NOT_VERIFIED') { throw 'Missing SSH public key did not remain PARTIAL/NOT_VERIFIED.' }
  $malformedPrivatePath = Join-Path $sshFixtureRoot 'ssh_host_malformed_key'
  [IO.File]::WriteAllText($malformedPrivatePath, 'MALFORMED_PRIVATE_SENTINEL')
  [IO.File]::WriteAllText("$malformedPrivatePath.pub", 'ssh-ed25519 YmFk malformed-comment')
  $malformedConfig = Join-Path $sshFixtureRoot 'sshd_config_malformed'
  [IO.File]::WriteAllText($malformedConfig, "HostKey `"$malformedPrivatePath`"")
  $malformedEvidence = Get-SshPublicHostKeyEvidence -ConfigPath $malformedConfig
  if ($malformedEvidence.state -ne 'PARTIAL' -or $malformedEvidence.keys[0].state -ne 'NOT_VERIFIED') { throw 'Malformed SSH public key was accepted.' }
  $allHostKeyJson = @($hostKeyEvidence,$missingPublicEvidence,$malformedEvidence) | ConvertTo-Json -Depth 8
  if ($allHostKeyJson -match 'PRIVATE_KEY_SENTINEL|SECOND_PRIVATE_KEY_SENTINEL|MISSING_PUBLIC_PRIVATE_SENTINEL|MALFORMED_PRIVATE_SENTINEL') { throw 'SSH evidence read or reported private host-key contents.' }

  $firewallFixtureMode = 'matching'
  function Get-NetFirewallRule { [CmdletBinding()]param(); if ($firewallFixtureMode -eq 'matching') { [pscustomobject]@{ DisplayName='OpenSSH exact'; Enabled='True'; Direction='Inbound'; Action='Allow' } } else { [pscustomobject]@{ DisplayName='OpenSSH unresolved'; Enabled='True'; Direction='Inbound'; Action='Allow' } } }
  function Get-NetFirewallPortFilter { [CmdletBinding()]param($AssociatedNetFirewallRule); if ($AssociatedNetFirewallRule.DisplayName -eq 'OpenSSH exact') { [pscustomobject]@{ Protocol='TCP'; LocalPort='2222' } } else { [pscustomobject]@{ Protocol='TCP'; LocalPort='Any' } } }
  $matchingFirewallEvidence = Get-SshFirewallEvidence -SshPort @(2222)
  $firewallFixtureMode = 'unresolved'
  $unresolvedFirewallEvidence = Get-SshFirewallEvidence -SshPort @(2222)
  Remove-Item Function:\Get-NetFirewallRule,Function:\Get-NetFirewallPortFilter -Force
  if ($matchingFirewallEvidence.state -ne 'DISCOVERED' -or $matchingFirewallEvidence.rules[0].state -ne 'DISCOVERED' -or $unresolvedFirewallEvidence.state -ne 'NOT_VERIFIED' -or $unresolvedFirewallEvidence.rules[0].state -ne 'NOT_VERIFIED') { throw 'SSH firewall rule-to-local-port evidence fixture failed.' }
  $releaseRoot = Join-Path $temp 'release-path-fixtures'
  $releaseShaA = 'a' * 40
  $releaseShaB = 'b' * 40
  $releasePathA = Join-Path $releaseRoot "releases\$releaseShaA"
  $releasePathB = Join-Path $releaseRoot "releases\$releaseShaB"
  New-Item -ItemType Directory -Path $releasePathA,$releasePathB -Force | Out-Null
  if ((Assert-ExactReleasePath -Root $releaseRoot -ReleaseSha $releaseShaA -ReleasePath $releasePathA) -ne (Get-CanonicalPath $releasePathA)) { throw 'M1 exact release path fixture failed.' }
  foreach ($invalidReleaseFixture in @(
    @{ label = 'M2 wrong SHA'; sha = $releaseShaA; path = $releasePathB },
    @{ label = 'M3 outside releases'; sha = $releaseShaA; path = (Join-Path $temp $releaseShaA) },
    @{ label = 'M3 nested release'; sha = $releaseShaA; path = (Join-Path $releasePathA 'nested') },
    @{ label = 'M4 missing release'; sha = ('c' * 40); path = (Join-Path $releaseRoot ('releases\' + ('c' * 40))) }
  )) {
    $invalidReleaseRejected = $false
    try { Assert-ExactReleasePath -Root $releaseRoot -ReleaseSha $invalidReleaseFixture.sha -ReleasePath $invalidReleaseFixture.path | Out-Null } catch { $invalidReleaseRejected = $true }
    if (-not $invalidReleaseRejected) { throw "Exact release path fixture was accepted: $($invalidReleaseFixture.label)" }
  }
  $validEnvLines = @(
    'NODE_ENV=production',
    'TZ=Asia/Ho_Chi_Minh',
    'API_HOST=127.0.0.1',
    'API_PORT=3100',
    'HTTP_TRUST_PROXY_HOPS=1',
    'DATABASE_URL=fixture-database-url',
    'CORS_ORIGINS=https://baogiang.dtnt-damsan.edu.vn',
    'AUTH_SESSION_TTL_SECONDS=28800',
    'AUTH_LAST_SEEN_UPDATE_SECONDS=300',
    'AUTH_COOKIE_NAME=baogiang_session',
    'AUTH_COOKIE_PATH=/api',
    'AUTH_COOKIE_SECURE=true',
    'AUTH_COOKIE_SAME_SITE=lax',
    'AUTH_LOCKOUT_THRESHOLD=5',
    'AUTH_LOCKOUT_DURATION_SECONDS=900',
    'AUTH_PASSWORD_MIN_LENGTH=12',
    'AUTH_LOGIN_RATE_LIMIT_MAX=10',
    'AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS=60',
    'AUTH_LOGIN_RATE_LIMIT_MAX_KEYS=10000',
    'AI_ENABLED=false',
    'AI_ACTIVE_MODE_ENABLED=false',
    'AI_PASSIVE_MODE_ENABLED=false',
    'WEB_PUSH_ENABLED=false',
    'LOG_LEVEL=info'
  )
  $validEnvPath = Join-Path $temp 'valid.env'
  [IO.File]::WriteAllLines($validEnvPath, $validEnvLines, [Text.UTF8Encoding]::new($false))
  $environmentActive = Invoke-WithServerEnvironment -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock { $env:TZ }
  if ($environmentActive -cne 'Asia/Ho_Chi_Minh') { throw 'Correct production TZ contract was rejected.' }

  $missingTimeZonePath = Join-Path $temp 'missing-tz.env'
  [IO.File]::WriteAllLines($missingTimeZonePath, @($validEnvLines | Where-Object { $_ -notmatch '^TZ=' }), [Text.UTF8Encoding]::new($false))
  $missingTimeZoneRejected = $false; try { Invoke-WithServerEnvironment -EnvFile $missingTimeZonePath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock {} | Out-Null } catch { $missingTimeZoneRejected = $true }
  if (-not $missingTimeZoneRejected) { throw 'Missing production TZ was accepted.' }

  $wrongTimeZonePath = Join-Path $temp 'wrong-tz.env'
  [IO.File]::WriteAllLines($wrongTimeZonePath, @($validEnvLines | ForEach-Object { if ($_ -match '^TZ=') { 'TZ=UTC' } else { $_ } }), [Text.UTF8Encoding]::new($false))
  $wrongTimeZoneRejected = $false; try { Invoke-WithServerEnvironment -EnvFile $wrongTimeZonePath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock {} | Out-Null } catch { $wrongTimeZoneRejected = $true }
  if (-not $wrongTimeZoneRejected) { throw 'Wrong production TZ was accepted.' }

  $duplicateTimeZonePath = Join-Path $temp 'duplicate-tz.env'
  [IO.File]::WriteAllLines($duplicateTimeZonePath, @($validEnvLines + 'TZ=Asia/Ho_Chi_Minh'), [Text.UTF8Encoding]::new($false))
  $duplicateTimeZoneRejected = $false; try { Invoke-WithServerEnvironment -EnvFile $duplicateTimeZonePath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock {} | Out-Null } catch { $duplicateTimeZoneRejected = $true }
  if (-not $duplicateTimeZoneRejected) { throw 'Duplicate production TZ was accepted.' }

  foreach ($requiredName in @('NODE_ENV','API_HOST','API_PORT','HTTP_TRUST_PROXY_HOPS','DATABASE_URL','CORS_ORIGINS','AUTH_COOKIE_SECURE','AI_ENABLED','AI_ACTIVE_MODE_ENABLED','AI_PASSIVE_MODE_ENABLED','WEB_PUSH_ENABLED','AUTH_SESSION_TTL_SECONDS','LOG_LEVEL')) {
    [Environment]::SetEnvironmentVariable($requiredName,($validEnvLines | Where-Object { $_ -like "$requiredName=*" } | Select-Object -First 1).Substring($requiredName.Length + 1),'Process')
    $missingPath = Join-Path $temp ("missing-$requiredName.env")
    [IO.File]::WriteAllLines($missingPath,@($validEnvLines | Where-Object { $_ -notlike "$requiredName=*" }),[Text.UTF8Encoding]::new($false))
    $rejected = $false; try { Read-ValidatedProductionEnvironment -EnvFile $missingPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "Inherited process value satisfied missing required variable: $requiredName" }
  }
  $sentinelNode = 'parent-node-sentinel'; [Environment]::SetEnvironmentVariable('NODE_ENV',$sentinelNode,'Process')
  $atomicFailurePath = Join-Path $temp 'atomic-failure.env'
  [IO.File]::WriteAllLines($atomicFailurePath,@(($validEnvLines | ForEach-Object { if ($_ -match '^DATABASE_URL=') { 'DATABASE_URL=postgresql://fixture:P0_ENV_SECRET_DO_NOT_LEAK_9F4B@db.invalid:5433/baogiang' } else { $_ } }) + 'UNAPPROVED_VARIABLE=after-valid-secret'),[Text.UTF8Encoding]::new($false))
  $rejected = $false; try { Invoke-WithServerEnvironment -EnvFile $atomicFailurePath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock {} | Out-Null } catch { $rejected = $true }
  if (-not $rejected -or [Environment]::GetEnvironmentVariable('NODE_ENV','Process') -cne $sentinelNode) { throw 'Parse-before-apply atomicity fixture failed.' }
  $priorLogLevel = [Environment]::GetEnvironmentVariable('LOG_LEVEL','Process'); [Environment]::SetEnvironmentVariable('LOG_LEVEL','parent-log-sentinel','Process'); [Environment]::SetEnvironmentVariable('AUTH_COOKIE_DOMAIN',$null,'Process')
  $activeLogLevel = Invoke-WithServerEnvironment -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock { $env:LOG_LEVEL }
  if ($activeLogLevel -cne 'info') { throw 'Validated environment was not applied.' }
  if ([Environment]::GetEnvironmentVariable('LOG_LEVEL','Process') -cne 'parent-log-sentinel' -or $null -ne [Environment]::GetEnvironmentVariable('AUTH_COOKIE_DOMAIN','Process')) { throw 'Environment restore fixture failed.' }
  [Environment]::SetEnvironmentVariable('LOG_LEVEL',$priorLogLevel,'Process')
  [Environment]::SetEnvironmentVariable('AUTH_COOKIE_DOMAIN','parent-cookie-domain-sentinel','Process')
  $optionalActive = Invoke-WithServerEnvironment -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock { [Environment]::GetEnvironmentVariable('AUTH_COOKIE_DOMAIN','Process') }
  if ($null -ne $optionalActive) { throw 'Optional env variable inherited into the active production scope.' }
  if ([Environment]::GetEnvironmentVariable('AUTH_COOKIE_DOMAIN','Process') -cne 'parent-cookie-domain-sentinel') { throw 'Optional parent env variable was not restored.' }
  $forbiddenSentinels = @{}; foreach ($forbiddenName in @('TEST_DATABASE_URL','BOOTSTRAP_ADMIN_USERNAME','BOOTSTRAP_ADMIN_DISPLAY_NAME','BOOTSTRAP_ADMIN_PASSWORD')) { $forbiddenSentinels[$forbiddenName] = "parent-$forbiddenName-sentinel"; [Environment]::SetEnvironmentVariable($forbiddenName,$forbiddenSentinels[$forbiddenName],'Process') }
  $forbiddenActive = Invoke-WithServerEnvironment -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock { [ordered]@{ test = [Environment]::GetEnvironmentVariable('TEST_DATABASE_URL','Process'); username = [Environment]::GetEnvironmentVariable('BOOTSTRAP_ADMIN_USERNAME','Process'); display = [Environment]::GetEnvironmentVariable('BOOTSTRAP_ADMIN_DISPLAY_NAME','Process'); password = [Environment]::GetEnvironmentVariable('BOOTSTRAP_ADMIN_PASSWORD','Process') } }
  foreach ($value in $forbiddenActive.Values) { if ($null -ne $value) { throw 'Forbidden parent variable leaked into active production scope.' } }
  foreach ($forbiddenName in $forbiddenSentinels.Keys) { if ([Environment]::GetEnvironmentVariable($forbiddenName,'Process') -cne $forbiddenSentinels[$forbiddenName]) { throw "Forbidden parent variable was not restored: $forbiddenName" } }
  [Environment]::SetEnvironmentVariable('LOG_LEVEL',$null,'Process')
  $absentLogActive = Invoke-WithServerEnvironment -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock { [Environment]::GetEnvironmentVariable('LOG_LEVEL','Process') }
  if ($absentLogActive -cne 'info') { throw 'Absent-before LOG_LEVEL was not applied.' }
  if ($null -ne [Environment]::GetEnvironmentVariable('LOG_LEVEL','Process')) { throw 'Absent-before LOG_LEVEL was not removed after restore.' }
  $priorDatabaseUrl = 'postgresql://fixture:P0_PRIOR_SECRET_MUST_NOT_ESCAPE_7D91@db.invalid:5433/baogiang'; [Environment]::SetEnvironmentVariable('DATABASE_URL',$priorDatabaseUrl,'Process')
  $scopeOutput = @(Invoke-WithServerEnvironment -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock { 'SCOPE_BODY_OK' }); $scopeText = $scopeOutput -join "`n"
  if ($scopeText -notmatch '^SCOPE_BODY_OK$' -or $scopeText -match 'P0_PRIOR_SECRET_MUST_NOT_ESCAPE_7D91|postgresql://fixture|existed|value') { throw 'Scoped helper leaked prior environment state through its pipeline.' }
  if ([Environment]::GetEnvironmentVariable('DATABASE_URL','Process') -cne $priorDatabaseUrl) { throw 'Prior DATABASE_URL was not restored after successful scoped execution.' }
  $privateSnapshotUrl = 'postgresql://fixture:P0_PRIVATE_SNAPSHOT_SECRET_41A7@db.invalid:5433/baogiang'; [Environment]::SetEnvironmentVariable('DATABASE_URL',$privateSnapshotUrl,'Process')
  $privateScopeOutput = @(Invoke-WithServerEnvironment -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock { try { $snapshot } catch { } ; 'SCOPE_PRIVATE_OK' }); $privateScopeText = $privateScopeOutput -join "`n"
  if ($privateScopeText -notmatch '^SCOPE_PRIVATE_OK$' -or $privateScopeText -match 'P0_PRIVATE_SNAPSHOT_SECRET_41A7|postgresql://fixture|existed|value') { throw 'Hostile ScriptBlock accessed the private environment snapshot.' }
  if ([Environment]::GetEnvironmentVariable('DATABASE_URL','Process') -cne $privateSnapshotUrl) { throw 'Prior DATABASE_URL was not restored after hostile ScriptBlock execution.' }
  [Environment]::SetEnvironmentVariable('P0_ALTERNATE_DATABASE_URL','postgresql://fixture:alternate@db.invalid:5433/other','Process')
  $activeDatabaseUrl = Invoke-WithServerEnvironment -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock { [Environment]::GetEnvironmentVariable('DATABASE_URL','Process') }
  if ($activeDatabaseUrl -cne 'fixture-database-url') { throw 'Validated DATABASE_URL was not the sole active database authority.' }
  [Environment]::SetEnvironmentVariable('LOG_LEVEL','throw-log-sentinel','Process'); [Environment]::SetEnvironmentVariable('AUTH_COOKIE_DOMAIN','throw-domain-sentinel','Process'); [Environment]::SetEnvironmentVariable('TEST_DATABASE_URL','throw-test-sentinel','Process')
  $threw = $false; try { Invoke-WithServerEnvironment -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -ScriptBlock { throw 'synthetic scoped failure' } | Out-Null } catch { $threw = $true }
  if (-not $threw -or [Environment]::GetEnvironmentVariable('LOG_LEVEL','Process') -cne 'throw-log-sentinel' -or [Environment]::GetEnvironmentVariable('AUTH_COOKIE_DOMAIN','Process') -cne 'throw-domain-sentinel' -or [Environment]::GetEnvironmentVariable('TEST_DATABASE_URL','Process') -cne 'throw-test-sentinel') { throw 'Scoped helper did not restore parent values after ScriptBlock failure.' }
  foreach ($forbiddenName in @('TEST_DATABASE_URL','BOOTSTRAP_ADMIN_USERNAME','BOOTSTRAP_ADMIN_DISPLAY_NAME','BOOTSTRAP_ADMIN_PASSWORD')) { $forbiddenPath = Join-Path $temp ("forbidden-$forbiddenName.env"); [IO.File]::WriteAllLines($forbiddenPath,@($validEnvLines + "$forbiddenName=value"),[Text.UTF8Encoding]::new($false)); $rejected = $false; try { Read-ValidatedProductionEnvironment -EnvFile $forbiddenPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw "Forbidden production variable was accepted: $forbiddenName" } }
  $wrongCaseEnvPath = Join-Path $temp 'wrong-case-env.env'; [IO.File]::WriteAllLines($wrongCaseEnvPath,@($validEnvLines | ForEach-Object { if ($_ -match '^NODE_ENV=') { 'node_env=production' } else { $_ } }),[Text.UTF8Encoding]::new($false)); $rejected = $false; try { Read-ValidatedProductionEnvironment -EnvFile $wrongCaseEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw 'Wrong-case environment variable was accepted.' }
  foreach ($invalid in @(@{ name = 'NODE_ENV'; value = 'development' },@{ name = 'TZ'; value = 'UTC' },@{ name = 'API_HOST'; value = '0.0.0.0' },@{ name = 'API_PORT'; value = '9999' },@{ name = 'HTTP_TRUST_PROXY_HOPS'; value = '0' },@{ name = 'AUTH_COOKIE_SECURE'; value = 'false' },@{ name = 'CORS_ORIGINS'; value = 'https://other.example' },@{ name = 'AI_ENABLED'; value = 'true' },@{ name = 'WEB_PUSH_ENABLED'; value = 'true' })) { $invalidPath = Join-Path $temp ("invalid-$($invalid.name).env"); [IO.File]::WriteAllLines($invalidPath,@($validEnvLines | ForEach-Object { if ($_ -like "$($invalid.name)=*") { "$($invalid.name)=$($invalid.value)" } else { $_ } }),[Text.UTF8Encoding]::new($false)); $rejected = $false; try { Read-ValidatedProductionEnvironment -EnvFile $invalidPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw "Safety invariant was accepted: $($invalid.name)" } }
  foreach ($invalidInteger in @('abc','0','-1','1.5')) { $rejected = $false; try { Assert-ProductionPositiveInteger $invalidInteger | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw 'Invalid positive integer semantic was accepted.' } }
  if ((Assert-ProductionPositiveInteger '1') -cne '1') { throw 'Positive integer boundary was rejected.' }
  $hugeInteger = '9' * 400; $rejected = $false; try { Assert-ProductionPositiveInteger $hugeInteger | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw 'Non-finite auth integer was accepted by the shared validator.' }
  $hugeIntegerPath = Join-Path $temp 'invalid-huge-auth-integer.env'; [IO.File]::WriteAllLines($hugeIntegerPath,@($validEnvLines | ForEach-Object { if ($_ -match '^AUTH_SESSION_TTL_SECONDS=') { "AUTH_SESSION_TTL_SECONDS=$hugeInteger" } else { $_ } }),[Text.UTF8Encoding]::new($false)); $rejected = $false; try { Read-ValidatedProductionEnvironment -EnvFile $hugeIntegerPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw 'Non-finite auth integer was accepted in an environment field.' }
  $numericNames = @('AUTH_SESSION_TTL_SECONDS','AUTH_LAST_SEEN_UPDATE_SECONDS','AUTH_LOCKOUT_THRESHOLD','AUTH_LOCKOUT_DURATION_SECONDS','AUTH_PASSWORD_MIN_LENGTH','AUTH_LOGIN_RATE_LIMIT_MAX','AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS','AUTH_LOGIN_RATE_LIMIT_MAX_KEYS')
  for ($numericIndex = 0; $numericIndex -lt $numericNames.Count; $numericIndex++) { $numericName = $numericNames[$numericIndex]; $invalidValue = @('abc','0','-1','1.5')[$numericIndex % 4]; $numericPath = Join-Path $temp ("invalid-$numericName.env"); [IO.File]::WriteAllLines($numericPath,@($validEnvLines | ForEach-Object { if ($_ -like "$numericName=*") { "$numericName=$invalidValue" } else { $_ } }),[Text.UTF8Encoding]::new($false)); $rejected = $false; try { Read-ValidatedProductionEnvironment -EnvFile $numericPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw "Invalid auth numeric value was accepted: $numericName" } }
  foreach ($badCookieName in @('bad name','bad.name')) { $cookiePath = Join-Path $temp 'invalid-cookie-name.env'; [IO.File]::WriteAllLines($cookiePath,@($validEnvLines | ForEach-Object { if ($_ -match '^AUTH_COOKIE_NAME=') { "AUTH_COOKIE_NAME=$badCookieName" } else { $_ } }),[Text.UTF8Encoding]::new($false)); $rejected = $false; try { Read-ValidatedProductionEnvironment -EnvFile $cookiePath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw 'Invalid cookie name was accepted.' } }
  $cookiePathInvalid = Join-Path $temp 'invalid-cookie-path.env'; [IO.File]::WriteAllLines($cookiePathInvalid,@($validEnvLines | ForEach-Object { if ($_ -match '^AUTH_COOKIE_PATH=') { 'AUTH_COOKIE_PATH=api' } else { $_ } }),[Text.UTF8Encoding]::new($false)); $rejected = $false; try { Read-ValidatedProductionEnvironment -EnvFile $cookiePathInvalid -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw 'Invalid cookie path was accepted.' }
  foreach ($sameSite in @('lax','strict','none','LAX')) { $sameSitePath = Join-Path $temp ("same-site-$sameSite.env"); [IO.File]::WriteAllLines($sameSitePath,@($validEnvLines | ForEach-Object { if ($_ -match '^AUTH_COOKIE_SAME_SITE=') { "AUTH_COOKIE_SAME_SITE=$sameSite" } else { $_ } }),[Text.UTF8Encoding]::new($false)); Read-ValidatedProductionEnvironment -EnvFile $sameSitePath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null }
  $sameSiteInvalid = Join-Path $temp 'invalid-same-site.env'; [IO.File]::WriteAllLines($sameSiteInvalid,@($validEnvLines | ForEach-Object { if ($_ -match '^AUTH_COOKIE_SAME_SITE=') { 'AUTH_COOKIE_SAME_SITE=invalid' } else { $_ } }),[Text.UTF8Encoding]::new($false)); $rejected = $false; try { Read-ValidatedProductionEnvironment -EnvFile $sameSiteInvalid -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw 'Invalid SameSite value was accepted.' }
  $validatorPath = Join-Path $repo 'scripts\deploy\windows\validate-production-environment.ps1'; $parentMarker = [Environment]::GetEnvironmentVariable('P0_ENV_PARENT_ISOLATION','Process'); [Environment]::SetEnvironmentVariable('P0_ENV_PARENT_ISOLATION','unchanged','Process')
  $validatorOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' 2>&1)
  if ($LASTEXITCODE -ne 0 -or ($validatorOutput -join ' ') -notmatch 'VALIDATED' -or [Environment]::GetEnvironmentVariable('P0_ENV_PARENT_ISOLATION','Process') -cne 'unchanged') { throw 'Standalone environment validator isolation/no-current fixture failed.' }
  $standaloneSemanticPath = Join-Path $temp 'standalone-invalid-numeric.env'; [IO.File]::WriteAllLines($standaloneSemanticPath,@($validEnvLines | ForEach-Object { if ($_ -match '^AUTH_SESSION_TTL_SECONDS=') { 'AUTH_SESSION_TTL_SECONDS=1.5' } else { $_ } }),[Text.UTF8Encoding]::new($false)); $standaloneSemanticOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -EnvFile $standaloneSemanticPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' 2>&1); if ($LASTEXITCODE -eq 0 -or ($standaloneSemanticOutput -join "`n") -notmatch '^VALIDATION_FAILED\s*$') { throw 'Standalone semantic validation failure was not categorical.' }
  $standaloneHugeOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -EnvFile $hugeIntegerPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' 2>&1); if ($LASTEXITCODE -eq 0 -or ($standaloneHugeOutput -join "`n") -notmatch '^VALIDATION_FAILED\s*$') { throw 'Standalone non-finite integer failure was not categorical.' }
  $secretOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -EnvFile $atomicFailurePath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' 2>&1); $secretText = $secretOutput -join "`n"
  if ($LASTEXITCODE -eq 0 -or $secretText -match 'P0_ENV_SECRET_DO_NOT_LEAK_9F4B|UNAPPROVED_VARIABLE=|DATABASE_URL') { throw 'Standalone environment validator leaked hostile input.' }
  $missingValidatorOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -EnvFile (Join-Path $temp 'missing-validator.env') -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' 2>&1); $missingValidatorText = $missingValidatorOutput -join "`n"
  if ($LASTEXITCODE -eq 0 -or $missingValidatorText -notmatch '^VALIDATION_FAILED\s*$' -or $missingValidatorText -match 'Cannot validate argument|Test-Path') { throw 'Standalone missing-file failure was not categorical.' }
  $invalidBaseOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -EnvFile $validEnvPath -ExpectedBaseUrl 'https://invalid.example' 2>&1); $invalidBaseText = $invalidBaseOutput -join "`n"
  if ($LASTEXITCODE -eq 0 -or $invalidBaseText -notmatch '^VALIDATION_FAILED\s*$' -or $invalidBaseText -match 'Cannot validate argument|ValidatePattern') { throw 'Standalone invalid-base failure was not categorical.' }
  $isolatedValidatorDirectory = Join-Path $temp 'validator-without-helper'; New-Item -ItemType Directory -Path $isolatedValidatorDirectory -Force | Out-Null; $isolatedValidator = Join-Path $isolatedValidatorDirectory 'validate-production-environment.ps1'; Copy-Item -LiteralPath $validatorPath -Destination $isolatedValidator
  $missingHelperOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $isolatedValidator -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' 2>&1); $missingHelperText = $missingHelperOutput -join "`n"
  if ($LASTEXITCODE -eq 0 -or $missingHelperText -notmatch '^VALIDATION_FAILED\s*$' -or $missingHelperText -match 'deployment-common|CommandNotFound|not recognized') { throw 'Standalone helper-load failure was not categorical.' }
  [Environment]::SetEnvironmentVariable('P0_ENV_PARENT_ISOLATION',$parentMarker,'Process')

  $neighborReport = Join-Path $temp 'protected-neighbor-discovery.json'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $neighborDiscoveryPath -ReportPath $neighborReport | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Protected-neighbor discovery smoke execution failed.' }
  $neighborJson = Get-Content -LiteralPath $neighborReport -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($neighborJson.schemaVersion -ne 1 -or $neighborJson.safety.mode -ne 'READ_ONLY_DISCOVERY' -or $neighborJson.safety.mutationsPerformed -ne $false -or $neighborJson.safety.databaseAuthenticationAttempted -ne $false -or $neighborJson.candidateBaoGiang.port -ne 3100 -or $neighborJson.conclusion -ne 'REQUIRES_REVIEW') { throw 'Protected-neighbor discovery smoke schema contract failed.' }
  $nginxRoot = Join-Path $temp 'nginx-test'
  $nginxConf = Join-Path $nginxRoot 'conf'
  New-Item -ItemType Directory -Path $nginxConf -Force | Out-Null
  $outsideNginx = Join-Path $temp 'nginx-test-evil'
  New-Item -ItemType Directory -Path $outsideNginx -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $outsideNginx 'evil.conf'), "server { listen 9999; server_name evil.test; }", [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $nginxConf 'nginx.conf'), "include $outsideNginx\*.conf;`nserver {`n  listen 443 ssl;`n  server_name example.test;`n  root C:\app;`n  location /api {`n    proxy_pass http://127.0.0.1:3000;`n  }`n}", [Text.UTF8Encoding]::new($false))
  $pgData = Join-Path $temp 'postgres-data'
  New-Item -ItemType Directory -Path $pgData -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $pgData 'postgresql.conf'), "port = 5433`nlisten_addresses = 'localhost'`nhba_file = 'pg_hba.conf'", [Text.UTF8Encoding]::new($false))
  function Get-CimInstance([string]$ClassName) {
    if ($ClassName -eq 'Win32_Process') { return @(
      [pscustomobject]@{ ProcessId = 100; ParentProcessId = 1; Name = 'svchost.exe'; ExecutablePath = 'C:\Windows\System32\svchost.exe'; CommandLine = 'svchost.exe' },
      [pscustomobject]@{ ProcessId = 200; ParentProcessId = 1; Name = 'node.exe'; ExecutablePath = 'C:\tools\node.exe'; CommandLine = 'C:\tools\node.exe C:\app\server.js' },
      [pscustomobject]@{ ProcessId = 300; ParentProcessId = 1; Name = 'nginx.exe'; ExecutablePath = (Join-Path $nginxRoot 'nginx.exe'); CommandLine = 'nginx.exe' },
      [pscustomobject]@{ ProcessId = 400; ParentProcessId = 1; Name = 'postgres.exe'; ExecutablePath = 'C:\Program Files\PostgreSQL\17\bin\postgres.exe'; CommandLine = ('postgres.exe -D "' + $pgData + '"') }
    ) }
    if ($ClassName -eq 'Win32_Service') { return @(
      [pscustomobject]@{ Name = 'WindowsUpdate'; DisplayName = 'Windows Update'; State = 'Running'; StartMode = 'Auto'; StartName = 'LocalSystem'; ProcessId = 100; PathName = 'C:\Windows\System32\svchost.exe' },
      [pscustomobject]@{ Name = 'NodeHost'; DisplayName = 'Node Host'; State = 'Running'; StartMode = 'Auto'; StartName = 'LocalSystem'; ProcessId = 200; PathName = 'C:\tools\node.exe C:\app\server.js' }
    ) }
    [pscustomobject]@{ Caption = 'Fixture Windows' }
  }
  function Get-NetTCPConnection { @([pscustomobject]@{ OwningProcess = 300; LocalPort = 80; LocalAddress = '0.0.0.0' }, [pscustomobject]@{ OwningProcess = 300; LocalPort = 443; LocalAddress = '0.0.0.0' }) }
  function Get-ScheduledTask { @() }
  $fixtureReport = Join-Path $temp 'protected-neighbor-fixture.json'
  & $neighborDiscoveryPath -ReportPath $fixtureReport -NginxRoot $nginxRoot | Out-Null
  Remove-Item Function:\Get-CimInstance,Function:\Get-NetTCPConnection,Function:\Get-ScheduledTask -Force
  $fixtureJson = Get-Content -LiteralPath $fixtureReport -Raw -Encoding UTF8 | ConvertFrom-Json
  $fixtureServices = @($fixtureJson.services)
  if ($fixtureServices.Count -ne 1 -or $fixtureServices[0].name -ne 'NodeHost' -or $fixtureServices[0].reasonTags -notcontains 'application-runtime') { throw 'Protected-neighbor service filter fixture failed.' }
  if ($fixtureJson.nginx.processes[0].listeningPorts -notcontains 80 -or $fixtureJson.nginx.processes[0].listeningPorts -notcontains 443) { throw 'Nginx listener association fixture failed.' }
  $server = $fixtureJson.nginx.serverBlocks | Where-Object { $_.serverNames -contains 'example.test' } | Select-Object -First 1
  if (-not $server -or $server.listens -notcontains '443 ssl' -or $server.rootsAliases -notcontains 'C:\app' -or $server.proxyUpstreams[0].host -ne '127.0.0.1' -or $server.proxyUpstreams[0].port -ne 3000) { throw 'Nginx safe server-block fixture failed.' }
  if (@($fixtureJson.nginx.configFiles | Where-Object { $_.state -eq 'OUTSIDE_NGINX_ROOT_NOT_READ' }).Count -ne 1 -or (Get-Content -LiteralPath $fixtureReport -Raw) -match 'evil\.test') { throw 'Nginx containment fixture failed.' }
  if ($fixtureJson.postgres.configMetadata.config.port -ne 5433 -or $fixtureJson.postgres.configMetadata.config.listenAddresses -notcontains 'localhost' -or $fixtureJson.postgres.configMetadata.config.configFile -ne (Join-Path $pgData 'postgresql.conf') -or $fixtureJson.postgres.configMetadata.config.hbaFile -ne (Join-Path $pgData 'pg_hba.conf')) { throw 'PostgreSQL safe metadata fixture failed.' }
  $sha = 'a' * 40
  $root = Join-Path $temp 'root with spaces & unicode Đam San'
  $releases = Join-Path $root 'releases'
  $release = Join-Path $releases $sha
  New-Item -ItemType Directory -Path $release -Force | Out-Null
  Assert-ExactChildPath $root "releases\\$sha" | Out-Null
  if ((Assert-ExistingDirectory $releases) -ne (Get-CanonicalPath $releases)) { throw 'Bootstrapped release parent contract failed.' }
  $pointer = Join-Path $root 'current'
  New-Item -ItemType Junction -Path $pointer -Target $release | Out-Null
  if ((Assert-ReleasePointerTarget -PointerPath $pointer -Root $root) -ne (Get-CanonicalPath $release)) { throw 'Valid release pointer was rejected.' }
  Remove-Item -LiteralPath $pointer -Force
  New-Item -ItemType Junction -Path $pointer -Target $releases | Out-Null
  $rejected = $false; try { Assert-ReleasePointerTarget -PointerPath $pointer -Root $root | Out-Null } catch { $rejected = $true }
  if (-not $rejected) { throw 'Non-release junction target was accepted.' }
  $payload = @{ root = "C:\O'Brien & Đam San"; serviceKind = 'scheduled-task'; serviceName = 'BaoGiangBackend' } | ConvertTo-Json -Compress
  $payload64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
  $command = & node (Join-Path $repo 'scripts\ci\build-windows-remote-command.cjs') handshake-base64 $payload64
  $decoded = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($command))
  if ($decoded -notmatch "O''Brien" -or $decoded -notmatch 'BAOGIANG_HANDSHAKE_PASS') { throw 'Encoded OpenSSH command contract failed.' }
  $sftp = & node (Join-Path $repo 'scripts\ci\build-windows-remote-command.cjs') sftp-root 'C:\baogiang'
  if ($sftp -ne '/C:/baogiang') { throw 'Windows-to-SFTP path conversion failed.' }
  $cleanup = & node (Join-Path $repo 'scripts\ci\build-windows-remote-command.cjs') cleanup 'C:\baogiang' ('control-1-1-' + ('a' * 40))
  $cleanupDecoded = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($cleanup))
  if ($cleanupDecoded -notmatch 'direct incoming child' -or $cleanupDecoded -match "Remove-Item.+incoming'\)") { throw 'Cleanup containment contract failed.' }
  $global:LASTEXITCODE = 77
  & { [pscustomobject]@{ state = 'completed' } } | Out-Null
  if ($LASTEXITCODE -ne 77) { throw 'Fixture did not preserve stale native exit code.' }
  Write-Output '[deployment-windows] PASS (ACL-P1..ACL-P8, PATH-P1..PATH-P3, SB-P1..SB-P14, RPT-P1..RPT-P9, preflight isolation, SSH host-key/firewall, exact psql, privacy, safe-stop, migration and transfer fixtures)'
} finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
