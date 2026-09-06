import { createRequire } from 'node:module';
import { CapabilityKey } from '@baogiang/contracts';
import { BOOTSTRAP_TECHNICAL_CAPABILITIES } from '../bootstrap/bootstrap-admin';
describe('Business Configuration capability catalog', () => {
  it('is one school-wide catalog capability and is never bootstrap-granted', () => {
    const load = createRequire(__filename);
    const { CAPABILITIES } = load('../../../../prisma/capability-catalog.cjs') as { CAPABILITIES: Array<[string, string, string[]]> };
    const key: CapabilityKey = 'BUSINESS_CONFIGURATION_MANAGE';
    expect(CAPABILITIES.filter(([candidate]) => candidate === key)).toEqual([[key, expect.any(String), ['SCHOOL_WIDE']]]);
    expect(BOOTSTRAP_TECHNICAL_CAPABILITIES).not.toContain(key);
  });
});
