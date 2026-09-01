const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const WRAPPER_SOURCE = 'scripts/deploy/windows/start-baogiang-api.ps1';
const COMMON_SOURCE = 'scripts/deploy/windows/deployment-common.ps1';
function git(repositoryRoot, args, encoding = 'utf8') { const result = spawnSync('git', ['-C', repositoryRoot, ...args], { encoding, maxBuffer: 16 * 1024 * 1024, windowsHide: true }); if (result.status !== 0) throw new Error(`Git authority query failed: git ${args[0]}`); return result.stdout; }

function resolveEvidence({ repositoryRoot, canonicalMainRef, root, startupWrapper }) {
  const canonicalRepository = fs.realpathSync(repositoryRoot);
  if (git(canonicalRepository, ['rev-parse', '--show-prefix']).trim() !== '') throw new Error('Repository root is not canonical.');
  if (!/^[A-Za-z]:\\[A-Za-z0-9._-]+(?:\\[A-Za-z0-9._-]+)*$/.test(root || '')) throw new Error('Invalid Windows production root.');
  const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escapedRoot}\\\\shared\\\\startup-bundles\\\\([0-9a-f]{40})\\\\start-baogiang-api\\.ps1$`).exec(startupWrapper || '');
  if (!match) throw new Error('Startup wrapper is outside the canonical startup-bundle layout.');
  const reviewedCommitSha = match[1];
  git(canonicalRepository, ['cat-file', '-e', `${reviewedCommitSha}^{commit}`]);
  const firstParent = git(canonicalRepository, ['rev-list', '--first-parent', canonicalMainRef]).trim().split(/\r?\n/);
  if (!firstParent.includes(reviewedCommitSha)) throw new Error('Startup bundle commit is not in canonical first-parent main history.');
  const readBlob = (sourcePath) => { const oid = git(canonicalRepository, ['rev-parse', `${reviewedCommitSha}:${sourcePath}`]).trim(); const bytes = git(canonicalRepository, ['cat-file', 'blob', oid], null); return { oid, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }; };
  const wrapper = readBlob(WRAPPER_SOURCE); const common = readBlob(COMMON_SOURCE);
  const versionDirectory = `${root}\\shared\\startup-bundles\\${reviewedCommitSha}`;
  return { reviewedCommitSha, wrapperPath: `${versionDirectory}\\start-baogiang-api.ps1`, commonPath: `${versionDirectory}\\deployment-common.ps1`, wrapperGitBlobOid: wrapper.oid, commonGitBlobOid: common.oid, wrapperSha256: wrapper.sha256, commonSha256: common.sha256, markerAuthorityContractVersion: 1 };
}

if (require.main === module) {
  const raw = process.argv[2] === '--base64' ? Buffer.from(process.argv[3] || '', 'base64').toString('utf8') : (process.argv[2] || '{}');
  process.stdout.write(`${JSON.stringify(resolveEvidence(JSON.parse(raw)))}\n`);
}
module.exports = { resolveEvidence };
