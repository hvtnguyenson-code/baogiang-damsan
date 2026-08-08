[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$ReportPath,
  [string]$CandidateBaoGiangRoot = 'C:\baogiang',
  [ValidateRange(1,65535)][int]$CandidateBaoGiangPort = 3100,
  [ValidateRange(1,65535)][int]$ExpectedPostgresPort = 5433
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Sha256([string]$Text) { ([BitConverter]::ToString(([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-','')).ToLowerInvariant() }
function Get-SafePathHints([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return @() }
  @([regex]::Matches($Text, '(?i)(?:[A-Z]:\\[^"''\r\n<>|?*]+?\.(?:js|cjs|mjs|ps1|cmd|bat|exe))') | ForEach-Object { $_.Value.Trim('"') } | Select-Object -Unique)
}
function Get-ProcessRecord($Process, $Ports) {
  [ordered]@{ pid = [int]$Process.ProcessId; parentPid = [int]$Process.ParentProcessId; executablePath = $Process.ExecutablePath; executableName = [IO.Path]::GetFileName($Process.ExecutablePath); commandLineSha256 = Get-Sha256 ([string]$Process.CommandLine); listeningPorts = @($Ports | Where-Object { $_.OwningProcess -eq $Process.ProcessId } | Select-Object -ExpandProperty LocalPort -Unique); safePathHints = @(Get-SafePathHints ([string]$Process.CommandLine)) }
}
function Get-ListenersForPort([int]$Port, $Processes) {
  try { $rows = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop) } catch { return [ordered]@{ state = 'NOT_VERIFIED'; listeners = @() } }
  $items = @($rows | ForEach-Object { $listener = $_; $p = $Processes | Where-Object { $_.ProcessId -eq $listener.OwningProcess } | Select-Object -First 1; if ($p) { $r = Get-ProcessRecord $p $rows; $r.localAddress = $listener.LocalAddress; $r } else { [ordered]@{ pid = [int]$listener.OwningProcess; localAddress = $listener.LocalAddress; state = 'PROCESS_NOT_READABLE' } } })
  [ordered]@{ state = if ($items.Count -eq 0) { 'FREE' } else { 'OCCUPIED' }; listeners = $items }
}
function Get-CandidateTasks {
  $keywords = 'damsan|noi\s*tru|noi-tru|noitru|boarding|quan|backend|server|api'
  $runtimes = '^(?i)(node|node\.exe|npm|npm\.cmd|npx|npx\.cmd|powershell|powershell\.exe|pwsh|pwsh\.exe|cmd|cmd\.exe|nssm|nssm\.exe|winsw|winsw\.exe)$'
  @((Get-ScheduledTask -ErrorAction SilentlyContinue) | ForEach-Object {
    $task = $_; $actions = @($task.Actions | Where-Object { $_.PSObject.Properties.Name -contains 'Execute' }); $tags = @()
    foreach ($action in $actions) { $e = [string]$action.Execute; $a = if($action.PSObject.Properties.Name -contains 'Arguments'){[string]$action.Arguments}else{''}; $w = if($action.PSObject.Properties.Name -contains 'WorkingDirectory'){[string]$action.WorkingDirectory}else{''}; $leaf = ($e -split '[\\/]')[-1]; if ((($task.TaskName + ' ' + $task.TaskPath + ' ' + $e + ' ' + $a + ' ' + $w) -match $keywords)) { $tags += 'keyword-evidence' }; if ($leaf -match $runtimes -and ($a + ' ' + $w) -notmatch '(?i)windows\\system32') { $tags += 'application-runtime-evidence' } }
    if ($tags.Count -gt 0) { [ordered]@{ taskName=$task.TaskName; taskPath=$task.TaskPath; state=$task.State.ToString(); principalUserId=$task.Principal.UserId; actions=@($actions | ForEach-Object { [ordered]@{ execute=$_.Execute; workingDirectory=$_.WorkingDirectory; argumentsSha256=Get-Sha256 ([string]$_.Arguments); safePathHints=@(Get-SafePathHints (([string]$_.Arguments)+' '+([string]$_.WorkingDirectory))) } }); reasonTags=@($tags | Select-Object -Unique) } }
  })
}
function Get-CandidateServices($Processes, $Ports) {
  $keywords = 'damsan|noi\s*tru|noi-tru|noitru|boarding|quan|backend|server|api'
  @((Get-CimInstance Win32_Service -ErrorAction SilentlyContinue) | ForEach-Object {
    $s=$_; $hint=@(Get-SafePathHints ([string]$s.PathName)); $exe=if($hint.Count){$hint[0]}else{$null}; $runtime=if($exe){[IO.Path]::GetFileName($exe) -match '^(?i)(node|nssm|winsw)(\.exe)?$'}else{$false}; $related=$Processes | Where-Object { $_.ProcessId -eq $s.ProcessId } | Select-Object -First 1
    if ((($s.Name+' '+$s.DisplayName+' '+($hint -join ' ')) -match $keywords) -or $runtime -or $related) { [ordered]@{ name=$s.Name; displayName=$s.DisplayName; state=$s.State; startMode=$s.StartMode; startName=$s.StartName; processId=[int]$s.ProcessId; executablePath=$exe; pathNameSha256=Get-Sha256 ([string]$s.PathName); safePathHints=@($hint) } }
  })
}
function Get-NginxDiscovery($Processes) {
  $root='C:\nginx'; $nginx=@($Processes | Where-Object { $_.Name -ieq 'nginx.exe' }); $exe=if($nginx.Count){$nginx[0].ExecutablePath}else{Join-Path $root 'nginx.exe'}; $config=$null
  foreach($p in $nginx){$m=[regex]::Match([string]$p.CommandLine,'(?i)(?:^|\s)-c\s+"?([^"\s]+)');if($m.Success){$config=$m.Groups[1].Value;break}}
  if(-not $config){$config=Join-Path $root 'conf\nginx.conf'}
  $directives=[Collections.Generic.List[object]]::new(); $roots=[Collections.Generic.List[string]]::new(); $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  function Read-NginxConfig([string]$Path) {
    $full=[IO.Path]::GetFullPath($Path); if(-not $full.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){ $directives.Add([ordered]@{configFile=$full;state='OUTSIDE_NGINX_ROOT_NOT_READ'});return }; if(-not (Test-Path -LiteralPath $full -PathType Leaf) -or -not $seen.Add($full)){return}
    $lineNo=0; foreach($line in Get-Content -LiteralPath $full){$lineNo++;if($line -match '^\s*(include|listen|server_name|proxy_pass|root|alias|ssl_certificate)\s+(.+?);\s*$'){ $name=$Matches[1];$value=$Matches[2].Trim();if($name -eq 'include'){foreach($f in Get-ChildItem -Path (Join-Path (Split-Path $full) $value) -File -ErrorAction SilentlyContinue){Read-NginxConfig $f.FullName}};if($name -in @('root','alias')){$roots.Add($value)};$directives.Add([ordered]@{configFile=$full;lineNumber=$lineNo;directive=$name;value='<redacted>';valueSha256=Get-Sha256 $value})}}
  }
  if(Test-Path -LiteralPath $config -PathType Leaf){Read-NginxConfig $config}
  $version='MISSING';if(Test-Path -LiteralPath $exe -PathType Leaf){try{$version=(& $exe -v 2>&1 | Select-Object -First 1).ToString()}catch{$version='NOT_VERIFIED'}}
  [ordered]@{ root=$root; executablePath=$exe; executableState=if(Test-Path -LiteralPath $exe -PathType Leaf){'EXISTS'}else{'MISSING'}; version=$version; configPath=$config; directives=@($directives); discoveredRootCandidates=@($roots|Select-Object -Unique); processes=@($nginx|ForEach-Object{Get-ProcessRecord $_ @()}) }
}
function Get-PostgresDiscovery($Processes, $Ports, [int]$Port) {
  $pg=@($Processes|Where-Object{$_.Name -ieq 'postgres.exe'});$primary=$pg|Select-Object -First 1;$exe=if($primary -and -not [string]::IsNullOrWhiteSpace([string]$primary.ExecutablePath)){$primary.ExecutablePath}else{'C:\Program Files\PostgreSQL\17\bin\postgres.exe'};$bin=Split-Path $exe;$dataDirectory=$null
  if($primary){$match=[regex]::Match([string]$primary.CommandLine,'(?i)(?:^|\s)-D\s+"?([^"\s]+)');if($match.Success -and [IO.Path]::IsPathRooted($match.Groups[1].Value)){$dataDirectory=$match.Groups[1].Value}}
  $tools=@();foreach($name in @('psql.exe','pg_dump.exe','pg_restore.exe')){$path=Join-Path $bin $name;$tools+=[ordered]@{name=$name;path=$path;state=if(Test-Path -LiteralPath $path -PathType Leaf){'EXISTS'}else{'MISSING'};version=if(Test-Path -LiteralPath $path -PathType Leaf){try{(& $path --version|Select-Object -First 1).ToString()}catch{'NOT_VERIFIED'}}else{'MISSING'}}}
  $configMetadata=$null;if($dataDirectory -and (Test-Path -LiteralPath $dataDirectory -PathType Container)){$config=Join-Path $dataDirectory 'postgresql.conf';if(Test-Path -LiteralPath $config -PathType Leaf){$settings=@{};foreach($line in Get-Content -LiteralPath $config){if($line -match '^\s*(port|listen_addresses|config_file|hba_file)\s*=\s*([^#]+)'){$settings[$Matches[1]]='<redacted>'}};$configMetadata=[ordered]@{dataDirectory=$dataDirectory;configFile=$config;settings=$settings}}}
  [ordered]@{ expectedPort=$Port; executablePath=$exe; executableState=if(Test-Path -LiteralPath $exe -PathType Leaf){'EXISTS'}else{'MISSING'}; binDirectory=$bin; portListeners=@($Ports|Where-Object{$_.LocalPort -eq $Port}|ForEach-Object{[ordered]@{pid=[int]$_.OwningProcess;localAddress=$_.LocalAddress}}); processes=@($pg|ForEach-Object{Get-ProcessRecord $_ $Ports}); tools=$tools; configMetadata=$configMetadata; services=@(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue|Where-Object{$_.PathName -match '(?i)postgres'}|ForEach-Object{[ordered]@{name=$_.Name;state=$_.State;processId=[int]$_.ProcessId}}); databaseAuthenticationAttempted=$false }
}
$reportDir=Split-Path -Parent ([IO.Path]::GetFullPath($ReportPath));if(-not(Test-Path -LiteralPath $reportDir -PathType Container)){throw 'Report directory must already exist.'}
$processes=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue);$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue);$candidate=Get-ListenersForPort $CandidateBaoGiangPort $processes;$node=@($processes|Where-Object{$_.Name -ieq 'node.exe'});$global='C:\Program Files\nodejs\node.exe';$nodeRecords=@($node|ForEach-Object{Get-ProcessRecord $_ $listeners});$tasks=Get-CandidateTasks;$services=Get-CandidateServices $processes $listeners;$nginx=Get-NginxDiscovery $processes;$postgres=Get-PostgresDiscovery $processes $listeners $ExpectedPostgresPort
$roots=[Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase);function Add-Root($Path,$Source){if($Path -and [IO.Path]::IsPathRooted($Path)){if(-not $roots.ContainsKey($Path)){$roots[$Path]=[ordered]@{path=$Path;evidenceSources=@();state='DISCOVERED_UNVERIFIED'}};$roots[$Path].evidenceSources+= $Source}}
foreach($n in $nodeRecords){foreach($p in $n.safePathHints){Add-Root (Split-Path $p -Parent) 'node-safePathHint'}};foreach($t in $tasks){foreach($a in $t.actions){Add-Root $a.workingDirectory 'scheduled-task-workingDirectory';foreach($p in $a.safePathHints){Add-Root (Split-Path $p -Parent) 'scheduled-task-safePathHint'}}};foreach($s in $services){foreach($p in $s.safePathHints){Add-Root (Split-Path $p -Parent) 'service-safePathHint'}};foreach($r in $nginx.discoveredRootCandidates){Add-Root $r 'nginx-root-alias'};foreach($d in Get-ChildItem -LiteralPath 'C:\' -Directory -ErrorAction SilentlyContinue|Where-Object{$_.Name -match '(?i)damsan|noi|tru|noitru|boarding|quan'}){Add-Root $d.FullName 'targeted-c-root-name'}
$windowsCaption=try{(Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).Caption}catch{'NOT_VERIFIED'}
$report=[ordered]@{schemaVersion=1;generatedAtUtc=[DateTime]::UtcNow.ToString('o');host=[ordered]@{name=$env:COMPUTERNAME;windows=$windowsCaption};candidateBaoGiang=[ordered]@{root=$CandidateBaoGiangRoot;port=$CandidateBaoGiangPort;portState=$candidate.state;listeners=$candidate.listeners};node=[ordered]@{globalNode=[ordered]@{path=$global;version=if(Test-Path $global){try{(& $global --version|Select-Object -First 1).ToString()}catch{'NOT_VERIFIED'}}else{'MISSING'};runningProcessCountUsingThisExecutable=@($node|Where-Object{$_.ExecutablePath -eq $global}).Count};globalNodeInUseByRunningWorkload=@($node|Where-Object{$_.ExecutablePath -eq $global}).Count -gt 0;processes=$nodeRecords};scheduledTasks=$tasks;services=$services;nginx=$nginx;postgres=$postgres;protectedRootCandidates=@($roots.Values);safety=[ordered]@{mode='READ_ONLY_DISCOVERY';mutationsPerformed=$false;databaseAuthenticationAttempted=$false};conclusion='REQUIRES_REVIEW'}
$json=$report|ConvertTo-Json -Depth 12;if($json -match '(?i)(postgres(?:ql)?://|DATABASE_URL|PGPASSWORD|bearer\s+\S+|token\s*[=:]\s*\S+|BEGIN .*PRIVATE KEY|"commandline"\s*:|"arguments"\s*:)'){throw 'Secret/privacy redaction check failed.'};[IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath),$json,[Text.UTF8Encoding]::new($false));Write-Output $json
