import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

describe('operational overlay capability catalog', () => {
  const load = createRequire(__filename);
  const { CAPABILITIES } = load('../../../../prisma/capability-catalog.cjs') as { CAPABILITIES: Array<[string, string, string[]]> };

  it.each([
    ['CALENDAR_EXCEPTION_MANAGE', ['SCHOOL_WIDE']],
    ['TEACHING_OPERATION_MANAGE', ['SUBJECT', 'SCHOOL_WIDE']],
  ])('seeds %s exactly once with exact scopes', (key, scopes) => {
    expect(CAPABILITIES.filter(([candidate]) => candidate === key)).toEqual([[key, expect.any(String), scopes]]);
  });

  it('has unique definitions and the catalog synchronizer creates no grants', () => {
    expect(new Set(CAPABILITIES.map(([key]) => key))).toHaveProperty('size', CAPABILITIES.length);
    const catalog = fs.readFileSync(path.resolve(__dirname, '../../../../prisma/capability-catalog.cjs'), 'utf8');
    expect(catalog).not.toMatch(/capabilityGrant\.(?:create|createMany|upsert)/u);
  });
});
