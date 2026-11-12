/**
 * P5-057 / WS1 G-D2-2: static, non-runtime inventory drift checks.
 * This does NOT implement an issuer policy or authorize a grant/revocation.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RESPONSIBILITY_TEMPLATE_DEFINITIONS } from '../../src/capabilities/responsibility-template-catalog';

type CatalogEntry = readonly [string, string, readonly string[]];
// Catalog is a CommonJS production seed module, loaded only by this test.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CAPABILITIES } = require('../../../../prisma/capability-catalog.cjs') as {
  CAPABILITIES: CatalogEntry[];
};

const SENSITIVE_KEYS = [
  'APPROVAL_PRINCIPAL',
  'APPROVAL_VICE_PRINCIPAL',
  'AUDIT_VIEW',
  'ADDITIONAL_DUTY_CATALOG_MANAGE',
  'AI_CONFIGURE_POLICY',
  'AI_VIEW_USAGE',
  'AI_VIEW_COST',
  'AI_VIEW_AUDIT',
  'AI_DISABLE_SYSTEM',
] as const;
const AI_GOVERNANCE_KEYS = SENSITIVE_KEYS.filter((key) => key.startsWith('AI_'));
const policyDocument = resolve(
  __dirname,
  '../../../../docs/requirements/P5-057-WS1-SENSITIVE-NINE-CAPABILITY-MATRIX-20261112.md',
);

function templateSensitiveKeys(templateKey: keyof typeof RESPONSIBILITY_TEMPLATE_DEFINITIONS): string[] {
  const template = RESPONSIBILITY_TEMPLATE_DEFINITIONS[templateKey];
  return [
    ...template.sourceAuthorityGrants,
    ...template.productOperabilityGrants,
  ].map((grant) => grant.capabilityKey)
    .filter((key) => SENSITIVE_KEYS.some((sensitive) => sensitive === key));
}

describe('P5-057 WS1 G-D2-2: 9 sensitive keys baseline inventory (NOT an authorization policy)', () => {
  it('has exactly nine explicitly tracked, unique keys', () => {
    expect(SENSITIVE_KEYS).toHaveLength(9);
    expect(new Set(SENSITIVE_KEYS).size).toBe(9);
  });

  it.each(SENSITIVE_KEYS)('%s exists once in the capability catalog and only supports SCHOOL_WIDE', (key) => {
    const entries = CAPABILITIES.filter((row) => row[0] === key);
    expect(entries).toHaveLength(1);
    expect(entries[0][2]).toEqual(['SCHOOL_WIDE']);
  });

  it('matches the current built-in responsibility template exposures exactly', () => {
    const actual = Object.fromEntries(Object.keys(RESPONSIBILITY_TEMPLATE_DEFINITIONS).map((key) => [
      key, templateSensitiveKeys(key as keyof typeof RESPONSIBILITY_TEMPLATE_DEFINITIONS),
    ]));
    expect(actual).toEqual({
      TEACHER: [],
      SUBJECT_LEADER: [],
      VICE_PRINCIPAL_ACADEMIC: ['APPROVAL_VICE_PRINCIPAL'],
      PRINCIPAL: ['APPROVAL_PRINCIPAL', 'AUDIT_VIEW'],
      GDDP_COORDINATOR: [],
      HDTN_COORDINATOR: [],
      TECHNICAL_ACCOUNT_ADMIN: ['AUDIT_VIEW', 'ADDITIONAL_DUTY_CATALOG_MANAGE'],
    });
  });

  it('does not silently assign any of the five Phase-11 AI governance keys from templates', () => {
    for (const name of Object.keys(RESPONSIBILITY_TEMPLATE_DEFINITIONS)) {
      expect(templateSensitiveKeys(name as keyof typeof RESPONSIBILITY_TEMPLATE_DEFINITIONS)
        .filter((key) => AI_GOVERNANCE_KEYS.some((sensitive) => sensitive === key))).toEqual([]);
    }
  });

  it('documents exactly one decision row for each sensitive key without enabling a writer', () => {
    const text = readFileSync(policyDocument, 'utf8');
    const matrixSection = text.split('## 2. Ma trận 9 key')[1]?.split('## 3. ')[0] ?? '';
    expect(matrixSection).not.toBe('');
    const rows = [...matrixSection.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((match) => match[1]);
    expect(rows.sort()).toEqual([...SENSITIVE_KEYS].sort());
    expect(text).toContain('CHƯA PHẢI POLICY ĐƯỢC KÍCH HOẠT');
    expect(text).toContain('CRITICAL — G1/G2 generic writer bypass');
  });
});
