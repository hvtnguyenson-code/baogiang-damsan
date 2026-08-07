Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CanonicalPath([Parameter(Mandatory = $true)][string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.Path]::IsPathRooted($Path)) { throw 'A Windows absolute path is required.' }
  return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Assert-DedicatedRoot([Parameter(Mandatory = $true)][string]$Root) {
  $canonical = Get-CanonicalPath $Root
  $rootOfDrive = [IO.Path]::GetPathRoot($canonical).TrimEnd('\')
  if ($canonical.TrimEnd('\') -ieq $rootOfDrive) { throw 'The application root may not be a drive root.' }
  $blocked = @(
    [Environment]::GetFolderPath('Windows'),
    [Environment]::GetFolderPath('ProgramFiles'),
    [Environment]::GetFolderPath('CommonProgramFiles'),
    (Join-Path $env:WINDIR 'System32')
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  foreach ($path in $blocked) { if ($canonical.StartsWith((Get-CanonicalPath $path), [StringComparison]::OrdinalIgnoreCase)) { throw 'The application root is a protected Windows/system path.' } }
  if ($canonical -match '(?i)DamSanV5|boarding[-_ ]?management|quan.?ly.?noi.?tru|noi.?tru') { throw 'The application root conflicts with a protected neighboring system.' }
  return $canonical
}

function Assert-ExistingDirectory([Parameter(Mandatory = $true)][string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw "A bootstrapped directory is missing: $Path" }
  return Get-CanonicalPath $Path
}

function Assert-ExistingLeaf([Parameter(Mandatory = $true)][string]$Path,[string]$Label = 'Executable') {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label must be an existing file: $Path" }
  return Get-CanonicalPath $Path
}

function Normalize-ComparablePath([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return '' }
  return (Get-CanonicalPath $Path).ToLowerInvariant()
}

function Test-PathWithin([Parameter(Mandatory = $true)][string]$Path,[Parameter(Mandatory = $true)][string]$Parent) {
  $candidate = Normalize-ComparablePath $Path
  $container = (Normalize-ComparablePath $Parent).TrimEnd('\')
  return $candidate -eq $container -or $candidate.StartsWith("$container\", [StringComparison]::OrdinalIgnoreCase)
}

function Assert-ExactChildPath([Parameter(Mandatory = $true)][string]$Root,[Parameter(Mandatory = $true)][string]$RelativePath) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $candidate = Get-CanonicalPath (Join-Path $canonicalRoot $RelativePath)
  if (-not (Test-PathWithin $candidate $canonicalRoot)) { throw 'Path escapes the dedicated deployment root.' }
  return $candidate
}

function Redact-SensitiveText([AllowNull()][string]$Text) {
  if ($null -eq $Text) { return $null }
  $safe = $Text
  $safe = [regex]::Replace($safe, '(?i)(postgres(?:ql)?://)[^\s/@:]+(?::[^\s/@]*)?@', '$1<redacted>@')
  $safe = [regex]::Replace($safe, '(?i)(bearer\s+)[^\s,;]+', '$1<redacted>')
  $safe = [regex]::Replace($safe, '(?i)(DATABASE_URL|PGPASSWORD|PASSWORD|TOKEN|SECRET|PRIVATE_KEY)\s*[=:]\s*[^\s,;]+', '$1=<redacted>')
  $safe = [regex]::Replace($safe, '(?i)(-password|-token|-secret|-privatekey)\s+[^\s,;]+', '$1 <redacted>')
  return $safe
}

function Get-NormalizedProcessIdentity([Parameter(Mandatory = $true)]$Process) {
  # Command lines can contain arbitrary secret syntaxes. Inventory records only a hash.
  $commandLine = [string]$Process.CommandLine
  [ordered]@{
    pid = [int]$Process.ProcessId
    executablePath = $Process.ExecutablePath
    executableName = if ($Process.ExecutablePath) { Split-Path -Leaf $Process.ExecutablePath } else { $null }
    commandLineSha256 = if ($commandLine) { (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($commandLine))) -Algorithm SHA256).Hash } else { $null }
  }
}

function Normalize-ProcessCommandLine([AllowNull()][string]$CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return '' }
  return (Redact-SensitiveText $CommandLine).ToLowerInvariant().Replace('/','\')
}

function Get-ReparseTarget([Parameter(Mandatory = $true)][string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) { throw "Expected a reparse point: $Path" }
  $target = @($item.Target) | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($target)) { throw "Could not resolve reparse target: $Path" }
  return Get-CanonicalPath $target
}

function Assert-ReparseTarget([Parameter(Mandatory = $true)][string]$Path,[Parameter(Mandatory = $true)][string]$ExpectedTarget) {
  $actual = Get-ReparseTarget $Path
  if ((Normalize-ComparablePath $actual) -ne (Normalize-ComparablePath $ExpectedTarget)) { throw "Reparse target mismatch: $Path" }
  return $actual
}

function Assert-ReleasePointerTarget([Parameter(Mandatory = $true)][string]$PointerPath,[Parameter(Mandatory = $true)][string]$Root) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $releasesRoot = Assert-ExactChildPath $canonicalRoot 'releases'
  $target = Get-ReparseTarget $PointerPath
  if (-not (Test-PathWithin $target $releasesRoot)) { throw 'Release pointer target is outside the dedicated releases directory.' }
  $leaf = Split-Path -Leaf $target
  if ($leaf -notmatch '^[0-9a-f]{40}$') { throw 'Release pointer target must be a lowercase full SHA release directory.' }
  if (-not (Test-Path -LiteralPath $target -PathType Container)) { throw 'Release pointer target directory does not exist.' }
  if ((Normalize-ComparablePath (Split-Path -Parent $target)) -ne (Normalize-ComparablePath $releasesRoot)) { throw 'Release pointer target has an ambiguous parent path.' }
  return $target
}

function Read-DeploymentIdentity(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ExpectedEntryPoint
) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $markerPath = Join-Path $canonicalRoot 'shared\deployment-identity.json'
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { throw 'Dedicated deployment identity marker is missing.' }
  $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($marker.systemId -ne 'baogiang-damsan') { throw 'Deployment identity marker systemId mismatch.' }
  if ((Normalize-ComparablePath $marker.canonicalRoot) -ne (Normalize-ComparablePath $canonicalRoot)) { throw 'Deployment identity marker root mismatch.' }
  if ($marker.domain -ne 'https://baogiang.dtnt-damsan.edu.vn' -or [int]$marker.apiPort -ne 3100) { throw 'Deployment identity marker domain/port mismatch.' }
  if ($marker.service.kind -ne $ServiceKind -or $marker.service.name -ne $ServiceName) { throw 'Deployment identity marker task/service mismatch.' }
  if ((Normalize-ComparablePath $marker.envFile) -ne (Normalize-ComparablePath $EnvFile)) { throw 'Deployment identity marker env path mismatch.' }
  if ((Normalize-ComparablePath $marker.startupWrapper) -ne (Normalize-ComparablePath $StartupWrapper)) { throw 'Deployment identity marker startup wrapper mismatch.' }
  if ((Normalize-ComparablePath $marker.entryPoint) -ne (Normalize-ComparablePath $ExpectedEntryPoint)) { throw 'Deployment identity marker entry point mismatch.' }
  foreach ($name in @('releases','staging','incoming','shared','logs','backups')) { Assert-ExistingDirectory (Join-Path $canonicalRoot $name) | Out-Null }
  foreach ($property in @('startupBundle','nginxExe','nginxConfig','foreignIsolation')) {
    if (-not $marker.PSObject.Properties.Name.Contains($property)) { throw "Deployment identity marker is missing required isolation/runtime evidence: $property" }
  }
  if (-not $marker.startupBundle.wrapperPath -or -not $marker.startupBundle.commonPath -or -not $marker.startupBundle.wrapperSha256 -or -not $marker.startupBundle.commonSha256) { throw 'Deployment identity marker startup runtime bundle is incomplete.' }
  if ((Normalize-ComparablePath $marker.startupBundle.wrapperPath) -ne (Normalize-ComparablePath $StartupWrapper)) { throw 'Deployment marker startup bundle wrapper path mismatch.' }
  $commonPath = Join-Path (Split-Path -Parent $StartupWrapper) 'deployment-common.ps1'
  if ((Normalize-ComparablePath $marker.startupBundle.commonPath) -ne (Normalize-ComparablePath $commonPath)) { throw 'Deployment marker startup bundle helper path mismatch.' }
  foreach ($bundleFile in @(@{ path = $marker.startupBundle.wrapperPath; hash = $marker.startupBundle.wrapperSha256 }, @{ path = $marker.startupBundle.commonPath; hash = $marker.startupBundle.commonSha256 })) {
    Assert-ExistingLeaf $bundleFile.path 'Startup runtime bundle file' | Out-Null
    if ((Get-FileHash -LiteralPath $bundleFile.path -Algorithm SHA256).Hash -ine $bundleFile.hash) { throw 'Startup runtime bundle hash mismatch.' }
  }
  return [pscustomobject]@{ canonicalRoot = $canonicalRoot; marker = $marker }
}

function Assert-VerifiedRuntimeIdentity([Parameter(Mandatory = $true)]$Marker,[Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,[Parameter(Mandatory = $true)][string]$ServiceName) {
  if ($ServiceKind -eq 'scheduled-task') {
    $tasks = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -ceq $ServiceName })
    if ($tasks.Count -ne 1) { throw 'Exact Scheduled Task identity is missing or ambiguous.' }
    $task = $tasks[0]
    if ($marker.service.taskPath -and $task.TaskPath -cne $marker.service.taskPath) { throw 'Scheduled Task path mismatch.' }
    if ($task.Principal.UserId -cne $marker.service.account) { throw 'Scheduled Task account mismatch.' }
    $actions = @($task.Actions)
    if ($actions.Count -ne 1) { throw 'Scheduled Task must have exactly one action.' }
    if ((Normalize-ComparablePath $actions[0].Execute) -ne (Normalize-ComparablePath $marker.service.execute)) { throw 'Scheduled Task executable mismatch.' }
    if (($actions[0].Arguments -replace '\s+',' ').Trim() -cne ($marker.service.arguments -replace '\s+',' ').Trim()) { throw 'Scheduled Task arguments mismatch.' }
    if ((Normalize-ComparablePath $actions[0].WorkingDirectory) -ne (Normalize-ComparablePath $marker.service.workingDirectory)) { throw 'Scheduled Task working directory mismatch.' }
  } else {
    $services = @(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object { $_.Name -ceq $ServiceName })
    if ($services.Count -ne 1) { throw 'Exact Windows Service identity is missing or ambiguous.' }
    if ($services[0].StartName -cne $marker.service.account -or $services[0].PathName -cne $marker.service.pathName) { throw 'Windows Service action/account mismatch.' }
  }
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3100 -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction Stop
    $exeMatches = if ($marker.nodeExe) { (Normalize-ComparablePath $process.ExecutablePath) -eq (Normalize-ComparablePath $marker.nodeExe) } else { $true }
    if (-not $exeMatches -or (Normalize-ProcessCommandLine $process.CommandLine) -notlike "*$(Normalize-ProcessCommandLine $marker.entryPoint)*") { throw 'Port 3100 is occupied by a process that does not match the deployment marker.' }
  }
  return $true
}

function Get-SafeStopPollingDecision([Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$ExactProcessId,[Parameter(Mandatory = $true)]$Listeners) {
  $exactIds = @($ExactProcessId | ForEach-Object { [int]$_ })
  $rows = @($Listeners)
  $foreign = @($rows | Where-Object { $exactIds -notcontains [int]$_.OwningProcess })
  if ($foreign.Count -gt 0) { return [ordered]@{ state = 'CONFLICT'; exactProcessCount = $exactIds.Count; listenerCount = $rows.Count; foreignListenerCount = $foreign.Count } }
  if ($exactIds.Count -eq 0 -and $rows.Count -eq 0) { return [ordered]@{ state = 'PASS'; exactProcessCount = 0; listenerCount = 0; foreignListenerCount = 0 } }
  return [ordered]@{ state = 'WAIT'; exactProcessCount = $exactIds.Count; listenerCount = $rows.Count; foreignListenerCount = 0 }
}

function Get-DatabaseEvidenceClassification([Parameter(Mandatory = $true)][string]$ActualDatabase,[Parameter(Mandatory = $true)][string]$ExpectedDatabase,[Parameter(Mandatory = $true)][string]$ActualRole,[Parameter(Mandatory = $true)][string]$ExpectedRole,[Parameter(Mandatory = $true)][string[]]$ActualExtensions,[Parameter(Mandatory = $true)][string[]]$RequiredExtensions,[Parameter(Mandatory = $true)][bool]$MigrationTablePresent,[int]$UnfinishedMigrations = 0,[int]$RolledBackMigrations = 0,[bool]$MigrationSummaryVerified = $false) {
  if ($ActualDatabase -cne $ExpectedDatabase -or $ActualRole -cne $ExpectedRole) { return [ordered]@{ state = 'CONFLICT'; identityState = 'CONFLICT' } }
  $missing = @($RequiredExtensions | Where-Object { $ActualExtensions -notcontains $_ })
  if ($missing.Count -gt 0) { return [ordered]@{ state = 'CONFLICT'; identityState = 'EXISTS AND VERIFIED'; missingExtensions = $missing } }
  if (-not $MigrationTablePresent) { return [ordered]@{ state = 'PARTIAL'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'NOT_APPLIED' } }
  if (-not $MigrationSummaryVerified) { return [ordered]@{ state = 'PARTIAL'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'NOT_VERIFIED' } }
  if ($UnfinishedMigrations -gt 0 -or $RolledBackMigrations -gt 0) { return [ordered]@{ state = 'CONFLICT'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'BLOCKING_ROWS'; unfinished = $UnfinishedMigrations; rolledBack = $RolledBackMigrations } }
  return [ordered]@{ state = 'EXISTS AND VERIFIED'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'CLEAN' }
}

function Get-DatabaseEvidenceQueryPlan([Parameter(Mandatory = $true)][bool]$MigrationTablePresent) {
  $plan = @([pscustomobject]@{ name = 'identity'; sql = "SELECT current_database() || '|' || current_user; SELECT extname FROM pg_extension ORDER BY extname; SELECT CASE WHEN to_regclass('_prisma_migrations') IS NULL THEN 'MISSING' ELSE 'PRESENT' END;" })
  if ($MigrationTablePresent) { $plan += [pscustomobject]@{ name = 'migration-summary'; sql = "SELECT count(*) FILTER (WHERE finished_at IS NULL)::text || '|' || count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::text FROM _prisma_migrations;" } }
  return $plan
}

function Stop-ExactBaoGiangRuntime([Parameter(Mandatory = $true)]$Marker,[Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,[Parameter(Mandatory = $true)][string]$ServiceName,[ValidateRange(1,10)][int]$MaxAttempts = 6,[ValidateRange(0,10)][int]$DelaySeconds = 1) {
  # Identity validation is intentionally before every mutation; never target a generic node.exe.
  Assert-VerifiedRuntimeIdentity -Marker $Marker -ServiceKind $ServiceKind -ServiceName $ServiceName | Out-Null
  if ($ServiceKind -eq 'scheduled-task') {
    $tasks = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -ceq $ServiceName -and $_.TaskPath -ceq $Marker.service.taskPath })
    if ($tasks.Count -ne 1 -or @($tasks[0].Actions).Count -ne 1) { throw 'Exact Scheduled Task cannot be safely stopped.' }
    # A first-deploy failure must not be restarted by an automatic trigger.
    Disable-ScheduledTask -TaskName $ServiceName -TaskPath $Marker.service.taskPath -ErrorAction Stop | Out-Null
    Stop-ScheduledTask -TaskName $ServiceName -TaskPath $Marker.service.taskPath -ErrorAction SilentlyContinue
  } else {
    $services = @(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object { $_.Name -ceq $ServiceName -and $_.PathName -ceq $Marker.service.pathName -and $_.StartName -ceq $Marker.service.account })
    if ($services.Count -ne 1) { throw 'Exact Windows Service cannot be safely stopped.' }
    Stop-Service -Name $ServiceName -Force -ErrorAction Stop
    Set-Service -Name $ServiceName -StartupType Disabled -ErrorAction Stop
  }
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    $exact = @((Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
      (Normalize-ComparablePath $_.ExecutablePath) -eq (Normalize-ComparablePath $Marker.nodeExe) -and (Normalize-ProcessCommandLine $_.CommandLine) -like "*$(Normalize-ProcessCommandLine $Marker.entryPoint)*"
    }))
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3100 -ErrorAction SilentlyContinue)
    $decision = Get-SafeStopPollingDecision -ExactProcessId @($exact | Select-Object -ExpandProperty ProcessId) -Listeners $listeners
    if ($decision.state -eq 'CONFLICT') { throw "Safe-stop conflict: foreign process owns port 3100 (listener count $($decision.listenerCount))." }
    if ($decision.state -eq 'PASS') { return [ordered]@{ state = 'stopped'; serviceKind = $ServiceKind; serviceName = $ServiceName; attempts = $attempt; apiProcessCount = 0; listenerCount = 0 } }
    if ($attempt -lt $MaxAttempts -and $DelaySeconds -gt 0) { Start-Sleep -Seconds $DelaySeconds }
  }
  throw 'Safe-stop timeout: exact Báo giảng API process remains after the bounded wait.'
}

function Quarantine-FailedFirstRelease([Parameter(Mandatory = $true)][string]$Root,[Parameter(Mandatory = $true)][string]$FailedSha) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $current = Join-Path $canonicalRoot 'current'; $previous = Join-Path $canonicalRoot 'previous'; $failed = Join-Path $canonicalRoot 'failed-release'
  if (Test-Path -LiteralPath $previous) { throw 'First-deploy quarantine refuses an existing previous release pointer.' }
  if (Test-Path -LiteralPath $failed) { throw 'Failed-release quarantine pointer already exists; operator inspection is required.' }
  if (-not (Test-Path -LiteralPath $current)) { throw 'Current pointer is missing for first-deploy quarantine.' }
  $target = Assert-ReleasePointerTarget -PointerPath $current -Root $canonicalRoot
  if ((Split-Path -Leaf $target) -cne $FailedSha) { throw 'Current pointer does not identify the failed release.' }
  Move-Item -LiteralPath $current -Destination $failed -ErrorAction Stop
  Assert-ReleasePointerTarget -PointerPath $failed -Root $canonicalRoot | Out-Null
  if (Test-Path -LiteralPath $current) { throw 'Current pointer remained after first-deploy quarantine.' }
  return [ordered]@{ state = 'quarantined'; failedRelease = $FailedSha; pointer = $failed }
}

function Assert-ExecutableContract([Parameter(Mandatory = $true)][hashtable]$Executables) {
  foreach ($key in $Executables.Keys) { Assert-ExistingLeaf -Path $Executables[$key] -Label $key | Out-Null }
}

function Invoke-NativeChecked(
  [Parameter(Mandatory = $true)][string]$FilePath,
  [Parameter(Mandatory = $true)][object[]]$ArgumentList,
  [Parameter(Mandatory = $true)][string]$Operation
) {
  & $FilePath @ArgumentList
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { throw "$Operation failed with exit code $exitCode." }
}

function Import-ServerEnvironment(
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$ExpectedBaseUrl
) {
  Assert-ExistingLeaf $EnvFile 'Production environment file' | Out-Null
  $allowed = @('NODE_ENV','API_HOST','API_PORT','HTTP_TRUST_PROXY_HOPS','DATABASE_URL','TEST_DATABASE_URL','CORS_ORIGINS','AUTH_SESSION_TTL_SECONDS','AUTH_LAST_SEEN_UPDATE_SECONDS','AUTH_COOKIE_NAME','AUTH_COOKIE_PATH','AUTH_COOKIE_DOMAIN','AUTH_COOKIE_SECURE','AUTH_COOKIE_SAME_SITE','AUTH_LOCKOUT_THRESHOLD','AUTH_LOCKOUT_DURATION_SECONDS','AUTH_PASSWORD_MIN_LENGTH','AUTH_LOGIN_RATE_LIMIT_MAX','AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS','AUTH_LOGIN_RATE_LIMIT_MAX_KEYS','BOOTSTRAP_ADMIN_USERNAME','BOOTSTRAP_ADMIN_DISPLAY_NAME','BOOTSTRAP_ADMIN_PASSWORD','AI_ENABLED','AI_ACTIVE_MODE_ENABLED','AI_PASSIVE_MODE_ENABLED','WEB_PUSH_ENABLED','LOG_LEVEL')
  $seen = @{}
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#') { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { throw 'Production environment contains an invalid assignment.' }
    $name = $Matches[1]; $value = $Matches[2]
    if ($allowed -notcontains $name) { throw "Production environment contains an unapproved variable: $name" }
    if ($seen.ContainsKey($name)) { throw "Production environment contains a duplicate variable: $name" }
    $seen[$name] = $true
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
  foreach ($forbidden in @('TEST_DATABASE_URL','BOOTSTRAP_ADMIN_USERNAME','BOOTSTRAP_ADMIN_DISPLAY_NAME','BOOTSTRAP_ADMIN_PASSWORD')) {
    if ($seen.ContainsKey($forbidden)) { throw "Production runtime environment may not contain $forbidden." }
  }
  if ($env:NODE_ENV -ne 'production' -or $env:API_HOST -notin @('127.0.0.1','::1','localhost') -or $env:API_PORT -ne '3100' -or $env:HTTP_TRUST_PROXY_HOPS -ne '1' -or $env:AUTH_COOKIE_SECURE -ne 'true' -or $env:AI_ENABLED -ne 'false' -or $env:AI_ACTIVE_MODE_ENABLED -ne 'false' -or $env:AI_PASSIVE_MODE_ENABLED -ne 'false' -or $env:WEB_PUSH_ENABLED -ne 'false' -or [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw 'Production environment safety validation failed.' }
  $origins = @($env:CORS_ORIGINS -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($origins.Count -ne 1 -or $origins[0] -ne $ExpectedBaseUrl) { throw 'Production CORS origin is not the exact approved domain.' }
  return $seen.Keys
}

function Get-DatabaseParts([Parameter(Mandatory = $true)][string]$DatabaseUrl) {
  try { $uri = [Uri]$DatabaseUrl } catch { throw 'DATABASE_URL is not a valid PostgreSQL URI.' }
  if ($uri.Scheme -notin @('postgres','postgresql') -or [string]::IsNullOrWhiteSpace($uri.Host) -or [string]::IsNullOrWhiteSpace($uri.AbsolutePath.Trim('/')) -or [string]::IsNullOrWhiteSpace($uri.UserInfo)) { throw 'DATABASE_URL does not contain the required PostgreSQL fields.' }
  $userinfo = $uri.UserInfo.Split(':',2)
  if ($userinfo.Count -ne 2) { throw 'DATABASE_URL must provide a user and password through URI userinfo.' }
  [ordered]@{ host = $uri.Host; port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }; database = $uri.AbsolutePath.Trim('/'); user = [Uri]::UnescapeDataString($userinfo[0]); password = [Uri]::UnescapeDataString($userinfo[1]) }
}

function Set-PostgresProcessEnvironment([Parameter(Mandatory = $true)][string]$DatabaseUrl,[int]$ExpectedPort = 5433) {
  $parts = Get-DatabaseParts $DatabaseUrl
  if ([int]$parts.port -ne $ExpectedPort) { throw 'DATABASE_URL PostgreSQL port does not match the reviewed inventory.' }
  $env:PGHOST = $parts.host; $env:PGPORT = [string]$parts.port; $env:PGDATABASE = $parts.database; $env:PGUSER = $parts.user; $env:PGPASSWORD = $parts.password
  return $parts
}

function Clear-PostgresProcessEnvironment {
  foreach ($name in @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD')) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
}

function Get-SafeErrorCategory([Parameter(Mandatory = $true)]$ErrorRecord) {
  return $ErrorRecord.Exception.GetType().Name
}

function Write-RedactedReport([Parameter(Mandatory = $true)][string]$Path,[Parameter(Mandatory = $true)][object]$Data) {
  $safe = $Data | ConvertTo-Json -Depth 12
  if ($safe -match '(?i)postgres(?:ql)?://[^\s"'']+:[^\s"'']+@|BEGIN .*PRIVATE KEY|PGPASSWORD=') { throw 'Redacted report contains a forbidden secret pattern.' }
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($Path), $safe, [Text.UTF8Encoding]::new($false))
}
