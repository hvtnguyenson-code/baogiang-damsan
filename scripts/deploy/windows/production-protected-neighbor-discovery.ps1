[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$ReportPath,
  [string]$CandidateBaoGiangRoot = 'C:\baogiang',
  [ValidateRange(1,65535)][int]$CandidateBaoGiangPort = 3100,
  [ValidateRange(1,65535)][int]$ExpectedPostgresPort = 5433,
  [string]$NginxRoot = 'C:\nginx'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')

function Get-Sha256([string]$Text) { ([BitConverter]::ToString(([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-','')).ToLowerInvariant() }
function Get-SafePathHints([string]$Text) { if ([string]::IsNullOrWhiteSpace($Text)) { return @() }; @([regex]::Matches($Text, '(?i)(?:[A-Z]:\\[^"''\r\n<>|?*]+?\.(?:js|cjs|mjs|ps1|cmd|bat|exe))') | ForEach-Object { $_.Value.Trim('"') } | Select-Object -Unique) }
function Test-ApplicationPath([string]$Path) { [IO.Path]::IsPathRooted($Path) -and $Path -notmatch '(?i)^C:\\Windows(?:\\|$)' }
function Get-ProcessRecord($Process, $Ports) { [ordered]@{ pid=[int]$Process.ProcessId; parentPid=[int]$Process.ParentProcessId; executablePath=$Process.ExecutablePath; executableName=if($Process.ExecutablePath){[IO.Path]::GetFileName($Process.ExecutablePath)}else{$Process.Name}; commandLineSha256=Get-Sha256 ([string]$Process.CommandLine); listeningPorts=@($Ports | Where-Object { $_.OwningProcess -eq $Process.ProcessId } | Select-Object -ExpandProperty LocalPort -Unique); safePathHints=@(Get-SafePathHints ([string]$Process.CommandLine)) } }
function Get-ListenersForPort([int]$Port, $Processes) {
  try { $rows=@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop) } catch { return [ordered]@{state='NOT_VERIFIED';listeners=@()} }
  $items=@($rows | ForEach-Object { $listener=$_; $process=$Processes | Where-Object { $_.ProcessId -eq $listener.OwningProcess } | Select-Object -First 1; if($process){$record=Get-ProcessRecord $process $rows;$record.localAddress=$listener.LocalAddress;$record}else{[ordered]@{pid=[int]$listener.OwningProcess;localAddress=$listener.LocalAddress;state='PROCESS_NOT_READABLE'}} })
  [ordered]@{state=if($items.Count){'OCCUPIED'}else{'FREE'};listeners=$items}
}
function Get-CandidateTasks {
  $protectedKeywords='damsan|noi\s*tru|noi-tru|noitru|boarding|quan'; $runtimes='^(?i)(node|node\.exe|npm|npm\.cmd|npx|npx\.cmd|powershell|powershell\.exe|pwsh|pwsh\.exe|cmd|cmd\.exe|nssm|nssm\.exe|winsw|winsw\.exe)$'
  @((Get-ScheduledTask -ErrorAction SilentlyContinue) | ForEach-Object {
    $task=$_; $actions=@($task.Actions | Where-Object { $_.PSObject.Properties.Name -contains 'Execute' }); $tags=@()
    foreach($action in $actions) { $execute=[string]$action.Execute; $arguments=if($action.PSObject.Properties.Name -contains 'Arguments'){[string]$action.Arguments}else{''}; $workingDirectory=if($action.PSObject.Properties.Name -contains 'WorkingDirectory'){[string]$action.WorkingDirectory}else{''}; $hints=@(Get-SafePathHints ($arguments+' '+$workingDirectory+' '+$execute)); if(($task.TaskName+' '+$task.TaskPath+' '+$execute+' '+$arguments+' '+$workingDirectory) -match $protectedKeywords){$tags+='protected-keyword'}; if(@($hints | Where-Object { Test-ApplicationPath $_ }).Count){$tags+='application-path-hint'}; if(Test-ApplicationPath $workingDirectory){$tags+='application-working-directory'}; if((($execute -split '[\\/]')[-1] -match $runtimes) -and @($hints | Where-Object { Test-ApplicationPath $_ }).Count){$tags+='runtime-with-application-path'} }
    if($tags.Count){[ordered]@{taskName=$task.TaskName;taskPath=$task.TaskPath;state=$task.State.ToString();principalUserId=$task.Principal.UserId;actions=@($actions | ForEach-Object {[ordered]@{execute=$_.Execute;workingDirectory=$_.WorkingDirectory;argumentsSha256=Get-Sha256 ([string]$_.Arguments);safePathHints=@(Get-SafePathHints (([string]$_.Arguments)+' '+([string]$_.WorkingDirectory)+' '+([string]$_.Execute)))}});reasonTags=@($tags|Select-Object -Unique)}}
  })
}
function Get-CandidateServices($Processes, $ApplicationProcessIds) {
  $keywords='damsan|noi\s*tru|noi-tru|noitru|boarding|quan'; $runtimeNames='^(?i)(node|nssm|winsw)(\.exe)?$'
  @((Get-CimInstance Win32_Service -ErrorAction SilentlyContinue) | ForEach-Object {
    $service=$_; $hints=@(Get-SafePathHints ([string]$service.PathName)); $executable=if($hints.Count){$hints[0]}else{$null}; $tags=@()
    if(($service.Name+' '+$service.DisplayName+' '+($hints -join ' ')) -match $keywords){$tags+='protected-keyword'}
    if($executable -and [IO.Path]::GetFileName($executable) -match $runtimeNames){$tags+='application-runtime'}
    if($ApplicationProcessIds -contains [int]$service.ProcessId){$tags+='discovered-application-process'}
    if($tags.Count){[ordered]@{name=$service.Name;displayName=$service.DisplayName;state=$service.State;startMode=$service.StartMode;startName=$service.StartName;processId=[int]$service.ProcessId;executablePath=$executable;pathNameSha256=Get-Sha256 ([string]$service.PathName);safePathHints=$hints;reasonTags=@($tags|Select-Object -Unique)}}
  })
}
function ConvertTo-SafeProxyUpstream([string]$Value) { $match=[regex]::Match($Value.Trim(), '^(?i)(https?)://([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(?::(\d+))?/?$'); if(-not $match.Success){return $null}; [ordered]@{scheme=$match.Groups[1].Value.ToLowerInvariant();host=$match.Groups[2].Value;port=if($match.Groups[3].Success){[int]$match.Groups[3].Value}else{$null}} }
function Get-NginxCommandArgument([string]$CommandLine,[string]$Name) {
  $match=[regex]::Match($CommandLine,"(?i)(?:^|\s)-$Name(?:\s+|=)(?:`"([^`"]+)`"|'([^']+)'|([^\s]+))")
  if(-not $match.Success){return $null};foreach($index in 1..3){if($match.Groups[$index].Success){return $match.Groups[$index].Value}};return $null
}
function Get-NginxDiscovery($Processes, $Ports, [string]$RootHint) {
  $nginx = @($Processes | Where-Object { $_.Name -ieq 'nginx.exe' })
  $candidates = [Collections.Generic.List[object]]::new()
  foreach ($process in $nginx) {
    if ([string]::IsNullOrWhiteSpace([string]$process.ExecutablePath)) { continue }
    try {
      $exe = Get-CanonicalPath $process.ExecutablePath
      if ((Split-Path -Leaf $exe) -ine 'nginx.exe') { continue }
      $cmdLine = [string]$process.CommandLine
      $prefixArg = Get-NginxCommandArgument $cmdLine 'p'
      $configArg = Get-NginxCommandArgument $cmdLine 'c'
      $exeDir = Split-Path -Parent $exe
      if ([string]::IsNullOrWhiteSpace($prefixArg)) {
        $candidates.Add([pscustomobject][ordered]@{
          state = 'NOT_VERIFIED'
          reason = 'NGINX_DISCOVERY_PREFIX_NOT_PROVEN'
          processId = [int]$process.ProcessId
          executablePath = $exe
          executableDirectoryHint = $exeDir
          configPathHint = if ($configArg) { $configArg } else { $null }
          rootHint = $RootHint
          commandLineSha256 = Get-Sha256 $cmdLine
        })
        continue
      }
      if (-not [IO.Path]::IsPathRooted($prefixArg)) {
        $candidates.Add([pscustomobject][ordered]@{
          state = 'NOT_VERIFIED'
          reason = 'NGINX_DISCOVERY_RELATIVE_PREFIX_UNPROVEN'
          processId = [int]$process.ProcessId
          executablePath = $exe
          executableDirectoryHint = $exeDir
          configPathHint = if ($configArg) { $configArg } else { $null }
          rootHint = $RootHint
          commandLineSha256 = Get-Sha256 $cmdLine
        })
        continue
      }
      $prefix = Get-CanonicalPath $prefixArg
      $config = if ($configArg) {
        if ([IO.Path]::IsPathRooted($configArg)) { Get-CanonicalPath $configArg } else { Get-CanonicalPath (Join-Path $prefix $configArg) }
      } else {
        Get-CanonicalPath (Join-Path $prefix 'conf\nginx.conf')
      }
      if (-not (Test-PathWithin $config $prefix)) { throw 'NGINX_DISCOVERY_CONFIG_OUTSIDE_PREFIX' }
      $candidates.Add([pscustomobject][ordered]@{
        executablePath = $exe
        prefix = $prefix
        configPath = $config
        prefixSource = 'EXPLICIT_PROCESS_ARGUMENT'
        configSource = if ($configArg) { 'PROCESS_ARGUMENT' } else { 'PREFIX_DEFAULT_DISCOVERY' }
      })
    } catch {
      $candidates.Add([pscustomobject][ordered]@{
        state = 'NOT_VERIFIED'
        reason = $_.Exception.Message
        processId = [int]$process.ProcessId
      })
    }
  }
  $valid = @($candidates | Where-Object { $_.PSObject.Properties.Name -contains 'prefix' })
  $keys = @($valid | ForEach-Object { "$($_.executablePath)|$($_.prefix)|$($_.configPath)" } | Select-Object -Unique)
  if ($keys.Count -ne 1) {
    return [ordered]@{
      state = if ($keys.Count -gt 1) { 'AMBIGUOUS' } else { 'NOT_VERIFIED' }
      authority = 'DISCOVERY'
      rootHint = $RootHint
      candidateBindings = @($candidates)
      configFiles = @()
      serverBlocks = @()
      discoveredRootCandidates = @($valid | ForEach-Object { $_.prefix } | Select-Object -Unique)
      processes = @($nginx | ForEach-Object { Get-ProcessRecord $_ $Ports })
    }
  }
  $binding = $valid[0]; $canonicalRoot = $binding.prefix; $exe = $binding.executablePath; $config = $binding.configPath
  $files = [Collections.Generic.List[object]]::new(); $serverBlocks = [Collections.Generic.List[object]]::new(); $roots = [Collections.Generic.List[string]]::new(); $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  function Read-NginxConfig([string]$Path) {
    try {
      $full = Assert-SafeDiscoveryReadPath -Path $Path -Kind file -AllowedRoot @($canonicalRoot)
    } catch {
      $category = if ($_.Exception.Message -match 'REPARSE') { 'REPARSE_NOT_READ' } else { 'INVALID_NOT_READ' }
      $files.Add([ordered]@{ configFile = $Path; state = $category })
      return
    }
    if (-not $seen.Add($full)) { return }
    $files.Add([ordered]@{ configFile = $full; state = 'DISCOVERY_READ' })
    $lineNumber = 0; $depth = 0; $current = $null
    foreach ($line in Get-Content -LiteralPath $full) {
      $lineNumber++
      if ($line -match '^\s*server\s*\{') {
        $current = [ordered]@{ configFile = $full; startLine = $lineNumber; listens = @(); serverNames = @(); rootsAliases = @(); proxyUpstreams = @(); sslCertificates = @() }
        $serverBlocks.Add($current); $depth = 1; continue
      }
      if ($current) {
        if ($line -match '^\s*listen\s+([^;]+);') { $current.listens += $Matches[1].Trim() }
        if ($line -match '^\s*server_name\s+([^;]+);') { $current.serverNames += @($Matches[1].Trim() -split '\s+') }
        if ($line -match '^\s*(root|alias)\s+([^;]+);') {
          $value = $Matches[2].Trim()
          if ([IO.Path]::IsPathRooted($value)) { $current.rootsAliases += $value; $roots.Add($value) }
        }
        if ($line -match '^\s*proxy_pass\s+([^;]+);') {
          $upstream = ConvertTo-SafeProxyUpstream $Matches[1]
          if ($upstream) { $current.proxyUpstreams += $upstream } else { $current.proxyUpstreams += [ordered]@{ state = 'NOT_VERIFIED'; valueSha256 = Get-Sha256 $Matches[1] } }
        }
        if ($line -match '^\s*ssl_certificate\s+([^;]+);') {
          $certificate = $Matches[1].Trim()
          if ([IO.Path]::IsPathRooted($certificate)) { $current.sslCertificates += [IO.Path]::GetFullPath($certificate) }
        }
        $depth += ([regex]::Matches($line,'\{').Count - [regex]::Matches($line,'\}').Count)
        if ($depth -le 0) { $current = $null }
      }
      if ($line -match '^\s*include\s+([^;]+);') {
        $pattern = $Matches[1].Trim()
        $candidate = if ([IO.Path]::IsPathRooted($pattern)) { $pattern } else { Join-Path $canonicalRoot $pattern }
        $includeDirectory = Split-Path $candidate -Parent
        try {
          Assert-SafeDiscoveryReadPath -Path $includeDirectory -Kind directory -AllowedRoot @($canonicalRoot) | Out-Null
          foreach ($included in Get-ChildItem -Path $candidate -File -ErrorAction SilentlyContinue) { Read-NginxConfig $included.FullName }
        } catch {
          $files.Add([ordered]@{ configFile = $candidate; state = if ($_.Exception.Message -match 'REPARSE') { 'REPARSE_NOT_READ' } else { 'INVALID_NOT_READ' } })
        }
      }
    }
  }
  Read-NginxConfig $config
  $version = 'NOT_EXECUTED'
  [ordered]@{
    state = 'PARTIAL'
    authority = 'DISCOVERY'
    parserState = 'DISCOVERY'
    root = $canonicalRoot
    rootHint = $RootHint
    executablePath = $exe
    executableState = if (Test-Path -LiteralPath $exe -PathType Leaf) { 'EXISTS' } else { 'MISSING' }
    version = $version
    configPath = $config
    configFiles = @($files)
    serverBlocks = @($serverBlocks)
    discoveredRootCandidates = @(@($canonicalRoot) + @($roots) | Select-Object -Unique)
    candidateBindings = @($candidates)
    processes = @($nginx | ForEach-Object { Get-ProcessRecord $_ $Ports })
  }
}
function Get-PostgresDiscovery($Processes, $Ports, [int]$Port) {
  $postgres = @($Processes | Where-Object { $_.Name -ieq 'postgres.exe' })
  $exe = @($postgres | ForEach-Object { $_.ExecutablePath } | Where-Object { $_ } | Select-Object -First 1)
  $executable = if ($exe.Count) { $exe[0] } else { 'C:\Program Files\PostgreSQL\17\bin\postgres.exe' }
  $directories = @($postgres | ForEach-Object {
    $match = [regex]::Match([string]$_.CommandLine, '(?i)(?:^|\s)-D\s+"?([^"\s]+)')
    if ($match.Success -and [IO.Path]::IsPathRooted($match.Groups[1].Value)) { [IO.Path]::GetFullPath($match.Groups[1].Value) }
  } | Select-Object -Unique)
  $dataDirectory = if ($directories.Count -eq 1) { $directories[0] } else { $null }
  $metadata = [ordered]@{ state = if ($directories.Count -gt 1) { 'CONFLICT' } elseif ($dataDirectory) { 'DISCOVERED' } else { 'NOT_VERIFIED' }; dataDirectory = $dataDirectory }
  if ($dataDirectory) {
    try {
      $safeData = Assert-SafeDiscoveryReadPath -Path $dataDirectory -Kind directory -AllowedRoot @($dataDirectory)
      $config = Assert-SafeDiscoveryReadPath -Path (Join-Path $safeData 'postgresql.conf') -Kind file -AllowedRoot @($safeData)
      $settings = [ordered]@{ state = 'DISCOVERED'; configFile = $config; port = $null; listenAddresses = @(); hbaFile = $null }
      foreach ($line in Get-Content -LiteralPath $config) {
        if ($line -match '^\s*port\s*=\s*(\d+)') { $settings.port = [int]$Matches[1] }
        if ($line -match "^\s*listen_addresses\s*=\s*'?([^'#]+)") { $settings.listenAddresses = @($Matches[1].Trim() -split '\s*,\s*') }
        if ($line -match "^\s*hba_file\s*=\s*'?([^'#]+)") {
          $hba = $Matches[1].Trim()
          $settings.hbaFile = if ([IO.Path]::IsPathRooted($hba)) { Get-CanonicalPath $hba } else { Get-CanonicalPath (Join-Path $safeData $hba) }
        }
      }
      $metadata.config = $settings
    } catch {
      $metadata.state = if ($_.Exception.Message -match 'REPARSE') { 'REPARSE_NOT_READ' } else { 'NOT_VERIFIED' }
      $metadata.config = [ordered]@{ state = $metadata.state }
    }
  }
  $tools = @('psql.exe','pg_dump.exe','pg_restore.exe' | ForEach-Object {
    $tool = Join-Path (Split-Path $executable -Parent) $_
    [ordered]@{ name = $_; path = $tool; state = if (Test-Path -LiteralPath $tool -PathType Leaf) { 'DISCOVERED' } else { 'MISSING' }; version = 'NOT_EXECUTED' }
  })
  [ordered]@{ expectedPort = $Port; executablePath = $executable; processes = @($postgres | ForEach-Object { Get-ProcessRecord $_ $Ports }); portListeners = @($Ports | Where-Object { $_.LocalPort -eq $Port } | ForEach-Object { [ordered]@{ pid = [int]$_.OwningProcess; localAddress = $_.LocalAddress } }); tools = $tools; configMetadata = $metadata; databaseAuthenticationAttempted = $false }
}
$repositoryRoot = Get-CanonicalPath (Join-Path $PSScriptRoot '..\..\..')
$canonicalCandidateRoot = Get-CanonicalPath $CandidateBaoGiangRoot
$canonicalReport = Assert-OperatorEvidenceReportPath -ReportPath $ReportPath -CandidateRoot $canonicalCandidateRoot -RepositoryRoot $repositoryRoot -NginxRoot @($NginxRoot)
$processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
$candidate = Get-ListenersForPort $CandidateBaoGiangPort $processes
$node = @($processes | Where-Object { $_.Name -ieq 'node.exe' })
$nodeRecords = @($node | ForEach-Object { Get-ProcessRecord $_ $listeners })
$applicationProcessIds = @($node | ForEach-Object { [int]$_.ProcessId })
$tasks = Get-CandidateTasks
$services = Get-CandidateServices $processes $applicationProcessIds
$nginx = Get-NginxDiscovery $processes $listeners $NginxRoot
$postgres = Get-PostgresDiscovery $processes $listeners $ExpectedPostgresPort
$roots = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
function Add-Root($Path, $Source) {
  if (Test-ApplicationPath $Path) {
    if (-not $roots.ContainsKey($Path)) { $roots[$Path] = [ordered]@{ path = $Path; evidenceSources = @(); state = 'DISCOVERED_UNVERIFIED' } }
    $roots[$Path].evidenceSources = @($roots[$Path].evidenceSources + $Source | Select-Object -Unique)
  }
}
foreach ($record in $nodeRecords) { foreach ($path in $record.safePathHints) { Add-Root (Split-Path $path -Parent) 'node-safePathHint' } }
foreach ($task in $tasks) {
  foreach ($action in $task.actions) {
    Add-Root $action.workingDirectory 'scheduled-task-workingDirectory'
    foreach ($path in $action.safePathHints) { Add-Root (Split-Path $path -Parent) 'scheduled-task-safePathHint' }
  }
}
foreach ($service in $services) { foreach ($path in $service.safePathHints) { Add-Root (Split-Path $path -Parent) 'service-safePathHint' } }
foreach ($path in $nginx.discoveredRootCandidates) { Add-Root $path 'nginx-root-alias' }
foreach ($directory in Get-ChildItem -LiteralPath 'C:\' -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)damsan|noi|tru|noitru|boarding|quan' }) { Add-Root $directory.FullName 'targeted-c-root-name' }
$windows = try { (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).Caption } catch { 'NOT_VERIFIED' }
$globalNode = 'C:\Program Files\nodejs\node.exe'
$globalNodeCount = @($node | Where-Object { $_.ExecutablePath -eq $globalNode }).Count
$report = [ordered]@{
  schemaVersion = 1
  generatedAtUtc = [DateTime]::UtcNow.ToString('o')
  host = [ordered]@{ name = $env:COMPUTERNAME; windows = $windows }
  candidateBaoGiang = [ordered]@{ root = $CandidateBaoGiangRoot; port = $CandidateBaoGiangPort; portState = $candidate.state; listeners = $candidate.listeners }
  node = [ordered]@{
    globalNode = [ordered]@{ path = $globalNode; version = if (Test-Path -LiteralPath $globalNode) { 'NOT_EXECUTED' } else { 'MISSING' }; runningProcessCountUsingThisExecutable = $globalNodeCount }
    globalNodeInUseByRunningWorkload = ($globalNodeCount -gt 0)
    processes = $nodeRecords
  }
  scheduledTasks = $tasks
  services = $services
  nginx = $nginx
  postgres = $postgres
  protectedRootCandidates = @($roots.Values)
  safety = [ordered]@{ mode = 'READ_ONLY_DISCOVERY'; mutationsPerformed = $false; databaseAuthenticationAttempted = $false }
  conclusion = 'REQUIRES_REVIEW'
}
$json = $report | ConvertTo-Json -Depth 14
if ($json -match '(?i)(postgres(?:ql)?://|DATABASE_URL|PGPASSWORD|bearer\s+\S+|token\s*[=:]\s*\S+|BEGIN .*PRIVATE KEY|"commandline"\s*:|"arguments"\s*:)') { throw 'Secret/privacy redaction check failed.' }
$discoveredNginxRoots = @(@($report.nginx.discoveredRootCandidates) + @($report.nginx.candidateBindings | ForEach-Object { if ($_.PSObject.Properties.Name -contains 'prefix') { $_.prefix } }) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
$discoveredProtectedRoots = @(@($report.protectedRootCandidates | ForEach-Object { $_.path }) + @($discoveredNginxRoots) + @($report.postgres.configMetadata.dataDirectory) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
$canonicalReport = Assert-OperatorEvidenceReportPath -ReportPath $canonicalReport -CandidateRoot $canonicalCandidateRoot -RepositoryRoot $repositoryRoot -NginxRoot @(@($NginxRoot) + @($discoveredNginxRoots) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique) -AdditionalProtectedRoot $discoveredProtectedRoots
[IO.File]::WriteAllText($canonicalReport, $json, [Text.UTF8Encoding]::new($false))
Write-Output $json
