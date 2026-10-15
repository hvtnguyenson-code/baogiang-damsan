[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$requestPath='C:\baogiang\incoming\deploy-request.json'
$statusPath='C:\ProgramData\BaoGiangDeploy\status.json'
$runner='C:\ProgramData\BaoGiangDeploy\auto-deploy-code-only.ps1'
$task='BaoGiangDeploymentWorker'
$state=[ordered]@{status='failed';sha='';nonce='';preflightOnly=$true;startedUtc=[DateTime]::UtcNow.ToString('o');finishedUtc='';message='';processId=$PID}
try {
  if(-not (Test-Path -LiteralPath $requestPath -PathType Leaf)){throw 'REQUEST_MISSING'}
  $item=Get-Item -LiteralPath $requestPath -Force -ErrorAction Stop
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -gt 1024){throw 'REQUEST_UNSAFE'}
  $request=Get-Content -LiteralPath $requestPath -Raw -ErrorAction Stop | ConvertFrom-Json
  $keys=@($request.PSObject.Properties.Name)
  if(@(Compare-Object $keys @('sha','nonce','issuedUtc','preflightOnly')).Length -gt 0){throw 'REQUEST_KEYS_INVALID'}
  if([string]$request.sha -cnotmatch '^[0-9a-f]{40}$' -or [string]$request.nonce -cnotmatch '^[0-9a-f]{32}$'){throw 'REQUEST_ID_INVALID'}
  if($request.preflightOnly -isnot [bool]){throw 'REQUEST_MODE_INVALID'}
  $issued=[DateTimeOffset]::Parse([string]$request.issuedUtc)
  $age=([DateTimeOffset]::UtcNow-$issued).TotalMinutes
  if($age -lt -1 -or $age -gt 5){throw 'REQUEST_EXPIRED'}
  $state.sha=[string]$request.sha
  $state.nonce=[string]$request.nonce
  $state.preflightOnly=[bool]$request.preflightOnly
  $state.status='running'
  $output=@(& $runner -ExpectedSha $state.sha -PreflightOnly:$state.preflightOnly)
  if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw 'RUNNER_FAILED'}
  $evidence=($output|Where-Object{$_ -is [string] -and $_ -match '^BAOGIANG_(PREFLIGHT_PASS|DEPLOY_VERIFIED|DEPLOY_ALREADY_CURRENT)' }|Select-Object -Last 1)
  if(-not $evidence){throw 'RUNNER_SUCCESS_MARKER_MISSING'}
  $state.status='success';$state.message=[string]$evidence
}catch{
  $state.status='failed'
  $state.message=$_.Exception.GetType().Name+': '+($_.Exception.Message -replace '[\r\n]+',' ')
}finally{
  $state.finishedUtc=[DateTime]::UtcNow.ToString('o')
  $tmp=$statusPath+'.tmp'
  $json=$state|ConvertTo-Json -Depth 4
  [IO.File]::WriteAllText($tmp,$json,[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tmp -Destination $statusPath -Force
  Write-Output ('WORKER_'+$state.status.ToUpperInvariant()+' '+$state.sha+' '+$state.message)
  if($state.status -ne 'success'){exit 1}
}
