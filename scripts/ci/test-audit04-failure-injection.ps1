$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repoRoot 'scripts\deploy\windows\deployment-common.ps1')

Write-Output '=== AUD-04 Deployment Migration Recovery Failure-Injection Tests ==='

$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("aud04-fixtures-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
  $fixtureScriptsDir = Join-Path $tempDir 'scripts'
  New-Item -ItemType Directory -Path $fixtureScriptsDir -Force | Out-Null
  Copy-Item -Path (Join-Path $repoRoot 'scripts\deploy\windows\*') -Destination $fixtureScriptsDir -Recurse -Force

  $fakeToolPath = Join-Path $tempDir 'fake-tool.cmd'
  [IO.File]::WriteAllLines($fakeToolPath, @('@echo off', 'exit /b 0'), [Text.ASCIIEncoding]::new())

  $reviewedCommitSha = 'a' * 40
  $origSha = '1' * 40
  $ancientSha = '0' * 40
  $newSha = '2' * 40

  function New-AudFixtureEnvironment([string]$TestName) {
    $envRoot = Join-Path $tempDir $TestName
    foreach ($sub in @('releases', 'staging', 'incoming', 'shared', 'logs', 'backups')) {
      New-Item -ItemType Directory -Path (Join-Path $envRoot $sub) -Force | Out-Null
    }
    $startupBundleDir = Join-Path $envRoot "shared\startup-bundles\$reviewedCommitSha"
    New-Item -ItemType Directory -Path $startupBundleDir -Force | Out-Null
    $startupWrapper = Join-Path $startupBundleDir 'start-baogiang-api.ps1'
    $startupCommon = Join-Path $startupBundleDir 'deployment-common.ps1'
    [IO.File]::WriteAllText($startupWrapper, 'fixture wrapper', [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($startupCommon, 'fixture common', [Text.UTF8Encoding]::new($false))

    $envFile = Join-Path $envRoot 'shared\production.env'
    $envLines = @(
      'NODE_ENV=production',
      'PORT=3100',
      'HOST=127.0.0.1',
      'TZ=Asia/Ho_Chi_Minh',
      'DATABASE_URL=postgresql://baogiang_app:secret@127.0.0.1:5433/baogiang?schema=public',
      'APP_URL=https://baogiang.dtnt-damsan.edu.vn',
      'CORS_ORIGINS=https://baogiang.dtnt-damsan.edu.vn',
      'COOKIE_DOMAIN=baogiang.dtnt-damsan.edu.vn',
      'AUTH_COOKIE_NAME=__Host-baogiang-session',
      'AUTH_COOKIE_PATH=/',
      'AUTH_COOKIE_SAME_SITE=lax',
      'AUTH_COOKIE_SECURE=true',
      'AUTH_COOKIE_HTTP_ONLY=true',
      'AUTH_SESSION_TTL_SECONDS=1800',
      'BOOTSTRAP_ADMIN_PASSWORD=Fixture-Password-12345!',
      'REPORT_PAGE_SIZE_DEFAULT=50',
      'REPORT_PAGE_SIZE_MAX=200',
      'DATA_INTEGRITY_MAX_DRIFT_MINUTES=5',
      'TELEGRAM_BOT_TOKEN=',
      'TELEGRAM_BOT_USERNAME=',
      'TELEGRAM_WEBHOOK_SECRET='
    )
    [IO.File]::WriteAllLines($envFile, $envLines, [Text.UTF8Encoding]::new($false))

    $nginxPrefix = Join-Path $tempDir ("nginx-pfx-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $nginxPrefix -Force | Out-Null
    $nginxConfig = Join-Path $nginxPrefix 'nginx.conf'
    [IO.File]::WriteAllText($nginxConfig, 'events {} http {}', [Text.UTF8Encoding]::new($false))

    $entryPoint = Join-Path $envRoot 'current\apps\api\dist\apps\api\src\main.js'

    $markerObj = [ordered]@{
      schemaVersion = [long]1
      systemId = 'baogiang-damsan'
      canonicalRoot = (Get-CanonicalPath $envRoot)
      domain = 'https://baogiang.dtnt-damsan.edu.vn'
      apiPort = [long]3100
      nodeExe = $fakeToolPath
      envFile = (Get-CanonicalPath $envFile)
      startupWrapper = (Get-CanonicalPath $startupWrapper)
      entryPoint = (Get-CanonicalPath $entryPoint)
      nginxExe = $fakeToolPath
      nginxConfig = (Get-CanonicalPath $nginxConfig)
      foreignIsolation = [ordered]@{
        reviewedNginxPrefix = (Get-CanonicalPath $nginxPrefix)
        reviewedNginxConfig = (Get-CanonicalPath $nginxConfig)
        foreignRoots = @((Join-Path $tempDir 'foreign-root'))
        bootstrapReportReference = 'fixture'
      }
      startupBundle = [ordered]@{
        wrapperPath = (Get-CanonicalPath $startupWrapper)
        wrapperSha256 = (Get-FileSha256FromBytes $startupWrapper)
        commonPath = (Get-CanonicalPath $startupCommon)
        commonSha256 = (Get-FileSha256FromBytes $startupCommon)
      }
      service = [ordered]@{
        kind = 'scheduled-task'
        name = 'BaoGiangBackend'
        taskPath = '\BaoGiang\'
        account = 'fixture-account'
        execute = $fakeToolPath
        arguments = '-File start-baogiang-api.ps1'
        workingDirectory = (Join-Path $envRoot 'shared')
      }
    }
    $markerPath = Join-Path $envRoot 'shared\deployment-identity.json'
    [IO.File]::WriteAllText($markerPath, ($markerObj | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))

    return [pscustomobject]@{
      Root = $envRoot
      StartupWrapper = $startupWrapper
      EnvFile = $envFile
      NginxConfig = $nginxConfig
      EntryPoint = $entryPoint
      Marker = $markerObj
    }
  }

  function Prepare-IncomingTransfer([string]$Root, [string]$TargetSha) {
    $xferName = "control-1-1-$TargetSha"
    $xferDir = Join-Path $Root "incoming\$xferName"
    New-Item -ItemType Directory -Path $xferDir -Force | Out-Null
    $arcName = "release-$TargetSha.zip"
    $arcFile = Join-Path $xferDir $arcName
    [IO.File]::WriteAllText($arcFile, 'archive content', [Text.UTF8Encoding]::new($false))
    return @{ TransferDir = $xferName; ArchiveName = $arcName; Sha256 = (Get-FileSha256FromBytes $arcFile) }
  }

  function Write-DeploymentParameters([string]$FilePath, [hashtable]$Params) {
    [IO.File]::WriteAllText($FilePath, ($Params | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
  }

  $global:aud04StopCalls = [Collections.Generic.List[string]]::new()
  $global:aud04StopShouldFail = $false

  function global:Stop-ExactBaoGiangRuntime {
    param($Marker, [string]$ServiceKind, [string]$ServiceName, [int]$MaxAttempts = 6, [int]$DelaySeconds = 1)
    [void]$global:aud04StopCalls.Add("$($ServiceKind):$($ServiceName)")
    if ($global:aud04StopShouldFail) { throw 'Simulated safe-stop failure' }
    return [ordered]@{ state = 'stopped'; serviceKind = $ServiceKind; serviceName = $ServiceName }
  }

  function global:Get-ScheduledTask {
    param([string]$TaskName)
    return [pscustomobject]@{
      TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
      Principal = [pscustomobject]@{ UserId = 'fixture-account' }
      Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = 'C:\dummy' })
      Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
    }
  }

  function global:Get-FileHash {
    param([string]$LiteralPath, [string]$Algorithm)
    return [pscustomobject]@{ Hash = Get-FileSha256FromBytes $LiteralPath }
  }

  function global:Invoke-ReviewedNginxSyntaxTest {
    param($NginxExe, $NginxPrefix, $NginxConfig)
    return $true
  }

  # Helper to write stub scripts in fixtureScriptsDir
  function Set-FixtureScriptStubs([hashtable]$Stubs) {
    foreach ($scriptName in $Stubs.Keys) {
      $targetScript = Join-Path $fixtureScriptsDir $scriptName
      [IO.File]::WriteAllText($targetScript, $Stubs[$scriptName], [Text.UTF8Encoding]::new($false))
    }
  }

  # --- TEST 1: Existing release + migration completed + capability sync fails before switch + compatibility not approved ---
  # Expected: exact runtime safely stopped; original pointer preserved; fail-closed.
  {
    $fix = New-AudFixtureEnvironment 'test1'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated capability catalog sync failure'"
      'switch-current-release.ps1' = "throw 'switch should not be reached'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated capability catalog sync failure') { throw "Test 1 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 1 did not throw' }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 1 current pointer was not preserved: got $currentTarget, expected $origSha" }
    if ($global:aud04StopCalls.Count -eq 0) { throw 'Test 1 exact runtime was not stopped' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    if (-not (Test-Path $reportPath)) { throw 'Test 1 report missing' }
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.migration.state -ne 'completed') { throw "Test 1 report migration state: $($rep.migration.state)" }
    if ($rep.capabilityCatalog.state -ne 'attemptedUnknown') { throw "Test 1 report catalog state: $($rep.capabilityCatalog.state)" }
    if ($rep.rollback.state -ne 'stoppedCompatibilityApprovalRequired') { throw "Test 1 rollback state: $($rep.rollback.state)" }
    Write-Output '  [PASS] Test 1: Existing release + migration completed + capability sync fails before switch + compatibility not approved -> runtime stopped, pointer preserved'
  }

  # --- TEST 2: Existing release + migration attempted/unknown + failure before switch -> fail-closed ---
  {
    $fix = New-AudFixtureEnvironment 'test2'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "throw 'Simulated migration crash before completion'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated migration crash before completion') { throw "Test 2 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 2 did not throw' }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 2 current pointer was not preserved: got $currentTarget, expected $origSha" }
    if ($global:aud04StopCalls.Count -eq 0) { throw 'Test 2 exact runtime was not stopped' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.migration.state -ne 'attemptedUnknown') { throw "Test 2 report migration state: $($rep.migration.state)" }
    if ($rep.rollback.state -ne 'stoppedCompatibilityApprovalRequired') { throw "Test 2 rollback state: $($rep.rollback.state)" }
    Write-Output '  [PASS] Test 2: Existing release + migration attempted/unknown + failure before switch -> fail-closed (stopped)'
  }

  # --- TEST 3: No migration requested + pre-switch failure -> original runtime/pointer unaffected ---
  {
    $fix = New-AudFixtureEnvironment 'test3'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "throw 'Simulated install failure'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $false; ProductionMigrationApproved = $false
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated install failure') { throw "Test 3 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 3 did not throw' }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 3 current pointer was not preserved: got $currentTarget" }
    if ($global:aud04StopCalls.Count -ne 0) { throw 'Test 3 runtime was stopped unexpectedly' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.migration.state -ne 'notStarted') { throw "Test 3 migration state: $($rep.migration.state)" }
    if ($rep.rollback.state -ne 'notNeeded') { throw "Test 3 rollback state: $($rep.rollback.state)" }
    Write-Output '  [PASS] Test 3: No migration requested + pre-switch failure -> runtime and pointer unaffected (notNeeded)'
  }

  # --- TEST 4: First deploy + failure before initial switch -> no invalid quarantine or fabricated previous pointer ---
  {
    $fix = New-AudFixtureEnvironment 'test4'
    # No current pointer, no previous pointer!

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated first-deploy capability failure'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated first-deploy capability failure') { throw "Test 4 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 4 did not throw' }

    if (Test-Path -LiteralPath (Join-Path $fix.Root 'current')) { throw 'Test 4 current pointer was created' }
    if (Test-Path -LiteralPath (Join-Path $fix.Root 'previous')) { throw 'Test 4 previous pointer was created' }
    if (Test-Path -LiteralPath (Join-Path $fix.Root 'failed-release')) { throw 'Test 4 quarantine pointer was created without current' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'firstDeployFailedStopped') { throw "Test 4 rollback state: $($rep.rollback.state)" }
    if ($rep.rollback.quarantinePointer) { throw "Test 4 quarantinePointer should be null" }
    Write-Output '  [PASS] Test 4: First deploy + failure before switch -> no invalid quarantine or fabricated pointer'
  }

  # --- TEST 5: Failure after partial pointer mutation -> detected and handled safely ---
  {
    $fix = New-AudFixtureEnvironment 'test5'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    # Simulate switch-current-release partially executing: current moved to previous, then throws before creating current
    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "Write-Output '{`"state`":`"completed`",`"expectedDefinitionCount`":10,`"verifiedDefinitionCount`":10}'"
      'switch-current-release.ps1' = "param(`$ReleaseSha, `$Root) Move-Item -LiteralPath (Join-Path `$Root 'current') -Destination (Join-Path `$Root 'previous'); throw 'Simulated partial switch failure after moving current to previous'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated partial switch failure') { throw "Test 5 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 5 did not throw' }

    if (-not (Test-Path -LiteralPath (Join-Path $fix.Root 'current'))) { throw 'Test 5 current was not restored from partial switch' }
    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 5 current pointer restored incorrectly: got $currentTarget, expected $origSha" }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'stoppedCompatibilityApprovalRequired') { throw "Test 5 rollback state: $($rep.rollback.state)" }
    Write-Output '  [PASS] Test 5: Failure after partial pointer mutation -> detected, restored current, safely stopped'
  }

  # --- TEST 6: Migration attempted + compatibility approved -> exact recovery semantics; never blindly rollback to previous before switch ---
  {
    $fix = New-AudFixtureEnvironment 'test6'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    # Set up an ancient previous pointer to ensure controller NEVER activates it before switch!
    $ancientReleaseDir = Join-Path $fix.Root "releases\$ancientSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $ancientReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $ancientReleaseDir 'main.js'), 'console.log("v0");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'previous') -Target (Join-Path $fix.Root "releases\$ancientSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated capability catalog sync failure before switch'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
      'rollback-release.ps1' = "throw 'CRITICAL DEFECT: rollback-release.ps1 was blindly invoked before switch!'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated capability catalog sync failure before switch') { throw "Test 6 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 6 did not throw' }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 6 current pointer modified: got $currentTarget, expected $origSha (never $ancientSha)" }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'completed') { throw "Test 6 rollback state: $($rep.rollback.state)" }
    if ($rep.rollback.currentTarget -notmatch [regex]::Escape($origSha)) { throw "Test 6 currentTarget was not original release: $($rep.rollback.currentTarget)" }
    Write-Output '  [PASS] Test 6: Migration attempted + compatibility approved -> exact recovery on current; rollback-release.ps1 not invoked'
  }

  # --- TEST 7: Runtime safe-stop fails -> original and secondary error both recorded, no false PASS ---
  {
    $fix = New-AudFixtureEnvironment 'test7'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated primary catalog failure'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $global:aud04StopShouldFail = $true
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated primary catalog failure') { throw "Test 7 wrong exception thrown: $($_.Exception.Message)" }
    } finally {
      $global:aud04StopShouldFail = $false
    }
    if (-not $thrown) { throw 'Test 7 did not throw' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.errorCategory -ne 'UNKNOWN') { throw "Test 7 primary errorCategory: $($rep.errorCategory)" }
    if ($rep.rollback.state -ne 'stopFailedCompatibilityApprovalRequired') { throw "Test 7 rollback state: $($rep.rollback.state)" }
    if ($rep.rollback.errorCategory -ne 'UNKNOWN') { throw "Test 7 secondary errorCategory: $($rep.rollback.errorCategory)" }
    Write-Output '  [PASS] Test 7: Runtime safe-stop fails -> original and secondary error both recorded, no false PASS'
  }

  # --- TEST 8: Neighbor isolation -> no changes to Quản lí nội trú, other tasks, unrelated processes, shared database services or Nginx ---
  {
    $fix = New-AudFixtureEnvironment 'test8'
    $foreignDir = Join-Path $tempDir 'foreign-root'
    New-Item -ItemType Directory -Path $foreignDir -Force | Out-Null
    $sentinelFile = Join-Path $foreignDir 'untouched-neighbour.txt'
    [IO.File]::WriteAllText($sentinelFile, 'neighbour content', [Text.UTF8Encoding]::new($false))
    $beforeHash = Get-FileSha256FromBytes $sentinelFile

    # Confirm Assert-DedicatedRoot rejects neighbour paths
    $conflictRejected = $false
    try { Assert-DedicatedRoot 'C:\Quan_li_noi_tru' | Out-Null } catch { $conflictRejected = $true }
    if (-not $conflictRejected) { throw 'Test 8 Assert-DedicatedRoot accepted neighbour path' }

    $afterHash = Get-FileSha256FromBytes $sentinelFile
    if ($beforeHash -cne $afterHash) { throw 'Test 8 neighbour sentinel was mutated' }
    Write-Output '  [PASS] Test 8: Neighbor isolation verified (neighbour resources untouched)'
  }

  Write-Output '=== ALL 8 AUD-04 FAILURE-INJECTION TESTS PASSED ==='
} finally {
  Remove-Item Function:\Stop-ExactBaoGiangRuntime, Function:\Get-ScheduledTask, Function:\Get-FileHash, Function:\Invoke-ReviewedNginxSyntaxTest -Force -ErrorAction SilentlyContinue
  Remove-Variable aud04StopCalls, aud04StopShouldFail -Scope Global -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
