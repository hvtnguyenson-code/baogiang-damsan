const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.endsWith('.docx') && file !== 'package-lock.json' && file !== 'scripts/ci/scan-auth-secrets.cjs');

const forbidden = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /\bgh[opusr]_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:session|access|refresh)[_-]?token\s*[:=]\s*['"][A-Za-z0-9._~-]{20,}['"]/i,
];

const findings = [];
for (const file of files) {
  let content;
  try { content = readFileSync(file, 'utf8'); } catch { continue; }
  for (const pattern of forbidden) {
    if (pattern.test(content)) findings.push(`${file}: ${pattern.source}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`Potential committed secrets detected:\n${findings.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('Auth secret scan PASS.\n');
