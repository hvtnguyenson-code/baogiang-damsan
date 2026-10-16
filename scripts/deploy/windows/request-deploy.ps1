[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedSha,
  [ValidateSet('Wait','Enqueue','Poll')][string]$Mode='Wait',
  [ValidatePattern('^[0-9a-f]{32}$')][string]$Nonce='',
  [switch]$PreflightOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\baogiang'
$requestPath=Join-Path $root 'incoming\deploy-request.json'
$statusPath='C:\ProgramData\BaoGiangDeploy\status.json'
$workerName='BaoGiangDeploymentWorker'
$workerPath='C:\ProgramData\BaoGiangDeploy\worker.ps1'
if(-not (Test-Path -LiteralPath $workerPath -PathType Leaf)){throw 'PROTECTED_WORKER_MISSING'}

function Read-JsonFile([string]$Path){
  if(-not (Test-Path -LiteralPath $Path -PathType Leaf)){return $null}
  return (Get-Content -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json)
}
function Assert-Result([object]$Result,[string]$Sha){
  if([string]$Result.sha -cne $Sha){throw 'WORKER_RESULT_SHA_MISMATCH'}
  if([string]$Result.status -ceq 'success'){
    $evidence=[string]$Result.message
    if($evidence -cmatch "^BAOGIANG_DEPLOY_VERIFIED sha=$Sha neighbor_pid=([0-9]+)$"){
      return "BAOGIANG_DEPLOY_RESULT_VERIFIED sha=$Sha nonce=$Nonce neighbor_pid=$($Matches[1])"
    }
    if($evidence -ceq "BAOGIANG_DEPLOY_ALREADY_CURRENT sha=$Sha"){
      return "BAOGIANG_DEPLOY_RESULT_ALREADY_CURRENT sha=$Sha nonce=$Nonce"
    }
    throw 'WORKER_SUCCESS_EVIDENCE_INVALID'
  }
  if([string]$Result.status -ceq 'failed'){
    return "BAOGIANG_DEPLOY_RESULT_FAILED sha=$Sha nonce=$Nonce"
  }
  if([string]$Result.status -cne 'running'){throw 'WORKER_STATE_UNKNOWN'}
  return "BAOGIANG_DEPLOY_RUNNING sha=$Sha nonce=$Nonce"
}
if($Mode -ceq 'Poll'){
  if(-not $Nonce){throw 'NONCE_REQUIRED'}
  $status=Read-JsonFile $statusPath
  if($null -ne $status -and [string]$status.nonce -ceq $Nonce){
    Write-Output (Assert-Result $status $ExpectedSha)
    return
  }
  $request=Read-JsonFile $requestPath
  if($null -eq $request -or [string]$request.nonce -cne $Nonce -or [string]$request.sha -cne $ExpectedSha){
    throw 'DEPLOY_NONCE_NOT_FOUND_OR_SUPERSEDED'
  }
  $issued=[DateTimeOffset]::Parse([string]$request.issuedUtc)
  if(([DateTimeOffset]::UtcNow-$issued).TotalMinutes -gt 2){throw 'DEPLOY_WORKER_START_NOT_CONFIRMED'}
  Write-Output "BAOGIANG_DEPLOY_PENDING sha=$ExpectedSha nonce=$Nonce"
  return
}
if($Nonce){throw 'NONCE_ONLY_VALID_FOR_POLL'}
$mutex=[Threading.Mutex]::new($false,'Global\BaoGiangDeployRequestLock')
$hasLock=$false
try{
  $hasLock=$mutex.WaitOne([TimeSpan]::FromSeconds(15))
  if(-not $hasLock){throw 'DEPLOY_REQUEST_LOCK_TIMEOUT'}
  $existing=Read-JsonFile $requestPath
  $status=Read-JsonFile $statusPath
  $task=Get-ScheduledTask -TaskName $workerName -ErrorAction Stop
  $busy=([string]$task.State -ceq 'Running')
  # If the first SSH session dies after schtasks accepted the request but before
  # Task Scheduler exposes Running, an immediate Enqueue retry must recover the
  # same nonce instead of overwriting the request that the worker is about to read.
  if($Mode -ceq 'Enqueue' -and $null -ne $existing -and
     [string]$existing.sha -ceq $ExpectedSha -and
     [string]$existing.nonce -cmatch '^[0-9a-f]{32}  if($busy){
    if($null -ne $existing -and [string]$existing.sha -ceq $ExpectedSha -and
       [string]$existing.nonce -cmatch '^[0-9a-f]{32}$' -and
       ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse([string]$existing.issuedUtc)).TotalMinutes -le 45){
      if($Mode -ceq 'Wait'){throw 'DEPLOY_ALREADY_RUNNING_USE_ENQUEUE'}
      Write-Output "BAOGIANG_DEPLOY_ACCEPTED sha=$ExpectedSha nonce=$($existing.nonce)"
      return
    }
    throw 'DEPLOY_BUSY_DIFFERENT_OR_STALE_REQUEST'
  }
  # Never trust a historical success marker as proof of current production state.
  # Always let the detached worker reconcile the requested SHA; its runner performs
  # current-pointer, API and exact public-frontend verification before returning ALREADY_CURRENT.
  $newNonce=[Guid]::NewGuid().ToString('N')
  $request=[ordered]@{
    sha=$ExpectedSha
    nonce=$newNonce
    issuedUtc=[DateTimeOffset]::UtcNow.ToString('o')
    preflightOnly=[bool]$PreflightOnly
  }
  $temp=Join-Path (Join-Path $root 'incoming') ('request-'+$newNonce+'.tmp')
  try{
    [IO.File]::WriteAllText($temp,($request|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $requestPath -Force -ErrorAction Stop
  }finally{
    if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue}
  }
  $null=& "$env:WINDIR\System32\schtasks.exe" /Run /TN ('\'+$workerName) 2>&1
  if($LASTEXITCODE -ne 0){throw 'BAOGIANG_WORKER_START_DENIED_OR_FAILED'}
}finally{
  if($hasLock){$mutex.ReleaseMutex()}
  $mutex.Dispose()
}
if($Mode -ceq 'Enqueue'){
  Write-Output "BAOGIANG_DEPLOY_ACCEPTED sha=$ExpectedSha nonce=$newNonce"
  return
}
for($attempt=0;$attempt -lt 270;$attempt++){
  Start-Sleep -Seconds 6
  $status=Read-JsonFile $statusPath
  if($null -eq $status -or [string]$status.nonce -cne $newNonce){continue}
  if([string]$status.sha -cne $ExpectedSha){throw 'WORKER_RESULT_SHA_MISMATCH'}
  if([string]$status.status -ceq 'success'){
    $message=[string]$status.message
    if($message -cnotmatch "^BAOGIANG_(PREFLIGHT_PASS|DEPLOY_VERIFIED|DEPLOY_ALREADY_CURRENT) sha=$ExpectedSha"){throw 'WORKER_SUCCESS_EVIDENCE_INVALID'}
    Write-Output $message
    return
  }
  if([string]$status.status -ceq 'failed'){throw 'BAOGIANG_WORKER_FAILED'}
}
throw 'BAOGIANG_WORKER_RESULT_TIMEOUT'
){
    $existingIssued=[DateTimeOffset]::Parse([string]$existing.issuedUtc)
    $existingAge=([DateTimeOffset]::UtcNow-$existingIssued).TotalMinutes
    $statusOwnsExisting=($null -ne $status -and [string]$status.nonce -ceq [string]$existing.nonce)
    if(-not $busy -and -not $statusOwnsExisting -and $existingAge -ge -1 -and $existingAge -le 2){
      Write-Output "BAOGIANG_DEPLOY_ACCEPTED sha=$ExpectedSha nonce=$($existing.nonce)"
      return
    }
  }
  if($busy){
    if($null -ne $existing -and [string]$existing.sha -ceq $ExpectedSha -and
       [string]$existing.nonce -cmatch '^[0-9a-f]{32}$' -and
       ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse([string]$existing.issuedUtc)).TotalMinutes -le 45){
      if($Mode -ceq 'Wait'){throw 'DEPLOY_ALREADY_RUNNING_USE_ENQUEUE'}
      Write-Output "BAOGIANG_DEPLOY_ACCEPTED sha=$ExpectedSha nonce=$($existing.nonce)"
      return
    }
    throw 'DEPLOY_BUSY_DIFFERENT_OR_STALE_REQUEST'
  }
  # Never trust a historical success marker as proof of current production state.
  # Always let the detached worker reconcile the requested SHA; its runner performs
  # current-pointer, API and exact public-frontend verification before returning ALREADY_CURRENT.
  $newNonce=[Guid]::NewGuid().ToString('N')
  $request=[ordered]@{
    sha=$ExpectedSha
    nonce=$newNonce
    issuedUtc=[DateTimeOffset]::UtcNow.ToString('o')
    preflightOnly=[bool]$PreflightOnly
  }
  $temp=Join-Path (Join-Path $root 'incoming') ('request-'+$newNonce+'.tmp')
  try{
    [IO.File]::WriteAllText($temp,($request|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $requestPath -Force -ErrorAction Stop
  }finally{
    if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue}
  }
  $null=& "$env:WINDIR\System32\schtasks.exe" /Run /TN ('\'+$workerName) 2>&1
  if($LASTEXITCODE -ne 0){throw 'BAOGIANG_WORKER_START_DENIED_OR_FAILED'}
}finally{
  if($hasLock){$mutex.ReleaseMutex()}
  $mutex.Dispose()
}
if($Mode -ceq 'Enqueue'){
  Write-Output "BAOGIANG_DEPLOY_ACCEPTED sha=$ExpectedSha nonce=$newNonce"
  return
}
for($attempt=0;$attempt -lt 270;$attempt++){
  Start-Sleep -Seconds 6
  $status=Read-JsonFile $statusPath
  if($null -eq $status -or [string]$status.nonce -cne $newNonce){continue}
  if([string]$status.sha -cne $ExpectedSha){throw 'WORKER_RESULT_SHA_MISMATCH'}
  if([string]$status.status -ceq 'success'){
    $message=[string]$status.message
    if($message -cnotmatch "^BAOGIANG_(PREFLIGHT_PASS|DEPLOY_VERIFIED|DEPLOY_ALREADY_CURRENT) sha=$ExpectedSha"){throw 'WORKER_SUCCESS_EVIDENCE_INVALID'}
    Write-Output $message
    return
  }
  if([string]$status.status -ceq 'failed'){throw 'BAOGIANG_WORKER_FAILED'}
}
throw 'BAOGIANG_WORKER_RESULT_TIMEOUT'
