[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$ExpectedBaseUrl
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
try {
  . (Join-Path $PSScriptRoot 'deployment-common.ps1')
  if ($ExpectedBaseUrl -cne 'https://baogiang.dtnt-damsan.edu.vn') { throw 'Production environment validator base URL is invalid.' }
  Read-ValidatedProductionEnvironment -EnvFile $EnvFile -ExpectedBaseUrl $ExpectedBaseUrl | Out-Null
  [ordered]@{ schemaVersion = 1; state = 'VALIDATED' } | ConvertTo-Json -Compress
} catch {
  Write-Output 'VALIDATION_FAILED'
  exit 1
}
