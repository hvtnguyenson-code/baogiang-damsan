const assert = require('node:assert/strict');

const TRANSFER_NAME = /^control-[0-9]+-[0-9]+-[0-9a-f]{40}$/;
const WINDOWS_ROOT = /^[A-Za-z]:\\[A-Za-z0-9._-]+(?:\\[A-Za-z0-9._-]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;

function psLiteral(value) { return `'${String(value).replace(/'/g, "''")}'`; }
function encodedPowerShell(script) { return Buffer.from(script, 'utf16le').toString('base64'); }
function assertTransferName(name) { if (!TRANSFER_NAME.test(name || '')) throw new Error('Unsafe or missing transfer name.'); return name; }

function assertHandshakeContract(contract) {
  assert.ok(contract && typeof contract === 'object', 'Handshake contract is required.');
  for (const key of ['root','serviceKind','serviceName','envFile','startupWrapper','expectedEntryPoint','nodeExe','nginxExe','nginxConfig','wrapperPath','commonPath']) {
    assert.equal(typeof contract[key], 'string', `Missing handshake contract: ${key}`);
    assert.ok(contract[key].length > 0, `Empty handshake contract: ${key}`);
  }
  assert.match(contract.root, WINDOWS_ROOT);
  assert.match(contract.reviewedCommitSha || '', /^[0-9a-f]{40}$/);
  assert.match(contract.wrapperSha256 || '', SHA256);
  assert.match(contract.commonSha256 || '', SHA256);
  assert.equal(contract.markerAuthorityContractVersion, 1);
  return contract;
}

function trustedAuthorityScript(input) {
  const c = assertHandshakeContract(input);
  const v = Object.fromEntries(Object.entries(c).map(([key, value]) => [key, typeof value === 'string' ? psLiteral(value) : value]));
  return [
    "$ErrorActionPreference='Stop'",
    `$root=[IO.Path]::GetFullPath(${v.root}).TrimEnd('\\')`,
    `if($root -ine ${v.root}){throw 'HANDSHAKE_ROOT_NOT_CANONICAL'}`,
    `$wrapper=[IO.Path]::GetFullPath(${v.wrapperPath}).TrimEnd('\\')`,
    `$common=[IO.Path]::GetFullPath(${v.commonPath}).TrimEnd('\\')`,
    `$expectedVersion=Join-Path $root ${psLiteral(`shared\\startup-bundles\\${c.reviewedCommitSha}`)}`,
    `if($wrapper -ine (Join-Path $expectedVersion 'start-baogiang-api.ps1') -or $common -ine (Join-Path $expectedVersion 'deployment-common.ps1') -or $wrapper -ine ${v.startupWrapper}){throw 'HANDSHAKE_STARTUP_LAYOUT_CONFLICT'}`,
    `$segments=$root.TrimEnd('\\').Split('\\')`,
    `$cursor=$segments[0]+'\\'`,
    `$visited=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)`,
    `try{$driveRootItem=Get-Item -LiteralPath $cursor -Force -ErrorAction Stop}catch{throw 'HANDSHAKE_ROOT_ANCESTOR_UNVERIFIABLE'};if(-not $driveRootItem.PSIsContainer -or ($driveRootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'HANDSHAKE_ROOT_ANCESTOR_REPARSE_POINT'}`,
    `for($i=1;$i -lt $segments.Count;$i++){if($segments[$i] -eq ''){continue};$cursor=Join-Path $cursor $segments[$i];if(-not $visited.Add($cursor)){throw 'HANDSHAKE_ROOT_ANCESTOR_UNVERIFIABLE'};try{$item=Get-Item -LiteralPath $cursor -Force -ErrorAction Stop}catch{throw 'HANDSHAKE_ROOT_ANCESTOR_UNVERIFIABLE'};if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'HANDSHAKE_ROOT_ANCESTOR_REPARSE_POINT'};if(-not $item.PSIsContainer){throw 'HANDSHAKE_ROOT_ANCESTOR_UNVERIFIABLE'}}`,
    `foreach($directory in @((Join-Path $root 'shared'),(Join-Path $root 'shared\\startup-bundles'),$expectedVersion)){try{$item=Get-Item -LiteralPath $directory -Force -ErrorAction Stop}catch{throw 'HANDSHAKE_STARTUP_LAYOUT_MISSING'};if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'HANDSHAKE_STARTUP_LAYOUT_REPARSE'}}`,
    `foreach($file in @($wrapper,$common)){try{$item=Get-Item -LiteralPath $file -Force -ErrorAction Stop}catch{throw 'HANDSHAKE_STARTUP_FILE_MISSING'};if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'HANDSHAKE_STARTUP_FILE_REPARSE'}}`,
    `if(([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([IO.File]::ReadAllBytes($wrapper))).Replace('-','').ToLowerInvariant()) -cne ${v.wrapperSha256}){throw 'HANDSHAKE_WRAPPER_HASH_MISMATCH'}`,
    `if(([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([IO.File]::ReadAllBytes($common))).Replace('-','').ToLowerInvariant()) -cne ${v.commonSha256}){throw 'HANDSHAKE_COMMON_HASH_MISMATCH'}`,
    `. $common`,
    `if(-not (Test-Path Function:\\Get-DeploymentMarkerAuthorityContractVersion) -or (Get-DeploymentMarkerAuthorityContractVersion) -ne ${c.markerAuthorityContractVersion}){throw 'HANDSHAKE_MARKER_AUTHORITY_VERSION_MISMATCH'}`,
    `$identity=Read-DeploymentIdentity -Root $root -ServiceKind ${v.serviceKind} -ServiceName ${v.serviceName} -EnvFile ${v.envFile} -StartupWrapper $wrapper -ExpectedEntryPoint ${v.expectedEntryPoint} -NodeExe ${v.nodeExe} -NginxExe ${v.nginxExe} -NginxConfig ${v.nginxConfig}`,
    `if($null -eq $identity){throw 'HANDSHAKE_IDENTITY_MISSING'}`,
  ];
}

function buildHandshake(contract) { return encodedPowerShell([...trustedAuthorityScript(contract), "Write-Output 'BAOGIANG_HANDSHAKE_PASS'"].join('; ')); }

function buildPrepareTransfer(contract) {
  assertTransferName(contract.transferName);
  const root = contract.root.replace(/[\\/]+$/, '');
  const parent = `${root}\\incoming`;
  const candidate = `${parent}\\${contract.transferName}`;
  return encodedPowerShell([...trustedAuthorityScript(contract),
    `$parent=${psLiteral(parent)}`, `$candidate=${psLiteral(candidate)}`,
    `if([IO.Path]::GetFullPath($parent).TrimEnd('\\') -ine (Join-Path $root 'incoming')){throw 'TRANSFER_PARENT_CONFLICT'}`,
    `if((Split-Path -Parent ([IO.Path]::GetFullPath($candidate))) -ine [IO.Path]::GetFullPath($parent)){throw 'TRANSFER_NOT_DIRECT_CHILD'}`,
    `if(Test-Path -LiteralPath $candidate){throw 'TRANSFER_ALREADY_EXISTS'}`,
    `$parentItem=Get-Item -LiteralPath $parent -Force -ErrorAction Stop`,
    `if(-not $parentItem.PSIsContainer -or ($parentItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'TRANSFER_PARENT_UNSAFE'}`,
    `New-Item -ItemType Directory -Path $candidate | Out-Null`,
    `$created=Get-Item -LiteralPath $candidate -Force -ErrorAction Stop`,
    `if(-not $created.PSIsContainer -or ($created.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'TRANSFER_CREATED_UNSAFE'}`,
    `Write-Output 'BAOGIANG_PREPARE_TRANSFER_PASS'`,
  ].join('; '));
}

function buildFileInvocation(scriptPath, parameterPath) { return encodedPowerShell(`$ErrorActionPreference='Stop'; & ${psLiteral(scriptPath)} -ParameterFile ${psLiteral(parameterPath)}`); }
function windowsRootToSftp(root) { if (typeof root !== 'string' || !WINDOWS_ROOT.test(root)) throw new Error('Windows deployment root must use safe ASCII path segments.'); return `/${root[0].toUpperCase()}:/${root.slice(3).replace(/\\/g, '/')}`; }
function quoteSftp(value) { if (/[\r\n\u0000]/.test(value)) throw new Error('Unsafe SFTP batch value.'); return `"${String(value).replace(/(["\\])/g, '\\$1')}"`; }

function buildCleanup(root, transfer) {
  assertTransferName(transfer);
  if (!WINDOWS_ROOT.test(root)) throw new Error('Unsafe cleanup root.');
  const parent = `${root.replace(/[\\/]+$/, '')}\\incoming`;
  const candidate = `${parent}\\${transfer}`;
  return encodedPowerShell([
    "$ErrorActionPreference='Stop'", `$root=${psLiteral(root)}`, `$parent=${psLiteral(parent)}`, `$candidate=${psLiteral(candidate)}`,
    `if([IO.Path]::GetFullPath($parent).TrimEnd('\\') -ine (Join-Path ([IO.Path]::GetFullPath($root).TrimEnd('\\')) 'incoming')){throw 'CLEANUP_PARENT_CONFLICT'}`,
    `if((Split-Path -Parent ([IO.Path]::GetFullPath($candidate))) -ine [IO.Path]::GetFullPath($parent)){throw 'CLEANUP_NOT_DIRECT_CHILD'}`,
    `$filesystemRoot=[IO.Path]::GetPathRoot($candidate);$cursor=[IO.Path]::GetFullPath($candidate).TrimEnd('\\');$visited=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)`,
    `while($true){if(-not $visited.Add($cursor)){throw 'CLEANUP_ANCESTOR_UNVERIFIABLE'};try{$item=Get-Item -LiteralPath $cursor -Force -ErrorAction Stop}catch{throw 'CLEANUP_PATH_UNVERIFIABLE'};if(-not $item.PSIsContainer){throw 'CLEANUP_PATH_NOT_DIRECTORY'};if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'CLEANUP_REPARSE_POINT'};if($cursor.TrimEnd('\\') -ieq $filesystemRoot.TrimEnd('\\')){break};$cursor=(Split-Path -Parent $cursor);if([string]::IsNullOrWhiteSpace($cursor)){throw 'CLEANUP_ANCESTOR_UNVERIFIABLE'}}`,
    `Remove-Item -LiteralPath $candidate -Recurse -Force`,
  ].join('; '));
}

if (require.main === module) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'handshake') console.log(buildHandshake(JSON.parse(args[0])));
  else if (mode === 'handshake-base64') console.log(buildHandshake(JSON.parse(Buffer.from(args[0], 'base64').toString('utf8'))));
  else if (mode === 'prepare-transfer') console.log(buildPrepareTransfer(JSON.parse(args[0])));
  else if (mode === 'prepare-transfer-base64') console.log(buildPrepareTransfer(JSON.parse(Buffer.from(args[0], 'base64').toString('utf8'))));
  else if (mode === 'invoke') console.log(buildFileInvocation(args[0], args[1]));
  else if (mode === 'sftp-root') console.log(windowsRootToSftp(args[0]));
  else if (mode === 'cleanup') console.log(buildCleanup(args[0], args[1]));
  else throw new Error('Expected handshake, prepare-transfer, invoke, sftp-root or cleanup mode.');
}

module.exports = { psLiteral, encodedPowerShell, buildHandshake, buildPrepareTransfer, buildFileInvocation, windowsRootToSftp, assertTransferName, quoteSftp, buildCleanup };
