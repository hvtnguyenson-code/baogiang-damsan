[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReleaseSha,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$SourceArchive,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedSha256,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NpmExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NpxExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NodeExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$EnvFile,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$ExpectedEntryPoint,
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$ExpectedBaseUrl,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')
$canonicalRoot = Read-DeploymentIdentity -Root $Root -ServiceKind $ServiceKind -ServiceName $ServiceName -EnvFile $EnvFile -StartupWrapper $StartupWrapper -ExpectedEntryPoint $ExpectedEntryPoint
Assert-ExecutableContract @{ NpmExe = $NpmExe; NpxExe = $NpxExe; NodeExe = $NodeExe }
$actual = (Get-FileHash -LiteralPath $SourceArchive -Algorithm SHA256).Hash
if ($actual -ne $ExpectedSha256.ToUpperInvariant()) { throw 'Release archive checksum mismatch.' }
$release = Join-Path $Root "releases\$ReleaseSha"
$staging = Join-Path $Root "staging\$ReleaseSha"
if (Test-Path -LiteralPath $release) { throw "Release already exists: $ReleaseSha" }
if (Test-Path -LiteralPath $staging) { throw 'Staging directory already exists; operator must inspect it before retry.' }
$pushed = $false
try {
  New-Item -ItemType Directory -Path $staging | Out-Null
  Expand-Archive -LiteralPath $SourceArchive -DestinationPath $staging -Force
  if (-not (Test-Path (Join-Path $staging 'package-lock.json'))) { throw 'package-lock.json is missing from release package.' }
  Push-Location $staging; $pushed = $true
  Invoke-NativeChecked $NpmExe @('ci') 'npm ci'
  $argonSmoke = "const argon2 = require('argon2'); if (!argon2 || typeof argon2.hash !== 'function') process.exit(1);"
  Invoke-NativeChecked $NodeExe @('-e',$argonSmoke) 'argon2 native runtime smoke check'
  Invoke-NativeChecked $NpxExe @('prisma','generate','--schema',(Join-Path $staging 'prisma\schema.prisma')) 'prisma generate'
  Invoke-NativeChecked $NpmExe @('run','build') 'npm run build'
  if (-not (Test-Path (Join-Path $staging 'apps\api\dist\apps\api\src\main.js'))) { throw 'API startup entry point is missing after build.' }
  if (-not (Test-Path (Join-Path $staging 'apps\web\dist') -PathType Container)) { throw 'Frontend static root is missing after build.' }
} finally { if ($pushed) { Pop-Location } }
New-Item -ItemType Directory -Path (Split-Path $release) -ErrorAction Stop | Out-Null
Move-Item -LiteralPath $staging -Destination $release
