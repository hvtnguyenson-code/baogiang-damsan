import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

describe('operational overlay capability catalog', () => {
  const load = createRequire(__filename);
  const { CAPABILITIES } = load('../../../../prisma/seed.cjs') as { CAPABILITIES: Array<[string, string, string[]]> };

  it.each([
    ['CALENDAR_EXCEPTION_MANAGE', ['SCHOOL_WIDE']],
    ['TEACHING_OPERATION_MANAGE', ['SUBJECT', 'SCHOOL_WIDE']],
  ])('seeds %s exactly once with exact scopes', (key, scopes) => {
    expect(CAPABILITIES.filter(([candidate]) => candidate === key)).toEqual([[key, expect.any(String), scopes]]);
  });

  it('has exactly 30 unique definitions and creates no grants in seed', () => {
    expect(CAPABILITIES).toHaveLength(30);
    expect(new Set(CAPABILITIES.map(([key]) => key))).toHaveProperty('size', 30);
    const seed = fs.readFileSync(path.resolve(__dirname, '../../../../prisma/seed.cjs'), 'utf8');
    expect(seed).not.toMatch(/capabilityGrant\.(?:create|createMany|upsert)/u);
  });
});
