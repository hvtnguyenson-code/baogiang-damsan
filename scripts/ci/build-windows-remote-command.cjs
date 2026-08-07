const assert = require('node:assert/strict');

function psLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function encodedPowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function buildHandshake({ root, serviceKind, serviceName }) {
  const marker = `${root.replace(/[\\/]+$/, '')}\\shared\\deployment-identity.json`;
  const script = [
    "$ErrorActionPreference='Stop'",
    `$markerPath=${psLiteral(marker)}`,
    "if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { throw 'Deployment marker is missing.' }",
    '$marker=Get-Content -Raw -Encoding UTF8 -LiteralPath $markerPath | ConvertFrom-Json',
    "if ($marker.systemId -ne 'baogiang-damsan' -or $marker.canonicalRoot -ine ${psLiteral(root)} -or $marker.domain -ne 'https://baogiang.dtnt-damsan.edu.vn' -or [int]$marker.apiPort -ne 3100) { throw 'Deployment marker identity mismatch.' }",
    "if ($marker.service.kind -ne ${psLiteral(serviceKind)} -or $marker.service.name -ne ${psLiteral(serviceName)}) { throw 'Deployment marker service mismatch.' }",
    `$incoming=${psLiteral(`${root.replace(/[\\/]+$/, '')}\\incoming`)}`,
    "if (-not (Test-Path -LiteralPath $incoming -PathType Container)) { throw 'Bootstrapped incoming directory is missing.' }",
    "Write-Output 'BAOGIANG_HANDSHAKE_PASS'",
  ].join('; ');
  return encodedPowerShell(script);
}

function buildFileInvocation(scriptPath, parameterPath) {
  return encodedPowerShell(`$ErrorActionPreference='Stop'; & ${psLiteral(scriptPath)} -ParameterFile ${psLiteral(parameterPath)}`);
}

function windowsRootToSftp(root) {
  if (typeof root !== 'string' || /[\r\n'"\u0000]/.test(root) || !/^[A-Za-z]:\\[^\\/:*?<>|]+(?:\\[^\\/:*?<>|]+)*$/.test(root)) throw new Error('Unsafe Windows root for SFTP contract.');
  return `/${root[0].toUpperCase()}:/${root.slice(3).replace(/\\/g, '/')}`;
}
function assertTransferName(name) {
  if (!/^control-[0-9]+-[0-9]+-[0-9a-f]{40}$/.test(name || '')) throw new Error('Unsafe or missing transfer name.');
  return name;
}
function quoteSftp(value) {
  if (/[\r\n\u0000]/.test(value)) throw new Error('Unsafe SFTP batch value.');
  return `"${String(value).replace(/(["\\])/g, '\\$1')}"`;
}
function buildCleanup(root, transfer) {
  assertTransferName(transfer);
  const parent = `${root.replace(/[\\/]+$/, '')}\\incoming`;
  const candidate = `${parent}\\${transfer}`;
  return encodedPowerShell(`$ErrorActionPreference='Stop'; $parent=${psLiteral(parent)}; $candidate=${psLiteral(candidate)}; if([IO.Path]::GetFullPath($candidate).TrimEnd('\\') -eq [IO.Path]::GetFullPath($parent).TrimEnd('\\')){throw 'Unsafe cleanup target.'}; if((Split-Path -Parent ([IO.Path]::GetFullPath($candidate))) -ine ([IO.Path]::GetFullPath($parent))){throw 'Cleanup target is not a direct incoming child.'}; if(Test-Path -LiteralPath $candidate){Remove-Item -LiteralPath $candidate -Recurse -Force}`);
}

if (require.main === module) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'handshake') console.log(buildHandshake(JSON.parse(args[0])));
  else if (mode === 'handshake-base64') console.log(buildHandshake(JSON.parse(Buffer.from(args[0], 'base64').toString('utf8'))));
  else if (mode === 'invoke') console.log(buildFileInvocation(args[0], args[1]));
  else if (mode === 'sftp-root') console.log(windowsRootToSftp(args[0]));
  else if (mode === 'cleanup') console.log(buildCleanup(args[0], args[1]));
  else throw new Error('Expected handshake or invoke mode.');
}

module.exports = { psLiteral, encodedPowerShell, buildHandshake, buildFileInvocation, windowsRootToSftp, assertTransferName, quoteSftp, buildCleanup };
