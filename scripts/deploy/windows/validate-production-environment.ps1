[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$EnvFile,
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$ExpectedBaseUrl
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
try {
  Read-ValidatedProductionEnvironment -EnvFile $EnvFile -ExpectedBaseUrl $ExpectedBaseUrl | Out-Null
  [ordered]@{ schemaVersion = 1; state = 'VALIDATED' } | ConvertTo-Json -Compress
} catch {
  Write-Output 'VALIDATION_FAILED'
  exit 1
}
