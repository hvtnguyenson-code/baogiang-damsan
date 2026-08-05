[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NodeExe,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ExpectedEntryPoint,
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$ExpectedBaseUrl,
  [Parameter(Mandatory = $true)][switch]$CompatibilityApproved,
  [Parameter(Mandatory = $true)][switch]$MigrationAttempted
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
if ($MigrationAttempted -and -not $CompatibilityApproved) { throw 'Database migration was attempted; automatic code rollback requires explicit compatibility approval.' }
$canonicalRoot = Read-DeploymentIdentity -Root $Root -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint
$current = Join-Path $canonicalRoot 'current'; $previous = Join-Path $canonicalRoot 'previous'; $failed = Join-Path $canonicalRoot 'failed-release'; $temp = Join-Path $canonicalRoot 'rollback.next'
if (-not (Test-Path -LiteralPath $previous)) { throw 'No previous release pointer exists; first deploy has no automatic rollback target.' }
$previousTarget = Get-ReparseTarget $previous
if ($previousTarget -notmatch '\\releases\\[0-9a-f]{40}$' -or -not (Test-Path -LiteralPath $previousTarget -PathType Container)) { throw 'Previous pointer target is not a valid release.' }
if (Test-Path -LiteralPath $failed) { throw 'A failed-release pointer already exists; operator must inspect it before retrying rollback.' }
if (Test-Path -LiteralPath $temp) { Get-ReparseTarget $temp | Out-Null; Remove-Item -LiteralPath $temp -Force }
New-Item -ItemType Junction -Path $temp -Target $previousTarget | Out-Null
if (Test-Path -LiteralPath $current) { Get-ReparseTarget $current | Out-Null; Move-Item -LiteralPath $current -Destination $failed }
Move-Item -LiteralPath $temp -Destination $current
try {
  & (Join-Path $PSScriptRoot 'restart-baogiang-api.ps1') -ServiceKind $ServiceKind -ServiceName $ServiceName -NodeExe $NodeExe -Root $Root -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint -ExpectedBaseUrl $ExpectedBaseUrl
  $restartCode = $LASTEXITCODE
  if ($restartCode -ne 0) { throw 'Rollback restart returned a non-zero exit code.' }
  $health = & (Join-Path $PSScriptRoot 'test-production-health.ps1') -BaseUrl $ExpectedBaseUrl -ExpectedApiPort 3100
  [ordered]@{ state = 'completed'; currentTarget = $previousTarget; health = ($health -join '') } | ConvertTo-Json -Compress
} catch { throw }
