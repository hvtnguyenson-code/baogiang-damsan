[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ReportPath,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$CandidateRoot,
  [ValidateRange(1, 65535)][int]$ApiPort = 3100,
  [ValidateRange(1, 65535)][int]$PostgresPort = 5433,
  [string]$BaseUrl = 'https://baogiang.dtnt-damsan.edu.vn',
  [string]$ExpectedTaskName,
  [string]$ExpectedServiceName,
  [switch]$RequireVerifiedIdentity
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CommandSnapshot([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) { return [ordered]@{ name = $Name; found = $false } }
  $version = try { (& $command.Source --version 2>&1 | Select-Object -First 1).ToString() } catch { 'version-unavailable' }
  return [ordered]@{ name = $Name; found = $true; path = $command.Source; version = $version }
}

function Get-ListenerSnapshot([int]$Port) {
  $rows = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  return @($rows | ForEach-Object {
    $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" -ErrorAction SilentlyContinue
    [ordered]@{ port = $Port; address = $_.LocalAddress; pid = $_.OwningProcess; process = $process.ProcessName; path = $process.Path; commandLine = $cim.CommandLine }
  })
}

function Get-DirectorySnapshot([string]$Path) {
  $item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
  if (-not $item) { return [ordered]@{ path = $Path; exists = $false } }
  $acl = (Get-Acl -LiteralPath $Path).Access | ForEach-Object { "$($_.IdentityReference):$($_.FileSystemRights):$($_.AccessControlType)" }
  [ordered]@{ path = $Path; exists = $true; type = $item.GetType().Name; acl = @($acl) }
}

$root = [IO.Path]::GetFullPath($CandidateRoot)
$parent = Split-Path -Parent $root
$directories = @(
  (Get-DirectorySnapshot $root),
  (Get-DirectorySnapshot (Join-Path $root 'releases')),
  (Get-DirectorySnapshot (Join-Path $root 'shared')),
  (Get-DirectorySnapshot (Join-Path $root 'logs')),
  (Get-DirectorySnapshot (Join-Path $root 'backups'))
)
$tasks = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match 'BaoGiang' }) | ForEach-Object {
  $info = Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction SilentlyContinue
  [ordered]@{ name = $_.TaskName; path = $_.TaskPath; state = $_.State; principal = $_.Principal.UserId; actions = @($_.Actions | ForEach-Object { [ordered]@{ execute = $_.Execute; arguments = $_.Arguments; workingDirectory = $_.WorkingDirectory } }); lastRun = $info.LastRunTime }
}
$services = @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'BaoGiang' -or $_.DisplayName -match 'BaoGiang' }) | ForEach-Object {
  [ordered]@{ name = $_.Name; displayName = $_.DisplayName; state = $_.State; startName = $_.StartName; pathName = $_.PathName }
}
$nginx = @(Get-Process nginx -ErrorAction SilentlyContinue | ForEach-Object { [ordered]@{ pid = $_.Id; path = $_.Path; commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine } })
$dns = try { Resolve-DnsName ([Uri]$BaseUrl).DnsSafeHost -ErrorAction Stop | Select-Object -ExpandProperty IPAddress } catch { @() }
$http = foreach ($suffix in @('/api/health/live','/api/health/ready','/')) {
  $uri = "$($BaseUrl.TrimEnd('/'))$suffix"
  try { $response = Invoke-WebRequest -Uri $uri -Method Head -TimeoutSec 10 -UseBasicParsing; [ordered]@{ uri = $uri; status = [int]$response.StatusCode; reachable = $true } }
  catch { [ordered]@{ uri = $uri; reachable = $false; error = $_.Exception.Message.Split([Environment]::NewLine)[0] } }
}

$report = [ordered]@{
  generatedAtUtc = [DateTime]::UtcNow.ToString('o'); identity = [ordered]@{ hostname = $env:COMPUTERNAME; user = "$env:USERDOMAIN\$env:USERNAME"; powershell = $PSVersionTable.PSVersion.ToString(); architecture = $env:PROCESSOR_ARCHITECTURE; windows = (Get-CimInstance Win32_OperatingSystem).Caption; freeBytes = (Get-PSDrive -Name (Split-Path -Qualifier $root).TrimEnd(':')).Free }
  ssh = [ordered]@{ service = (Get-Service sshd -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType); listeners = @(Get-ListenerSnapshot 22); firewall = @(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'SSH|OpenSSH' } | Select-Object DisplayName,Enabled,Direction,Action) }
  tools = @('git','node','npm','npx','nginx','psql','pg_dump' | ForEach-Object { Get-CommandSnapshot $_ })
  listeners = @($ApiPort,$PostgresPort,80,443 | ForEach-Object { Get-ListenerSnapshot $_ })
  directories = $directories; scheduledTasks = @($tasks); services = @($services); nginx = $nginx; dns = @($dns); http = @($http)
  database = [ordered]@{ verification = 'NOT_RUN: provide an approved server-side admin connection for read-only verification; no credential was read or printed.' }
  isolation = [ordered]@{ status = 'REQUIRES_REVIEW'; note = 'Compare paths, ports, process command lines, tasks, services, Nginx blocks, database and backups against DamSanV5 and boarding-management inventory before mutation.' }
}
$json = $report | ConvertTo-Json -Depth 8
$reportDirectory = Split-Path -Parent ([IO.Path]::GetFullPath($ReportPath))
if (-not (Test-Path -LiteralPath $reportDirectory)) { throw "Report directory is missing; read-only preflight will not create it: $reportDirectory" }
[IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath), $json, [Text.UTF8Encoding]::new($false))
$missingIdentity = @($root, $ExpectedTaskName, $ExpectedServiceName | Where-Object { [string]::IsNullOrWhiteSpace($_) })
if ($RequireVerifiedIdentity -and $missingIdentity.Count -gt 0) { throw 'Identity is incomplete; no deployment mutation is permitted.' }
Write-Output $json
