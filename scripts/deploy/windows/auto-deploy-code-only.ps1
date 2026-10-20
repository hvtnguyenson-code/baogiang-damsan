[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedSha,
  [switch]$PreflightOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = 'C:\baogiang'
$repo = 'C:\ProgramData\BaoGiangDeploy\source'
$markerPath = Join-Path $root 'shared\deployment-identity.json'
$healthUrl = 'http://127.0.0.1:3100/api/health/ready'
$neighborHealthUrl = 'http://127.0.0.1:3000/health'
$taskName = 'BaoGiangBackendPreDomain'
$nodeDir = 'C:\baogiang\shared\runtimes\node-v22.23.3-win-x64'
$pgDir = 'C:\Program Files\PostgreSQL\17\bin'

function Assert-Http200([string]$Url) {
  $result = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 12
  if ($result.StatusCode -ne 200) { throw "HTTP_NOT_OK: $Url" }
}
function Invoke-Git([string[]]$GitArguments) {
  $result = & git -C $repo @GitArguments
  if ($LASTEXITCODE -ne 0) { throw ('GIT_FAILED: ' + ($GitArguments -join ' ')) }
  return $result
}

if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { throw 'BAOGIANG_MARKER_MISSING' }
if (-not (Test-Path -LiteralPath (Join-Path $repo '.git') -PathType Container)) { throw 'DEDICATED_GIT_REPO_MISSING' }
$marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
if ($marker.canonicalRoot -cne $root -or $marker.apiPort -ne 3100 -or
    $marker.service.name -cne $taskName -or $marker.service.kind -cne 'scheduled-task' -or
    $marker.nodeExe -cne (Join-Path $nodeDir 'node.exe')) { throw 'BAOGIANG_MARKER_CONTRACT_MISMATCH' }
if (-not (Test-Path -LiteralPath $marker.startupWrapper -PathType Leaf)) { throw 'STARTUP_WRAPPER_NOT_FOUND' }
foreach ($exe in @((Join-Path $nodeDir 'node.exe'), (Join-Path $nodeDir 'npm.cmd'),
                 (Join-Path $nodeDir 'npx.cmd'), (Join-Path $pgDir 'psql.exe'),
                 (Join-Path $pgDir 'pg_dump.exe'), (Join-Path $pgDir 'pg_restore.exe'))) {
  if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "DEPENDENCY_MISSING: $exe" }
}
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.Settings.Enabled -ne $true -or $task.Actions.Arguments -cne $marker.service.arguments) {
  throw 'BAOGIANG_TASK_CONTRACT_MISMATCH'
}
Assert-Http200 $neighborHealthUrl
$neighborPid = (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction Stop | Select-Object -First 1).OwningProcess

# This dedicated, publicly readable repository is the only Git tree touched.
$dirty = @(Invoke-Git @('status','--porcelain','--untracked-files=no'))
if ($dirty.Count -gt 0) { throw 'DEPLOY_REPOSITORY_DIRTY' }
Invoke-Git @('fetch','--no-tags','origin','main') | Out-Null
$main = ([string](Invoke-Git @('rev-parse','origin/main'))).Trim()
if ($main -cne $ExpectedSha) { throw "MAIN_SHA_MISMATCH: expected=$ExpectedSha actual=$main" }
Invoke-Git @('cat-file','-e',"$ExpectedSha^{commit}") | Out-Null

if ($PreflightOnly) {
  Assert-Http200 $healthUrl
  Write-Output "BAOGIANG_PREFLIGHT_PASS sha=$ExpectedSha neighbor_pid=$neighborPid"
  return
}
$oldTarget = [string](Get-Item -LiteralPath (Join-Path $root 'current') -Force).Target
if ($oldTarget -match [regex]::Escape($ExpectedSha) + '$') {
  Assert-Http200 $healthUrl
  & (Join-Path $repo 'scripts\deploy\windows\test-production-health.ps1') -BaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -VerifyFrontend | Out-Null
  Write-Output "BAOGIANG_DEPLOY_ALREADY_CURRENT sha=$ExpectedSha"
  return
}
Invoke-Git @('checkout','--detach',$ExpectedSha) | Out-Null
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$transferName = "control-$runId-1-$ExpectedSha"
$transfer = Join-Path (Join-Path $root 'incoming') $transferName
if (Test-Path -LiteralPath $transfer) { throw 'UNIQUE_TRANSFER_DIRECTORY_COLLISION' }
New-Item -ItemType Directory -Path $transfer -ErrorAction Stop | Out-Null
$archiveName = "release-$ExpectedSha.zip"
$archivePath = Join-Path $transfer $archiveName
try {
  Invoke-Git @('archive','--format=zip',("--output=$archivePath"),$ExpectedSha) | Out-Null
  $digest = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $source = Join-Path $repo 'scripts\deploy\windows'
  $scripts = @('deployment-common.ps1','install-release.ps1','backup-database.ps1',
    'run-migrations.ps1','assert-no-pending-migrations.ps1','sync-capability-catalog.ps1',
    'switch-current-release.ps1','restart-baogiang-api.ps1','start-baogiang-api.ps1',
    'test-production-health.ps1','rollback-release.ps1','notify-operator-telegram.ps1',
    'invoke-production-deploy.ps1','prune-releases.ps1')
  foreach ($name in $scripts) {
    Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $transfer $name) -ErrorAction Stop
  }
  $settings = [ordered]@{
    ReleaseSha = $ExpectedSha; Root = $root; TransferDirectoryName = $transferName
    SourceArchiveName = $archiveName; ExpectedSha256 = $digest
    NodeExe = (Join-Path $nodeDir 'node.exe')
    NpmExe = (Join-Path $nodeDir 'npm.cmd')
    NpxExe = (Join-Path $nodeDir 'npx.cmd')
    PsqlExe = (Join-Path $pgDir 'psql.exe')
    PgDumpExe = (Join-Path $pgDir 'pg_dump.exe')
    PgRestoreExe = (Join-Path $pgDir 'pg_restore.exe')
    EnvFile = $marker.envFile
    StartupWrapper = $marker.startupWrapper
    NginxExe = $marker.nginxExe
    NginxConfig = $marker.nginxConfig
    ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'
    ServiceKind = 'scheduled-task'; ServiceName = $taskName
    ExpectedEntryPoint = $marker.entryPoint
    MigrationRequested = $false; ProductionMigrationApproved = $false
    RollbackCompatibilityApproved = $false
    PreMigrationRecoveryApproved = $false
    MaintenanceWindow = $null
    ReportFileName = "deploy-report-$ExpectedSha.json"
  }
  $parameters = Join-Path $transfer 'deploy-parameters.json'
  [IO.File]::WriteAllText($parameters,($settings|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  & (Join-Path $transfer 'invoke-production-deploy.ps1') -ParameterFile $parameters
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'CONTROLLER_NONZERO_EXIT' }
  $reportPath = Join-Path (Join-Path $root 'logs') $settings.ReportFileName
  if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) { throw 'DEPLOY_REPORT_MISSING' }
  $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
  if ($report.overallState -cne 'succeeded' -or $report.releaseSha -cne $ExpectedSha) {
    throw 'DEPLOY_REPORT_NOT_SUCCESSFUL'
  }
  & (Join-Path $source 'test-production-health.ps1') -BaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -VerifyFrontend | Out-Null
  Assert-Http200 $healthUrl
  Assert-Http200 $neighborHealthUrl
  $actualNeighborPid = (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction Stop | Select-Object -First 1).OwningProcess
  if ($actualNeighborPid -ne $neighborPid) { throw 'PROTECTED_NEIGHBOR_PROCESS_CHANGED' }
  $actualTarget = [string](Get-Item -LiteralPath (Join-Path $root 'current') -Force).Target
  if ($actualTarget -notmatch ([regex]::Escape($ExpectedSha) + '$')) { throw 'RELEASE_POINTER_NOT_UPDATED' }
  Write-Output "BAOGIANG_DEPLOY_VERIFIED sha=$ExpectedSha neighbor_pid=$neighborPid"
  # Post-verification housekeeping is strictly best-effort: never roll back a healthy release.
  try {
    & (Join-Path $transfer 'prune-releases.ps1') -Root $root -ExpectedSha $ExpectedSha -Execute | Out-Null
    Write-Output "BAOGIANG_RELEASE_PRUNE_OK sha=$ExpectedSha"
  } catch {
    Write-Warning ('BAOGIANG_RELEASE_PRUNE_SKIPPED: ' + $_.Exception.Message)
  }
} finally {
  # Keep the durable redacted report under C:\baogiang\logs; remove only exact staging.
  if (Test-Path -LiteralPath $transfer) {
    Remove-Item -LiteralPath $transfer -Recurse -Force -ErrorAction SilentlyContinue
  }
}
