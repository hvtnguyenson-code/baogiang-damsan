import { createRequire } from 'node:module';
import { CapabilityKey } from '@baogiang/contracts';
import { BOOTSTRAP_TECHNICAL_CAPABILITIES } from '../../src/bootstrap/bootstrap-admin';

describe('Special Activity capability', () => {
  it('is a single school-wide catalog definition, not a bootstrap grant', () => {
    const key: CapabilityKey = 'SPECIAL_ACTIVITY_MANAGE';
    const load = createRequire(__filename);
    const { CAPABILITIES } = load('../../../../prisma/seed.cjs') as { CAPABILITIES: Array<[string, string, string[]]> };
    expect(CAPABILITIES.filter(([candidate]) => candidate === key)).toEqual([[key, expect.any(String), ['SCHOOL_WIDE']]]);
    expect(CAPABILITIES).toHaveLength(33);
    expect(BOOTSTRAP_TECHNICAL_CAPABILITIES).not.toContain(key);
  });
});
