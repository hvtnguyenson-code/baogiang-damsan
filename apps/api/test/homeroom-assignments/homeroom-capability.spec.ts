import { createRequire } from 'node:module';
import { CapabilityKey } from '@baogiang/contracts';
import { BOOTSTRAP_TECHNICAL_CAPABILITIES } from '../../src/bootstrap/bootstrap-admin';

describe('Homeroom capability catalog', () => {
  it('defines exactly one SCHOOL_WIDE business capability without bootstrap bypass', () => {
    const key: CapabilityKey = 'HOMEROOM_ASSIGNMENT_MANAGE';
    const load = createRequire(__filename);
    const { CAPABILITIES } = load('../../../../prisma/capability-catalog.cjs') as {
      CAPABILITIES: Array<[string, string, string[]]>;
    };
    expect(CAPABILITIES.filter(([candidate]) => candidate === key)).toEqual([
      [key, expect.any(String), ['SCHOOL_WIDE']],
    ]);
    expect(BOOTSTRAP_TECHNICAL_CAPABILITIES).not.toContain(key);
  });
});
