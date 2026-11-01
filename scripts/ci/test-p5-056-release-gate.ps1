# Execute the actual deployment orchestrator against disposable filesystem and
# command fixtures. No services, production environment files or DB are accessed.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('p5056-release-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
try {
  $fixtureScripts = Join-Path $fixtureRoot 'scripts'
  New-Item -ItemType Directory -Path $fixtureScripts | Out-Null
  Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts\deploy\windows\invoke-production-deploy.ps1') -Destination $fixtureScripts
  Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts\deploy\windows\assert-release-schema.ps1') -Destination $fixtureScripts
  $commonFixture = @'
function Assert-DedicatedRoot($Root) { return $Root }
function Read-DeploymentIdentity { return @{ canonicalRoot=$global:releaseFixtureRoot; marker=@{foreignIsolation=@{reviewedNginxPrefix='fixture'}} } }
function Assert-VerifiedRuntimeIdentity { }
function Assert-ExecutableContract { }
function Assert-ProductionRuntimeKindSupported { }
function Assert-ExactChildPath($Root,$Child) { Join-Path $Root $Child }
function Read-ValidatedProductionEnvironment { }
function Invoke-ReviewedNginxSyntaxTest { }
function Get-SafeErrorCategory { 'FIXTURE_REJECTED' }
function Assert-MaintenanceWindowAuthorization { @{} }
function Stop-ExactBaoGiangRuntime { Add-Content -LiteralPath $global:releaseFixtureEvents -Value 'quiesce' }
function Assert-BaoGiangQuiescence { @{state='verified'} }
function Get-DeploymentFailureRecoveryDecision { 'FIRST_DEPLOY_SAFE_STOP' }
function Assert-ExactReleasePath { Join-Path $global:releaseFixtureRoot ('releases\' + ('a' * 40)) }
function Get-CanonicalPath($Path) { [IO.Path]::GetFullPath($Path) }
function Test-PathWithin { $true }
function Invoke-WithServerEnvironment($EnvFile,$ExpectedBaseUrl,$ScriptBlock) { & $ScriptBlock }
function Set-PostgresProcessEnvironment { @{host='127.0.0.1'} }
function Clear-PostgresProcessEnvironment { }
function Invoke-NativeChecked {
  Add-Content -LiteralPath $global:releaseFixtureEvents -Value 'schema'
  if ($global:releaseFixtureMode -like '*invalid-schema') { throw 'RELEASE_SCHEMA_NOT_VERIFIED' }
}
function Write-RedactedReport($Path,$Data) { [IO.File]::WriteAllText($Path,'{}') }
'@
  [IO.File]::WriteAllText((Join-Path $fixtureScripts 'deployment-common.ps1'), $commonFixture)
  foreach ($scriptName in @('install-release','sync-capability-catalog','switch-current-release','restart-baogiang-api','test-production-health','notify-operator-telegram')) {
    $body = "Add-Content -LiteralPath `$global:releaseFixtureEvents -Value '$scriptName'`n'{}'"
    [IO.File]::WriteAllText((Join-Path $fixtureScripts ($scriptName + '.ps1')), $body)
  }
  [IO.File]::WriteAllText((Join-Path $fixtureScripts 'backup-database.ps1'), "Add-Content -LiteralPath `$global:releaseFixtureEvents -Value 'backup'`n'{}'")
  [IO.File]::WriteAllText((Join-Path $fixtureScripts 'run-migrations.ps1'), "Add-Content -LiteralPath `$global:releaseFixtureEvents -Value 'migration'`n'{`"state`":`"completed`"}'")
  [IO.File]::WriteAllText((Join-Path $fixtureScripts 'assert-no-pending-migrations.ps1'), @'
Add-Content -LiteralPath $global:releaseFixtureEvents -Value 'migration-status'
if ($global:releaseFixtureMode -eq 'pending') { throw 'MIGRATIONS_PENDING' }
@{ state='verifiedNoPending'; releaseSha=('a' * 40); databasePort=5434 } | ConvertTo-Json -Compress
'@)
  foreach ($mode in @('pending','invalid-schema','verified','migration-invalid-schema','verified-migration')) {
    $global:releaseFixtureRoot = Join-Path $fixtureRoot $mode
    $global:releaseFixtureMode = $mode
    New-Item -ItemType Directory -Path $global:releaseFixtureRoot | Out-Null
    $global:releaseFixtureEvents = Join-Path $global:releaseFixtureRoot 'events.txt'
    $releaseSha = 'a' * 40
    $transferName = "control-1-1-$releaseSha"
    $transferDir = Join-Path $global:releaseFixtureRoot "incoming\$transferName"
    $releaseNodeDir = Join-Path $global:releaseFixtureRoot "releases\$releaseSha\scripts\deploy\node"
    New-Item -ItemType Directory -Path $transferDir,$releaseNodeDir,(Join-Path $global:releaseFixtureRoot 'logs') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $releaseNodeDir 'verify-release-schema.cjs'),'// fixture')
    [IO.File]::WriteAllText((Join-Path $transferDir "release-$releaseSha.zip"),'fixture')
    $parameters = @{
      ReleaseSha=$releaseSha; Root=$global:releaseFixtureRoot; TransferDirectoryName=$transferName
      SourceArchiveName="release-$releaseSha.zip"; ExpectedSha256=('b' * 64)
      NodeExe='fixture'; NpmExe='fixture'; NpxExe='fixture'; PsqlExe='fixture'; PgDumpExe='fixture'; PgRestoreExe='fixture'
      EnvFile='synthetic-not-read'; StartupWrapper='fixture'; NginxExe='fixture'; NginxConfig='fixture'
      ExpectedBaseUrl='https://baogiang.dtnt-damsan.edu.vn'; ServiceKind='scheduled-task'; ServiceName='fixture'
      ExpectedEntryPoint='fixture'; MigrationRequested=($mode -like '*migration*'); ProductionMigrationApproved=($mode -like '*migration*')
      RollbackCompatibilityApproved=$false; PreMigrationRecoveryApproved=$false; MaintenanceWindow=$null
      ReportFileName="deploy-report-$releaseSha.json"
    }
    $parameterFile = Join-Path $transferDir 'parameters.json'
    $parameters | ConvertTo-Json | Set-Content -LiteralPath $parameterFile
    $failure = $null
    try { & (Join-Path $fixtureScripts 'invoke-production-deploy.ps1') -ParameterFile $parameterFile | Out-Null }
    catch { $failure = $_.Exception.Message }
    $events = @(Get-Content -LiteralPath $global:releaseFixtureEvents)
    if ($mode -like 'verified*') {
      if ($failure) { throw "Verified schema failed: $failure" }
      $migrationEvent = if ($mode -eq 'verified-migration') { 'migration' } else { 'migration-status' }
      foreach ($required in @('backup',$migrationEvent,'schema','switch-current-release','restart-baogiang-api','test-production-health')) {
        if ($events -notcontains $required) { throw "Verified release missed $required" }
      }
      if ([array]::IndexOf($events,'schema') -gt [array]::IndexOf($events,'switch-current-release')) { throw 'Schema verified after switch.' }
      if ([array]::IndexOf($events,'backup') -gt [array]::IndexOf($events,$migrationEvent) -or [array]::IndexOf($events,$migrationEvent) -gt [array]::IndexOf($events,'schema')) { throw 'Backup/migration/schema order violated.' }
    } else {
      $expectedFailure = if ($mode -eq 'pending') { 'MIGRATIONS_PENDING' } else { 'RELEASE_SCHEMA_NOT_VERIFIED' }
      if ($failure -notmatch $expectedFailure) { throw "Wrong rejection in ${mode}: $failure" }
      if ($events -contains 'switch-current-release' -or $events -contains 'restart-baogiang-api') { throw 'Unverified release was activated.' }
    }
  }
  Write-Output 'P5-056 release gate fixtures PASS (pending/schema mismatch prevent activation; verified schema precedes switch/start).'
} finally {
  # Delete only the fresh, canonical temporary fixture owned by this invocation.
  $resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
  $allowedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (-not $resolvedFixture.StartsWith($allowedTemp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedFixture -Leaf) -notlike 'p5056-release-*') { throw 'Unsafe fixture cleanup path.' }
  Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
  Remove-Variable releaseFixtureRoot,releaseFixtureEvents,releaseFixtureMode -Scope Global -ErrorAction SilentlyContinue
}
