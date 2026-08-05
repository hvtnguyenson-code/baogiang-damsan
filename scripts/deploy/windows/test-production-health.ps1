[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$BaseUrl,
  [ValidateRange(1,65535)][int]$ExpectedApiPort = 3100,
  [ValidateRange(1,10)][int]$MaxAttempts = 6,
  [ValidateRange(1,60)][int]$DelaySeconds = 2
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
