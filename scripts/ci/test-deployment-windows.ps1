$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repo 'scripts\deploy\windows\deployment-common.ps1')

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
foreach ($requiredCatalogSyncToken in @('Set-StrictMode -Version Latest',"`$ErrorActionPreference = 'Stop'",'Read-DeploymentIdentity','Import-ServerEnvironment','Assert-ExecutableContract','BackupVerified','ReleaseSha','Assert-ExactReleasePath','sync-capability-catalog.cjs')) {
  if ($catalogSyncText -notmatch [regex]::Escape($requiredCatalogSyncToken)) { throw "Capability catalog sync wrapper is missing required safety token: $requiredCatalogSyncToken" }
}
if ($catalogSyncText -match 'npm run prisma:seed|prisma db seed') { throw 'Capability catalog sync wrapper must not invoke generic seed.' }

$migrationPath = Join-Path $repo 'scripts\deploy\windows\run-migrations.ps1'
$migrationText = Get-Content -LiteralPath $migrationPath -Raw -Encoding UTF8
foreach ($requiredMigrationToken in @('ReleaseSha','Assert-ExactReleasePath','prisma\schema.prisma','Test-PathWithin $schema $release')) {
  if ($migrationText -notmatch [regex]::Escape($requiredMigrationToken)) { throw "Migration wrapper is missing exact-release safety token: $requiredMigrationToken" }
}
if ($migrationText.IndexOf('Assert-ExactReleasePath') -gt $migrationText.IndexOf('Import-ServerEnvironment') -or $migrationText.IndexOf('Test-Path -LiteralPath $schema -PathType Leaf') -gt $migrationText.IndexOf('Import-ServerEnvironment')) { throw 'Exact release and schema checks must precede environment/database mutation.' }

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
    @{ label = 'unsupported schemaVersion'; mutate = { param($m) $m.schemaVersion = [long]2 } },
    @{ label = 'wrong type version'; mutate = { param($m) $m.schemaVersion = '1' } },
    @{ label = 'wrong type apiPort'; mutate = { param($m) $m.apiPort = '3100' } },
    @{ label = 'unknown top-level'; mutate = { param($m) $m | Add-Member -NotePropertyName extra -NotePropertyValue 'x' } },
    @{ label = 'missing nodeExe'; mutate = { param($m) $m.PSObject.Properties.Remove('nodeExe') } },
    @{ label = 'empty nodeExe'; mutate = { param($m) $m.nodeExe = '' } },
    @{ label = 'wrong type nodeExe'; mutate = { param($m) $m.nodeExe = 7 } },
    @{ label = 'empty nginxExe'; mutate = { param($m) $m.nginxExe = '' } },
    @{ label = 'empty nginxConfig'; mutate = { param($m) $m.nginxConfig = '' } },
    @{ label = 'empty foreignIsolation'; mutate = { param($m) $m.foreignIsolation = [pscustomobject]@{} } },
    @{ label = 'missing Nginx prefix'; mutate = { param($m) $m.foreignIsolation.PSObject.Properties.Remove('reviewedNginxPrefix') } },
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
    @{ label = 'invalid startup hash'; mutate = { param($m) $m.startupBundle.wrapperSha256 = 'bad' } },
    @{ label = 'unknown startup field'; mutate = { param($m) $m.startupBundle | Add-Member -NotePropertyName extra -NotePropertyValue 'x' } },
    @{ label = 'missing taskPath'; mutate = { param($m) $m.service.PSObject.Properties.Remove('taskPath') } },
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
  $serviceMarker = $validMarker | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $serviceMarker.service = [pscustomobject]@{ kind = 'service'; name = 'BaoGiangService'; account = 'fixture-account'; pathName = 'C:\fixture\service-host.exe --run' }
  Assert-DeploymentMarkerSchema -Marker $serviceMarker -CanonicalRoot $schemaRoot | Out-Null
  foreach ($field in @('account','pathName')) { $candidate = $serviceMarker | ConvertTo-Json -Depth 8 | ConvertFrom-Json; $candidate.service.PSObject.Properties.Remove($field); $rejected = $false; try { Assert-DeploymentMarkerSchema $candidate $schemaRoot | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw "Service marker missing $field was accepted." } }
  $serviceWithTaskField = $serviceMarker | ConvertTo-Json -Depth 8 | ConvertFrom-Json; $serviceWithTaskField.service | Add-Member -NotePropertyName taskPath -NotePropertyValue '\\'; $rejected = $false; try { Assert-DeploymentMarkerSchema $serviceWithTaskField $schemaRoot | Out-Null } catch { $rejected = $true }; if (-not $rejected) { throw 'Service marker carrying Scheduled Task fields was accepted.' }
  $firstDeployRoot = Join-Path $temp 'first-deploy-root'
  foreach ($directory in @('releases','staging','incoming','shared','logs','backups')) { New-Item -ItemType Directory -Path (Join-Path $firstDeployRoot $directory) -Force | Out-Null }
  $firstDeployShared = Join-Path $firstDeployRoot 'shared'
  $firstDeployWrapper = Join-Path $firstDeployShared 'start-baogiang-api.ps1'; $firstDeployCommon = Join-Path $firstDeployShared 'deployment-common.ps1'
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
    'AUTH_COOKIE_SECURE=true',
    'AI_ENABLED=false',
    'AI_ACTIVE_MODE_ENABLED=false',
    'AI_PASSIVE_MODE_ENABLED=false',
    'WEB_PUSH_ENABLED=false'
  )
  $validEnvPath = Join-Path $temp 'valid.env'
  [IO.File]::WriteAllLines($validEnvPath, $validEnvLines, [Text.UTF8Encoding]::new($false))
  $importedNames = @(Import-ServerEnvironment -EnvFile $validEnvPath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn')
  if ($importedNames -notcontains 'TZ' -or $env:TZ -ne 'Asia/Ho_Chi_Minh') { throw 'Correct production TZ contract was rejected.' }

  $missingTimeZonePath = Join-Path $temp 'missing-tz.env'
  [IO.File]::WriteAllLines($missingTimeZonePath, @($validEnvLines | Where-Object { $_ -notmatch '^TZ=' }), [Text.UTF8Encoding]::new($false))
  $missingTimeZoneRejected = $false; try { Import-ServerEnvironment -EnvFile $missingTimeZonePath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $missingTimeZoneRejected = $true }
  if (-not $missingTimeZoneRejected) { throw 'Missing production TZ was accepted.' }

  $wrongTimeZonePath = Join-Path $temp 'wrong-tz.env'
  [IO.File]::WriteAllLines($wrongTimeZonePath, @($validEnvLines | ForEach-Object { if ($_ -match '^TZ=') { 'TZ=UTC' } else { $_ } }), [Text.UTF8Encoding]::new($false))
  $wrongTimeZoneRejected = $false; try { Import-ServerEnvironment -EnvFile $wrongTimeZonePath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $wrongTimeZoneRejected = $true }
  if (-not $wrongTimeZoneRejected) { throw 'Wrong production TZ was accepted.' }

  $duplicateTimeZonePath = Join-Path $temp 'duplicate-tz.env'
  [IO.File]::WriteAllLines($duplicateTimeZonePath, @($validEnvLines + 'TZ=Asia/Ho_Chi_Minh'), [Text.UTF8Encoding]::new($false))
  $duplicateTimeZoneRejected = $false; try { Import-ServerEnvironment -EnvFile $duplicateTimeZonePath -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' | Out-Null } catch { $duplicateTimeZoneRejected = $true }
  if (-not $duplicateTimeZoneRejected) { throw 'Duplicate production TZ was accepted.' }

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
  Write-Output '[deployment-windows] PASS (preflight isolation, SSH host-key/firewall, exact psql, privacy, safe-stop, migration, path and transfer fixtures)'
} finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
