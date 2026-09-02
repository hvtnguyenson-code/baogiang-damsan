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
  [string]$NodeExe,
  [string]$NpmExe,
  [string]$NpxExe,
  [string]$NginxExe,
  [string]$NginxPrefix,
  [string]$NginxConfig,
  [string[]]$KnownForeignRoot = @(),
  [string[]]$KnownForeignName = @(),
  [switch]$RequireReviewedIsolation,
  [switch]$VerifyDatabase,
  [string]$PsqlExe,
  [string]$PgDumpExe,
  [string]$PgRestoreExe,
  [string]$DatabaseUrlEnvironmentVariable = 'DATABASE_URL',
  [string]$ExpectedDatabase = 'baogiang',
  [string]$ExpectedDatabaseRole = 'baogiang_app',
  [ValidateRange(1,65535)][int]$ExpectedPostgresPort = 5433,
  [string[]]$RequiredDatabaseExtension = @('btree_gist'),
  [string[]]$KnownForeignDatabase = @(),
  [string[]]$KnownForeignDatabaseRole = @(),
  [string]$ReviewedPostgresDataDirectory,
  [switch]$RequireForeignDatabaseIsolation,
  [switch]$VerifyPublicEndpoint,
  [switch]$RequireVerifiedIdentity
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')

function Get-CommandSnapshot([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) { return [ordered]@{ name = $Name; found = $false } }
  [ordered]@{ name = $Name; found = $true; path = $command.Source; state = 'DISCOVERY_ONLY_NOT_EXECUTED' }
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
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { try { $target = Get-ReparseTarget $Path } catch { $target = 'UNRESOLVED_REPARSE_TARGET' }; return [ordered]@{ path = $Path; state = 'REPARSE_POINT'; reparseTarget = $target; aclState = 'NOT_READ'; acl = @() } }
  $acl = @(); $aclState = 'NOT_VERIFIED'
  try { $acl = @((Get-Acl -LiteralPath $Path).Access | ForEach-Object { [ordered]@{ identity = $_.IdentityReference.ToString(); rights = $_.FileSystemRights.ToString(); type = $_.AccessControlType.ToString() } }); $aclState = 'DISCOVERED' } catch { }
  [ordered]@{ path = $Path; state = 'EXISTS'; reparseTarget = $target; aclState = $aclState; acl = $acl }
}

function Get-SshSnapshot {
  $service = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -ceq 'sshd' } | Select-Object -First 1
  $config = $null
  if ($service) {
    $match = [regex]::Match($service.PathName, '(?i)(?:-f|--config)\s+(?:"([^"]+)"|([^\s]+))')
    if ($match.Success) { $config = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value } }
  }
  if (-not $config) { $config = Join-Path $env:ProgramData 'ssh\sshd_config' }
  $configEvidence = Get-SshDirectConfigEvidence -ConfigPath $config
  $sshdProcessId = if ($service) { [int]$service.ProcessId } else { 0 }
  $listeningPorts = if ($sshdProcessId -gt 0) { @(Get-NetTCPConnection -State Listen -OwningProcess $sshdProcessId -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique) } else { @() }
  $portEvidence = Get-SshPortEvidence -EffectiveConfigState $configEvidence.effectiveConfigState -ConfiguredPort ([int[]]@($configEvidence.configuredPorts)) -ListeningPort ([int[]]$listeningPorts) -ServiceRunning:($service -and $service.State -ieq 'Running')
  $hostKeyEvidence = Get-SshPublicHostKeyEvidence -ConfigPath $config -EffectiveConfigVerified:($configEvidence.effectiveConfigState -eq 'DISCOVERED')
  $firewallEvidence = Get-SshFirewallEvidence -SshPort @($portEvidence.agreedPorts)
  $sshState = if ($portEvidence.state -eq 'CONFLICT' -or $firewallEvidence.state -eq 'CONFLICT') { 'CONFLICT' } elseif ($configEvidence.effectiveConfigState -eq 'DISCOVERED' -and $portEvidence.state -eq 'DISCOVERED' -and $hostKeyEvidence.state -eq 'DISCOVERED' -and $firewallEvidence.state -eq 'DISCOVERED') { 'DISCOVERED' } elseif ($hostKeyEvidence.state -eq 'PARTIAL') { 'PARTIAL' } else { 'NOT_VERIFIED' }
  [ordered]@{
    state = $sshState
    service = if ($service) { [ordered]@{ name = $service.Name; state = $service.State; startName = $service.StartName; pathNameSha256 = Get-SensitiveTextHash ([string]$service.PathName); safePathHints = @(Get-SafePathHints ([string]$service.PathName)) } } else { [ordered]@{ state = 'MISSING' } }
    configPath = Get-CanonicalPath $config
    effectiveConfig = $configEvidence
    configuredPorts = @($configEvidence.configuredPorts)
    actualSshdListeningPorts = $listeningPorts
    portEvidence = $portEvidence
    hostKeys = $hostKeyEvidence
    firewall = $firewallEvidence
  }
}

function Get-TaskSnapshot([string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Name)) { return [ordered]@{ state = 'NOT_RUN' } }
  $task = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -ceq $Name }
  if (-not $task) { return [ordered]@{ name = $Name; state = 'MISSING' } }
  [ordered]@{ name = $task.TaskName; path = $task.TaskPath; state = $task.State; account = $task.Principal.UserId; actions = @($task.Actions | ForEach-Object { [ordered]@{ execute = $_.Execute; argumentsSha256 = Get-SensitiveTextHash ([string]$_.Arguments); safePathHints = @(Get-SafePathHints (([string]$_.Arguments) + ' ' + ([string]$_.WorkingDirectory) + ' ' + ([string]$_.Execute))); workingDirectory = $_.WorkingDirectory } }) }
}

function Get-ServiceSnapshot([string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Name)) { return [ordered]@{ state = 'NOT_RUN' } }
  $service = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -ceq $Name }
  if (-not $service) { return [ordered]@{ name = $Name; state = 'MISSING' } }
  [ordered]@{ name = $service.Name; displayName = $service.DisplayName; state = $service.State; account = $service.StartName; pathNameSha256 = Get-SensitiveTextHash ([string]$service.PathName); safePathHints = @(Get-SafePathHints ([string]$service.PathName)) }
}

function Get-NginxSnapshot {
  $executable = Get-ReviewedExecutableSnapshot -Role nginx -Path $NginxExe
  $configState = [ordered]@{ state = 'NOT_PROVIDED' }
  $references = @()
  if ($NginxConfig) {
    if ([string]::IsNullOrWhiteSpace($NginxPrefix)) {
      throw 'NginxConfig requires a reviewed absolute NginxPrefix.'
    }
    $allowedRoot = Get-CanonicalPath $NginxPrefix
    $config = Assert-SafeDiscoveryReadPath -Path $NginxConfig -Kind file -AllowedRoot @($allowedRoot)
    $configState = [ordered]@{ state = 'EXISTS AND REVIEWED'; exactPath = $config; authority = 'REVIEWED_INPUT' }
    $references = @(Get-Content -LiteralPath $config | Where-Object { $_ -match 'server_name|proxy_pass|root\s+' } | ForEach-Object { Redact-SensitiveText $_.Trim() })
  }
  [ordered]@{ state = if ($executable.state -eq 'EXISTS AND REVIEWED' -and $configState.state -eq 'EXISTS AND REVIEWED') { 'PARTIAL' } else { 'NOT_VERIFIED' }; note = 'Exact executable/config inputs recorded; direct references remain partial until Get-NginxEffectiveGraph plan/verify authority runs.'; executable = $executable; config = $configState; references = $references; processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq 'nginx.exe' } | ForEach-Object { Get-NormalizedProcessIdentity $_ }) }
}

function Get-DatabaseSnapshot {
  if (-not $VerifyDatabase) { return [ordered]@{ state = 'NOT_RUN'; reason = 'No approved local database authentication was provided.' } }
  $url = [Environment]::GetEnvironmentVariable($DatabaseUrlEnvironmentVariable)
  if ([string]::IsNullOrWhiteSpace($url)) { return [ordered]@{ state = 'NOT_RUN'; reason = 'Approved server-side database environment is unavailable.' } }
  $envSnapshot = Snapshot-PostgresProcessEnvironment
  try {
    $parts = Set-PostgresProcessEnvironment -DatabaseUrl $url -ExpectedPort $ExpectedPostgresPort
    # Query A is always safe on a greenfield database: it never references the relation.
    $queryA = (Get-DatabaseEvidenceQueryPlan -MigrationTablePresent:$false)[0].sql
    $output = @(& $databaseVerifier --tuples-only --no-align --command $queryA 2>$null)
    if ($LASTEXITCODE -ne 0) { return [ordered]@{ state = 'CONFLICT'; reason = 'Read-only PostgreSQL verification failed.' } }
    $parsedA = $null
    try {
      $parsedA = Parse-PostgresStructuredEvidence -Lines $output
    } catch {
      return [ordered]@{ state = 'CONFLICT'; reason = 'Structured database evidence parsing failed.' }
    }
    if ($null -eq $parsedA.identity -or $null -eq $parsedA.migrationTable -or $null -eq $parsedA.roleSafety) {
      return [ordered]@{ state = 'CONFLICT'; reason = 'Structured database identity/roleSafety/migrationTable record missing.' }
    }
    $identity = $parsedA.identity
    $roleSafety = $parsedA.roleSafety
    $extensions = @($parsedA.extensions)
    $migrationsPresent = $parsedA.migrationTable.present
    if ($identity.database -cne $ExpectedDatabase -or $identity.role -cne $ExpectedDatabaseRole -or [int]$parts.port -ne $ExpectedPostgresPort) {
      return [ordered]@{ state = 'CONFLICT'; database = $identity.database; role = $identity.role; port = $parts.port; reason = 'Actual database/role/port does not match reviewed expectations.' }
    }
    $summary = [pscustomobject]@{ unfinished = 0; rolledBack = 0 }
    $summaryVerified = $false
    if ($migrationsPresent) {
      # Query B is only constructed/executed after Query A proved the relation exists.
      $queryB = (Get-DatabaseEvidenceQueryPlan -MigrationTablePresent:$true)[1].sql
      $summaryOutput = @(& $databaseVerifier --tuples-only --no-align --command $queryB 2>$null)
      if ($LASTEXITCODE -eq 0) {
        try {
          $parsedB = Parse-PostgresStructuredEvidence -Lines $summaryOutput
          if ($null -ne $parsedB.migrationSummary) {
            $summary = $parsedB.migrationSummary
            $summaryVerified = $true
          }
        } catch {}
      }
    }
    $foreignIsolation = @()
    $foreignIsolationRequested = $RequireForeignDatabaseIsolation -or $KnownForeignDatabase.Count -gt 0
    if ($foreignIsolationRequested -and $KnownForeignDatabase.Count -eq 0) { throw 'Reviewed foreign database names are required for requested cross-database isolation evidence.' }
    foreach ($foreignDatabase in @(if ($foreignIsolationRequested) { $KnownForeignDatabase } else { @() })) {
      $foreignQuery = Get-ForeignDatabaseIsolationQuery -DatabaseName $foreignDatabase
      $foreignOutput = @(& $databaseVerifier --tuples-only --no-align --command $foreignQuery 2>$null)
      $foreignRecord = [pscustomobject][ordered]@{ database = $foreignDatabase; existence = 'MISSING'; state = 'NOT_VERIFIED' }
      if ($LASTEXITCODE -eq 0) {
        try {
          $parsedForeign = Parse-PostgresStructuredEvidence -Lines $foreignOutput
          $foreignRecord = ConvertTo-ReviewedForeignDatabaseEvidence -RequestedDatabase $foreignDatabase -ParsedEvidence $parsedForeign
        } catch {
          $foreignRecord = [pscustomobject][ordered]@{ database = $foreignDatabase; existence = 'MISSING'; state = 'NOT_VERIFIED' }
        }
      }
      $foreignIsolation += $foreignRecord
    }
    $classification = Get-DatabaseEvidenceClassification `
      -ActualDatabase $identity.database `
      -ExpectedDatabase $ExpectedDatabase `
      -ActualRole $identity.role `
      -ExpectedRole $ExpectedDatabaseRole `
      -ActualExtensions $extensions `
      -RequiredExtensions $RequiredDatabaseExtension `
      -MigrationTablePresent $migrationsPresent `
      -UnfinishedMigrations $summary.unfinished `
      -RolledBackMigrations $summary.rolledBack `
      -MigrationSummaryVerified $summaryVerified `
      -RoleSafetyVerified:$true `
      -RoleIsSuperuser:$roleSafety.superuser `
      -RoleCanCreateDatabase:$roleSafety.createDatabase `
      -RoleCanCreateRole:$roleSafety.createRole `
      -RoleCanReplicate:$roleSafety.replication `
      -RoleBypassesRls:$roleSafety.bypassRls `
      -DirectMembershipCount $roleSafety.directMembershipCount `
      -RequireForeignIsolation:$foreignIsolationRequested `
      -ForeignIsolation $foreignIsolation `
      -KnownForeignDatabaseRole $KnownForeignDatabaseRole
    $classification.database = $identity.database
    $classification.role = $identity.role
    $classification.port = $parts.port
    $classification.extensions = $extensions
    $classification.roleClusterSafety = [ordered]@{
      state = if (-not ($roleSafety.superuser -or $roleSafety.createDatabase -or $roleSafety.createRole -or $roleSafety.replication -or $roleSafety.bypassRls -or $roleSafety.directMembershipCount -gt 0)) { 'PASS' } else { 'CONFLICT' }
      superuser = $roleSafety.superuser
      createDatabase = $roleSafety.createDatabase
      createRole = $roleSafety.createRole
      replication = $roleSafety.replication
      bypassRls = $roleSafety.bypassRls
      directMembershipCount = $roleSafety.directMembershipCount
    }
    $classification.foreignDatabaseIsolation = $foreignIsolation
    $classification.migrationsTablePresent = $migrationsPresent
    $classification.migrationSummary = [ordered]@{ unfinished = $summary.unfinished; rolledBack = $summary.rolledBack }
    return $classification
  } finally {
    Restore-PostgresProcessEnvironment -Snapshot $envSnapshot
  }
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
$repositoryRoot = Get-CanonicalPath (Join-Path $PSScriptRoot '..\..\..')
$reviewedNginxRoots = if ([string]::IsNullOrWhiteSpace($NginxPrefix)) { @() } else { @((Get-CanonicalPath $NginxPrefix)) }
$additionalProtectedRoots = @()
if (-not [string]::IsNullOrWhiteSpace($ReviewedPostgresDataDirectory)) {
  $canonicalPgData = Get-CanonicalPath $ReviewedPostgresDataDirectory
  $pgDataState = Get-PathSecurityClassification -Path $canonicalPgData -Kind directory
  if ($pgDataState.state -eq 'REPARSE_POINT') { throw 'POSTGRES_DATA_DIRECTORY_REPARSE_POINT' }
  Assert-PathAncestorChainNonReparse -Directory $canonicalPgData -CategoryPrefix 'POSTGRES_DATA_DIRECTORY' | Out-Null
  $additionalProtectedRoots += $canonicalPgData
} elseif ($RequireReviewedIsolation) {
  throw 'ReviewedPostgresDataDirectory is required under reviewed isolation.'
}
$operatorProtectedLeaves = @($EnvFile,$StartupWrapper,$ExpectedEntryPoint,$NodeExe,$NpmExe,$NpxExe,$PsqlExe,$PgDumpExe,$PgRestoreExe,$NginxExe,$NginxConfig)
$reviewedPsql = if ([string]::IsNullOrWhiteSpace($PsqlExe)) { $null } else { Assert-ExactPsqlExecutable -Path $PsqlExe }
$databaseVerifier = Resolve-DatabaseVerifierExecutable -VerifyDatabase:$VerifyDatabase -PsqlExe $PsqlExe
$canonicalReport = Assert-OperatorEvidenceReportPath -ReportPath $ReportPath -CandidateRoot $canonicalRoot -RepositoryRoot $repositoryRoot -NginxRoot $reviewedNginxRoots -KnownForeignRoot $KnownForeignRoot -AdditionalProtectedRoot $additionalProtectedRoots -ProtectedLeaf $operatorProtectedLeaves
$directoryPaths = @($canonicalRoot,'releases','staging','incoming','shared','logs','backups' | ForEach-Object { if ($_ -eq $canonicalRoot) { $_ } else { Join-Path $canonicalRoot $_ } })
Assert-PreflightRuntimeKindSupported -RequireReviewedIsolation:$RequireReviewedIsolation -ServiceKind $ServiceKind
$candidateRuntimeName = Resolve-ExpectedCandidateRuntimeName -ServiceKind $ServiceKind -ExpectedTaskName $ExpectedTaskName -ExpectedServiceName $ExpectedServiceName -RequireReviewedIsolation:$RequireReviewedIsolation
$candidateNames = if ($RequireReviewedIsolation) { @($candidateRuntimeName) } else { @(@($ExpectedTaskName,$ExpectedServiceName) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) }
$isolation = Get-ProtectedNeighborIsolationEvidence -CandidateRoot $canonicalRoot -KnownForeignRoot $KnownForeignRoot -CandidateName $candidateNames -KnownForeignName $KnownForeignName -RequireReviewedInputs:$RequireReviewedIsolation
$identityStatus = 'REQUIRES_REVIEW'
if ($RequireVerifiedIdentity) {
  if ([string]::IsNullOrWhiteSpace($ExpectedTaskName) -and [string]::IsNullOrWhiteSpace($ExpectedServiceName)) { throw 'Verified identity requires an exact task or service name.' }
  if ([string]::IsNullOrWhiteSpace($NodeExe)) { throw 'Verified identity requires an exact NodeExe.' }
  Get-ReviewedExecutableSnapshot -Role node -Path $NodeExe | Out-Null
  if (-not [string]::IsNullOrWhiteSpace($NginxExe)) { Get-ReviewedExecutableSnapshot -Role nginx -Path $NginxExe | Out-Null }
  $identityServiceName = if ($ServiceKind -eq 'service') { $ExpectedServiceName } else { $ExpectedTaskName }
  $identity = Read-DeploymentIdentity -Root $canonicalRoot -ServiceKind $ServiceKind -ServiceName $identityServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint -NodeExe $NodeExe -NginxExe $NginxExe -NginxConfig $NginxConfig
  $markerPrefix = $identity.marker.foreignIsolation.reviewedNginxPrefix
  if ([string]::IsNullOrWhiteSpace($NginxPrefix) -or (Normalize-ComparablePath $NginxPrefix) -ne (Normalize-ComparablePath $markerPrefix)) {
    throw 'Deployment identity marker Nginx prefix mismatch.'
  }
  Assert-VerifiedRuntimeIdentity -Marker $identity.marker -ServiceKind $ServiceKind -ServiceName $identityServiceName | Out-Null
  $identityStatus = 'EXISTS AND VERIFIED'
}
$report = [ordered]@{
  generatedAtUtc = [DateTime]::UtcNow.ToString('o')
  identity = [ordered]@{ hostname = $env:COMPUTERNAME; user = "$env:USERDOMAIN\$env:USERNAME"; powershell = $PSVersionTable.PSVersion.ToString(); architecture = $env:PROCESSOR_ARCHITECTURE; windows = (Get-CimInstance Win32_OperatingSystem).Caption; candidateRoot = $canonicalRoot; status = $identityStatus }
  ssh = Get-SshSnapshot
  tools = @(
    (Get-ReviewedExecutableSnapshot -Role node -Path $NodeExe), (Get-ReviewedExecutableSnapshot -Role npm -Path $NpmExe), (Get-ReviewedExecutableSnapshot -Role npx -Path $NpxExe),
    (Get-ReviewedExecutableSnapshot -Role nginx -Path $NginxExe), (Get-ReviewedExecutableSnapshot -Role psql -Path $PsqlExe -SkipVersion:(-not $VerifyDatabase)), (Get-ReviewedExecutableSnapshot -Role pg_dump -Path $PgDumpExe), (Get-ReviewedExecutableSnapshot -Role pg_restore -Path $PgRestoreExe)
  )
  discoveryTools = @('git','node','npm','npx','nginx','psql','pg_dump','pg_restore' | ForEach-Object { Get-CommandSnapshot $_ })
  authenticatedDatabasePsql = if ($databaseVerifier) { [ordered]@{ reviewedPath = $reviewedPsql; exactPath = $databaseVerifier; state = 'USED FOR VERIFICATION' } } elseif ($reviewedPsql) { [ordered]@{ reviewedPath = $reviewedPsql; exactPath = $null; state = 'REVIEWED NOT USED' } } else { [ordered]@{ state = 'NOT_PROVIDED' } }
  listeners = @(
    (Get-ListenerSnapshot 80), (Get-ListenerSnapshot 443), (Get-ListenerSnapshot 3100), (Get-ListenerSnapshot $ExpectedPostgresPort)
  )
  directories = @($directoryPaths | ForEach-Object { Get-DirectorySnapshot $_ })
  scheduledTask = Get-TaskSnapshot $ExpectedTaskName
  service = Get-ServiceSnapshot $ExpectedServiceName
  nginx = Get-NginxSnapshot
  database = Get-DatabaseSnapshot
  dnsTlsHttp = if ($VerifyPublicEndpoint) { Get-TlsHttpSnapshot } else { [ordered]@{ state = 'NOT_RUN'; reason = 'Explicit operator authorization for the public endpoint probe was not supplied.' } }
  isolation = [ordered]@{ mode = if ($RequireReviewedIsolation) { 'VERIFIED_FIRST_DEPLOY' } else { 'DISCOVERY_COMPATIBILITY' }; foreignInputs = $isolation.foreignInputs; status = $isolation.status; conflictType = if ($isolation.Contains('conflictType')) { $isolation.conflictType } else { $null }; note = 'Compare normalized paths, ports, tasks, services and process identities against DamSanV5 and boarding-management without exporting unrelated command lines.' }
}
$json = $report | ConvertTo-Json -Depth 12
if ($json -match '(?i)postgres(?:ql)?://[^\s"'']+:[^\s"'']+@|BEGIN .*PRIVATE KEY|PGPASSWORD=|DATABASE_URL=|"arguments(?:Redacted)?"\s*:|"pathName(?:Redacted)?"\s*:') { throw 'Inventory report redaction failed.' }
$canonicalReport = Assert-OperatorEvidenceReportPath -ReportPath $canonicalReport -CandidateRoot $canonicalRoot -RepositoryRoot $repositoryRoot -NginxRoot $reviewedNginxRoots -KnownForeignRoot $KnownForeignRoot -AdditionalProtectedRoot $additionalProtectedRoots -ProtectedLeaf $operatorProtectedLeaves
[IO.File]::WriteAllText($canonicalReport, $json, [Text.UTF8Encoding]::new($false))
Write-Output $json
