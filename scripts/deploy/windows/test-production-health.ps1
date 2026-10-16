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
  if (-not $passed) { throw ([ordered]@{ health = $results } | ConvertTo-Json -Compress) }
}
[ordered]@{ health = $results } | ConvertTo-Json -Compress

if ($VerifyFrontend) {
  Add-Type -AssemblyName System.Net.Http
  # Prove the public origin serves the exact bytes from the current release.
  # Force identity encoding so compression/content decoding cannot create a false mismatch.
  $current='C:\baogiang\current'
  $pointer=Get-Item -LiteralPath $current -Force -ErrorAction Stop
  if(($pointer.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -or
     [string]$pointer.Target -cnotmatch '(?i)\\releases\\[0-9a-f]{40}$'){
    throw 'FRONTEND_RELEASE_POINTER_UNTRUSTED'
  }
  function Get-OriginBytes([string]$Uri,[int]$TimeoutSeconds){
    $handler=[Net.Http.HttpClientHandler]::new()
    $client=[Net.Http.HttpClient]::new($handler)
    try {
      $client.Timeout=[TimeSpan]::FromSeconds($TimeoutSeconds)
      $client.DefaultRequestHeaders.CacheControl=[Net.Http.Headers.CacheControlHeaderValue]::Parse('no-cache')
      $client.DefaultRequestHeaders.AcceptEncoding.Clear()
      $client.DefaultRequestHeaders.AcceptEncoding.ParseAdd('identity')
      $response=$client.GetAsync($Uri).GetAwaiter().GetResult()
      if(-not $response.IsSuccessStatusCode){throw ('ORIGIN_HTTP_STATUS_'+[int]$response.StatusCode)}
      return [byte[]]$response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    } finally {
      $client.Dispose()
      $handler.Dispose()
    }
  }
  function Test-ExactBytes([byte[]]$Left,[byte[]]$Right){
    if($Left.Length -ne $Right.Length){return $false}
    return [Linq.Enumerable]::SequenceEqual([byte[]]$Left,[byte[]]$Right)
  }
  $indexPath=Join-Path $current 'apps\web\dist\index.html'
  if(-not (Test-Path -LiteralPath $indexPath -PathType Leaf)){throw 'FRONTEND_INDEX_MISSING'}
  $expectedBytes=[IO.File]::ReadAllBytes($indexPath)
  $expected=[Text.Encoding]::UTF8.GetString($expectedBytes)
  $probe=$BaseUrl.TrimEnd('/')+'/?deploy_verify='+([Guid]::NewGuid().ToString('N'))
  $publicBytes=Get-OriginBytes $probe 12
  if(-not (Test-ExactBytes $publicBytes $expectedBytes)){throw 'FRONTEND_PUBLIC_INDEX_RELEASE_MISMATCH'}

  $entries=[regex]::Matches($expected,'/assets/([A-Za-z0-9_-]+\.js)')
  if($entries.Count -lt 1){throw 'FRONTEND_BUNDLE_REFERENCE_MISSING'}
  foreach($entry in $entries){
    $name=[string]$entry.Groups[1].Value
    $local=Join-Path (Join-Path $current 'apps\web\dist\assets') $name
    if(-not (Test-Path -LiteralPath $local -PathType Leaf)){throw 'FRONTEND_BUNDLE_MISSING'}
    $assetUrl=$BaseUrl.TrimEnd('/')+'/assets/'+$name+'?deploy_verify='+([Guid]::NewGuid().ToString('N'))
    $assetBytes=Get-OriginBytes $assetUrl 20
    if(-not (Test-ExactBytes $assetBytes ([IO.File]::ReadAllBytes($local)))){
      throw 'FRONTEND_PUBLIC_ASSET_RELEASE_MISMATCH'
    }
  }
}
[ordered]@{ health = $results; frontend = $(if($VerifyFrontend){ 'FRONTEND_RELEASE_VERIFIED' } else { 'NOT_REQUIRED' }) } | ConvertTo-Json -Compress
