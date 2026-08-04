const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const required = ['DESIGN.md', '.codex/skills/damsan-ui/SKILL.md'];
const sourceRoots = ['apps/web/src', 'apps/web/index.html', 'apps/web/tailwind.config.js'];
const forbidden = [
  { label: 'transition-all', pattern: /transition-all/i },
  { label: 'gradient', pattern: /(?:gradient\s*\(|(?:bg|from|via|to)-gradient)/i },
  { label: 'backdrop/glass', pattern: /(?:backdrop-blur|glassmorphism|glass-panel)/i },
  { label: 'h-screen', pattern: /(?:^|[^\w-])h-screen(?:$|[^\w-])/i },
  { label: 'route tab role', pattern: /role\s*=\s*["'{]\s*tab(?:list)?\b/i },
  { label: 'browser auth persistence', pattern: /(?:localStorage|sessionStorage)[\s\S]{0,160}(?:auth|token|cookie|password)|(?:auth|token|cookie|password)[\s\S]{0,160}(?:localStorage|sessionStorage)/i },
  { label: 'Inter font', pattern: /(?:font-family|fontFamily|fonts\.googleapis)[\s\S]{0,100}\bInter\b/i },
];

function walk(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(target, entry.name);
    return entry.isDirectory() ? walk(resolved) : [resolved];
  });
}

function inspectText(text, name) {
  return forbidden.filter(({ pattern }) => pattern.test(text)).map(({ label }) => `${name}: ${label}`);
}

function selfTest() {
  const bad = 'className="transition-all h-screen backdrop-blur"; localStorage.setItem("auth-token", password); font-family: Inter; background: linear-gradient(red, blue); role="tab"';
  const labels = inspectText(bad, 'fixture');
  if (labels.length !== forbidden.length) throw new Error(`Static checker fixture missed rules: ${labels.join(', ')}`);
  if (inspectText("transition: color 120ms; font-family: 'Be Vietnam Pro';", 'safe').length) throw new Error('Static checker rejected safe fixture.');
}

selfTest();
const failures = [];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`${relative}: required authority file is missing`);
}
for (const relative of sourceRoots) {
  const target = path.join(root, relative);
  for (const file of walk(target).filter((name) => /\.(?:css|html|js|jsx|ts|tsx)$/.test(name) && !name.includes(`${path.sep}__tests__${path.sep}`))) {
    failures.push(...inspectText(fs.readFileSync(file, 'utf8'), path.relative(root, file)));
  }
}
if (failures.length) {
  console.error(`UI foundation static gate failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log('UI foundation static gate passed (authority files, production web source, and checker fixtures).');
