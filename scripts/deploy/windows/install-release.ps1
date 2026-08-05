[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReleaseSha,
  [Parameter(Mandatory = $true)][ValidateScript({ [IO.Path]::IsPathRooted($_) })][string]$Root,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$SourceArchive,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedSha256,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NpmExe,
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$NodeExe
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($Root)
$release = Join-Path $root "releases\$ReleaseSha"
$actual = (Get-FileHash -LiteralPath $SourceArchive -Algorithm SHA256).Hash
if ($actual -ne $ExpectedSha256.ToUpperInvariant()) { throw 'Release archive checksum mismatch.' }
if (Test-Path -LiteralPath $release) { throw "Release already exists: $ReleaseSha" }
$staging = Join-Path $root "staging\$ReleaseSha"
if (Test-Path -LiteralPath $staging) { throw 'Staging directory already exists; operator must inspect it before retry.' }
New-Item -ItemType Directory -Path $staging -Force | Out-Null
try {
  Expand-Archive -LiteralPath $SourceArchive -DestinationPath $staging -Force
  if (-not (Test-Path (Join-Path $staging 'package-lock.json'))) { throw 'package-lock.json is missing from release package.' }
  Push-Location $staging
  & $NpmExe ci --ignore-scripts
  & $NodeExe (Join-Path $staging 'node_modules\prisma\build\index.js') generate --schema (Join-Path $staging 'prisma\schema.prisma')
  & $NpmExe run build
  if (-not (Test-Path (Join-Path $staging 'apps\api\dist\apps\api\src\main.js'))) { throw 'API startup entry point is missing after build.' }
  if (-not (Test-Path (Join-Path $staging 'apps\web\dist'))) { throw 'Frontend static root is missing after build.' }
  Pop-Location
  New-Item -ItemType Directory -Path (Split-Path $release) -Force | Out-Null
  Move-Item -LiteralPath $staging -Destination $release
} catch { Pop-Location -ErrorAction SilentlyContinue; throw }
