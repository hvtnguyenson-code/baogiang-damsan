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
  Assert-PathAncestorChainNonReparse -Directory $canonical -AllowMissing -CategoryPrefix 'PRODUCTION_ROOT' | Out-Null
  return $canonical
}

function Get-DeploymentMarkerAuthorityContractVersion { return 1 }

function Assert-ExistingDirectory([Parameter(Mandatory = $true)][string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw "A bootstrapped directory is missing: $Path" }
  return Get-CanonicalPath $Path
}

function Get-ProductionRequiredDirectoryNames {
  return @('releases','staging','incoming','shared','logs','backups')
}

function Get-PathSecurityClassification(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][ValidateSet('directory','file')][string]$Kind
) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if ($null -eq $item) { return [pscustomobject]@{ state = 'MISSING'; path = Get-CanonicalPath $Path; kind = $Kind } }
  $actualKind = if ($item.PSIsContainer) { 'directory' } else { 'file' }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return [pscustomobject]@{ state = 'REPARSE_POINT'; path = Get-CanonicalPath $Path; kind = $Kind } }
  if ($actualKind -ne $Kind) { return [pscustomobject]@{ state = 'TYPE_MISMATCH'; path = Get-CanonicalPath $Path; kind = $Kind } }
  return [pscustomobject]@{ state = 'PASS'; path = Get-CanonicalPath $Path; kind = $Kind }
}

function Assert-ExistingNonReparseDirectory(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][ValidateSet('PRODUCTION_ROOT','PRODUCTION_SUBDIRECTORY')][string]$Role
) {
  $classification = Get-PathSecurityClassification -Path $Path -Kind directory
  if ($Role -eq 'PRODUCTION_ROOT') {
    if ($classification.state -eq 'REPARSE_POINT') { throw 'PRODUCTION_ROOT_REPARSE_POINT' }
    if ($classification.state -eq 'MISSING') { throw 'PRODUCTION_ROOT_MISSING' }
    if ($classification.state -eq 'TYPE_MISMATCH') { throw 'PRODUCTION_ROOT_TYPE_MISMATCH' }
  } else {
    if ($classification.state -eq 'REPARSE_POINT') { throw 'PRODUCTION_SUBDIRECTORY_REPARSE_POINT' }
    if ($classification.state -eq 'MISSING') { throw 'PRODUCTION_SUBDIRECTORY_MISSING' }
    if ($classification.state -eq 'TYPE_MISMATCH') { throw 'PRODUCTION_SUBDIRECTORY_TYPE_MISMATCH' }
  }
  return $classification.path
}

function Assert-ExistingLeaf([Parameter(Mandatory = $true)][string]$Path,[string]$Label = 'Executable') {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label must be an existing file: $Path" }
  return Get-CanonicalPath $Path
}

function Get-CanonicalStartupBundleLayout(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReviewedCommitSha
) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $bundleRoot = Assert-ExactChildPath -Root $canonicalRoot -RelativePath 'shared\startup-bundles'
  $versionDirectory = Assert-ExactChildPath -Root $canonicalRoot -RelativePath "shared\startup-bundles\$ReviewedCommitSha"
  return [pscustomobject][ordered]@{
    bundleRoot = $bundleRoot
    versionDirectory = $versionDirectory
    wrapperPath = Get-CanonicalPath (Join-Path $versionDirectory 'start-baogiang-api.ps1')
    commonPath = Get-CanonicalPath (Join-Path $versionDirectory 'deployment-common.ps1')
  }
}

function Get-CanonicalStartupBundleLayoutFromWrapper(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$StartupWrapper
) {
  $wrapperPath = Get-CanonicalPath $StartupWrapper
  if ((Split-Path -Leaf $wrapperPath) -cne 'start-baogiang-api.ps1') { throw 'STARTUP_BUNDLE_LAYOUT_CONFLICT' }
  $versionDirectory = Split-Path -Parent $wrapperPath
  $reviewedCommitSha = Split-Path -Leaf $versionDirectory
  if ($reviewedCommitSha -notmatch '^[0-9a-f]{40}$') { throw 'STARTUP_BUNDLE_LAYOUT_CONFLICT' }
  $layout = Get-CanonicalStartupBundleLayout -Root $Root -ReviewedCommitSha $reviewedCommitSha
  if ((Normalize-ComparablePath $layout.wrapperPath) -ne (Normalize-ComparablePath $wrapperPath)) { throw 'STARTUP_BUNDLE_LAYOUT_CONFLICT' }
  $layout | Add-Member -NotePropertyName reviewedCommitSha -NotePropertyValue $reviewedCommitSha
  return $layout
}

function Assert-ExistingNonReparseStartupBundleLayout([Parameter(Mandatory = $true)]$Layout) {
  foreach ($directory in @($Layout.bundleRoot,$Layout.versionDirectory)) {
    $classification = Get-PathSecurityClassification -Path $directory -Kind directory
    if ($classification.state -eq 'REPARSE_POINT') { throw 'STARTUP_BUNDLE_REPARSE_POINT' }
    if ($classification.state -eq 'MISSING') { throw 'STARTUP_BUNDLE_MISSING' }
    if ($classification.state -eq 'TYPE_MISMATCH') { throw 'STARTUP_BUNDLE_LAYOUT_CONFLICT' }
  }
  foreach ($file in @($Layout.wrapperPath,$Layout.commonPath)) {
    $classification = Get-PathSecurityClassification -Path $file -Kind file
    if ($classification.state -eq 'REPARSE_POINT') { throw 'STARTUP_BUNDLE_REPARSE_POINT' }
    if ($classification.state -eq 'MISSING') { throw 'STARTUP_BUNDLE_PARTIAL_DESTINATION' }
    if ($classification.state -eq 'TYPE_MISMATCH') { throw 'STARTUP_BUNDLE_LAYOUT_CONFLICT' }
  }
  return $Layout
}

function Get-Sha256FromBytes([Parameter(Mandatory = $true)][byte[]]$Bytes) {
  $digest = [Security.Cryptography.SHA256]::Create().ComputeHash($Bytes)
  return ([BitConverter]::ToString($digest)).Replace('-','').ToLowerInvariant()
}

function Get-FileSha256FromBytes([Parameter(Mandatory = $true)][string]$Path) {
  return Get-Sha256FromBytes ([IO.File]::ReadAllBytes((Get-CanonicalPath $Path)))
}

function Invoke-GitCapturedBytes(
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string[]]$Argument
) {
  $repository = Assert-ExistingDirectory $RepositoryRoot
  $gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($null -eq $gitCommand) { $gitCommand = Get-Command git -ErrorAction SilentlyContinue }
  if ($null -eq $gitCommand -or [string]::IsNullOrWhiteSpace($gitCommand.Source)) { throw 'STARTUP_BUNDLE_SOURCE_INVALID' }
  foreach ($value in $Argument) { if ($value -notmatch '^[A-Za-z0-9._/:{}^-]+$') { throw 'STARTUP_BUNDLE_SOURCE_INVALID' } }
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $gitCommand.Source
  $startInfo.WorkingDirectory = $repository
  $startInfo.Arguments = $Argument -join ' '
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $output = [IO.MemoryStream]::new()
  try {
    if (-not $process.Start()) { throw 'STARTUP_BUNDLE_SOURCE_INVALID' }
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.StandardOutput.BaseStream.CopyTo($output)
    $process.WaitForExit()
    [void]$stderrTask.Result
    if ($process.ExitCode -ne 0) { throw 'STARTUP_BUNDLE_SOURCE_INVALID' }
    return [pscustomobject]@{ bytes = $output.ToArray(); exitCode = $process.ExitCode }
  } finally {
    $output.Dispose()
    $process.Dispose()
  }
}

function Get-GitAsciiOutput([Parameter(Mandatory = $true)][string]$RepositoryRoot,[Parameter(Mandatory = $true)][string[]]$Argument) {
  $result = Invoke-GitCapturedBytes -RepositoryRoot $RepositoryRoot -Argument $Argument
  return [Text.Encoding]::ASCII.GetString($result.bytes).Trim()
}

function Get-StartupBundleProvenancePlan(
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReviewedCommitSha,
  [Parameter(Mandatory = $true)][string]$Root
) {
  $repository = Assert-ExistingDirectory $RepositoryRoot
  if ((Get-GitAsciiOutput -RepositoryRoot $repository -Argument @('rev-parse','--show-prefix')) -cne '') { throw 'STARTUP_BUNDLE_SOURCE_INVALID' }
  if ((Get-GitAsciiOutput -RepositoryRoot $repository -Argument @('cat-file','-t',$ReviewedCommitSha)) -cne 'commit') { throw 'STARTUP_BUNDLE_SOURCE_INVALID' }
  $sourceRecords = [ordered]@{}
  foreach ($entry in @(
    @{ role = 'wrapper'; path = 'scripts/deploy/windows/start-baogiang-api.ps1' },
    @{ role = 'common'; path = 'scripts/deploy/windows/deployment-common.ps1' }
  )) {
    $oid = Get-GitAsciiOutput -RepositoryRoot $repository -Argument @('rev-parse','--verify',"${ReviewedCommitSha}:$($entry.path)")
    if ($oid -notmatch '^[0-9a-f]{40,64}$' -or (Get-GitAsciiOutput -RepositoryRoot $repository -Argument @('cat-file','-t',$oid)) -cne 'blob') { throw 'STARTUP_BUNDLE_SOURCE_INVALID' }
    $blob = Invoke-GitCapturedBytes -RepositoryRoot $repository -Argument @('cat-file','blob',$oid)
    $sourceRecords[$entry.role] = [pscustomobject][ordered]@{ repositoryPath = $entry.path; gitBlobOid = $oid; sha256 = Get-Sha256FromBytes $blob.bytes }
  }
  $layout = Get-CanonicalStartupBundleLayout -Root $Root -ReviewedCommitSha $ReviewedCommitSha
  return [pscustomobject][ordered]@{
    schemaVersion = 1
    mode = 'READ_ONLY_STARTUP_BUNDLE_PLAN'
    mutationsPerformed = $false
    reviewedCommitSha = $ReviewedCommitSha
    source = [pscustomobject]$sourceRecords
    destination = $layout
    policy = [pscustomobject][ordered]@{ overwriteExisting = $false; deletePreviousVersions = $false; exactExistingMayBeReused = $true; updateRequiresNewCommitDirectory = $true }
  }
}

function Assert-StartupBundlePlanObject([Parameter(Mandatory = $true)]$Object,[Parameter(Mandatory = $true)][string[]]$Expected) {
  if ($null -eq $Object -or $Object -isnot [pscustomobject]) { throw 'STARTUP_BUNDLE_PLAN_INVALID' }
  $actual = @($Object.PSObject.Properties.Name)
  if ($actual.Count -ne $Expected.Count) { throw 'STARTUP_BUNDLE_PLAN_INVALID' }
  foreach ($name in $Expected) { if (@($actual | Where-Object { $_ -ceq $name }).Count -ne 1) { throw 'STARTUP_BUNDLE_PLAN_INVALID' } }
}

function Assert-StartupBundlePlanSchema(
  [Parameter(Mandatory = $true)]$Plan,
  [Parameter(Mandatory = $true)][string]$Root
) {
  Assert-StartupBundlePlanObject $Plan @('schemaVersion','mode','mutationsPerformed','reviewedCommitSha','source','destination','policy')
  if ($Plan.schemaVersion -isnot [int] -and $Plan.schemaVersion -isnot [long]) { throw 'STARTUP_BUNDLE_PLAN_INVALID' }
  if ($Plan.schemaVersion -ne 1 -or $Plan.mode -cne 'READ_ONLY_STARTUP_BUNDLE_PLAN' -or $Plan.mutationsPerformed -isnot [bool] -or $Plan.mutationsPerformed) { throw 'STARTUP_BUNDLE_PLAN_INVALID' }
  if ($Plan.reviewedCommitSha -isnot [string] -or $Plan.reviewedCommitSha -notmatch '^[0-9a-f]{40}$') { throw 'STARTUP_BUNDLE_PLAN_INVALID' }
  Assert-StartupBundlePlanObject $Plan.source @('wrapper','common')
  foreach ($source in @(
    @{ value = $Plan.source.wrapper; path = 'scripts/deploy/windows/start-baogiang-api.ps1' },
    @{ value = $Plan.source.common; path = 'scripts/deploy/windows/deployment-common.ps1' }
  )) {
    Assert-StartupBundlePlanObject $source.value @('repositoryPath','gitBlobOid','sha256')
    if ($source.value.repositoryPath -cne $source.path -or $source.value.gitBlobOid -isnot [string] -or $source.value.gitBlobOid -notmatch '^[0-9a-f]{40,64}$' -or $source.value.sha256 -isnot [string] -or $source.value.sha256 -notmatch '^[0-9a-f]{64}$') { throw 'STARTUP_BUNDLE_PLAN_INVALID' }
  }
  Assert-StartupBundlePlanObject $Plan.destination @('bundleRoot','versionDirectory','wrapperPath','commonPath')
  $expectedLayout = Get-CanonicalStartupBundleLayout -Root $Root -ReviewedCommitSha $Plan.reviewedCommitSha
  foreach ($field in @('bundleRoot','versionDirectory','wrapperPath','commonPath')) {
    if ($Plan.destination.$field -isnot [string] -or (Normalize-ComparablePath $Plan.destination.$field) -ne (Normalize-ComparablePath $expectedLayout.$field)) { throw 'STARTUP_BUNDLE_PLAN_INVALID' }
  }
  Assert-StartupBundlePlanObject $Plan.policy @('overwriteExisting','deletePreviousVersions','exactExistingMayBeReused','updateRequiresNewCommitDirectory')
  if ($Plan.policy.overwriteExisting -isnot [bool] -or $Plan.policy.overwriteExisting -or $Plan.policy.deletePreviousVersions -isnot [bool] -or $Plan.policy.deletePreviousVersions -or $Plan.policy.exactExistingMayBeReused -isnot [bool] -or -not $Plan.policy.exactExistingMayBeReused -or $Plan.policy.updateRequiresNewCommitDirectory -isnot [bool] -or -not $Plan.policy.updateRequiresNewCommitDirectory) { throw 'STARTUP_BUNDLE_PLAN_INVALID' }
  return $Plan
}

function Resolve-ReviewedIdentitySid([Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$Identity) {
  try {
    if ($Identity -match '^S-1-(?:\d+-)+\d+$') { return ([Security.Principal.SecurityIdentifier]::new($Identity)).Value }
    $account = [Security.Principal.NTAccount]::new($Identity)
    return ($account.Translate([Security.Principal.SecurityIdentifier])).Value
  } catch { throw 'ACL_IDENTITY_RESOLUTION_FAILED' }
}

function New-ProductionAclRule(
  [Parameter(Mandatory = $true)][string]$Role,
  [Parameter(Mandatory = $true)][string]$Sid,
  [Parameter(Mandatory = $true)][Security.AccessControl.FileSystemRights]$Rights,
  [Security.AccessControl.InheritanceFlags]$InheritanceFlags = [Security.AccessControl.InheritanceFlags]::None,
  [Security.AccessControl.PropagationFlags]$PropagationFlags = [Security.AccessControl.PropagationFlags]::None
) {
  return [pscustomobject][ordered]@{
    role = $Role
    sid = $Sid
    accessControlType = 'Allow'
    accessControlTypeValue = [int][Security.AccessControl.AccessControlType]::Allow
    rights = $Rights.ToString()
    rightsValue = [int64]$Rights
    inheritanceFlags = $InheritanceFlags.ToString()
    inheritanceFlagsValue = [int]$InheritanceFlags
    propagationFlags = $PropagationFlags.ToString()
    propagationFlagsValue = [int]$PropagationFlags
    isInherited = $false
  }
}

function Merge-ProductionAclRules([Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Rule) {
  $groups = [ordered]@{}
  $groupOrder = [Collections.Generic.List[string]]::new()
  foreach ($candidate in $Rule) {
    $normalized = Normalize-AclRule $candidate
    $key = @($normalized.sid,$normalized.accessControlTypeValue,$normalized.inheritanceFlagsValue,$normalized.propagationFlagsValue,$normalized.isInherited) -join '|'
    if (-not $groups.Contains($key)) {
      $groups[$key] = [pscustomobject]@{ roles = [Collections.Generic.List[string]]::new(); sid = $normalized.sid; rightsValue = [int64]0; inheritanceFlagsValue = $normalized.inheritanceFlagsValue; propagationFlagsValue = $normalized.propagationFlagsValue }
      $groupOrder.Add($key)
    }
    $groups[$key].roles.Add([string]$candidate.role)
    $groups[$key].rightsValue = [int64]$groups[$key].rightsValue -bor [int64]$normalized.rightsValue
  }
  return @($groupOrder | ForEach-Object {
    $group = $groups[$_]
    New-ProductionAclRule -Role (@($group.roles) -join '+') -Sid $group.sid -Rights ([Security.AccessControl.FileSystemRights]$group.rightsValue) -InheritanceFlags ([Security.AccessControl.InheritanceFlags]$group.inheritanceFlagsValue) -PropagationFlags ([Security.AccessControl.PropagationFlags]$group.propagationFlagsValue)
  })
}

function Get-ProductionAclPolicy(
  [Parameter(Mandatory = $true)][string]$CanonicalRoot,
  [Parameter(Mandatory = $true)][string]$DeploymentIdentity,
  [Parameter(Mandatory = $true)][string]$ApiRuntimeIdentity,
  [Parameter(Mandatory = $true)][string]$WebRuntimeIdentity,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$StartupWrapper
) {
  $root = Assert-DedicatedRoot $CanonicalRoot
  $shared = Assert-ExactChildPath -Root $root -RelativePath 'shared'
  $environmentPath = Get-CanonicalPath $EnvFile
  $startupLayout = Get-CanonicalStartupBundleLayoutFromWrapper -Root $root -StartupWrapper $StartupWrapper
  $wrapperPath = $startupLayout.wrapperPath
  $commonPath = $startupLayout.commonPath
  $markerPath = Get-CanonicalPath (Join-Path $shared 'deployment-identity.json')

  $identitySids = [ordered]@{
    SYSTEM = 'S-1-5-18'
    Administrators = 'S-1-5-32-544'
    DeploymentIdentity = Resolve-ReviewedIdentitySid $DeploymentIdentity
    ApiRuntimeIdentity = Resolve-ReviewedIdentitySid $ApiRuntimeIdentity
    WebRuntimeIdentity = Resolve-ReviewedIdentitySid $WebRuntimeIdentity
  }
  $broadSids = @('S-1-1-0','S-1-5-11','S-1-5-32-545')
  if (@($identitySids.Values | Where-Object { $_ -in $broadSids }).Count -gt 0) { throw 'ACL_BROAD_PRINCIPAL_NOT_ALLOWED' }

  $inherit = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
  function New-DirectoryRules([string[]]$Roles,[hashtable]$RightsByRole) {
    return @(Merge-ProductionAclRules @($Roles | ForEach-Object { New-ProductionAclRule -Role $_ -Sid $identitySids[$_] -Rights $RightsByRole[$_] -InheritanceFlags $inherit }))
  }
  function New-LeafRules([string[]]$Roles,[hashtable]$RightsByRole) {
    return @(Merge-ProductionAclRules @($Roles | ForEach-Object { New-ProductionAclRule -Role $_ -Sid $identitySids[$_] -Rights $RightsByRole[$_] }))
  }

  $directoryRights = @{
    SYSTEM = [Security.AccessControl.FileSystemRights]::FullControl
    Administrators = [Security.AccessControl.FileSystemRights]::FullControl
    DeploymentIdentity = [Security.AccessControl.FileSystemRights]::Modify
    ApiRuntimeIdentity = [Security.AccessControl.FileSystemRights]::ReadAndExecute
    WebRuntimeIdentity = [Security.AccessControl.FileSystemRights]::ReadAndExecute
  }
  $paths = [Collections.Generic.List[object]]::new()
  $paths.Add([pscustomobject][ordered]@{ path = $root; kind = 'directory'; inheritanceProtected = $true; desiredAces = @(New-DirectoryRules @('SYSTEM','Administrators','DeploymentIdentity','ApiRuntimeIdentity','WebRuntimeIdentity') $directoryRights) })
  $logRights = @{} + $directoryRights
  $logRights.ApiRuntimeIdentity = [Security.AccessControl.FileSystemRights]::Modify
  foreach ($name in Get-ProductionRequiredDirectoryNames) {
    $roles = switch ($name) {
      'releases' { @('SYSTEM','Administrators','DeploymentIdentity','ApiRuntimeIdentity','WebRuntimeIdentity') }
      { $_ -in @('staging','incoming','backups') } { @('SYSTEM','Administrators','DeploymentIdentity') }
      { $_ -in @('shared','logs') } { @('SYSTEM','Administrators','DeploymentIdentity','ApiRuntimeIdentity') }
      default { throw 'PRODUCTION_DIRECTORY_POLICY_MISSING' }
    }
    $rights = if ($name -eq 'logs') { $logRights } else { $directoryRights }
    $paths.Add([pscustomobject][ordered]@{ path = (Join-Path $root $name); kind = 'directory'; inheritanceProtected = $true; desiredAces = @(New-DirectoryRules $roles $rights) })
  }
  foreach ($bundleDirectory in @($startupLayout.bundleRoot,$startupLayout.versionDirectory)) {
    $paths.Add([pscustomobject][ordered]@{ path = $bundleDirectory; kind = 'directory'; inheritanceProtected = $true; desiredAces = @(New-DirectoryRules @('SYSTEM','Administrators','DeploymentIdentity','ApiRuntimeIdentity') $directoryRights) })
  }

  $leafRights = @{
    SYSTEM = [Security.AccessControl.FileSystemRights]::FullControl
    Administrators = [Security.AccessControl.FileSystemRights]::FullControl
    DeploymentIdentity = [Security.AccessControl.FileSystemRights]::Modify
    ApiRuntimeIdentity = [Security.AccessControl.FileSystemRights]::Read
  }
  foreach ($leafPath in @($markerPath,$environmentPath)) {
    $paths.Add([pscustomobject][ordered]@{ path = $leafPath; kind = 'file'; inheritanceProtected = $true; desiredAces = @(New-LeafRules @('SYSTEM','Administrators','DeploymentIdentity','ApiRuntimeIdentity') $leafRights) })
  }
  $leafRights.ApiRuntimeIdentity = [Security.AccessControl.FileSystemRights]::ReadAndExecute
  foreach ($leafPath in @($wrapperPath,$commonPath)) {
    $paths.Add([pscustomobject][ordered]@{ path = $leafPath; kind = 'file'; inheritanceProtected = $true; desiredAces = @(New-LeafRules @('SYSTEM','Administrators','DeploymentIdentity','ApiRuntimeIdentity') $leafRights) })
  }

  $normalizedPaths = @($paths | ForEach-Object { Normalize-ComparablePath $_.path })
  if (@($normalizedPaths | Sort-Object -Unique).Count -ne $normalizedPaths.Count) { throw 'ACL_PROTECTED_PATH_COLLISION' }
  return [pscustomobject][ordered]@{ schemaVersion = 1; canonicalRoot = $root; identities = $identitySids; protectedPaths = @($paths) }
}

function Normalize-AclRule([Parameter(Mandatory = $true)]$Rule) {
  $properties = @($Rule.PSObject.Properties.Name)
  if ($properties -contains 'sid') { $sid = [string]$Rule.sid }
  else {
    try { $sid = ($Rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier])).Value }
    catch { throw 'ACL_IDENTITY_RESOLUTION_FAILED' }
  }
  $accessType = if ($properties -contains 'accessControlTypeValue') { [int]$Rule.accessControlTypeValue } else { [int]$Rule.AccessControlType }
  $rightsValue = if ($properties -contains 'rightsValue') { [int64]$Rule.rightsValue } else { [int64]$Rule.FileSystemRights }
  $inheritanceValue = if ($properties -contains 'inheritanceFlagsValue') { [int]$Rule.inheritanceFlagsValue } else { [int]$Rule.InheritanceFlags }
  $propagationValue = if ($properties -contains 'propagationFlagsValue') { [int]$Rule.propagationFlagsValue } else { [int]$Rule.PropagationFlags }
  $inherited = if ($properties -contains 'isInherited') { [bool]$Rule.isInherited } else { [bool]$Rule.IsInherited }
  return [pscustomobject][ordered]@{ sid = $sid; accessControlTypeValue = $accessType; rightsValue = $rightsValue; inheritanceFlagsValue = $inheritanceValue; propagationFlagsValue = $propagationValue; isInherited = $inherited }
}

function Get-AclRuleKey([Parameter(Mandatory = $true)]$Rule,[switch]$WithoutRights) {
  $normalized = Normalize-AclRule $Rule
  $parts = @($normalized.sid,$normalized.accessControlTypeValue)
  if (-not $WithoutRights) {
    $comparableRights = $normalized.rightsValue
    if ($normalized.accessControlTypeValue -eq [int][Security.AccessControl.AccessControlType]::Allow) {
      $comparableRights = $comparableRights -band (-bnot [int64][Security.AccessControl.FileSystemRights]::Synchronize)
    }
    $parts += $comparableRights
  }
  $parts += @($normalized.inheritanceFlagsValue,$normalized.propagationFlagsValue,$normalized.isInherited)
  return ($parts -join '|')
}

function Compare-AclSnapshotToPolicy(
  [Parameter(Mandatory = $true)]$PolicyPath,
  [Parameter(Mandatory = $true)]$Snapshot
) {
  if ([bool]$Snapshot.inheritanceProtected -ne [bool]$PolicyPath.inheritanceProtected) { return [pscustomobject]@{ state = 'INHERITANCE_MISMATCH'; issues = @('INHERITANCE_PROTECTION') } }
  $expected = @($PolicyPath.desiredAces | ForEach-Object { Normalize-AclRule $_ })
  $actual = @($Snapshot.access | ForEach-Object { Normalize-AclRule $_ })
  if (@($actual | Where-Object { $_.accessControlTypeValue -eq [int][Security.AccessControl.AccessControlType]::Deny }).Count -gt 0) { return [pscustomobject]@{ state = 'DENY_ACE'; issues = @('EXPLICIT_OR_INHERITED_DENY') } }

  $actualKeys = @($actual | ForEach-Object { Get-AclRuleKey $_ })
  if (@($actualKeys | Group-Object | Where-Object { $_.Count -gt 1 }).Count -gt 0) { return [pscustomobject]@{ state = 'UNEXPECTED_ACE'; issues = @('DUPLICATE_SEMANTIC_ACE') } }
  foreach ($rule in $expected) {
    $exactKey = Get-AclRuleKey $rule
    if ($actualKeys -contains $exactKey) { continue }
    $structuralKey = Get-AclRuleKey $rule -WithoutRights
    if (@($actual | Where-Object { (Get-AclRuleKey $_ -WithoutRights) -eq $structuralKey }).Count -gt 0) { return [pscustomobject]@{ state = 'RIGHTS_MISMATCH'; issues = @('WRONG_RIGHTS') } }
    return [pscustomobject]@{ state = 'MISSING_ACE'; issues = @('REQUIRED_ACE_MISSING') }
  }
  $expectedKeys = @($expected | ForEach-Object { Get-AclRuleKey $_ })
  if (@($actualKeys | Where-Object { $_ -notin $expectedKeys }).Count -gt 0) { return [pscustomobject]@{ state = 'UNEXPECTED_ACE'; issues = @('ACE_OUTSIDE_EXACT_POLICY') } }
  return [pscustomobject]@{ state = 'PASS'; issues = @() }
}

function Get-ActualAclSnapshot([Parameter(Mandatory = $true)][string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  $acl = if ($item.PSIsContainer) { [IO.Directory]::GetAccessControl($item.FullName) } else { [IO.File]::GetAccessControl($item.FullName) }
  return [pscustomobject]@{ inheritanceProtected = [bool]$acl.AreAccessRulesProtected; access = @($acl.Access | ForEach-Object { Normalize-AclRule $_ }) }
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

function Assert-PathAncestorChainNonReparse(
  [Parameter(Mandatory = $true)][string]$Directory,
  [switch]$AllowMissing,
  [ValidatePattern('^[A-Z0-9_]+$')][string]$CategoryPrefix = 'READ_ONLY_REPORT'
) {
  $fullDirectory = [IO.Path]::GetFullPath($Directory)
  $filesystemRoot = [IO.Path]::GetPathRoot($fullDirectory)
  $current = if ($fullDirectory.TrimEnd('\') -ieq $filesystemRoot.TrimEnd('\')) { $filesystemRoot } else { $fullDirectory.TrimEnd('\') }
  $visited = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $isImmediateParent = $true
  while (-not [string]::IsNullOrWhiteSpace($current)) {
    if (-not $visited.Add($current)) {
      if ($CategoryPrefix -eq 'PRODUCTION_ROOT') { throw 'PRODUCTION_ROOT_ANCESTOR_UNVERIFIABLE' }
      if ($CategoryPrefix -eq 'READ_ONLY_REPORT') { throw 'READ_ONLY_REPORT_ANCESTOR_INVALID' }
      throw "${CategoryPrefix}_ANCESTOR_UNVERIFIABLE"
    }
    try {
      $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
      if (-not $item.PSIsContainer) { throw "${CategoryPrefix}_ANCESTOR_UNVERIFIABLE" }
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        if ($CategoryPrefix -eq 'PRODUCTION_ROOT' -and $isImmediateParent) { throw 'PRODUCTION_ROOT_REPARSE_POINT' }
        if ($CategoryPrefix -eq 'READ_ONLY_REPORT' -and $isImmediateParent) { throw 'READ_ONLY_REPORT_PARENT_REPARSE_POINT' }
        if ($CategoryPrefix -eq 'PRODUCTION_ROOT') { throw 'PRODUCTION_ROOT_ANCESTOR_REPARSE_POINT' }
        if ($CategoryPrefix -eq 'READ_ONLY_REPORT') { throw 'READ_ONLY_REPORT_ANCESTOR_REPARSE_POINT' }
        throw "${CategoryPrefix}_ANCESTOR_REPARSE_POINT"
      }
    } catch {
      if ($_.Exception.Message -match "^(?:${CategoryPrefix}_|PRODUCTION_ROOT_)") { throw }
      $exists = $false
      try { $exists = Test-Path -LiteralPath $current -ErrorAction Stop } catch {
        if ($CategoryPrefix -eq 'PRODUCTION_ROOT') { throw 'PRODUCTION_ROOT_ANCESTOR_UNVERIFIABLE' }
        if ($CategoryPrefix -eq 'READ_ONLY_REPORT') { throw 'READ_ONLY_REPORT_ANCESTOR_INVALID' }
        throw "${CategoryPrefix}_ANCESTOR_UNVERIFIABLE"
      }
      if ($exists -or -not $AllowMissing) {
        if ($CategoryPrefix -eq 'READ_ONLY_REPORT' -and $isImmediateParent) { throw 'READ_ONLY_REPORT_PARENT_INVALID' }
        if ($CategoryPrefix -eq 'READ_ONLY_REPORT') { throw 'READ_ONLY_REPORT_ANCESTOR_INVALID' }
        if ($CategoryPrefix -eq 'PRODUCTION_ROOT') { throw 'PRODUCTION_ROOT_ANCESTOR_UNVERIFIABLE' }
        throw "${CategoryPrefix}_ANCESTOR_UNVERIFIABLE"
      }
    }
    if ($current.TrimEnd('\') -ieq $filesystemRoot.TrimEnd('\')) { break }
    $parent = Split-Path -Parent $current
    if ([string]::IsNullOrWhiteSpace($parent)) { throw 'READ_ONLY_REPORT_ANCESTOR_INVALID' }
    $current = if ($parent.TrimEnd('\') -ieq $filesystemRoot.TrimEnd('\')) { $filesystemRoot } else { Get-CanonicalPath $parent }
    $isImmediateParent = $false
  }
  return $fullDirectory.TrimEnd('\')
}

function Assert-SafeReadOnlyReportPath(
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [Parameter(Mandatory = $true)][string]$ProductionRoot,
  [string]$AdditionalProtectedRoot = '',
  [string[]]$ProtectedLeaf = @()
) {
  $canonicalReport = Get-CanonicalPath $ReportPath
  foreach ($protectedRoot in @($ProductionRoot,$AdditionalProtectedRoot)) {
    if (-not [string]::IsNullOrWhiteSpace($protectedRoot) -and (Test-PathWithin -Path $canonicalReport -Parent (Get-CanonicalPath $protectedRoot))) { throw 'READ_ONLY_REPORT_PATH_CONFLICT' }
  }
  foreach ($leaf in @($ProtectedLeaf)) {
    if (-not [string]::IsNullOrWhiteSpace($leaf) -and (Normalize-ComparablePath $canonicalReport) -eq (Normalize-ComparablePath $leaf)) { throw 'READ_ONLY_REPORT_PATH_CONFLICT' }
  }

  Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $canonicalReport) | Out-Null

  $targetClassification = Get-PathSecurityClassification -Path $canonicalReport -Kind file
  if ($targetClassification.state -eq 'REPARSE_POINT') { throw 'READ_ONLY_REPORT_TARGET_REPARSE_POINT' }
  if ($targetClassification.state -eq 'TYPE_MISMATCH') { throw 'READ_ONLY_REPORT_TARGET_TYPE_MISMATCH' }
  return $canonicalReport
}

function Assert-OperatorEvidenceReportPath(
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [Parameter(Mandatory = $true)][string]$CandidateRoot,
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [string[]]$NginxRoot = @(),
  [string[]]$KnownForeignRoot = @(),
  [string[]]$AdditionalProtectedRoot = @(),
  [string[]]$ProtectedLeaf = @()
) {
  $canonicalReport = Get-CanonicalPath $ReportPath
  $parent = Split-Path -Parent $canonicalReport
  $parentState = Get-PathSecurityClassification -Path $parent -Kind directory
  if ($parentState.state -eq 'REPARSE_POINT') { throw 'OPERATOR_EVIDENCE_REPORT_PARENT_REPARSE_POINT' }
  if ($parentState.state -ne 'PASS') { throw 'OPERATOR_EVIDENCE_REPORT_PARENT_INVALID' }
  Assert-PathAncestorChainNonReparse -Directory $parent -CategoryPrefix 'OPERATOR_EVIDENCE_REPORT' | Out-Null
  foreach ($protectedRoot in @($CandidateRoot,$RepositoryRoot) + @($NginxRoot) + @($KnownForeignRoot) + @($AdditionalProtectedRoot)) {
    if (-not [string]::IsNullOrWhiteSpace($protectedRoot)) {
      try {
        $canonProtected = Get-CanonicalPath $protectedRoot
        if (Test-PathWithin -Path $canonicalReport -Parent $canonProtected) { throw 'OPERATOR_EVIDENCE_REPORT_PATH_CONFLICT' }
      } catch {
        if ($_.Exception.Message -eq 'OPERATOR_EVIDENCE_REPORT_PATH_CONFLICT') { throw }
      }
    }
  }
  foreach ($leaf in @($ProtectedLeaf)) {
    if (-not [string]::IsNullOrWhiteSpace($leaf) -and (Normalize-ComparablePath $canonicalReport) -eq (Normalize-ComparablePath $leaf)) { throw 'OPERATOR_EVIDENCE_REPORT_PATH_CONFLICT' }
  }
  $target = Get-PathSecurityClassification -Path $canonicalReport -Kind file
  if ($target.state -eq 'REPARSE_POINT') { throw 'OPERATOR_EVIDENCE_REPORT_TARGET_REPARSE_POINT' }
  if ($target.state -eq 'TYPE_MISMATCH') { throw 'OPERATOR_EVIDENCE_REPORT_TARGET_TYPE_MISMATCH' }
  if ($target.state -notin @('MISSING','PASS')) { throw 'OPERATOR_EVIDENCE_REPORT_TARGET_INVALID' }
  return $canonicalReport
}

function Assert-SafeDiscoveryReadPath(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][ValidateSet('directory','file')][string]$Kind,
  [Parameter(Mandatory = $true)][string[]]$AllowedRoot
) {
  $canonical = Get-CanonicalPath $Path
  if (@($AllowedRoot | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-PathWithin -Path $canonical -Parent (Get-CanonicalPath $_)) }).Count -eq 0) { throw 'DISCOVERY_PATH_OUTSIDE_CANDIDATE_ROOT' }
  $directory = if ($Kind -eq 'directory') { $canonical } else { Split-Path -Parent $canonical }
  Assert-PathAncestorChainNonReparse -Directory $directory -CategoryPrefix 'DISCOVERY_READ' | Out-Null
  if ((Get-PathSecurityClassification -Path $canonical -Kind $Kind).state -ne 'PASS') { throw 'DISCOVERY_READ_PATH_INVALID' }
  return $canonical
}

function Get-ReviewedExecutableSnapshot(
  [Parameter(Mandatory = $true)][ValidateSet('node','npm','npx','psql','pg_dump','pg_restore','nginx')][string]$Role,
  [AllowNull()][string]$Path,
  [switch]$SkipVersion
) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return [ordered]@{ role = $Role; state = 'NOT_PROVIDED' } }
  $canonical = Get-CanonicalPath $Path
  Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $canonical) -CategoryPrefix 'REVIEWED_EXECUTABLE' | Out-Null
  if ((Get-PathSecurityClassification -Path $canonical -Kind file).state -ne 'PASS') { throw 'REVIEWED_EXECUTABLE_INVALID' }
  $leaf = Split-Path -Leaf $canonical
  $allowedLeaves = switch ($Role) {
    'node' { @('node.exe') }
    'npm' { @('npm.cmd','npm.exe') }
    'npx' { @('npx.cmd','npx.exe') }
    'psql' { @('psql.exe') }
    'pg_dump' { @('pg_dump.exe') }
    'pg_restore' { @('pg_restore.exe') }
    'nginx' { @('nginx.exe') }
  }
  if ($leaf -cnotin $allowedLeaves) { throw "REVIEWED_EXECUTABLE_ROLE_LEAF_CONFLICT: $Role" }
  $version = if ($SkipVersion) { 'NOT_RUN' } else { 'NOT_VERIFIED' }
  if (-not $SkipVersion) { try { $versionArguments = if ($Role -eq 'nginx') { @('-v') } else { @('--version') }; $output = @(& $canonical @versionArguments 2>&1); if ($output.Count -gt 0) { $version = Redact-SensitiveText ([string]$output[0]) } } catch { } }
  return [ordered]@{ role = $Role; state = 'EXISTS AND REVIEWED'; exactPath = $canonical; version = $version }
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
    commandLineSha256 = if ($commandLine) { Get-SensitiveTextHash $commandLine } else { $null }
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
  return (Get-ReviewedExecutableSnapshot -Role psql -Path $Path -SkipVersion).exactPath
}

function Resolve-DatabaseVerifierExecutable([switch]$VerifyDatabase,[AllowNull()][string]$PsqlExe) {
  if (-not $VerifyDatabase) { return $null }
  if ([string]::IsNullOrWhiteSpace($PsqlExe)) { throw 'VerifyDatabase requires an exact PsqlExe.' }
  return Assert-ExactPsqlExecutable -Path $PsqlExe
}

function Assert-ProductionRuntimeKindSupported([Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,[Parameter(Mandatory = $true)][bool]$FirstDeploy) {
  if ($FirstDeploy -and $ServiceKind -eq 'service') { throw 'SERVICE_FIRST_DEPLOY_UNSUPPORTED' }
}

function Assert-PreflightRuntimeKindSupported([switch]$RequireReviewedIsolation,[AllowNull()][string]$ServiceKind) {
  if ($RequireReviewedIsolation) { Assert-ProductionRuntimeKindSupported -ServiceKind $ServiceKind -FirstDeploy $true }
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

function Get-SshPortEvidence([Parameter(Mandatory = $true)][string]$EffectiveConfigState,[AllowNull()][AllowEmptyCollection()][int[]]$ConfiguredPort = @(),[AllowNull()][AllowEmptyCollection()][int[]]$ListeningPort = @(),[switch]$ServiceRunning) {
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
  Assert-ExistingNonReparseDirectory -Path $canonicalRoot -Role PRODUCTION_ROOT | Out-Null
  foreach ($name in Get-ProductionRequiredDirectoryNames) {
    Assert-ExistingNonReparseDirectory -Path (Join-Path $canonicalRoot $name) -Role PRODUCTION_SUBDIRECTORY | Out-Null
  }
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
  $startupLayout = Get-CanonicalStartupBundleLayoutFromWrapper -Root $canonicalRoot -StartupWrapper $StartupWrapper
  Assert-ExistingNonReparseStartupBundleLayout $startupLayout | Out-Null
  if ((Normalize-ComparablePath $marker.startupBundle.wrapperPath) -ne (Normalize-ComparablePath $StartupWrapper)) { throw 'Deployment marker startup bundle wrapper path mismatch.' }
  $commonPath = $startupLayout.commonPath
  if ((Normalize-ComparablePath $marker.startupBundle.commonPath) -ne (Normalize-ComparablePath $commonPath)) { throw 'Deployment marker startup bundle helper path mismatch.' }
  foreach ($bundleFile in @(@{ path = $marker.startupBundle.wrapperPath; hash = $marker.startupBundle.wrapperSha256 }, @{ path = $marker.startupBundle.commonPath; hash = $marker.startupBundle.commonSha256 })) {
    Assert-ExistingLeaf $bundleFile.path 'Startup runtime bundle file' | Out-Null
    if ((Get-FileSha256FromBytes -Path $bundleFile.path) -ine $bundleFile.hash) { throw 'Startup runtime bundle hash mismatch.' }
  }
  foreach ($requiredLeaf in @(@{ path = $marker.nodeExe; label = 'Node executable' }, @{ path = $marker.envFile; label = 'Production environment file' }, @{ path = $marker.nginxExe; label = 'Nginx executable' }, @{ path = $marker.nginxConfig; label = 'Nginx config' })) { Assert-ExistingLeaf $requiredLeaf.path $requiredLeaf.label | Out-Null }
  if ($marker.service.kind -eq 'scheduled-task') {
    Assert-ExistingLeaf $marker.service.execute 'Scheduled Task executable' | Out-Null
    Assert-ExistingDirectory $marker.service.workingDirectory | Out-Null
  }
  return [pscustomobject]@{ canonicalRoot = $canonicalRoot; marker = $marker }
}

function Get-ScheduledTaskTriggerClassName([Parameter(Mandatory = $true)]$Trigger) {
  if ($null -ne $Trigger.CimClass -and -not [string]::IsNullOrWhiteSpace([string]$Trigger.CimClass.CimClassName)) { return [string]$Trigger.CimClass.CimClassName }
  $typeName = @($Trigger.PSObject.TypeNames | Where-Object { $_ -match 'MSFT_Task.+Trigger$' } | Select-Object -First 1)
  if ($typeName.Count -eq 1) { return $typeName[0] }
  return ''
}

function Test-ScheduledTaskTriggerEnabled([Parameter(Mandatory = $true)]$Trigger) {
  return "$($Trigger.Enabled)" -match '^(True|1)$'
}

function Assert-VerifiedScheduledTaskContract([Parameter(Mandatory = $true)]$Marker,[Parameter(Mandatory = $true)][string]$ServiceName,[object]$Task) {
  [object[]]$tasks = @()
  if ($PSBoundParameters.ContainsKey('Task') -and $null -ne $Task) { $tasks += $Task } else { $tasks += @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -ceq $ServiceName }) }
  if ($tasks.Count -ne 1) { throw 'Exact Scheduled Task identity is missing or ambiguous.' }
  $task = $tasks[0]
  if ($task.TaskName -cne $ServiceName -or $task.TaskPath -cne $Marker.service.taskPath) { throw 'Scheduled Task name or path mismatch.' }
  if ($task.Principal.UserId -cne $Marker.service.account) { throw 'Scheduled Task account mismatch.' }
  $actions = @($task.Actions | Where-Object { $null -ne $_ })
  if ($actions.Count -ne 1) { throw 'Scheduled Task must have exactly one action.' }
  if ((Normalize-ComparablePath $actions[0].Execute) -ne (Normalize-ComparablePath $Marker.service.execute)) { throw 'Scheduled Task executable mismatch.' }
  if (($actions[0].Arguments -replace '\s+',' ').Trim() -cne ($Marker.service.arguments -replace '\s+',' ').Trim()) { throw 'Scheduled Task arguments mismatch.' }
  if ((Normalize-ComparablePath $actions[0].WorkingDirectory) -ne (Normalize-ComparablePath $Marker.service.workingDirectory)) { throw 'Scheduled Task working directory mismatch.' }
  $triggers = @($task.Triggers | Where-Object { $null -ne $_ })
  if ($triggers.Count -ne 1) { throw 'Scheduled Task must have exactly one enabled Boot trigger.' }
  if ((Get-ScheduledTaskTriggerClassName $triggers[0]) -cne 'MSFT_TaskBootTrigger') { throw 'Scheduled Task trigger must be the approved Boot trigger.' }
  if (-not (Test-ScheduledTaskTriggerEnabled $triggers[0])) { throw 'Scheduled Task Boot trigger must be enabled.' }
  return $task
}

function Assert-ScheduledTaskDisabledState([Parameter(Mandatory = $true)]$Task) {
  if ("$($Task.State)" -cne 'Disabled') { throw 'Scheduled Task safe-stop did not leave the exact task disabled.' }
  return $true
}

function Assert-ScheduledTaskActivationAuthorized([switch]$AllowScheduledTaskActivation) {
  if (-not $AllowScheduledTaskActivation) { throw 'Scheduled Task activation requires -AllowScheduledTaskActivation before any lifecycle mutation.' }
  return $true
}

function Get-ScheduledTaskActivationFailureDisposition([bool]$ActivationAttempted) {
  return [ordered]@{ state = if ($ActivationAttempted) { 'SAFE_STOP_REQUIRED' } else { 'PROPAGATE_ONLY' }; taskEnabled = $false; runtimeRunning = $false }
}

function Assert-ScheduledTaskHealthyState([Parameter(Mandatory = $true)]$Task) {
  if ("$($Task.State)" -cne 'Running') { throw 'Scheduled Task did not reach the required Running healthy state.' }
  return $true
}

function Invoke-ScheduledTaskActivationLifecycle(
  [switch]$AllowScheduledTaskActivation,
  [Parameter(Mandatory = $true)]$Context,
  [Parameter(Mandatory = $true)][scriptblock]$Verify,
  [Parameter(Mandatory = $true)][scriptblock]$Enable,
  [Parameter(Mandatory = $true)][scriptblock]$Start,
  [Parameter(Mandatory = $true)][scriptblock]$RuntimeCheck,
  [Parameter(Mandatory = $true)][scriptblock]$FinalVerify,
  [Parameter(Mandatory = $true)][scriptblock]$SafeStop,
  [Parameter(Mandatory = $true)][scriptblock]$Success
) {
  Assert-ScheduledTaskActivationAuthorized -AllowScheduledTaskActivation:$AllowScheduledTaskActivation | Out-Null
  $activationAttempted = $false
  try {
    $task = & $Verify $Context 'initial'
    $activationAttempted = $true
    & $Enable $Context $task
    $task = & $Verify $Context 'post-enable'
    if ("$($task.State)" -ceq 'Disabled') { throw 'Scheduled Task remained disabled after activation enable.' }
    & $Start $Context $task
    $runtime = & $RuntimeCheck $Context
    if (-not $runtime) { throw 'Restart completed but exactly one expected API process did not own port 3100 within the bounded wait.' }
    $finalTask = & $FinalVerify $Context
    Assert-ScheduledTaskHealthyState -Task $finalTask | Out-Null
    return & $Success $Context $runtime
  } catch {
    $activationFailure = $_
    if ((Get-ScheduledTaskActivationFailureDisposition -ActivationAttempted:$activationAttempted).state -eq 'SAFE_STOP_REQUIRED') {
      try { & $SafeStop $Context } catch { throw "ACTIVATION_FAILED_AND_SAFE_STOP_FAILED: primary=$($activationFailure.Exception.GetType().Name); cleanup=$($_.Exception.GetType().Name)" }
    }
    throw $activationFailure
  }
}

function Invoke-ScheduledTaskRollbackLifecycle([Parameter(Mandatory = $true)]$Context,[Parameter(Mandatory = $true)][scriptblock]$Restart,[Parameter(Mandatory = $true)][scriptblock]$Health,[Parameter(Mandatory = $true)][scriptblock]$SafeStop) {
  $restartCompleted = $false
  try { & $Restart $Context | Out-Null; $restartCompleted = $true; return & $Health $Context }
  catch {
    $rollbackFailure = $_
    if ($restartCompleted) { try { & $SafeStop $Context } catch { throw "ROLLBACK_HEALTH_FAILED_AND_SAFE_STOP_FAILED: primary=$($rollbackFailure.Exception.GetType().Name); cleanup=$($_.Exception.GetType().Name)" } }
    throw $rollbackFailure
  }
}

function Get-DeploymentFailureRecoveryDecision([bool]$HasPreviousRelease,[bool]$MigrationAttempted,[bool]$RollbackCompatibilityApproved) {
  if (-not $HasPreviousRelease) { return 'FIRST_DEPLOY_SAFE_STOP' }
  if ($MigrationAttempted -and -not $RollbackCompatibilityApproved) { return 'COMPATIBILITY_SAFE_STOP' }
  return 'ROLLBACK_RELEASE'
}

function Assert-VerifiedRuntimeIdentity([Parameter(Mandatory = $true)]$Marker,[Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,[Parameter(Mandatory = $true)][string]$ServiceName) {
  if ($ServiceKind -eq 'scheduled-task') {
    Assert-VerifiedScheduledTaskContract -Marker $Marker -ServiceName $ServiceName | Out-Null
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

function Parse-PostgresStructuredEvidence([Parameter(Mandatory = $true)][string[]]$Lines) {
  $records = [ordered]@{
    identity = $null
    extensions = [Collections.Generic.List[string]]::new()
    migrationTable = $null
    roleSafety = $null
    migrationSummary = $null
    foreignDatabases = [Collections.Generic.List[object]]::new()
  }
  foreach ($rawLine in $Lines) {
    $line = $rawLine.ToString().Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $obj = $null
    try {
      $obj = $line | ConvertFrom-Json -ErrorAction Stop
    } catch {
      throw 'DATABASE_STRUCTURED_OUTPUT_INVALID'
    }
    if ($null -eq $obj -or $null -eq $obj.record -or $obj.record -isnot [string]) {
      throw 'DATABASE_STRUCTURED_OUTPUT_INVALID'
    }
    $recordType = $obj.record
    $props = @($obj.PSObject.Properties.Name)
    switch ($recordType) {
      'identity' {
        if ($null -ne $records.identity) { throw 'DATABASE_STRUCTURED_OUTPUT_DUPLICATE' }
        if ($props.Count -ne 3 -or -not ($props -ccontains 'database') -or -not ($props -ccontains 'role')) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        if ($obj.database -isnot [string] -or $obj.role -isnot [string]) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        $records.identity = [pscustomobject][ordered]@{ database = $obj.database; role = $obj.role }
      }
      'extension' {
        if ($props.Count -ne 2 -or -not ($props -ccontains 'name')) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        if ($obj.name -isnot [string]) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        $records.extensions.Add($obj.name)
      }
      'migrationTable' {
        if ($null -ne $records.migrationTable) { throw 'DATABASE_STRUCTURED_OUTPUT_DUPLICATE' }
        if ($props.Count -ne 2 -or -not ($props -ccontains 'present')) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        if ($obj.present -isnot [bool]) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        $records.migrationTable = [pscustomobject][ordered]@{ present = $obj.present }
      }
      'roleSafety' {
        if ($null -ne $records.roleSafety) { throw 'DATABASE_STRUCTURED_OUTPUT_DUPLICATE' }
        if ($props.Count -ne 7 -or -not ($props -ccontains 'superuser') -or -not ($props -ccontains 'createDatabase') -or -not ($props -ccontains 'createRole') -or -not ($props -ccontains 'replication') -or -not ($props -ccontains 'bypassRls') -or -not ($props -ccontains 'directMembershipCount')) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        if ($obj.superuser -isnot [bool] -or $obj.createDatabase -isnot [bool] -or $obj.createRole -isnot [bool] -or $obj.replication -isnot [bool] -or $obj.bypassRls -isnot [bool]) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        if ($obj.directMembershipCount -isnot [int] -and $obj.directMembershipCount -isnot [long]) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        if ([int]$obj.directMembershipCount -lt 0) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        $records.roleSafety = [pscustomobject][ordered]@{
          superuser = [bool]$obj.superuser
          createDatabase = [bool]$obj.createDatabase
          createRole = [bool]$obj.createRole
          replication = [bool]$obj.replication
          bypassRls = [bool]$obj.bypassRls
          directMembershipCount = [int]$obj.directMembershipCount
        }
      }
      'migrationSummary' {
        if ($null -ne $records.migrationSummary) { throw 'DATABASE_STRUCTURED_OUTPUT_DUPLICATE' }
        if ($props.Count -ne 3 -or -not ($props -ccontains 'unfinished') -or -not ($props -ccontains 'rolledBack')) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        if (($obj.unfinished -isnot [int] -and $obj.unfinished -isnot [long]) -or ($obj.rolledBack -isnot [int] -and $obj.rolledBack -isnot [long])) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        if ([int]$obj.unfinished -lt 0 -or [int]$obj.rolledBack -lt 0) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        $records.migrationSummary = [pscustomobject][ordered]@{
          unfinished = [int]$obj.unfinished
          rolledBack = [int]$obj.rolledBack
        }
      }
      'foreignDatabase' {
        if ($props.Count -ne 4 -or -not ($props -ccontains 'database') -or -not ($props -ccontains 'present') -or -not ($props -ccontains 'connect')) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        if ($obj.database -isnot [string] -or $obj.present -isnot [bool] -or $obj.connect -isnot [bool]) { throw 'DATABASE_STRUCTURED_OUTPUT_INVALID' }
        $records.foreignDatabases.Add([pscustomobject][ordered]@{
          database = $obj.database
          present = [bool]$obj.present
          connect = [bool]$obj.connect
        })
      }
      Default {
        throw 'DATABASE_STRUCTURED_OUTPUT_INVALID'
      }
    }
  }
  return $records
}

function Get-DatabaseEvidenceClassification(
  [Parameter(Mandatory = $true)][string]$ActualDatabase,
  [Parameter(Mandatory = $true)][string]$ExpectedDatabase,
  [Parameter(Mandatory = $true)][string]$ActualRole,
  [Parameter(Mandatory = $true)][string]$ExpectedRole,
  [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$ActualExtensions,
  [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$RequiredExtensions,
  [Parameter(Mandatory = $true)][bool]$MigrationTablePresent,
  [int]$UnfinishedMigrations = 0,
  [int]$RolledBackMigrations = 0,
  [bool]$MigrationSummaryVerified = $false,
  [bool]$RoleSafetyVerified = $false,
  [bool]$RoleIsSuperuser = $false,
  [bool]$RoleCanCreateDatabase = $false,
  [bool]$RoleCanCreateRole = $false,
  [bool]$RoleCanReplicate = $false,
  [bool]$RoleBypassesRls = $false,
  [int]$DirectMembershipCount = 0,
  [bool]$RequireForeignIsolation = $false,
  [AllowEmptyCollection()][object[]]$ForeignIsolation = @(),
  [AllowEmptyCollection()][string[]]$KnownForeignDatabaseRole = @()
) {
  if ($ActualDatabase -cne $ExpectedDatabase -or $ActualRole -cne $ExpectedRole) { return [ordered]@{ state = 'CONFLICT'; identityState = 'CONFLICT' } }
  if (@($KnownForeignDatabaseRole | Where-Object { $_ -ceq $ActualRole }).Count -gt 0) { return [ordered]@{ state = 'CONFLICT'; identityState = 'CONFLICT'; reason = 'CURRENT_ROLE_ALIASES_PROTECTED_FOREIGN_ROLE' } }
  if ($RoleIsSuperuser -or $RoleCanCreateDatabase -or $RoleCanCreateRole -or $RoleCanReplicate -or $RoleBypassesRls -or $DirectMembershipCount -gt 0) {
    return [ordered]@{ state = 'CONFLICT'; identityState = 'EXISTS AND VERIFIED'; roleSafetyState = 'CONFLICT'; directMembershipCount = $DirectMembershipCount }
  }
  $missing = @($RequiredExtensions | Where-Object { $ActualExtensions -notcontains $_ })
  if ($missing.Count -gt 0) { return [ordered]@{ state = 'CONFLICT'; identityState = 'EXISTS AND VERIFIED'; missingExtensions = $missing } }
  if ($RequireForeignIsolation) {
    if (@($ForeignIsolation).Count -eq 0 -or @($ForeignIsolation | Where-Object { $_.state -ne 'PASS' }).Count -gt 0) {
      $foreignConflict = @($ForeignIsolation | Where-Object { $_.state -eq 'CONFLICT' }).Count -gt 0
      return [ordered]@{ state = if ($foreignConflict) { 'CONFLICT' } else { 'PARTIAL' }; identityState = 'EXISTS AND VERIFIED'; roleSafetyState = 'PASS'; foreignIsolationState = if ($foreignConflict) { 'CONFLICT' } else { 'NOT_VERIFIED' } }
    }
  }
  if (-not $RoleSafetyVerified) { return [ordered]@{ state = 'PARTIAL'; identityState = 'EXISTS AND VERIFIED'; roleSafetyState = 'NOT_VERIFIED' } }
  if (-not $MigrationTablePresent) { return [ordered]@{ state = 'PARTIAL'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'NOT_APPLIED' } }
  if (-not $MigrationSummaryVerified) { return [ordered]@{ state = 'PARTIAL'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'NOT_VERIFIED' } }
  if ($UnfinishedMigrations -gt 0 -or $RolledBackMigrations -gt 0) { return [ordered]@{ state = 'CONFLICT'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'BLOCKING_ROWS'; unfinished = $UnfinishedMigrations; rolledBack = $RolledBackMigrations } }
  return [ordered]@{ state = 'EXISTS AND VERIFIED'; identityState = 'EXISTS AND VERIFIED'; migrationState = 'CLEAN' }
}

function Get-DatabaseEvidenceQueryPlan([Parameter(Mandatory = $true)][bool]$MigrationTablePresent) {
  $queryA = "SELECT json_build_object('record', 'identity', 'database', current_database(), 'role', current_user)::text; SELECT json_build_object('record', 'extension', 'name', extname)::text FROM pg_extension ORDER BY extname; SELECT json_build_object('record', 'migrationTable', 'present', to_regclass('_prisma_migrations') IS NOT NULL)::text; SELECT json_build_object('record', 'roleSafety', 'superuser', rolsuper, 'createDatabase', rolcreatedb, 'createRole', rolcreaterole, 'replication', rolreplication, 'bypassRls', rolbypassrls, 'directMembershipCount', (SELECT count(*)::int FROM pg_auth_members WHERE member = pg_roles.oid))::text FROM pg_roles WHERE rolname = current_user;"
  $plan = @([pscustomobject]@{ name = 'identity'; sql = $queryA })
  if ($MigrationTablePresent) {
    $queryB = "SELECT json_build_object('record', 'migrationSummary', 'unfinished', (count(*) FILTER (WHERE finished_at IS NULL))::int, 'rolledBack', (count(*) FILTER (WHERE rolled_back_at IS NOT NULL))::int)::text FROM _prisma_migrations;"
    $plan += [pscustomobject]@{ name = 'migration-summary'; sql = $queryB }
  }
  return $plan
}

function Get-ForeignDatabaseIsolationQuery([Parameter(Mandatory = $true)][string]$DatabaseName) {
  if ([string]::IsNullOrWhiteSpace($DatabaseName) -or $DatabaseName -notmatch '^[a-z][a-z0-9_]*$') { throw 'FOREIGN_DATABASE_NAME_INVALID' }
  return "SELECT json_build_object('record', 'foreignDatabase', 'database', '$DatabaseName', 'present', (EXISTS (SELECT 1 FROM pg_database WHERE datname = '$DatabaseName')), 'connect', (CASE WHEN EXISTS (SELECT 1 FROM pg_database WHERE datname = '$DatabaseName') THEN has_database_privilege(current_user, '$DatabaseName', 'CONNECT') ELSE false END))::text;"
}

function Stop-ExactBaoGiangRuntime([Parameter(Mandatory = $true)]$Marker,[Parameter(Mandatory = $true)][ValidateSet('scheduled-task','service')][string]$ServiceKind,[Parameter(Mandatory = $true)][string]$ServiceName,[ValidateRange(1,10)][int]$MaxAttempts = 6,[ValidateRange(0,10)][int]$DelaySeconds = 1) {
  # Identity validation is intentionally before every mutation; never target a generic node.exe.
  Assert-VerifiedRuntimeIdentity -Marker $Marker -ServiceKind $ServiceKind -ServiceName $ServiceName | Out-Null
  if ($ServiceKind -eq 'scheduled-task') {
    $task = Assert-VerifiedScheduledTaskContract -Marker $Marker -ServiceName $ServiceName
    # A first-deploy failure must not be restarted by an automatic trigger.
    Disable-ScheduledTask -TaskName $ServiceName -TaskPath $task.TaskPath -ErrorAction Stop | Out-Null
    Stop-ScheduledTask -TaskName $ServiceName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue
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
    if ($decision.state -eq 'PASS') {
      if ($ServiceKind -eq 'scheduled-task') { Assert-ScheduledTaskDisabledState (Assert-VerifiedScheduledTaskContract -Marker $Marker -ServiceName $ServiceName) | Out-Null }
      return [ordered]@{ state = 'stopped'; serviceKind = $ServiceKind; serviceName = $ServiceName; attempts = $attempt; apiProcessCount = 0; listenerCount = 0; taskEnabled = if ($ServiceKind -eq 'scheduled-task') { $false } else { $null } }
    }
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

function Get-NginxRuntimeBinding(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$NginxExe,
  [Parameter(Mandatory = $true)][string]$NginxPrefix,
  [Parameter(Mandatory = $true)][string]$NginxConfig
) {
  $canonicalRoot = Assert-DedicatedRoot $Root
  $markerPath = Get-CanonicalPath (Join-Path $canonicalRoot 'shared\deployment-identity.json')
  Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $markerPath) | Out-Null
  if ((Get-PathSecurityClassification -Path $markerPath -Kind file).state -ne 'PASS') { throw 'NGINX_MARKER_INVALID' }
  $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-DeploymentMarkerSchema -Marker $marker -CanonicalRoot $canonicalRoot | Out-Null
  $binding = [pscustomobject][ordered]@{
    nginxExe = Get-CanonicalPath $NginxExe
    nginxPrefix = Get-CanonicalPath $NginxPrefix
    nginxConfig = Get-CanonicalPath $NginxConfig
  }
  if ((Normalize-ComparablePath $binding.nginxExe) -ne (Normalize-ComparablePath $marker.nginxExe) -or
      (Normalize-ComparablePath $binding.nginxPrefix) -ne (Normalize-ComparablePath $marker.foreignIsolation.reviewedNginxPrefix) -or
      (Normalize-ComparablePath $binding.nginxConfig) -ne (Normalize-ComparablePath $marker.nginxConfig) -or
      (Normalize-ComparablePath $binding.nginxConfig) -ne (Normalize-ComparablePath $marker.foreignIsolation.reviewedNginxConfig)) { throw 'NGINX_MARKER_BINDING_CONFLICT' }
  foreach ($leaf in @($binding.nginxExe,$binding.nginxConfig)) {
    Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $leaf) | Out-Null
    if ((Get-PathSecurityClassification -Path $leaf -Kind file).state -ne 'PASS') { throw 'NGINX_RUNTIME_LEAF_INVALID' }
  }
  Assert-PathAncestorChainNonReparse -Directory $binding.nginxPrefix | Out-Null
  if ((Get-PathSecurityClassification -Path $binding.nginxPrefix -Kind directory).state -ne 'PASS') { throw 'NGINX_PREFIX_INVALID' }
  return [pscustomobject][ordered]@{ root = $canonicalRoot; markerPath = $markerPath; marker = $marker; nginxExe = $binding.nginxExe; nginxPrefix = $binding.nginxPrefix; nginxConfig = $binding.nginxConfig }
}

function Get-NginxCommandPlan([string]$NginxExe,[string]$NginxPrefix,[string]$NginxConfig) {
  return [pscustomobject][ordered]@{
    syntaxTest = [pscustomobject][ordered]@{ executable = $NginxExe; arguments = @('-p',$NginxPrefix,'-t','-c',$NginxConfig) }
    reload = [pscustomobject][ordered]@{ executable = $NginxExe; arguments = @('-p',$NginxPrefix,'-c',$NginxConfig,'-s','reload'); execution = 'MANUAL_ONLY' }
  }
}

function Invoke-ReviewedNginxSyntaxTest([string]$NginxExe,[string]$NginxPrefix,[string]$NginxConfig) {
  $arguments = @('-p',(Get-CanonicalPath $NginxPrefix),'-t','-c',(Get-CanonicalPath $NginxConfig))
  & (Get-CanonicalPath $NginxExe) @arguments *> $null
  if ($LASTEXITCODE -ne 0) { throw 'NGINX_SYNTAX_TEST_FAILED' }
  return [pscustomobject][ordered]@{ executable = Get-CanonicalPath $NginxExe; arguments = $arguments; exitCode = 0 }
}

function ConvertTo-NginxPath([string]$Path) { return (Get-CanonicalPath $Path).Replace('\','/') }

function Get-NginxTokens([Parameter(Mandatory = $true)][string]$Text) {
  $tokens = [Collections.Generic.List[string]]::new(); $buffer = [Text.StringBuilder]::new()
  $quote = [char]0; $escaped = $false
  for ($index = 0; $index -lt $Text.Length; $index++) {
    $character = $Text[$index]
    if ($quote -ne [char]0) {
      if ($escaped) { [void]$buffer.Append($character); $escaped = $false; continue }
      if ($character -eq '\') { $escaped = $true; continue }
      if ($character -eq $quote) { $tokens.Add($buffer.ToString()); [void]$buffer.Clear(); $quote = [char]0; continue }
      [void]$buffer.Append($character); continue
    }
    if ($character -eq '#') { while ($index -lt $Text.Length -and $Text[$index] -notin @("`r","`n")) { $index++ }; continue }
    if ($character -eq '"' -or $character -eq "'") {
      if ($buffer.Length -gt 0) { throw 'NGINX_PARSE_AMBIGUOUS' }
      $quote = $character; continue
    }
    if ([char]::IsWhiteSpace($character)) { if ($buffer.Length -gt 0) { $tokens.Add($buffer.ToString()); [void]$buffer.Clear() }; continue }
    if ($character -in @('{','}',';')) { if ($buffer.Length -gt 0) { $tokens.Add($buffer.ToString()); [void]$buffer.Clear() }; $tokens.Add([string]$character); continue }
    [void]$buffer.Append($character)
  }
  if ($quote -ne [char]0 -or $escaped) { throw 'NGINX_PARSE_AMBIGUOUS' }
  if ($buffer.Length -gt 0) { $tokens.Add($buffer.ToString()) }
  return @($tokens)
}

function Read-NginxAst([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $text = [Text.UTF8Encoding]::new($false,$true).GetString($bytes)
  $tokens = @(Get-NginxTokens $text); $state = [pscustomobject]@{ position = 0 }
  function Read-NginxBlock([bool]$Nested) {
    $nodes = [Collections.Generic.List[object]]::new()
    while ($state.position -lt $tokens.Count) {
      if ($tokens[$state.position] -eq '}') { if (-not $Nested) { throw 'NGINX_PARSE_AMBIGUOUS' }; $state.position++; return @($nodes) }
      $words = [Collections.Generic.List[string]]::new()
      while ($state.position -lt $tokens.Count -and $tokens[$state.position] -notin @('{','}',';')) { $words.Add($tokens[$state.position]); $state.position++ }
      if ($words.Count -eq 0 -or $state.position -ge $tokens.Count -or $tokens[$state.position] -eq '}') { throw 'NGINX_PARSE_AMBIGUOUS' }
      $delimiter = $tokens[$state.position]; $state.position++
      if ($delimiter -eq ';') { $nodes.Add([pscustomobject]@{ name=$words[0]; arguments=@($words | Select-Object -Skip 1); children=@(); file=(Get-CanonicalPath $Path) }) }
      elseif ($delimiter -eq '{') { $nodes.Add([pscustomobject]@{ name=$words[0]; arguments=@($words | Select-Object -Skip 1); children=@(Read-NginxBlock $true); file=(Get-CanonicalPath $Path) }) }
      else { throw 'NGINX_PARSE_AMBIGUOUS' }
    }
    if ($Nested) { throw 'NGINX_PARSE_AMBIGUOUS' }
    return @($nodes)
  }
  $ast = @(Read-NginxBlock $false)
  if ($state.position -ne $tokens.Count) { throw 'NGINX_PARSE_AMBIGUOUS' }
  return [pscustomobject]@{ path=Get-CanonicalPath $Path; sha256=Get-Sha256FromBytes $bytes; nodes=$ast }
}

function Get-NginxEffectiveGraph([string]$NginxPrefix,[string]$NginxConfig,[string]$PlannedManagedPath = '') {
  $prefix = Get-CanonicalPath $NginxPrefix; $main = Get-CanonicalPath $NginxConfig
  $files = [Collections.Generic.List[object]]::new(); $servers = [Collections.Generic.List[object]]::new(); $includes = [Collections.Generic.List[object]]::new()
  $visited = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase); $active = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  function Visit-NginxFile([string]$FilePath,[string[]]$InheritedContext) {
    $canonical = Get-CanonicalPath $FilePath
    if (-not (Test-PathWithin $canonical $prefix)) { throw 'NGINX_INCLUDE_OUTSIDE_PREFIX' }
    Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $canonical) | Out-Null
    if ((Get-PathSecurityClassification -Path $canonical -Kind file).state -ne 'PASS') { throw 'NGINX_CONFIG_FILE_INVALID' }
    if ($active.Contains($canonical)) { throw 'NGINX_INCLUDE_CYCLE' }
    if (-not $visited.Add($canonical)) { throw 'NGINX_INCLUDE_AMBIGUOUS' }
    [void]$active.Add($canonical); $parsed = Read-NginxAst $canonical; $files.Add($parsed)
    function Walk-NginxNodes([object[]]$Nodes,[string[]]$Context) {
      foreach ($node in $Nodes) {
        if ($node.name -ceq 'include') {
          if ($node.arguments.Count -ne 1 -or $node.arguments[0] -match '\$') { throw 'NGINX_INCLUDE_DYNAMIC_OR_AMBIGUOUS' }
          $pattern = [string]$node.arguments[0]
          $wild = $pattern.IndexOfAny([char[]]'*?[') -ge 0
          if ($wild) {
            $rawPattern = if ([IO.Path]::IsPathRooted($pattern)) { $pattern } else { Join-Path $prefix $pattern }
            $parent = Get-CanonicalPath (Split-Path -Parent $rawPattern); $resolvedPattern = Join-Path $parent (Split-Path -Leaf $rawPattern)
            if (-not (Test-PathWithin $parent $prefix)) { throw 'NGINX_INCLUDE_OUTSIDE_PREFIX' }
            Assert-PathAncestorChainNonReparse $parent | Out-Null
            if ((Get-PathSecurityClassification $parent directory).state -ne 'PASS') { throw 'NGINX_INCLUDE_BOUNDARY_INVALID' }
            $matches = @(Get-ChildItem -Path $resolvedPattern -File -ErrorAction SilentlyContinue | Sort-Object FullName)
            $plannedMatch = -not [string]::IsNullOrWhiteSpace($PlannedManagedPath) -and (Get-CanonicalPath $PlannedManagedPath) -like $resolvedPattern
            if ($matches.Count -eq 0 -and -not $plannedMatch) { throw 'NGINX_INCLUDE_UNRESOLVED' }
            $includes.Add([pscustomobject]@{source=$canonical;pattern=$resolvedPattern;wildcard=$true;plannedMatch=$plannedMatch;matches=@($matches.FullName | ForEach-Object { Get-CanonicalPath $_ })})
            foreach ($match in $matches) { Visit-NginxFile $match.FullName $Context }
          } else {
            $resolvedPattern = if ([IO.Path]::IsPathRooted($pattern)) { Get-CanonicalPath $pattern } else { Get-CanonicalPath (Join-Path $prefix $pattern) }
            if (-not (Test-PathWithin $resolvedPattern $prefix)) { throw 'NGINX_INCLUDE_OUTSIDE_PREFIX' }
            $isPlanned = -not [string]::IsNullOrWhiteSpace($PlannedManagedPath) -and (Normalize-ComparablePath $resolvedPattern) -eq (Normalize-ComparablePath $PlannedManagedPath)
            $includes.Add([pscustomobject]@{source=$canonical;pattern=$resolvedPattern;wildcard=$false;plannedMatch=$isPlanned;matches=if(Test-Path -LiteralPath $resolvedPattern){@($resolvedPattern)}else{@()}})
            if (Test-Path -LiteralPath $resolvedPattern) { Visit-NginxFile $resolvedPattern $Context } elseif (-not $isPlanned) { throw 'NGINX_INCLUDE_UNRESOLVED' }
          }
        }
        if ($node.name -ceq 'server') {
          if ($Context.Count -eq 0 -or $Context[$Context.Count-1] -cne 'http') { throw 'NGINX_SERVER_CONTEXT_AMBIGUOUS' }
          $servers.Add([pscustomobject]@{file=$canonical;context=@($Context);node=$node})
        }
        if ($node.children.Count -gt 0) { Walk-NginxNodes $node.children @($Context + $node.name) }
      }
    }
    Walk-NginxNodes $parsed.nodes $InheritedContext; [void]$active.Remove($canonical)
  }
  Visit-NginxFile $main @()
  return [pscustomobject][ordered]@{ main=$main; files=@($files); includes=@($includes); servers=@($servers) }
}

function Get-NginxDirective([object]$Node,[string]$Name) { return @($Node.children | Where-Object { $_.name -ceq $Name }) }

function Normalize-NginxExactServerName([Parameter(Mandatory = $true)][string]$ServerName) {
  if ([string]::IsNullOrWhiteSpace($ServerName) -or $ServerName -match '[\x00-\x20\x7f/\\]' -or $ServerName.StartsWith('~') -or $ServerName.Contains('*') -or $ServerName.StartsWith('.') -or $ServerName.Contains('$')) { throw 'NGINX_SERVER_NAME_NOT_EXACT' }
  $normalized = $ServerName.TrimEnd('.').ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($normalized) -or $normalized.Contains('..') -or $normalized.Length -gt 253 -or
      $normalized -notmatch '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$') { throw 'NGINX_SERVER_NAME_NOT_EXACT' }
  return $normalized
}

function Get-NginxServerNameClassification([Parameter(Mandatory = $true)][string]$ServerName) {
  if ([string]::IsNullOrWhiteSpace($ServerName) -or $ServerName -match '[\x00-\x20\x7f/\\]') { return [pscustomobject][ordered]@{kind='SPECIAL';normalizedExactName=$null} }
  if ($ServerName.StartsWith('~')) { return [pscustomobject][ordered]@{kind='REGEX';normalizedExactName=$null} }
  if ($ServerName.Contains('$')) { return [pscustomobject][ordered]@{kind='SPECIAL';normalizedExactName=$null} }
  if ($ServerName.Contains('*') -or $ServerName.StartsWith('.')) { return [pscustomobject][ordered]@{kind='WILDCARD';normalizedExactName=$null} }
  try { return [pscustomobject][ordered]@{kind='EXACT';normalizedExactName=Normalize-NginxExactServerName $ServerName} }
  catch { return [pscustomobject][ordered]@{kind='OTHER';normalizedExactName=$null} }
}

function Test-NginxServerClaims443Domain([object]$Server,[string]$Domain = 'baogiang.dtnt-damsan.edu.vn') {
  $names = @(Get-NginxDirective $Server.node 'server_name' | ForEach-Object { $_.arguments })
  $listens = @(Get-NginxDirective $Server.node 'listen' | ForEach-Object { $_.arguments -join ' ' })
  $approvedName = Normalize-NginxExactServerName $Domain
  $claimsExactName = @($names | ForEach-Object { Get-NginxServerNameClassification $_ } | Where-Object { $_.kind -ceq 'EXACT' -and $_.normalizedExactName -ceq $approvedName }).Count -gt 0
  return $claimsExactName -and @($listens | Where-Object { $_ -match '(^|:)443(?:\s|$)' }).Count -gt 0
}

function Get-CanonicalNginxManagedBytes([string]$Root,[string]$CertificatePath,[string]$PrivateKeyPath,[string]$ClientMaxBodySize) {
  if ($ClientMaxBodySize -notmatch '^[1-9][0-9]*(?:[kKmMgG])?$') { throw 'NGINX_REQUEST_SIZE_INVALID' }
  $webRoot = ConvertTo-NginxPath (Join-Path (Assert-DedicatedRoot $Root) 'current\apps\web\dist')
  $certificate = ConvertTo-NginxPath $CertificatePath; $privateKey = ConvertTo-NginxPath $PrivateKeyPath
  $content = @(
    'server {','    listen 443 ssl;','    server_name baogiang.dtnt-damsan.edu.vn;',"    root `"$webRoot`";",'    index index.html;',"    client_max_body_size $ClientMaxBodySize;", "    ssl_certificate `"$certificate`";", "    ssl_certificate_key `"$privateKey`";",'', '    location / {','        try_files $uri $uri/ /index.html;','    }','', '    location /api/ {','        proxy_pass http://127.0.0.1:3100;','        proxy_http_version 1.1;','        proxy_set_header Host $host;','        proxy_set_header X-Real-IP $remote_addr;','        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;','        proxy_set_header X-Forwarded-Proto $scheme;','    }','}',''
  ) -join "`n"
  return [Text.UTF8Encoding]::new($false).GetBytes($content)
}

function Assert-NginxTlsLeafMetadata([string]$Path,[string]$Label) {
  Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent (Get-CanonicalPath $Path)) | Out-Null
  if ((Get-PathSecurityClassification -Path $Path -Kind file).state -ne 'PASS') { throw "NGINX_${Label}_INVALID" }
  return Get-CanonicalPath $Path
}

function Get-NginxNeighborSnapshot([object]$Graph,[string]$ManagedPath) {
  return @($Graph.files | Where-Object { (Normalize-ComparablePath $_.path) -ne (Normalize-ComparablePath $ManagedPath) } | Sort-Object path | ForEach-Object { [pscustomobject][ordered]@{path=$_.path;sha256=$_.sha256} })
}

function Assert-NginxNeighborSnapshot([object[]]$Expected,[object]$Graph,[string]$ManagedPath) {
  $actual = @(Get-NginxNeighborSnapshot $Graph $ManagedPath)
  if ($actual.Count -ne @($Expected).Count) { throw 'NGINX_NEIGHBOR_CONFLICT' }
  for ($i=0;$i -lt $actual.Count;$i++) { if ((Normalize-ComparablePath $actual[$i].path) -ne (Normalize-ComparablePath $Expected[$i].path) -or $actual[$i].sha256 -cne $Expected[$i].sha256) { throw 'NGINX_NEIGHBOR_CONFLICT' } }
}

function Assert-NginxPlanSchema([Parameter(Mandatory = $true)]$Plan) {
  try {
    Assert-StartupBundlePlanObject $Plan @('schemaVersion','mode','mutationsPerformed','state','reason','domain','binding','desired','preState','rollbackSnapshot','neighbors','preGraphFiles','commands','safety')
    Assert-StartupBundlePlanObject $Plan.binding @('root','nginxExe','nginxPrefix','nginxConfig','managedConfig','tlsCertificate','tlsPrivateKey','clientMaxBodySize','repositoryRoot')
    Assert-StartupBundlePlanObject $Plan.desired @('encoding','eol','sha256','contentBase64')
    Assert-StartupBundlePlanObject $Plan.preState @('state','sha256','restoreAction')
    Assert-StartupBundlePlanObject $Plan.rollbackSnapshot @('path','sha256','state')
    Assert-StartupBundlePlanObject $Plan.commands @('syntaxTest','reload')
    Assert-StartupBundlePlanObject $Plan.commands.syntaxTest @('executable','arguments')
    Assert-StartupBundlePlanObject $Plan.commands.reload @('executable','arguments','execution')
    Assert-StartupBundlePlanObject $Plan.safety @('configMutationPerformed','reloadExecuted','privateKeyContentRead')
  } catch { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  if (($Plan.schemaVersion -isnot [int] -and $Plan.schemaVersion -isnot [long]) -or [long]$Plan.schemaVersion -ne 1 -or
      $Plan.mode -isnot [string] -or $Plan.mode -cne 'READ_ONLY_NGINX_PLAN' -or $Plan.mutationsPerformed -isnot [bool] -or $Plan.mutationsPerformed -or
      $Plan.state -isnot [string] -or $Plan.state -notin @('READY_FOR_MANUAL_APPLY','SNAPSHOT_REQUIRED','BLOCKED_INCLUDE_BOUNDARY','CONFLICT') -or
      ($null -ne $Plan.reason -and $Plan.reason -isnot [string]) -or $Plan.domain -isnot [string] -or $Plan.domain -cne 'baogiang.dtnt-damsan.edu.vn') { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  if ($Plan.state -in @('READY_FOR_MANUAL_APPLY','SNAPSHOT_REQUIRED') -and $null -ne $Plan.reason) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  if ($Plan.state -in @('BLOCKED_INCLUDE_BOUNDARY','CONFLICT') -and ($Plan.reason -isnot [string] -or [string]::IsNullOrWhiteSpace($Plan.reason))) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  foreach ($pathField in @('root','nginxExe','nginxPrefix','nginxConfig','managedConfig','tlsCertificate','tlsPrivateKey','repositoryRoot')) {
    $value = $Plan.binding.$pathField
    if ($value -isnot [string] -or [string]::IsNullOrWhiteSpace($value) -or -not [IO.Path]::IsPathRooted($value) -or (Get-CanonicalPath $value) -cne $value) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  }
  if ($Plan.binding.clientMaxBodySize -isnot [string] -or $Plan.binding.clientMaxBodySize -notmatch '^[1-9][0-9]*(?:[kKmMgG])?$') { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  if ($Plan.desired.encoding -isnot [string] -or $Plan.desired.encoding -cne 'UTF-8_NO_BOM' -or $Plan.desired.eol -isnot [string] -or $Plan.desired.eol -cne 'LF' -or
      $Plan.desired.sha256 -isnot [string] -or $Plan.desired.sha256 -notmatch '^[0-9a-f]{64}$' -or $Plan.desired.contentBase64 -isnot [string]) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  try { $desiredPlanBytes = [Convert]::FromBase64String($Plan.desired.contentBase64) } catch { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  if ((Get-Sha256FromBytes $desiredPlanBytes) -cne $Plan.desired.sha256) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  if ($Plan.preState.state -isnot [string] -or $Plan.preState.state -notin @('MISSING','EXISTS') -or $Plan.preState.restoreAction -isnot [string]) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  if ($Plan.preState.state -ceq 'MISSING') {
    if ($null -ne $Plan.preState.sha256 -or $Plan.preState.restoreAction -cne 'REMOVE_EXACT_MANAGED_FILE' -or
        $Plan.rollbackSnapshot.state -isnot [string] -or $Plan.rollbackSnapshot.state -cne 'NOT_REQUIRED' -or
        $null -ne $Plan.rollbackSnapshot.path -or $null -ne $Plan.rollbackSnapshot.sha256 -or $Plan.state -ceq 'SNAPSHOT_REQUIRED') { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  } else {
    if ($Plan.preState.sha256 -isnot [string] -or $Plan.preState.sha256 -notmatch '^[0-9a-f]{64}$' -or $Plan.preState.restoreAction -cne 'RESTORE_EXACT_SNAPSHOT_BYTES' -or
        $Plan.rollbackSnapshot.state -isnot [string] -or $Plan.rollbackSnapshot.state -notin @('REQUIRED','MISSING','EXACT','HASH_MISMATCH')) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
    if ($Plan.rollbackSnapshot.state -ceq 'EXACT') {
      if ($Plan.rollbackSnapshot.path -isnot [string] -or [string]::IsNullOrWhiteSpace($Plan.rollbackSnapshot.path) -or -not [IO.Path]::IsPathRooted($Plan.rollbackSnapshot.path) -or
          (Get-CanonicalPath $Plan.rollbackSnapshot.path) -cne $Plan.rollbackSnapshot.path -or $Plan.rollbackSnapshot.sha256 -isnot [string] -or
          $Plan.rollbackSnapshot.sha256 -cne $Plan.preState.sha256) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
    } elseif ($Plan.rollbackSnapshot.state -ceq 'HASH_MISMATCH') {
      if ($Plan.rollbackSnapshot.path -isnot [string] -or -not [IO.Path]::IsPathRooted($Plan.rollbackSnapshot.path) -or $Plan.rollbackSnapshot.sha256 -isnot [string] -or $Plan.rollbackSnapshot.sha256 -notmatch '^[0-9a-f]{64}$' -or $Plan.rollbackSnapshot.sha256 -ceq $Plan.preState.sha256) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
    } elseif ($null -ne $Plan.rollbackSnapshot.path -or $null -ne $Plan.rollbackSnapshot.sha256) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
    if ($Plan.state -ceq 'READY_FOR_MANUAL_APPLY' -and $Plan.rollbackSnapshot.state -cne 'EXACT') { throw 'NGINX_PLAN_SCHEMA_INVALID' }
    if ($Plan.state -ceq 'SNAPSHOT_REQUIRED' -and $Plan.rollbackSnapshot.state -ceq 'EXACT') { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  }
  if ($Plan.neighbors -isnot [object[]] -or $Plan.preGraphFiles -isnot [object[]]) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  $neighborPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($neighbor in @($Plan.neighbors)) {
    try { Assert-StartupBundlePlanObject $neighbor @('path','sha256') } catch { throw 'NGINX_PLAN_SCHEMA_INVALID' }
    if ($neighbor.path -isnot [string] -or -not [IO.Path]::IsPathRooted($neighbor.path) -or (Get-CanonicalPath $neighbor.path) -cne $neighbor.path -or
        $neighbor.sha256 -isnot [string] -or $neighbor.sha256 -notmatch '^[0-9a-f]{64}$' -or -not $neighborPaths.Add($neighbor.path)) { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  }
  $graphPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($graphPath in @($Plan.preGraphFiles)) { if ($graphPath -isnot [string] -or -not [IO.Path]::IsPathRooted($graphPath) -or (Get-CanonicalPath $graphPath) -cne $graphPath -or -not $graphPaths.Add($graphPath)) { throw 'NGINX_PLAN_SCHEMA_INVALID' } }
  if ($Plan.commands.syntaxTest.executable -isnot [string] -or $Plan.commands.reload.executable -isnot [string] -or
      $Plan.commands.syntaxTest.executable -cne $Plan.binding.nginxExe -or $Plan.commands.reload.executable -cne $Plan.binding.nginxExe -or
      $Plan.commands.syntaxTest.arguments -isnot [object[]] -or $Plan.commands.reload.arguments -isnot [object[]] -or
      (($Plan.commands.syntaxTest.arguments -join "`n") -cne (@('-p',$Plan.binding.nginxPrefix,'-t','-c',$Plan.binding.nginxConfig) -join "`n")) -or
      (($Plan.commands.reload.arguments -join "`n") -cne (@('-p',$Plan.binding.nginxPrefix,'-c',$Plan.binding.nginxConfig,'-s','reload') -join "`n")) -or
      $Plan.commands.reload.execution -isnot [string] -or $Plan.commands.reload.execution -cne 'MANUAL_ONLY') { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  foreach ($safetyField in @('configMutationPerformed','reloadExecuted','privateKeyContentRead')) { if ($Plan.safety.$safetyField -isnot [bool] -or $Plan.safety.$safetyField) { throw 'NGINX_PLAN_SCHEMA_INVALID' } }
  return $Plan
}

function Assert-NginxRollbackSnapshotEvidence(
  [Parameter(Mandatory = $true)][string]$SnapshotPath,
  [Parameter(Mandatory = $true)][string]$ProductionRoot,
  [Parameter(Mandatory = $true)][string]$NginxPrefix,
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][string]$ManagedConfig,
  [Parameter(Mandatory = $true)][string]$NginxExe,
  [Parameter(Mandatory = $true)][string]$NginxConfig,
  [Parameter(Mandatory = $true)][string]$MarkerPath,
  [Parameter(Mandatory = $true)][string]$TlsCertificate,
  [Parameter(Mandatory = $true)][string]$TlsPrivateKey,
  [string]$PlanPath = '',
  [string]$ReportPath = '',
  [string]$ExpectedSha256 = '',
  [switch]$RequireExact
) {
  if ([string]::IsNullOrWhiteSpace($SnapshotPath)) { if ($RequireExact) { throw 'NGINX_ROLLBACK_SNAPSHOT_MISSING' }; return [pscustomobject][ordered]@{path=$null;sha256=$null;state='MISSING'} }
  $snapshot = Get-CanonicalPath $SnapshotPath
  foreach ($boundary in @($ProductionRoot,$NginxPrefix,$RepositoryRoot)) { if (Test-PathWithin $snapshot (Get-CanonicalPath $boundary)) { throw 'NGINX_ROLLBACK_SNAPSHOT_BOUNDARY_INVALID' } }
  foreach ($protectedLeaf in @($ManagedConfig,$NginxExe,$NginxConfig,$MarkerPath,$TlsCertificate,$TlsPrivateKey,$PlanPath,$ReportPath)) {
    if (-not [string]::IsNullOrWhiteSpace($protectedLeaf) -and (Normalize-ComparablePath $snapshot) -eq (Normalize-ComparablePath $protectedLeaf)) { throw 'NGINX_ROLLBACK_SNAPSHOT_PROTECTED_LEAF' }
  }
  try { Assert-PathAncestorChainNonReparse -Directory (Split-Path -Parent $snapshot) | Out-Null } catch {
    if ($_.Exception.Message -match 'REPARSE_POINT') { throw 'NGINX_ROLLBACK_SNAPSHOT_REPARSE_POINT' }
    throw 'NGINX_ROLLBACK_SNAPSHOT_BOUNDARY_INVALID'
  }
  $classification = Get-PathSecurityClassification -Path $snapshot -Kind file
  if ($classification.state -eq 'MISSING') { if ($RequireExact) { throw 'NGINX_ROLLBACK_SNAPSHOT_MISSING' }; return [pscustomobject][ordered]@{path=$null;sha256=$null;state='MISSING'} }
  if ($classification.state -eq 'REPARSE_POINT') { throw 'NGINX_ROLLBACK_SNAPSHOT_REPARSE_POINT' }
  if ($classification.state -ne 'PASS') { throw 'NGINX_ROLLBACK_SNAPSHOT_BOUNDARY_INVALID' }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedSha256) -and $ExpectedSha256 -notmatch '^[0-9a-f]{64}$') { throw 'NGINX_PLAN_SCHEMA_INVALID' }
  $snapshotHash = Get-FileSha256FromBytes $snapshot
  if (-not [string]::IsNullOrWhiteSpace($ExpectedSha256) -and $snapshotHash -cne $ExpectedSha256) {
    if ($RequireExact) { throw 'NGINX_ROLLBACK_SNAPSHOT_HASH_MISMATCH' }
    return [pscustomobject][ordered]@{path=$snapshot;sha256=$snapshotHash;state='HASH_MISMATCH'}
  }
  return [pscustomobject][ordered]@{path=$snapshot;sha256=$snapshotHash;state='EXACT'}
}

function Get-ManagedProductionEnvironmentNames {
  return @('NODE_ENV','TZ','API_HOST','API_PORT','HTTP_TRUST_PROXY_HOPS','DATABASE_URL','CORS_ORIGINS','AUTH_SESSION_TTL_SECONDS','AUTH_LAST_SEEN_UPDATE_SECONDS','AUTH_COOKIE_NAME','AUTH_COOKIE_PATH','AUTH_COOKIE_DOMAIN','AUTH_COOKIE_SECURE','AUTH_COOKIE_SAME_SITE','AUTH_LOCKOUT_THRESHOLD','AUTH_LOCKOUT_DURATION_SECONDS','AUTH_PASSWORD_MIN_LENGTH','AUTH_LOGIN_RATE_LIMIT_MAX','AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS','AUTH_LOGIN_RATE_LIMIT_MAX_KEYS','AI_ENABLED','AI_ACTIVE_MODE_ENABLED','AI_PASSIVE_MODE_ENABLED','WEB_PUSH_ENABLED','LOG_LEVEL','TEST_DATABASE_URL','BOOTSTRAP_ADMIN_USERNAME','BOOTSTRAP_ADMIN_DISPLAY_NAME','BOOTSTRAP_ADMIN_PASSWORD')
}

function Assert-ProductionPositiveInteger([Parameter(Mandatory = $true)][string]$Value) {
  if ($Value -notmatch '^[1-9][0-9]*$') { throw 'Production runtime environment contains an invalid positive integer.' }
  [double]$number = 0
  if (-not [double]::TryParse($Value,[Globalization.NumberStyles]::None,[Globalization.CultureInfo]::InvariantCulture,[ref]$number) -or [double]::IsNaN($number) -or [double]::IsInfinity($number) -or $number -le 0 -or [Math]::Truncate($number) -ne $number) { throw 'Production runtime environment contains a non-finite positive integer.' }
  return $Value
}

function Read-ValidatedProductionEnvironment([Parameter(Mandatory = $true)][string]$EnvFile,[Parameter(Mandatory = $true)][string]$ExpectedBaseUrl) {
  Assert-ExistingLeaf $EnvFile 'Production environment file' | Out-Null
  $allowed = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($name in @(Get-ManagedProductionEnvironmentNames | Where-Object { $_ -notin @('TEST_DATABASE_URL','BOOTSTRAP_ADMIN_USERNAME','BOOTSTRAP_ADMIN_DISPLAY_NAME','BOOTSTRAP_ADMIN_PASSWORD') })) { [void]$allowed.Add($name) }
  $required = @('NODE_ENV','TZ','API_HOST','API_PORT','HTTP_TRUST_PROXY_HOPS','DATABASE_URL','CORS_ORIGINS','AUTH_SESSION_TTL_SECONDS','AUTH_LAST_SEEN_UPDATE_SECONDS','AUTH_COOKIE_NAME','AUTH_COOKIE_PATH','AUTH_COOKIE_SECURE','AUTH_COOKIE_SAME_SITE','AUTH_LOCKOUT_THRESHOLD','AUTH_LOCKOUT_DURATION_SECONDS','AUTH_PASSWORD_MIN_LENGTH','AUTH_LOGIN_RATE_LIMIT_MAX','AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS','AUTH_LOGIN_RATE_LIMIT_MAX_KEYS','AI_ENABLED','AI_ACTIVE_MODE_ENABLED','AI_PASSIVE_MODE_ENABLED','WEB_PUSH_ENABLED','LOG_LEVEL')
  $forbidden = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($name in @('TEST_DATABASE_URL','BOOTSTRAP_ADMIN_USERNAME','BOOTSTRAP_ADMIN_DISPLAY_NAME','BOOTSTRAP_ADMIN_PASSWORD')) { [void]$forbidden.Add($name) }
  $values = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)
  $seenInsensitive = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#') { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { throw 'Production environment contains an invalid assignment.' }
    $name = $Matches[1]; $value = $Matches[2]
    if ($forbidden.Contains($name)) { throw 'Production runtime environment contains a forbidden variable.' }
    if (-not $allowed.Contains($name)) { throw 'Production runtime environment contains an unapproved variable.' }
    if (-not $seenInsensitive.Add($name)) { throw 'Production runtime environment contains a duplicate variable.' }
    [void]$values.Add($name,$value)
  }
  foreach ($name in $required) { if (-not $values.ContainsKey($name)) { throw 'Production runtime environment is missing a required variable.' } }
  foreach ($name in @('DATABASE_URL','AUTH_SESSION_TTL_SECONDS','AUTH_LAST_SEEN_UPDATE_SECONDS','AUTH_COOKIE_NAME','AUTH_COOKIE_PATH','AUTH_COOKIE_SAME_SITE','AUTH_LOCKOUT_THRESHOLD','AUTH_LOCKOUT_DURATION_SECONDS','AUTH_PASSWORD_MIN_LENGTH','AUTH_LOGIN_RATE_LIMIT_MAX','AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS','AUTH_LOGIN_RATE_LIMIT_MAX_KEYS','LOG_LEVEL')) { if ([string]::IsNullOrWhiteSpace($values[$name])) { throw 'Production runtime environment contains a blank required value.' } }
  foreach ($name in @('AUTH_SESSION_TTL_SECONDS','AUTH_LAST_SEEN_UPDATE_SECONDS','AUTH_LOCKOUT_THRESHOLD','AUTH_LOCKOUT_DURATION_SECONDS','AUTH_PASSWORD_MIN_LENGTH','AUTH_LOGIN_RATE_LIMIT_MAX','AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS','AUTH_LOGIN_RATE_LIMIT_MAX_KEYS')) { Assert-ProductionPositiveInteger $values[$name] | Out-Null }
  if ($values['AUTH_COOKIE_NAME'] -notmatch '^[A-Za-z0-9_-]+$') { throw 'Production runtime environment contains an invalid cookie name.' }
  if (-not $values['AUTH_COOKIE_PATH'].StartsWith('/')) { throw 'Production runtime environment contains an invalid cookie path.' }
  if ($values['AUTH_COOKIE_SAME_SITE'].ToLowerInvariant() -notin @('lax','strict','none')) { throw 'Production runtime environment contains an invalid cookie SameSite value.' }
  if ($values['NODE_ENV'] -cne 'production' -or $values['TZ'] -cne 'Asia/Ho_Chi_Minh' -or $values['API_HOST'] -cnotin @('127.0.0.1','::1','localhost') -or $values['API_PORT'] -cne '3100' -or $values['HTTP_TRUST_PROXY_HOPS'] -cne '1' -or $values['AUTH_COOKIE_SECURE'] -cne 'true' -or $values['AI_ENABLED'] -cne 'false' -or $values['AI_ACTIVE_MODE_ENABLED'] -cne 'false' -or $values['AI_PASSIVE_MODE_ENABLED'] -cne 'false' -or $values['WEB_PUSH_ENABLED'] -cne 'false') { throw 'Production environment safety validation failed.' }
  $origins = @($values['CORS_ORIGINS'] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($origins.Count -ne 1 -or $origins[0] -cne $ExpectedBaseUrl) { throw 'Production CORS origin is not the exact approved domain.' }
  return $values
}

function Invoke-WithServerEnvironment([Parameter(Mandatory = $true)][string]$EnvFile,[Parameter(Mandatory = $true)][string]$ExpectedBaseUrl,[Parameter(Mandatory = $true)][scriptblock]$ScriptBlock) {
  $values = Read-ValidatedProductionEnvironment -EnvFile $EnvFile -ExpectedBaseUrl $ExpectedBaseUrl
  $private:snapshot = @{}
  try {
    foreach ($name in Get-ManagedProductionEnvironmentNames) { $prior = [Environment]::GetEnvironmentVariable($name,'Process'); $private:snapshot[$name] = [pscustomobject]@{ existed = $null -ne $prior; value = $prior } }
    foreach ($name in $private:snapshot.Keys) { [Environment]::SetEnvironmentVariable($name,$null,'Process') }
    foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name,$values[$name],'Process') }
    & $ScriptBlock
  } finally { Restore-ServerEnvironment -Snapshot $private:snapshot }
}

function Restore-ServerEnvironment([Parameter(Mandatory = $true)][hashtable]$Snapshot) {
  foreach ($name in $Snapshot.Keys) { $prior = $Snapshot[$name]; if ($prior.existed) { [Environment]::SetEnvironmentVariable($name,$prior.value,'Process') } else { [Environment]::SetEnvironmentVariable($name,$null,'Process') } }
}

function Get-DatabaseParts([Parameter(Mandatory = $true)][string]$DatabaseUrl) {
  try { $uri = [Uri]$DatabaseUrl } catch { throw 'DATABASE_URL is not a valid PostgreSQL URI.' }
  if ($uri.Scheme -notin @('postgres','postgresql') -or [string]::IsNullOrWhiteSpace($uri.Host) -or [string]::IsNullOrWhiteSpace($uri.AbsolutePath.Trim('/')) -or [string]::IsNullOrWhiteSpace($uri.UserInfo)) { throw 'DATABASE_URL does not contain the required PostgreSQL fields.' }
  $userinfo = $uri.UserInfo.Split(':',2)
  if ($userinfo.Count -ne 2) { throw 'DATABASE_URL must provide a user and password through URI userinfo.' }
  [ordered]@{ host = $uri.Host; port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }; database = $uri.AbsolutePath.Trim('/'); user = [Uri]::UnescapeDataString($userinfo[0]); password = [Uri]::UnescapeDataString($userinfo[1]) }
}

function Get-ManagedPostgresEnvironmentNames {
  return @(
    'PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGPASSFILE',
    'PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGAPPNAME','PGSSLMODE','PGREQUIRESSL',
    'PGSSLCERT','PGSSLKEY','PGSSLROOTCERT','PGSSLCRL','PGSSLCRLDIR','PGSSLSNI',
    'PGCONNECT_TIMEOUT','PGCLIENTENCODING','PGTARGETSESSIONATTRS','PGREQUIREAUTH',
    'PGCHANNELBINDING'
  )
}

function Snapshot-PostgresProcessEnvironment {
  $pgEnvSnapshot = [ordered]@{}
  foreach ($name in Get-ManagedPostgresEnvironmentNames) {
    $val = [Environment]::GetEnvironmentVariable($name, 'Process')
    $pgEnvSnapshot[$name] = [pscustomobject]@{ existed = ($null -ne $val); value = $val }
  }
  return $pgEnvSnapshot
}

function Restore-PostgresProcessEnvironment([Parameter(Mandatory = $true)][hashtable]$Snapshot) {
  foreach ($name in $Snapshot.Keys) {
    $entry = $Snapshot[$name]
    if ($entry.existed) {
      [Environment]::SetEnvironmentVariable($name, $entry.value, 'Process')
    } else {
      [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
  }
}

function Clear-PostgresProcessEnvironment {
  foreach ($name in Get-ManagedPostgresEnvironmentNames) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
}

function Set-PostgresProcessEnvironment([Parameter(Mandatory = $true)][string]$DatabaseUrl,[int]$ExpectedPort = 5433) {
  $parts = Get-DatabaseParts $DatabaseUrl
  if ([int]$parts.port -ne $ExpectedPort) { throw 'DATABASE_URL PostgreSQL port does not match the reviewed inventory.' }
  Clear-PostgresProcessEnvironment
  $env:PGHOST = $parts.host; $env:PGPORT = [string]$parts.port; $env:PGDATABASE = $parts.database; $env:PGUSER = $parts.user; $env:PGPASSWORD = $parts.password
  return $parts
}

function Get-SafeErrorCategory([Parameter(Mandatory = $true)]$ErrorRecord) {
  return $ErrorRecord.Exception.GetType().Name
}

function Write-RedactedReport([Parameter(Mandatory = $true)][string]$Path,[Parameter(Mandatory = $true)][object]$Data) {
  $safe = $Data | ConvertTo-Json -Depth 12
  if ($safe -match '(?i)postgres(?:ql)?://[^\s"'']+:[^\s"'']+@|BEGIN .*PRIVATE KEY|PGPASSWORD=') { throw 'Redacted report contains a forbidden secret pattern.' }
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($Path), $safe, [Text.UTF8Encoding]::new($false))
}
