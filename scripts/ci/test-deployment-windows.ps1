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

$preflightPath = Join-Path $repo 'scripts\deploy\windows\production-preflight-readonly.ps1'
$preflightText = Get-Content -LiteralPath $preflightPath -Raw -Encoding UTF8
$forbiddenPreflightMutations = @(
  'Register-ScheduledTask','Set-ScheduledTask','Start-ScheduledTask','Stop-ScheduledTask','Disable-ScheduledTask','Enable-ScheduledTask','Unregister-ScheduledTask',
  'Start-Service','Stop-Service','Restart-Service','Set-Service','Stop-Process','taskkill','prisma migrate'
)
foreach ($forbiddenMutation in $forbiddenPreflightMutations) {
  if ($preflightText -match [regex]::Escape($forbiddenMutation)) { throw "Read-only production preflight contains forbidden mutation token: $forbiddenMutation" }
}

$neighborDiscoveryPath = Join-Path $repo 'scripts\deploy\windows\production-protected-neighbor-discovery.ps1'
$neighborDiscoveryText = Get-Content -LiteralPath $neighborDiscoveryPath -Raw -Encoding UTF8
foreach ($forbiddenMutation in @('Register-ScheduledTask','Set-ScheduledTask','Start-ScheduledTask','Stop-ScheduledTask','Disable-ScheduledTask','Enable-ScheduledTask','Unregister-ScheduledTask','Start-Service','Stop-Service','Restart-Service','Set-Service','Stop-Process','Start-Process','taskkill','New-Item','Remove-Item','Move-Item','Copy-Item','Set-Content','Add-Content','Out-File','prisma migrate')) {
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
$temp = Join-Path ([IO.Path]::GetTempPath()) ("baogiang-deploy-test-" + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  $neighborReport = Join-Path $temp 'protected-neighbor-discovery.json'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $neighborDiscoveryPath -ReportPath $neighborReport | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Protected-neighbor discovery smoke execution failed.' }
  $neighborJson = Get-Content -LiteralPath $neighborReport -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($neighborJson.schemaVersion -ne 1 -or $neighborJson.safety.mode -ne 'READ_ONLY_DISCOVERY' -or $neighborJson.safety.mutationsPerformed -ne $false -or $neighborJson.safety.databaseAuthenticationAttempted -ne $false -or $neighborJson.candidateBaoGiang.port -ne 3100 -or $neighborJson.conclusion -ne 'REQUIRES_REVIEW') { throw 'Protected-neighbor discovery smoke schema contract failed.' }
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
  Write-Output '[deployment-windows] PASS (automatic-variable write audit, protected-neighbor preflight audit, helpers, paths, junction safety, encoded command, SFTP and cleanup contracts, stale LASTEXITCODE fixture)'
} finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
