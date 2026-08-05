[CmdletBinding()]
param(
  [string[]]$Uri = @('http://127.0.0.1:3100/api/health/live','http://127.0.0.1:3100/api/health/ready','https://baogiang.dtnt-damsan.edu.vn/api/health/live','https://baogiang.dtnt-damsan.edu.vn/api/health/ready','https://baogiang.dtnt-damsan.edu.vn/'),
  [ValidateRange(1, 10)][int]$MaxAttempts = 6,
  [ValidateRange(1, 60)][int]$DelaySeconds = 2
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
foreach ($target in $Uri) {
  $passed = $false
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try { $response = Invoke-WebRequest -Uri $target -TimeoutSec 10 -UseBasicParsing; if ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400) { $passed = $true; break } } catch { }
    if ($attempt -lt $MaxAttempts) { Start-Sleep -Seconds $DelaySeconds }
  }
  if (-not $passed) { throw "Health check failed: $target" }
  Write-Output "Health check passed: $target"
}
