[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedSha,
  [switch]$PreflightOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\baogiang'
$requestPath=Join-Path $root 'incoming\deploy-request.json'
$statusPath='C:\ProgramData\BaoGiangDeploy\status.json'
$workerName='BaoGiangDeploymentWorker'
if(-not (Test-Path 'C:\ProgramData\BaoGiangDeploy\worker.ps1' -PathType Leaf)){
  throw 'PROTECTED_WORKER_MISSING'
}
$nonce=[Guid]::NewGuid().ToString('N')
$request=[ordered]@{
  sha=$ExpectedSha
  nonce=$nonce
  issuedUtc=[DateTimeOffset]::UtcNow.ToString('o')
  preflightOnly=[bool]$PreflightOnly
}
$temporary=Join-Path (Join-Path $root 'incoming') ('request-'+$nonce+'.tmp')
try{
  [IO.File]::WriteAllText($temporary,($request|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $requestPath -Force -ErrorAction Stop
}finally{
  if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue}
}
$null=& "$env:WINDIR\System32\schtasks.exe" /Run /TN ('\'+$workerName) 2>&1
if($LASTEXITCODE -ne 0){throw 'BAOGIANG_WORKER_START_DENIED_OR_FAILED'}
for($attempt=0;$attempt -lt 270;$attempt++){
  Start-Sleep -Seconds 6
  if(-not (Test-Path -LiteralPath $statusPath -PathType Leaf)){continue}
  $status=Get-Content -LiteralPath $statusPath -Raw -ErrorAction Stop |ConvertFrom-Json
  if([string]$status.nonce -cne $nonce){continue}
  if([string]$status.sha -cne $ExpectedSha){throw 'WORKER_RESULT_SHA_MISMATCH'}
  if([string]$status.status -ceq 'success'){
    if([string]$status.message -cnotmatch '^BAOGIANG_(PREFLIGHT_PASS|DEPLOY_VERIFIED|DEPLOY_ALREADY_CURRENT)'){throw 'WORKER_SUCCESS_EVIDENCE_INVALID'}
    Write-Output ([string]$status.message)
    return
  }
  if([string]$status.status -ceq 'failed'){
    throw ('BAOGIANG_WORKER_FAILED: '+[string]$status.message)
  }
}
throw 'BAOGIANG_WORKER_RESULT_TIMEOUT'
