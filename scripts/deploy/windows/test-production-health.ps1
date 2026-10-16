[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$BaseUrl,
  [ValidateRange(1,65535)][int]$ExpectedApiPort = 3100,
  [ValidateRange(1,10)][int]$MaxAttempts = 6,
  [ValidateRange(1,60)][int]$DelaySeconds = 2,
  [switch]$VerifyFrontend
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$targets = @(
  "http://127.0.0.1:$ExpectedApiPort/api/health/live",
  "http://127.0.0.1:$ExpectedApiPort/api/health/ready",
  "$($BaseUrl.TrimEnd('/'))/api/health/live",
  "$($BaseUrl.TrimEnd('/'))/api/health/ready",
  "$($BaseUrl.TrimEnd('/'))/",
  "$($BaseUrl.TrimEnd('/'))/trang-thai-he-thong"
)
$results = @()
foreach ($target in $targets) {
  $started = [DateTime]::UtcNow; $passed = $false; $attemptUsed = 0; $status = $null; $category = $null
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    $attemptUsed = $attempt
    try {
      $response = Invoke-WebRequest -Uri $target -TimeoutSec 10 -UseBasicParsing -MaximumRedirection 0
      $final = [Uri]$response.BaseResponse.ResponseUri
      if (($final.Scheme -ne 'https' -or $final.Host -ne ([Uri]$BaseUrl).Host) -and $target.StartsWith('https://')) { throw 'redirect-host-mismatch' }
      if ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400) { $passed = $true; $status = [int]$response.StatusCode; break }
      $category = 'unexpected-status'
    } catch { $category = if ($_.Exception.Message -eq 'redirect-host-mismatch') { 'redirect-host-mismatch' } else { 'unreachable-or-timeout' } }
    if ($attempt -lt $MaxAttempts) { Start-Sleep -Seconds $DelaySeconds }
  }
  $results += [ordered]@{ uri = $target; passed = $passed; status = $status; attempts = $attemptUsed; durationMs = [int](([DateTime]::UtcNow - $started).TotalMilliseconds); category = $category }
  if (-not $passed) { throw () }
}
[ordered]@{ health = $results } | ConvertTo-Json -Compress

if ($VerifyFrontend) {
  # Network requests bypass browser SW caches. The origin HTML must correspond
  # exactly to the current versioned release, not merely respond HTTP 200.
  $current='C:\baogiang\current'
  $pointer=Get-Item -LiteralPath $current -Force -ErrorAction Stop
  if(($pointer.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -or
     [string]$pointer.Target -cnotmatch '(?i)\\releases\\[0-9a-f]{40}$'){
    throw 'FRONTEND_RELEASE_POINTER_UNTRUSTED'
  }
  $indexPath=Join-Path $current 'apps\web\dist\index.html'
  if(-not (Test-Path -LiteralPath $indexPath -PathType Leaf)){throw 'FRONTEND_INDEX_MISSING'}
  $expected=[IO.File]::ReadAllText($indexPath,[Text.UTF8Encoding]::new($false,$true))
  $probe= $BaseUrl.TrimEnd('/') + '/?deploy_verify=' + ([Guid]::NewGuid().ToString('N'))
  $response=Invoke-WebRequest -Uri $probe -UseBasicParsing -TimeoutSec 12 -Headers @{ 'Cache-Control'='no-cache' }
  if([int]$response.StatusCode -ne 200 -or [string]$response.Content -cne $expected){
    throw 'FRONTEND_PUBLIC_INDEX_RELEASE_MISMATCH'
  }
  # The hashed Vite entry asset must also resolve to the current release.
  $entries=[regex]::Matches($expected,'/assets/([A-Za-z0-9_-]+\.js)')
  if($entries.Count -lt 1){throw 'FRONTEND_BUNDLE_REFERENCE_MISSING'}
  foreach($entry in $entries){
    $name=[string]$entry.Groups[1].Value
    $local=Join-Path (Join-Path $current 'apps\web\dist\assets') $name
    if(-not (Test-Path -LiteralPath $local -PathType Leaf)){throw 'FRONTEND_BUNDLE_MISSING'}
    $assetUrl=$BaseUrl.TrimEnd('/')+'/assets/'+$name+'?deploy_verify='+([Guid]::NewGuid().ToString('N'))
    $asset=Invoke-WebRequest -Uri $assetUrl -UseBasicParsing -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'}
    if([int]$asset.StatusCode -ne 200 -or [string]$asset.Content -cne [IO.File]::ReadAllText($local,[Text.UTF8Encoding]::new($false,$true))){
      throw 'FRONTEND_PUBLIC_ASSET_RELEASE_MISMATCH'
    }
  }
}
[ordered]@{ health = $results; frontend = $(if($VerifyFrontend){ 'FRONTEND_RELEASE_VERIFIED' } else { 'NOT_REQUIRED' }) } | ConvertTo-Json -Compress
