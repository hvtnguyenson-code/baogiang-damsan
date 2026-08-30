Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CanonicalPath([Parameter(Mandatory = $true)][string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.Path]::IsPathRooted($Path)) { throw 'A Windows absolute path is required.' }
  return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Assert-DedicatedRoot([Parameter(Mandatory = $true)][string]$Root) {
  $canonical = Get-CanonicalPath $Root
  $rootOfDrive = [IO.Path]::GetPathRoot($canonical).TrimEnd('\')
  if ($canonical.TrimEnd('\') -ieq $rootOfDrive) { throw 'The application root may not be a drive root.' }
  $blocked = @(
    [Environment]::GetFolderPath('Windows'),
    [Environment]::GetFolderPath('ProgramFiles'),
    [Environment]::GetFolderPath('CommonProgramFiles'),
    (Join-Path $env:WINDIR 'System32')
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  foreach ($path in $blocked) { if ($canonical.StartsWith((Get-CanonicalPath $path), [StringComparison]::OrdinalIgnoreCase)) { throw 'The application root is a protected Windows/system path.' } }
  if ($canonical -match '(?i)DamSanV5|boarding[-_ ]?management|quan.?ly.?noi.?tru|noi.?tru') { throw 'The application root conflicts with a protected neighboring system.' }
  return $canonical
}

function Assert-ExistingDirectory([Parameter(Mandatory = $true)][string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw "A bootstrapped directory is missing: $Path" }
  return Get-CanonicalPath $Path
}

function Assert-ExistingLeaf([Parameter(Mandatory = $true)][string]$Path,[string]$Label = 'Executable') {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label must be an existing file: $Path" }
  return Get-CanonicalPath $Path
}

function Normalize-ComparablePath([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return '' }
  return (Get-CanonicalPath $Path).ToLowerInvariant()
}

function Test-PathWithin([Parameter(Mandatory = $true)][string]$Path,[Parameter(Mandatory = $true)][string]$Parent) {
  $candidate = Normalize-ComparablePath $Path
  $container = (Normalize-ComparablePath $Parent).TrimEnd('\')
  return $candidate -eq $container -or $candidate.StartsWith("$container\", [StringComparison]::OrdinalIgnoreCase)
}

function Assert-ExactChildPath([Parameter(Mandatory = $true)][string]$Root,[Parameter(Mandatory = $true)][string]$RelativePath) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $candidate = Get-CanonicalPath (Join-Path $canonicalRoot $RelativePath)
  if (-not (Test-PathWithin $candidate $canonicalRoot)) { throw 'Path escapes the dedicated deployment root.' }
  return $candidate
}

function Assert-ExactReleasePath([Parameter(Mandatory = $true)][string]$Root,[Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReleaseSha,[Parameter(Mandatory = $true)][string]$ReleasePath) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $releasesRoot = Assert-ExactChildPath $canonicalRoot 'releases'
  $expectedRelease = Assert-ExactChildPath $canonicalRoot "releases\$ReleaseSha"
  $release = Get-CanonicalPath $ReleasePath
  if ((Normalize-ComparablePath $release) -ne (Normalize-ComparablePath $expectedRelease) -or -not (Test-PathWithin $expectedRelease $releasesRoot) -or (Normalize-ComparablePath (Split-Path -Parent $expectedRelease)) -ne (Normalize-ComparablePath $releasesRoot) -or (Split-Path -Leaf $expectedRelease) -cne $ReleaseSha -or -not (Test-Path -LiteralPath $expectedRelease -PathType Container)) { throw 'Release path does not match the exact requested release identity.' }
  return $expectedRelease
}

function Redact-SensitiveText([AllowNull()][string]$Text) {
  if ($null -eq $Text) { return $null }
  $safe = $Text
  $safe = [regex]::Replace($safe, '(?i)(postgres(?:ql)?://)[^\s/@:]+(?::[^\s/@]*)?@', '$1<redacted>@')
  $safe = [regex]::Replace($safe, '(?i)(bearer\s+)[^\s,;]+', '$1<redacted>')
  $safe = [regex]::Replace($safe, '(?i)(DATABASE_URL|PGPASSWORD|PASSWORD|TOKEN|SECRET|PRIVATE_KEY)\s*[=:]\s*[^\s,;]+', '$1=<redacted>')
  $safe = [regex]::Replace($safe, '(?i)(-password|-token|-secret|-privatekey)\s+[^\s,;]+', '$1 <redacted>')
  return $safe
}

function Get-NormalizedProcessIdentity([Parameter(Mandatory = $true)]$Process) {
  # Command lines can contain arbitrary secret syntaxes. Inventory records only a hash.
  $commandLine = [string]$Process.CommandLine
  [ordered]@{
    pid = [int]$Process.ProcessId
    executablePath = $Process.ExecutablePath
    executableName = if ($Process.ExecutablePath) { Split-Path -Leaf $Process.ExecutablePath } else { $null }
    commandLineSha256 = if ($commandLine) { (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($commandLine))) -Algorithm SHA256).Hash } else { $null }
  }
}

function Get-SafePathHints([AllowNull()][string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return @() }
  return @([regex]::Matches($Text, '(?i)(?:[A-Z]:\\[^"''\r\n<>|?*]+?\.(?:js|cjs|mjs|ps1|cmd|bat|exe|conf))') | ForEach-Object { $_.Value.Trim('"') } | Select-Object -Unique)
}

function Get-SensitiveTextHash([AllowNull()][string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
  $digest = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($Text))
  return ([BitConverter]::ToString($digest)).Replace('-','').ToLowerInvariant()
}

function Assert-ExactPsqlExecutable([Parameter(Mandatory = $true)][string]$Path) {
  if (-not [IO.Path]::IsPathRooted($Path)) { throw 'PsqlExe must be an absolute path.' }
  $exact = Assert-ExistingLeaf -Path $Path -Label 'PsqlExe'
  if ((Split-Path -Leaf $exact) -cne 'psql.exe') { throw 'PsqlExe must identify the exact psql.exe leaf.' }
  return $exact
}

function Resolve-DatabaseVerifierExecutable([switch]$VerifyDatabase,[AllowNull()][string]$PsqlExe) {
  if (-not $VerifyDatabase) { return $null }
  if ([string]::IsNullOrWhiteSpace($PsqlExe)) { throw 'VerifyDatabase requires an exact PsqlExe.' }
  return Assert-ExactPsqlExecutable -Path $PsqlExe
}

function Resolve-ExpectedCandidateRuntimeName([AllowNull()][string]$ServiceKind,[AllowNull()][string]$ExpectedTaskName,[AllowNull()][string]$ExpectedServiceName,[switch]$RequireReviewedIsolation) {
  if (-not $RequireReviewedIsolation) { return $null }
  if ($ServiceKind -notin @('scheduled-task','service')) { throw 'Verified first-deploy isolation requires an exact ServiceKind.' }
  $selected = if ($ServiceKind -eq 'scheduled-task') { $ExpectedTaskName } else { $ExpectedServiceName }
  $unselected = if ($ServiceKind -eq 'scheduled-task') { $ExpectedServiceName } else { $ExpectedTaskName }
  if ([string]::IsNullOrWhiteSpace($selected)) { throw 'Verified first-deploy isolation requires the corresponding expected runtime name.' }
  if (-not [string]::IsNullOrWhiteSpace($unselected)) { throw 'Verified first-deploy isolation candidate identity is ambiguous.' }
  if ($selected -notmatch '^[A-Za-z0-9._-]{1,128}$') { throw 'Expected runtime name does not match the safe service-name syntax.' }
  return $selected
}

function Get-ProtectedNeighborIsolationEvidence(
  [Parameter(Mandatory = $true)][string]$CandidateRoot,
  [string[]]$KnownForeignRoot = @(),
  [string[]]$CandidateName = @(),
  [string[]]$KnownForeignName = @(),
  [switch]$RequireReviewedInputs
) {
  if ($RequireReviewedInputs -and (@($KnownForeignRoot | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -gt 0 -or @($KnownForeignName | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -gt 0 -or @($CandidateName | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -gt 0)) { throw 'Reviewed protected-neighbor inputs may not contain empty values.' }
  $foreignRoots = @($KnownForeignRoot | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $foreignNames = @($KnownForeignName | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $candidateNames = @($CandidateName | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($RequireReviewedInputs -and ($foreignRoots.Count -eq 0 -or $foreignNames.Count -eq 0)) { throw 'Verified first-deploy preflight requires reviewed KnownForeignRoot and KnownForeignName inputs.' }
  if ($RequireReviewedInputs -and $candidateNames.Count -ne 1) { throw 'Verified first-deploy preflight requires exactly one expected candidate runtime name.' }
  if ($RequireReviewedInputs -and $candidateNames[0] -notmatch '^[A-Za-z0-9._-]{1,128}$') { throw 'Expected candidate runtime name does not match the safe service-name syntax.' }
  if ($foreignRoots.Count -eq 0 -and $foreignNames.Count -eq 0) { return [ordered]@{ status = 'NOT_RUN'; foreignInputs = @() } }
  $candidate = Normalize-ComparablePath $CandidateRoot
  foreach ($foreignRoot in $foreignRoots) {
    if (-not [IO.Path]::IsPathRooted($foreignRoot)) { throw 'KnownForeignRoot must contain only absolute reviewed paths.' }
    $foreign = (Normalize-ComparablePath $foreignRoot).TrimEnd('\')
    if ($candidate -eq $foreign -or $candidate.StartsWith("$foreign\", [StringComparison]::OrdinalIgnoreCase) -or $foreign.StartsWith("$candidate\", [StringComparison]::OrdinalIgnoreCase)) {
      return [ordered]@{ status = 'CONFLICT'; foreignInputs = @($foreignRoots + $foreignNames); conflictType = 'PATH_OVERLAP' }
    }
  }
  foreach ($name in $candidateNames) {
    if (@($foreignNames | Where-Object { $_ -ieq $name }).Count -gt 0) { return [ordered]@{ status = 'CONFLICT'; foreignInputs = @($foreignRoots + $foreignNames); conflictType = 'NAME_OVERLAP' } }
  }
  return [ordered]@{ status = if ($RequireReviewedInputs) { 'EXISTS AND VERIFIED' } else { 'REQUIRES_REVIEW' }; foreignInputs = @($foreignRoots + $foreignNames) }
}

function Get-SshDirectConfigEvidence([Parameter(Mandatory = $true)][string]$ConfigPath) {
  $config = Get-CanonicalPath $ConfigPath
  if (-not (Test-Path -LiteralPath $config -PathType Leaf)) { return [ordered]@{ effectiveConfigState = 'NOT_VERIFIED'; configPath = $config; configuredPorts = @(); activeIncludes = @(); reason = 'SSH_CONFIG_MISSING' } }
  $activeIncludes = @(); $configuredPorts = @()
  foreach ($line in Get-Content -LiteralPath $config) {
    if ($line -match '^\s*Include\s+(.+?)\s*$') { $activeIncludes += [ordered]@{ patternSha256 = Get-SensitiveTextHash $Matches[1]; safePathHints = @(Get-SafePathHints $Matches[1]) }; continue }
    if ($line -match '^\s*Port\s+(\d+)(?:\s|#|$)') { $configuredPorts += [int]$Matches[1] }
  }
  if ($activeIncludes.Count -gt 0) { return [ordered]@{ effectiveConfigState = 'NOT_VERIFIED'; configPath = $config; configuredPorts = @(); activeIncludes = $activeIncludes; defaultPortApplied = $false; reason = 'ACTIVE_INCLUDE_REQUIRES_REVIEW' } }
  $ports = @($configuredPorts | Sort-Object -Unique)
  $defaultApplied = $ports.Count -eq 0
  if ($defaultApplied) { $ports = @(22) }
  return [ordered]@{ effectiveConfigState = 'DISCOVERED'; configPath = $config; configuredPorts = $ports; activeIncludes = @(); defaultPortApplied = $defaultApplied }
}

function Get-SshPortEvidence([Parameter(Mandatory = $true)][string]$EffectiveConfigState,[Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$ConfiguredPort,[Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$ListeningPort,[switch]$ServiceRunning) {
  $configured = @($ConfiguredPort | ForEach-Object { [int]$_ } | Sort-Object -Unique)
  $listening = @($ListeningPort | ForEach-Object { [int]$_ } | Sort-Object -Unique)
  if ($EffectiveConfigState -ne 'DISCOVERED') { return [ordered]@{ state = 'NOT_VERIFIED'; configuredPorts = $configured; listeningPorts = $listening; agreedPorts = @(); reason = 'EFFECTIVE_CONFIG_NOT_VERIFIED' } }
  if (-not $ServiceRunning -or $configured.Count -eq 0 -or $listening.Count -eq 0) { return [ordered]@{ state = 'NOT_VERIFIED'; configuredPorts = $configured; listeningPorts = $listening; agreedPorts = @(); reason = 'ACTUAL_SSHD_LISTENER_NOT_VERIFIED' } }
  if (@(Compare-Object -ReferenceObject $configured -DifferenceObject $listening).Count -gt 0) { return [ordered]@{ state = 'CONFLICT'; configuredPorts = $configured; listeningPorts = $listening; agreedPorts = @(); reason = 'CONFIGURED_LISTENER_PORT_MISMATCH' } }
  return [ordered]@{ state = 'DISCOVERED'; configuredPorts = $configured; listeningPorts = $listening; agreedPorts = $configured }
}

function Get-SshPublicHostKeyEvidence([Parameter(Mandatory = $true)][string]$ConfigPath,[bool]$EffectiveConfigVerified = $true) {
  $config = Get-CanonicalPath $ConfigPath
  if (-not (Test-Path -LiteralPath $config -PathType Leaf)) { return [ordered]@{ state = 'MISSING'; configPath = $config; keys = @() } }
  if (-not $EffectiveConfigVerified) { return [ordered]@{ state = 'NOT_VERIFIED'; configPath = $config; source = 'UNRESOLVED_EFFECTIVE_CONFIG'; keys = @(); reason = 'ACTIVE_INCLUDE_REQUIRES_REVIEW' } }
  $configured = @(); $source = 'CONFIGURED'
  foreach ($line in Get-Content -LiteralPath $config) {
    if ($line -match '^\s*HostKey\s+(?:"([^"]+)"|([^#\s]+))') {
      $value = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
      if ($value -match '^(?i)__PROGRAMDATA__[\\/](.+)$' -and -not [string]::IsNullOrWhiteSpace($env:ProgramData)) { $value = Join-Path $env:ProgramData $Matches[1] }
      $value = [Environment]::ExpandEnvironmentVariables($value)
      $configured += if ([IO.Path]::IsPathRooted($value)) { Get-CanonicalPath $value } else { Get-CanonicalPath (Join-Path (Split-Path -Parent $config) $value) }
    }
  }
  if ($configured.Count -eq 0) {
    $source = 'OPENSSH_DEFAULT'
    $configDirectory = Split-Path -Parent $config
    $configured = @('ssh_host_ed25519_key','ssh_host_ecdsa_key','ssh_host_rsa_key' | ForEach-Object { Get-CanonicalPath (Join-Path $configDirectory $_) })
  }
  $keys = @($configured | Select-Object -Unique | ForEach-Object {
    $privatePath = $_; $publicPath = "$privatePath.pub"
    if (-not (Test-Path -LiteralPath $privatePath -PathType Leaf)) { return [ordered]@{ state = 'MISSING'; privateKeyPath = $privatePath; publicKeyPath = $publicPath } }
    if (-not (Test-Path -LiteralPath $publicPath -PathType Leaf)) { return [ordered]@{ state = 'NOT_VERIFIED'; privateKeyPath = $privatePath; publicKeyPath = $publicPath } }
    $fields = @((Get-Content -LiteralPath $publicPath -Raw -Encoding UTF8).Trim() -split '\s+')
    if ($fields.Count -lt 2 -or $fields[0] -notmatch '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521))$' -or $fields[1] -notmatch '^[A-Za-z0-9+/]+={0,2}$') { return [ordered]@{ state = 'NOT_VERIFIED'; privateKeyPath = $privatePath; publicKeyPath = $publicPath } }
    try { $blob = [Convert]::FromBase64String($fields[1]) } catch { return [ordered]@{ state = 'NOT_VERIFIED'; privateKeyPath = $privatePath; publicKeyPath = $publicPath } }
    if ($blob.Length -lt 5) { return [ordered]@{ state = 'NOT_VERIFIED'; privateKeyPath = $privatePath; publicKeyPath = $publicPath } }
    $algorithmLength = [Net.IPAddress]::NetworkToHostOrder([BitConverter]::ToInt32($blob, 0))
    if ($algorithmLength -le 0 -or $algorithmLength -gt ($blob.Length - 4) -or [Text.Encoding]::ASCII.GetString($blob, 4, $algorithmLength) -cne $fields[0]) { return [ordered]@{ state = 'NOT_VERIFIED'; privateKeyPath = $privatePath; publicKeyPath = $publicPath } }
    $digest = [Security.Cryptography.SHA256]::Create().ComputeHash($blob)
    [ordered]@{ state = 'DISCOVERED'; privateKeyPath = $privatePath; publicKeyPath = $publicPath; algorithm = $fields[0]; publicKey = $fields[1]; fingerprint = 'SHA256:' + [Convert]::ToBase64String($digest).TrimEnd('=') }
  })
  [ordered]@{ state = if (@($keys | Where-Object { $_.state -ne 'DISCOVERED' }).Count) { 'PARTIAL' } else { 'DISCOVERED' }; configPath = $config; source = $source; keys = $keys }
}

function Get-SshFirewallEvidence([Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$SshPort) {
  if (-not (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) -or -not (Get-Command Get-NetFirewallPortFilter -ErrorAction SilentlyContinue)) { return [ordered]@{ state = 'NOT_VERIFIED'; rules = @(); reason = 'Windows firewall rule-to-port APIs are unavailable.' } }
  $rules = @(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '(?i)SSH|OpenSSH' })
  $records = @($rules | ForEach-Object {
    $rule = $_
    $filters = @(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)
    $resolved = @($filters | Where-Object { "$($_.Protocol)" -match '^(6|TCP)$' -and "$($_.LocalPort)" -match '^\d+$' })
    $matching = @($resolved | Where-Object { $SshPort -contains [int]$_.LocalPort })
    $usable = "$($rule.Enabled)" -match '^(True|1)$' -and "$($rule.Direction)" -ieq 'Inbound' -and "$($rule.Action)" -ieq 'Allow'
    [ordered]@{ displayName = $rule.DisplayName; enabled = "$($rule.Enabled)"; direction = "$($rule.Direction)"; action = "$($rule.Action)"; state = if ($SshPort.Count -eq 0) { 'NOT_VERIFIED' } elseif ($matching.Count -and $usable) { 'DISCOVERED' } elseif ($resolved.Count) { 'CONFLICT' } else { 'NOT_VERIFIED' }; portFilters = @($filters | ForEach-Object { [ordered]@{ protocol = "$($_.Protocol)"; localPort = "$($_.LocalPort)" } }) }
  })
  [ordered]@{ state = if (@($records | Where-Object { $_.state -eq 'CONFLICT' }).Count) { 'CONFLICT' } elseif ($records.Count -gt 0 -and @($records | Where-Object { $_.state -ne 'DISCOVERED' }).Count -eq 0) { 'DISCOVERED' } else { 'NOT_VERIFIED' }; rules = $records }
}

function Normalize-ProcessCommandLine([AllowNull()][string]$CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return '' }
  return (Redact-SensitiveText $CommandLine).ToLowerInvariant().Replace('/','\')
}

function Get-ReparseTarget([Parameter(Mandatory = $true)][string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) { throw "Expected a reparse point: $Path" }
  $target = @($item.Target) | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($target)) { throw "Could not resolve reparse target: $Path" }
  return Get-CanonicalPath $target
}

function Assert-ReparseTarget([Parameter(Mandatory = $true)][string]$Path,[Parameter(Mandatory = $true)][string]$ExpectedTarget) {
  $actual = Get-ReparseTarget $Path
  if ((Normalize-ComparablePath $actual) -ne (Normalize-ComparablePath $ExpectedTarget)) { throw "Reparse target mismatch: $Path" }
  return $actual
}

function Assert-ReleasePointerTarget([Parameter(Mandatory = $true)][string]$PointerPath,[Parameter(Mandatory = $true)][string]$Root) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $releasesRoot = Assert-ExactChildPath $canonicalRoot 'releases'
  $target = Get-ReparseTarget $PointerPath
  if (-not (Test-PathWithin $target $releasesRoot)) { throw 'Release pointer target is outside the dedicated releases directory.' }
  $leaf = Split-Path -Leaf $target
  if ($leaf -notmatch '^[0-9a-f]{40}$') { throw 'Release pointer target must be a lowercase full SHA release directory.' }
  if (-not (Test-Path -LiteralPath $target -PathType Container)) { throw 'Release pointer target directory does not exist.' }
  if ((Normalize-ComparablePath (Split-Path -Parent $target)) -ne (Normalize-ComparablePath $releasesRoot)) { throw 'Release pointer target has an ambiguous parent path.' }
  return $target
}

function Assert-ExactMarkerProperties([Parameter(Mandatory = $true)]$Object,[Parameter(Mandatory = $true)][string[]]$Expected,[Parameter(Mandatory = $true)][string]$Label) {
  if ($null -eq $Object -or $Object -isnot [pscustomobject]) { throw "Deployment identity marker $Label must be an object." }
  $actual = @($Object.PSObject.Properties.Name)
  $expectedNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($name in $Expected) { [void]$expectedNames.Add($name) }
  foreach ($name in $Expected) { if (-not $expectedNames.Contains($name) -or -not (@($actual | Where-Object { $_ -ceq $name }).Count -eq 1)) { throw "Deployment identity marker $Label is missing required property: $name" } }
  foreach ($name in $actual) { if (-not $expectedNames.Contains($name)) { throw "Deployment identity marker $Label contains an unknown property." } }
}

function Assert-MarkerString([Parameter(Mandatory = $true)]$Value,[Parameter(Mandatory = $true)][string]$Label,[switch]$AbsolutePath) {
  if ($Value -isnot [string] -or [string]::IsNullOrWhiteSpace($Value)) { throw "Deployment identity marker $Label must be a non-empty string." }
  if ($AbsolutePath -and ($Value -notmatch '^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)')) { throw "Deployment identity marker $Label must be an absolute Windows path." }
  return $Value
}

function Assert-DeploymentMarkerSchema([Parameter(Mandatory = $true)]$Marker,[Parameter(Mandatory = $true)][string]$CanonicalRoot) {
  # Deliberately pure: this verifies JSON shape/types/path binding only, not host state.
  Assert-ExactMarkerProperties $Marker @('schemaVersion','systemId','canonicalRoot','domain','apiPort','nodeExe','envFile','startupWrapper','entryPoint','nginxExe','nginxConfig','foreignIsolation','startupBundle','service') 'top level'
  if (($Marker.schemaVersion -isnot [int] -and $Marker.schemaVersion -isnot [long]) -or [long]$Marker.schemaVersion -ne 1) { throw 'Deployment identity marker schemaVersion must be integer 1.' }
  if ((Assert-MarkerString $Marker.systemId 'systemId') -cne 'baogiang-damsan') { throw 'Deployment identity marker systemId mismatch.' }
  $markerRoot = Assert-MarkerString $Marker.canonicalRoot 'canonicalRoot' -AbsolutePath
  if ((Normalize-ComparablePath $markerRoot) -ne (Normalize-ComparablePath $CanonicalRoot)) { throw 'Deployment identity marker root mismatch.' }
  if ((Assert-MarkerString $Marker.domain 'domain') -cne 'https://baogiang.dtnt-damsan.edu.vn') { throw 'Deployment identity marker domain mismatch.' }
  if (($Marker.apiPort -isnot [int] -and $Marker.apiPort -isnot [long]) -or [long]$Marker.apiPort -ne 3100) { throw 'Deployment identity marker apiPort must be integer 3100.' }
  foreach ($pathField in @('nodeExe','envFile','startupWrapper','entryPoint','nginxExe','nginxConfig')) { Assert-MarkerString $Marker.$pathField $pathField -AbsolutePath | Out-Null }

  Assert-ExactMarkerProperties $Marker.startupBundle @('wrapperPath','wrapperSha256','commonPath','commonSha256') 'startupBundle'
  foreach ($pathField in @('wrapperPath','commonPath')) { Assert-MarkerString $Marker.startupBundle.$pathField "startupBundle.$pathField" -AbsolutePath | Out-Null }
  foreach ($hashField in @('wrapperSha256','commonSha256')) {
    $hash = Assert-MarkerString $Marker.startupBundle.$hashField "startupBundle.$hashField"
    if ($hash -notmatch '^[0-9A-Fa-f]{64}$') { throw "Deployment identity marker startupBundle.$hashField must be a SHA-256 hex digest." }
  }

  Assert-ExactMarkerProperties $Marker.foreignIsolation @('reviewedNginxPrefix','reviewedNginxConfig','foreignRoots','bootstrapReportReference') 'foreignIsolation'
  $nginxPrefix = Assert-MarkerString $Marker.foreignIsolation.reviewedNginxPrefix 'foreignIsolation.reviewedNginxPrefix' -AbsolutePath
  $reviewedConfig = Assert-MarkerString $Marker.foreignIsolation.reviewedNginxConfig 'foreignIsolation.reviewedNginxConfig' -AbsolutePath
  if ((Normalize-ComparablePath $reviewedConfig) -ne (Normalize-ComparablePath $Marker.nginxConfig)) { throw 'Deployment identity marker reviewed Nginx config mismatch.' }
  if ((Test-PathWithin $nginxPrefix $CanonicalRoot) -or (Test-PathWithin $CanonicalRoot $nginxPrefix)) { throw 'Deployment identity marker reviewed Nginx prefix overlaps the dedicated root.' }
  Assert-MarkerString $Marker.foreignIsolation.bootstrapReportReference 'foreignIsolation.bootstrapReportReference' | Out-Null
  if ($Marker.foreignIsolation.foreignRoots -isnot [object[]] -or @($Marker.foreignIsolation.foreignRoots).Count -eq 0) { throw 'Deployment identity marker foreignRoots must be a non-empty JSON array.' }
  $foreignRoots = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($foreignRootValue in @($Marker.foreignIsolation.foreignRoots)) {
    $foreignRoot = Assert-MarkerString $foreignRootValue 'foreignIsolation.foreignRoots member' -AbsolutePath
    $normalized = Normalize-ComparablePath $foreignRoot
    if (-not $foreignRoots.Add($normalized)) { throw 'Deployment identity marker foreignRoots contains a duplicate.' }
    if ((Test-PathWithin $foreignRoot $CanonicalRoot) -or (Test-PathWithin $CanonicalRoot $foreignRoot)) { throw 'Deployment identity marker foreignRoots overlaps the dedicated root.' }
  }

  if ($Marker.service -isnot [pscustomobject]) { throw 'Deployment identity marker service must be an object.' }
  $kind = Assert-MarkerString $Marker.service.kind 'service.kind'
  if ($kind -ceq 'scheduled-task') {
    Assert-ExactMarkerProperties $Marker.service @('kind','name','taskPath','account','execute','arguments','workingDirectory') 'service'
    foreach ($field in @('name','taskPath','account','execute','arguments','workingDirectory')) { Assert-MarkerString $Marker.service.$field "service.$field" | Out-Null }
    if ($Marker.service.name -notmatch '^[A-Za-z0-9._-]{1,128}$') { throw 'Deployment identity marker scheduled-task name does not match the safe runtime-name syntax.' }
    foreach ($pathField in @('execute','workingDirectory')) { Assert-MarkerString $Marker.service.$pathField "service.$pathField" -AbsolutePath | Out-Null }
  } elseif ($kind -ceq 'service') {
    Assert-ExactMarkerProperties $Marker.service @('kind','name','account','pathName') 'service'
    foreach ($field in @('name','account','pathName')) { Assert-MarkerString $Marker.service.$field "service.$field" | Out-Null }
    if ($Marker.service.name -notmatch '^[A-Za-z0-9._-]{1,128}$') { throw 'Deployment identity marker service name does not match the safe runtime-name syntax.' }
  } else { throw 'Deployment identity marker service.kind is unsupported.' }
  return $Marker
}

function Read-DeploymentIdentity(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ServiceName,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper,
  [Parameter(Mandatory = $true)][string]$ExpectedEntryPoint,
  [string]$NodeExe,
  [string]$NginxExe,
  [string]$NginxConfig
) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $markerPath = Join-Path $canonicalRoot 'shared\deployment-identity.json'
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { throw 'Dedicated deployment identity marker is missing.' }
  $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-DeploymentMarkerSchema -Marker $marker -CanonicalRoot $canonicalRoot | Out-Null
  if ($marker.service.kind -cne $ServiceKind -or $marker.service.name -cne $ServiceName) { throw 'Deployment identity marker task/service mismatch.' }
  if ((Normalize-ComparablePath $marker.envFile) -ne (Normalize-ComparablePath $EnvFile)) { throw 'Deployment identity marker env path mismatch.' }
  if ((Normalize-ComparablePath $marker.startupWrapper) -ne (Normalize-ComparablePath $StartupWrapper)) { throw 'Deployment identity marker startup wrapper mismatch.' }
  if ((Normalize-ComparablePath $marker.entryPoint) -ne (Normalize-ComparablePath $ExpectedEntryPoint)) { throw 'Deployment identity marker entry point mismatch.' }
  if (-not [string]::IsNullOrWhiteSpace($NodeExe) -and (Normalize-ComparablePath $marker.nodeExe) -ne (Normalize-ComparablePath $NodeExe)) { throw 'Deployment identity marker Node executable mismatch.' }
  if (-not [string]::IsNullOrWhiteSpace($NginxExe) -and (Normalize-ComparablePath $marker.nginxExe) -ne (Normalize-ComparablePath $NginxExe)) { throw 'Deployment identity marker Nginx executable mismatch.' }
  if (-not [string]::IsNullOrWhiteSpace($NginxConfig) -and (Normalize-ComparablePath $marker.nginxConfig) -ne (Normalize-ComparablePath $NginxConfig)) { throw 'Deployment identity marker Nginx config mismatch.' }
  foreach ($name in @('releases','staging','incoming','shared','logs','backups')) { Assert-ExistingDirectory (Join-Path $canonicalRoot $name) | Out-Null }
  if ((Normalize-ComparablePath $marker.startupBundle.wrapperPath) -ne (Normalize-ComparablePath $StartupWrapper)) { throw 'Deployment marker startup bundle wrapper path mismatch.' }
  $commonPath = Join-Path (Split-Path -Parent $StartupWrapper) 'deployment-common.ps1'
  if ((Normalize-ComparablePath $marker.startupBundle.commonPath) -ne (Normalize-ComparablePath $commonPath)) { throw 'Deployment marker startup bundle helper path mismatch.' }
  foreach ($bundleFile in @(@{ path = $marker.startupBundle.wrapperPath; hash = $marker.startupBundle.wrapperSha256 }, @{ path = $marker.startupBundle.commonPath; hash = $marker.startupBundle.commonSha256 })) {
    Assert-ExistingLeaf $bundleFile.path 'Startup runtime bundle file' | Out-Null
    if ((Get-FileHash -LiteralPath $bundleFile.path -Algorithm SHA256).Hash -ine $bundleFile.hash) { throw 'Startup runtime bundle hash mismatch.' }
  }
  foreach ($requiredLeaf in @(@{ path = $marker.nodeExe; label = 'Node executable' }, @{ path = $marker.envFile; label = 'Production environment file' }, @{ path = $marker.nginxExe; label = 'Nginx executable' }, @{ path = $marker.nginxConfig; label = 'Nginx config' })) { Assert-ExistingLeaf $requiredLeaf.path $requiredLeaf.label | Out-Null }
  if ($marker.service.kind -eq 'scheduled-task') {
    Assert-ExistingLeaf $marker.service.execute 'Scheduled Task executable' | Out-Null
    Assert-ExistingDirectory $marker.service.workingDirectory | Out-Null
  }
  return [pscustomobject]@{ canonicalRoot = $canonicalRoot; marker = $marker }
}

function Assert-VerifiedRuntimeIdentity([Parameter(Mandatory = $true)]$Marker,[Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,[Parameter(Mandatory = $true)][string]$ServiceName) {
  if ($ServiceKind -eq 'scheduled-task') {
    $tasks = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -ceq $ServiceName })
    if ($tasks.Count -ne 1) { throw 'Exact Scheduled Task identity is missing or ambiguous.' }
    $task = $tasks[0]
    if ($task.TaskPath -cne $marker.service.taskPath) { throw 'Scheduled Task path mismatch.' }
    if ($task.Principal.UserId -cne $marker.service.account) { throw 'Scheduled Task account mismatch.' }
    $actions = @($task.Actions)
    if ($actions.Count -ne 1) { throw 'Scheduled Task must have exactly one action.' }
    if ((Normalize-ComparablePath $actions[0].Execute) -ne (Normalize-ComparablePath $marker.service.execute)) { throw 'Scheduled Task executable mismatch.' }
    if (($actions[0].Arguments -replace '\s+',' ').Trim() -cne ($marker.service.arguments -replace '\s+',' ').Trim()) { throw 'Scheduled Task arguments mismatch.' }
    if ((Normalize-ComparablePath $actions[0].WorkingDirectory) -ne (Normalize-ComparablePath $marker.service.workingDirectory)) { throw 'Scheduled Task working directory mismatch.' }
  } else {
    $services = @(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object { $_.Name -ceq $ServiceName })
    if ($services.Count -ne 1) { throw 'Exact Windows Service identity is missing or ambiguous.' }
    if ($services[0].StartName -cne $marker.service.account -or $services[0].PathName -cne $marker.service.pathName) { throw 'Windows Service action/account mismatch.' }
  }
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3100 -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction Stop
    $exeMatches = (Normalize-ComparablePath $process.ExecutablePath) -eq (Normalize-ComparablePath $marker.nodeExe)
    if (-not $exeMatches -or (Normalize-ProcessCommandLine $process.CommandLine) -notlike "*$(Normalize-ProcessCommandLine $marker.entryPoint)*") { throw 'Port 3100 is occupied by a process that does not match the deployment marker.' }
  }
  return $true
}

function Get-SafeStopPollingDecision([Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$ExactProcessId,[Parameter(Mandatory = $true)]$Listeners) {
  $exactIds = @($ExactProcessId | ForEach-Object { [int]$_ })
  $rows = @($Listeners)
  $foreign = @($rows | Where-Object { $exactIds -notcontains [int]$_.OwningProcess })
  if ($foreign.Count -gt 0) { return [ordered]@{ state = 'CONFLICT'; exactProcessCount = $exactIds.Count; listenerCount = $rows.Count; foreignListenerCount = $foreign.Count } }
  if ($exactIds.Count -eq 0 -and $rows.Count -eq 0) { return [ordered]@{ state = 'PASS'; exactProcessCount = 0; listenerCount = 0; foreignListenerCount = 0 } }
  return [ordered]@{ state = 'WAIT'; exactProcessCount = $exactIds.Count; listenerCount = $rows.Count; foreignListenerCount = 0 }
}

function Get-DatabaseEvidenceClassification([Parameter(Mandatory = $true)][string]$ActualDatabase,[Parameter(Mandatory = $true)][string]$ExpectedDatabase,[Parameter(Mandatory = $true)][string]$ActualRole,[Parameter(Mandatory = $true)][string]$ExpectedRole,[Parameter(Mandatory = $true)][string[]]$ActualExtensions,[Parameter(Mandatory = $true)][string[]]$RequiredExtensions,[Parameter(Mandatory = $true)][bool]$MigrationTablePresent,[int]$UnfinishedMigrations = 0,[int]$RolledBackMigrations = 0,[bool]$MigrationSummaryVerified = $false) {
  if ($ActualDatabase -cne $ExpectedDatabase -or $ActualRole -cne $ExpectedRole) { return [ordered]@{ state = 'CONFLICT'; identityState = 'CONFLICT' } }
  $missing = @($RequiredExtensions | Where-Object { $ActualExtensions -notcontains $_ })
  if ($missing.Count -gt 0) { return [ordered]@{ state = 'CONFLICT'; identityState = 'EXISTS AND VERIFIED'; missingExtensions = $missing } }
  if (-not $MigrationTablePresent) { return [ordered]@{ state = 'PARTIAL'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'NOT_APPLIED' } }
  if (-not $MigrationSummaryVerified) { return [ordered]@{ state = 'PARTIAL'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'NOT_VERIFIED' } }
  if ($UnfinishedMigrations -gt 0 -or $RolledBackMigrations -gt 0) { return [ordered]@{ state = 'CONFLICT'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'BLOCKING_ROWS'; unfinished = $UnfinishedMigrations; rolledBack = $RolledBackMigrations } }
  return [ordered]@{ state = 'EXISTS AND VERIFIED'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'CLEAN' }
}

function Get-DatabaseEvidenceQueryPlan([Parameter(Mandatory = $true)][bool]$MigrationTablePresent) {
  $plan = @([pscustomobject]@{ name = 'identity'; sql = "SELECT current_database() || '|' || current_user; SELECT extname FROM pg_extension ORDER BY extname; SELECT CASE WHEN to_regclass('_prisma_migrations') IS NULL THEN 'MISSING' ELSE 'PRESENT' END;" })
  if ($MigrationTablePresent) { $plan += [pscustomobject]@{ name = 'migration-summary'; sql = "SELECT count(*) FILTER (WHERE finished_at IS NULL)::text || '|' || count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::text FROM _prisma_migrations;" } }
  return $plan
}

function Stop-ExactBaoGiangRuntime([Parameter(Mandatory = $true)]$Marker,[Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,[Parameter(Mandatory = $true)][string]$ServiceName,[ValidateRange(1,10)][int]$MaxAttempts = 6,[ValidateRange(0,10)][int]$DelaySeconds = 1) {
  # Identity validation is intentionally before every mutation; never target a generic node.exe.
  Assert-VerifiedRuntimeIdentity -Marker $Marker -ServiceKind $ServiceKind -ServiceName $ServiceName | Out-Null
  if ($ServiceKind -eq 'scheduled-task') {
    $tasks = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -ceq $ServiceName -and $_.TaskPath -ceq $Marker.service.taskPath })
    if ($tasks.Count -ne 1 -or @($tasks[0].Actions).Count -ne 1) { throw 'Exact Scheduled Task cannot be safely stopped.' }
    # A first-deploy failure must not be restarted by an automatic trigger.
    Disable-ScheduledTask -TaskName $ServiceName -TaskPath $Marker.service.taskPath -ErrorAction Stop | Out-Null
    Stop-ScheduledTask -TaskName $ServiceName -TaskPath $Marker.service.taskPath -ErrorAction SilentlyContinue
  } else {
    $services = @(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object { $_.Name -ceq $ServiceName -and $_.PathName -ceq $Marker.service.pathName -and $_.StartName -ceq $Marker.service.account })
    if ($services.Count -ne 1) { throw 'Exact Windows Service cannot be safely stopped.' }
    Stop-Service -Name $ServiceName -Force -ErrorAction Stop
    Set-Service -Name $ServiceName -StartupType Disabled -ErrorAction Stop
  }
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    $exact = @((Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
      (Normalize-ComparablePath $_.ExecutablePath) -eq (Normalize-ComparablePath $Marker.nodeExe) -and (Normalize-ProcessCommandLine $_.CommandLine) -like "*$(Normalize-ProcessCommandLine $Marker.entryPoint)*"
    }))
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3100 -ErrorAction SilentlyContinue)
    $decision = Get-SafeStopPollingDecision -ExactProcessId @($exact | Select-Object -ExpandProperty ProcessId) -Listeners $listeners
    if ($decision.state -eq 'CONFLICT') { throw "Safe-stop conflict: foreign process owns port 3100 (listener count $($decision.listenerCount))." }
    if ($decision.state -eq 'PASS') { return [ordered]@{ state = 'stopped'; serviceKind = $ServiceKind; serviceName = $ServiceName; attempts = $attempt; apiProcessCount = 0; listenerCount = 0 } }
    if ($attempt -lt $MaxAttempts -and $DelaySeconds -gt 0) { Start-Sleep -Seconds $DelaySeconds }
  }
  throw 'Safe-stop timeout: exact Báo giảng API process remains after the bounded wait.'
}

function Quarantine-FailedFirstRelease([Parameter(Mandatory = $true)][string]$Root,[Parameter(Mandatory = $true)][string]$FailedSha) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $current = Join-Path $canonicalRoot 'current'; $previous = Join-Path $canonicalRoot 'previous'; $failed = Join-Path $canonicalRoot 'failed-release'
  if (Test-Path -LiteralPath $previous) { throw 'First-deploy quarantine refuses an existing previous release pointer.' }
  if (Test-Path -LiteralPath $failed) { throw 'Failed-release quarantine pointer already exists; operator inspection is required.' }
  if (-not (Test-Path -LiteralPath $current)) { throw 'Current pointer is missing for first-deploy quarantine.' }
  $target = Assert-ReleasePointerTarget -PointerPath $current -Root $canonicalRoot
  if ((Split-Path -Leaf $target) -cne $FailedSha) { throw 'Current pointer does not identify the failed release.' }
  Move-Item -LiteralPath $current -Destination $failed -ErrorAction Stop
  Assert-ReleasePointerTarget -PointerPath $failed -Root $canonicalRoot | Out-Null
  if (Test-Path -LiteralPath $current) { throw 'Current pointer remained after first-deploy quarantine.' }
  return [ordered]@{ state = 'quarantined'; failedRelease = $FailedSha; pointer = $failed }
}

function Assert-ExecutableContract([Parameter(Mandatory = $true)][hashtable]$Executables) {
  foreach ($key in $Executables.Keys) { Assert-ExistingLeaf -Path $Executables[$key] -Label $key | Out-Null }
}

function Invoke-NativeChecked(
  [Parameter(Mandatory = $true)][string]$FilePath,
  [Parameter(Mandatory = $true)][object[]]$ArgumentList,
  [Parameter(Mandatory = $true)][string]$Operation
) {
  & $FilePath @ArgumentList
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { throw "$Operation failed with exit code $exitCode." }
}

function Import-ServerEnvironment(
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$ExpectedBaseUrl
) {
  Assert-ExistingLeaf $EnvFile 'Production environment file' | Out-Null
  $allowed = @('NODE_ENV','TZ','API_HOST','API_PORT','HTTP_TRUST_PROXY_HOPS','DATABASE_URL','TEST_DATABASE_URL','CORS_ORIGINS','AUTH_SESSION_TTL_SECONDS','AUTH_LAST_SEEN_UPDATE_SECONDS','AUTH_COOKIE_NAME','AUTH_COOKIE_PATH','AUTH_COOKIE_DOMAIN','AUTH_COOKIE_SECURE','AUTH_COOKIE_SAME_SITE','AUTH_LOCKOUT_THRESHOLD','AUTH_LOCKOUT_DURATION_SECONDS','AUTH_PASSWORD_MIN_LENGTH','AUTH_LOGIN_RATE_LIMIT_MAX','AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS','AUTH_LOGIN_RATE_LIMIT_MAX_KEYS','BOOTSTRAP_ADMIN_USERNAME','BOOTSTRAP_ADMIN_DISPLAY_NAME','BOOTSTRAP_ADMIN_PASSWORD','AI_ENABLED','AI_ACTIVE_MODE_ENABLED','AI_PASSIVE_MODE_ENABLED','WEB_PUSH_ENABLED','LOG_LEVEL')
  $seen = @{}
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#') { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { throw 'Production environment contains an invalid assignment.' }
    $name = $Matches[1]; $value = $Matches[2]
    if ($allowed -notcontains $name) { throw "Production environment contains an unapproved variable: $name" }
    if ($seen.ContainsKey($name)) { throw "Production environment contains a duplicate variable: $name" }
    $seen[$name] = $true
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
  foreach ($forbidden in @('TEST_DATABASE_URL','BOOTSTRAP_ADMIN_USERNAME','BOOTSTRAP_ADMIN_DISPLAY_NAME','BOOTSTRAP_ADMIN_PASSWORD')) {
    if ($seen.ContainsKey($forbidden)) { throw "Production runtime environment may not contain $forbidden." }
  }
  if (-not $seen.ContainsKey('TZ')) { throw 'Production runtime environment must explicitly contain TZ.' }
  if ($env:NODE_ENV -ne 'production' -or $env:TZ -ne 'Asia/Ho_Chi_Minh' -or $env:API_HOST -notin @('127.0.0.1','::1','localhost') -or $env:API_PORT -ne '3100' -or $env:HTTP_TRUST_PROXY_HOPS -ne '1' -or $env:AUTH_COOKIE_SECURE -ne 'true' -or $env:AI_ENABLED -ne 'false' -or $env:AI_ACTIVE_MODE_ENABLED -ne 'false' -or $env:AI_PASSIVE_MODE_ENABLED -ne 'false' -or $env:WEB_PUSH_ENABLED -ne 'false' -or [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw 'Production environment safety validation failed.' }
  $origins = @($env:CORS_ORIGINS -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($origins.Count -ne 1 -or $origins[0] -ne $ExpectedBaseUrl) { throw 'Production CORS origin is not the exact approved domain.' }
  return $seen.Keys
}

function Get-DatabaseParts([Parameter(Mandatory = $true)][string]$DatabaseUrl) {
  try { $uri = [Uri]$DatabaseUrl } catch { throw 'DATABASE_URL is not a valid PostgreSQL URI.' }
  if ($uri.Scheme -notin @('postgres','postgresql') -or [string]::IsNullOrWhiteSpace($uri.Host) -or [string]::IsNullOrWhiteSpace($uri.AbsolutePath.Trim('/')) -or [string]::IsNullOrWhiteSpace($uri.UserInfo)) { throw 'DATABASE_URL does not contain the required PostgreSQL fields.' }
  $userinfo = $uri.UserInfo.Split(':',2)
  if ($userinfo.Count -ne 2) { throw 'DATABASE_URL must provide a user and password through URI userinfo.' }
  [ordered]@{ host = $uri.Host; port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }; database = $uri.AbsolutePath.Trim('/'); user = [Uri]::UnescapeDataString($userinfo[0]); password = [Uri]::UnescapeDataString($userinfo[1]) }
}

function Set-PostgresProcessEnvironment([Parameter(Mandatory = $true)][string]$DatabaseUrl,[int]$ExpectedPort = 5433) {
  $parts = Get-DatabaseParts $DatabaseUrl
  if ([int]$parts.port -ne $ExpectedPort) { throw 'DATABASE_URL PostgreSQL port does not match the reviewed inventory.' }
  $env:PGHOST = $parts.host; $env:PGPORT = [string]$parts.port; $env:PGDATABASE = $parts.database; $env:PGUSER = $parts.user; $env:PGPASSWORD = $parts.password
  return $parts
}

function Clear-PostgresProcessEnvironment {
  foreach ($name in @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD')) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
}

function Get-SafeErrorCategory([Parameter(Mandatory = $true)]$ErrorRecord) {
  return $ErrorRecord.Exception.GetType().Name
}

function Write-RedactedReport([Parameter(Mandatory = $true)][string]$Path,[Parameter(Mandatory = $true)][object]$Data) {
  $safe = $Data | ConvertTo-Json -Depth 12
  if ($safe -match '(?i)postgres(?:ql)?://[^\s"'']+:[^\s"'']+@|BEGIN .*PRIVATE KEY|PGPASSWORD=') { throw 'Redacted report contains a forbidden secret pattern.' }
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($Path), $safe, [Text.UTF8Encoding]::new($false))
}
