[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ReportPath,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$CandidateRoot,
  [string]$BaseUrl = 'https://baogiang.dtnt-damsan.edu.vn',
  [string]$ExpectedTaskName,
  [string]$ExpectedServiceName,
  [ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [string]$EnvFile,
  [string]$StartupWrapper,
  [string]$ExpectedEntryPoint,
  [string]$NginxExe,
  [string]$NginxConfig,
  [string[]]$KnownForeignRoot = @(),
  [string[]]$KnownForeignName = @(),
  [switch]$VerifyDatabase,
  [string]$DatabaseUrlEnvironmentVariable = 'DATABASE_URL',
  [string]$ExpectedDatabase = 'baogiang',
  [string]$ExpectedDatabaseRole = 'baogiang_app',
  [ValidateRange(1,65535)][int]$ExpectedPostgresPort = 5433,
  [string[]]$RequiredDatabaseExtension = @('btree_gist'),
  [switch]$RequireVerifiedIdentity
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')

function Get-CommandSnapshot([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) { return [ordered]@{ name = $Name; found = $false } }
  $version = 'unavailable'
  try { $output = @(& $command.Source --version 2>&1); if ($output.Count -gt 0) { $version = Redact-SensitiveText ($output[0].ToString()) } } catch { }
  [ordered]@{ name = $Name; found = $true; path = $command.Source; version = $version }
}

function Get-ProcessForPid([int]$ProcessId) {
  try { return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop } catch { return $null }
}

function Get-ListenerSnapshot([int]$Port) {
  $rows = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  @($rows | ForEach-Object {
    $row = $_
    $process = Get-ProcessForPid ([int]$_.OwningProcess)
    $identity = if ($process) { Get-NormalizedProcessIdentity $process } else { [ordered]@{ pid = [int]$_.OwningProcess; inaccessible = $true } }
    $identity['port'] = $Port; $identity['address'] = $row.LocalAddress; $identity
  })
}

function Get-DirectorySnapshot([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if (-not $item) { return [ordered]@{ path = $Path; state = 'MISSING' } }
  $target = $null
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { try { $target = Get-ReparseTarget $Path } catch { $target = 'UNRESOLVED_REPARSE_TARGET' } }
  $acl = @((Get-Acl -LiteralPath $Path).Access | ForEach-Object { [ordered]@{ identity = $_.IdentityReference.ToString(); rights = $_.FileSystemRights.ToString(); type = $_.AccessControlType.ToString() } })
  [ordered]@{ path = $Path; state = 'EXISTS'; reparseTarget = $target; acl = $acl }
}

function Get-SshSnapshot {
  $service = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -ceq 'sshd' } | Select-Object -First 1
  $config = $null; $ports = @()
  if ($service) {
    $match = [regex]::Match($service.PathName, '(?i)(?:-f|--config)\s+"?([^"\s]+)')
    if ($match.Success) { $config = $match.Groups[1].Value }
  }
  if (-not $config) { $config = Join-Path $env:ProgramData 'ssh\sshd_config' }
  if (Test-Path -LiteralPath $config -PathType Leaf) { $ports = @(Get-Content -LiteralPath $config | Where-Object { $_ -match '^\s*Port\s+(\d+)' } | ForEach-Object { [int]$Matches[1] }) }
  $sshdProcessId = if ($service) { [int]$service.ProcessId } else { 0 }
  [ordered]@{ service = if ($service) { [ordered]@{ name = $service.Name; state = $service.State; startName = $service.StartName; pathNameRedacted = Redact-SensitiveText $service.PathName } } else { [ordered]@{ state = 'MISSING' } }; configPath = $config; configuredPorts = $ports; listeningPorts = @(Get-NetTCPConnection -State Listen -OwningProcess $sshdProcessId -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique); firewall = @(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '(?i)SSH|OpenSSH' } | Select-Object DisplayName,Enabled,Direction,Action) }
}

function Get-TaskSnapshot([string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Name)) { return [ordered]@{ state = 'NOT_RUN' } }
  $task = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -ceq $Name }
  if (-not $task) { return [ordered]@{ name = $Name; state = 'MISSING' } }
  [ordered]@{ name = $task.TaskName; path = $task.TaskPath; state = $task.State; account = $task.Principal.UserId; actions = @($task.Actions | ForEach-Object { [ordered]@{ execute = $_.Execute; argumentsRedacted = Redact-SensitiveText $_.Arguments; workingDirectory = $_.WorkingDirectory } }) }
}

function Get-ServiceSnapshot([string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Name)) { return [ordered]@{ state = 'NOT_RUN' } }
  $service = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -ceq $Name }
  if (-not $service) { return [ordered]@{ name = $Name; state = 'MISSING' } }
  [ordered]@{ name = $service.Name; displayName = $service.DisplayName; state = $service.State; account = $service.StartName; pathNameRedacted = Redact-SensitiveText $service.PathName }
}

function Get-NginxSnapshot {
  $configState = if ($NginxConfig) { Get-DirectorySnapshot $NginxConfig } else { [ordered]@{ state = 'NOT_RUN' } }
  $references = @()
  if ($NginxConfig -and (Test-Path -LiteralPath $NginxConfig -PathType Leaf)) {
    $references = @(Get-Content -LiteralPath $NginxConfig | Where-Object { $_ -match 'server_name|proxy_pass|root\s+' } | ForEach-Object { Redact-SensitiveText $_.Trim() })
  }
  [ordered]@{ state = if ($references.Count -gt 0) { 'PARTIAL' } else { 'NOT_VERIFIED' }; note = 'Direct config references only; include chain and exact server block are not verified.'; executable = if ($NginxExe) { Get-CommandSnapshot ([IO.Path]::GetFileNameWithoutExtension($NginxExe)) } else { Get-CommandSnapshot 'nginx' }; config = $configState; references = $references; processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq 'nginx.exe' } | ForEach-Object { Get-NormalizedProcessIdentity $_ }) }
}

function Get-DatabaseSnapshot {
  if (-not $VerifyDatabase) { return [ordered]@{ state = 'NOT_RUN'; reason = 'No approved local database authentication was provided.' } }
  $url = [Environment]::GetEnvironmentVariable($DatabaseUrlEnvironmentVariable)
  if ([string]::IsNullOrWhiteSpace($url)) { return [ordered]@{ state = 'NOT_RUN'; reason = 'Approved server-side database environment is unavailable.' } }
  $parts = Set-PostgresProcessEnvironment -DatabaseUrl $url -ExpectedPort $ExpectedPostgresPort
  try {
    $psql = Get-Command psql -ErrorAction Stop
    # Query A is always safe on a greenfield database: it never references the relation.
    $queryA = (Get-DatabaseEvidenceQueryPlan -MigrationTablePresent:$false)[0].sql
    $output = @(& $psql.Source --tuples-only --no-align --command $queryA 2>$null)
    if ($LASTEXITCODE -ne 0) { return [ordered]@{ state = 'CONFLICT'; reason = 'Read-only PostgreSQL verification failed.' } }
    $actual = ($output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
    $identity = $actual | Select-Object -First 1
    $identityParts = $identity -split '\|', 2
    $extensions = @($actual | Select-Object -Skip 1 | Where-Object { $_ -notin @('MISSING','PRESENT') })
    $migrationsPresent = $actual -contains 'PRESENT'
    if ($identityParts.Count -ne 2 -or $identityParts[0] -cne $ExpectedDatabase -or $identityParts[1] -cne $ExpectedDatabaseRole -or [int]$parts.port -ne $ExpectedPostgresPort) { return [ordered]@{ state = 'CONFLICT'; database = if($identityParts.Count -gt 0){$identityParts[0]}else{$null}; role = if($identityParts.Count -gt 1){$identityParts[1]}else{$null}; port = $parts.port; reason = 'Actual database/role/port does not match reviewed expectations.' } }
    $summary = @('0','0'); $summaryVerified = $false
    if ($migrationsPresent) {
      # Query B is only constructed/executed after Query A proved the relation exists.
      $queryB = (Get-DatabaseEvidenceQueryPlan -MigrationTablePresent:$true)[1].sql
      $summaryOutput = @(& $psql.Source --tuples-only --no-align --command $queryB 2>$null)
      if ($LASTEXITCODE -eq 0 -and $summaryOutput.Count -eq 1 -and $summaryOutput[0].ToString().Trim() -match '^\d+\|\d+$') { $summary = $summaryOutput[0].ToString().Trim() -split '\|'; $summaryVerified = $true }
    }
    $classification = Get-DatabaseEvidenceClassification -ActualDatabase $identityParts[0] -ExpectedDatabase $ExpectedDatabase -ActualRole $identityParts[1] -ExpectedRole $ExpectedDatabaseRole -ActualExtensions $extensions -RequiredExtensions $RequiredDatabaseExtension -MigrationTablePresent $migrationsPresent -UnfinishedMigrations ([int]$summary[0]) -RolledBackMigrations ([int]$summary[1]) -MigrationSummaryVerified $summaryVerified
    $classification.database = $identityParts[0]; $classification.role = $identityParts[1]; $classification.port = $parts.port; $classification.extensions = $extensions; $classification.migrationsTablePresent = $migrationsPresent; $classification.migrationSummary = [ordered]@{ unfinished = [int]$summary[0]; rolledBack = [int]$summary[1] }; $classification
  } finally { Clear-PostgresProcessEnvironment }
}

function Get-TlsHttpSnapshot {
  try {
    $response = Invoke-WebRequest -Uri $BaseUrl -Method Head -MaximumRedirection 0 -TimeoutSec 10 -UseBasicParsing
    $certificate = $null
    if ($response.BaseResponse.ServicePoint.Certificate) { $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]$response.BaseResponse.ServicePoint.Certificate }
    [ordered]@{ state = 'PARTIAL'; status = [int]$response.StatusCode; finalHost = ([Uri]$response.BaseResponse.ResponseUri).Host; note = 'DNS A/AAAA and certificate SAN hostname validation are not performed by this snapshot.'; tls = if ($certificate) { [ordered]@{ subject = $certificate.Subject; thumbprint = $certificate.Thumbprint; notAfter = $certificate.NotAfter.ToUniversalTime().ToString('o') } } else { [ordered]@{ state = 'NOT_AVAILABLE' } } }
  } catch { [ordered]@{ state = 'NOT_RUN'; reason = 'DNS/TLS/HTTP check did not complete; inspect category in operator environment.' } }
}

$canonicalRoot = Assert-DedicatedRoot $CandidateRoot
$reportDirectory = Split-Path -Parent ([IO.Path]::GetFullPath($ReportPath))
if (-not (Test-Path -LiteralPath $reportDirectory -PathType Container)) { throw 'Report directory must already exist; inventory will not create it.' }
$directoryPaths = @($canonicalRoot,'releases','staging','incoming','shared','logs','backups' | ForEach-Object { if ($_ -eq $canonicalRoot) { $_ } else { Join-Path $canonicalRoot $_ } })
$identityStatus = 'REQUIRES_REVIEW'
if ($RequireVerifiedIdentity) {
  if ([string]::IsNullOrWhiteSpace($ExpectedTaskName) -and [string]::IsNullOrWhiteSpace($ExpectedServiceName)) { throw 'Verified identity requires an exact task or service name.' }
  $identityServiceName = if ($ServiceKind -eq 'service') { $ExpectedServiceName } else { $ExpectedTaskName }
  $identity = Read-DeploymentIdentity -Root $canonicalRoot -ServiceKind $ServiceKind -ServiceName $identityServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint
  Assert-VerifiedRuntimeIdentity -Marker $identity.marker -ServiceKind $ServiceKind -ServiceName $identityServiceName | Out-Null
  $identityStatus = 'EXISTS AND VERIFIED'
}
$report = [ordered]@{
  generatedAtUtc = [DateTime]::UtcNow.ToString('o')
  identity = [ordered]@{ hostname = $env:COMPUTERNAME; user = "$env:USERDOMAIN\$env:USERNAME"; powershell = $PSVersionTable.PSVersion.ToString(); architecture = $env:PROCESSOR_ARCHITECTURE; windows = (Get-CimInstance Win32_OperatingSystem).Caption; candidateRoot = $canonicalRoot; status = $identityStatus }
  ssh = Get-SshSnapshot
  tools = @('git','node','npm','npx','nginx','psql','pg_dump','pg_restore' | ForEach-Object { Get-CommandSnapshot $_ })
  listeners = @(
    (Get-ListenerSnapshot 80), (Get-ListenerSnapshot 443), (Get-ListenerSnapshot 3100), (Get-ListenerSnapshot 5433)
  )
  directories = @($directoryPaths | ForEach-Object { Get-DirectorySnapshot $_ })
  scheduledTask = Get-TaskSnapshot $ExpectedTaskName
  service = Get-ServiceSnapshot $ExpectedServiceName
  nginx = Get-NginxSnapshot
  database = Get-DatabaseSnapshot
  dnsTlsHttp = Get-TlsHttpSnapshot
  isolation = [ordered]@{ foreignInputs = @($KnownForeignRoot + $KnownForeignName); status = if (($KnownForeignRoot.Count + $KnownForeignName.Count) -eq 0) { 'NOT_RUN' } else { 'REQUIRES_REVIEW' }; note = 'Compare normalized paths, ports, tasks, services and process identities against DamSanV5 and boarding-management without exporting unrelated command lines.' }
}
foreach ($foreign in $KnownForeignRoot) { if ((Normalize-ComparablePath $canonicalRoot) -eq (Normalize-ComparablePath $foreign) -or (Normalize-ComparablePath $canonicalRoot).StartsWith("$(Normalize-ComparablePath $foreign)\")) { $report.isolation.status = 'CONFLICT' } }
$json = $report | ConvertTo-Json -Depth 12
if ($json -match '(?i)postgres(?:ql)?://[^\s"'']+:[^\s"'']+@|BEGIN .*PRIVATE KEY|PGPASSWORD=|DATABASE_URL=') { throw 'Inventory report redaction failed.' }
[IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath), $json, [Text.UTF8Encoding]::new($false))
Write-Output $json
