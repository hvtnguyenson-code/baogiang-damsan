import { createRequire } from 'node:module';
import { CapabilityKey } from '@baogiang/contracts';
import { BOOTSTRAP_TECHNICAL_CAPABILITIES } from '../../src/bootstrap/bootstrap-admin';

describe('academic structure capability catalog', () => {
  it('is a public capability and an explicit bootstrap grant', () => {
    const key: CapabilityKey = 'ACADEMIC_STRUCTURE_MANAGE';
    expect(BOOTSTRAP_TECHNICAL_CAPABILITIES).toContain(key);
  });

  it('has one canonical SCHOOL_WIDE definition', () => {
    const load = createRequire(__filename);
    const { CAPABILITIES } = load('../../../../prisma/capability-catalog.cjs') as { CAPABILITIES: Array<[string, string, string[]]> };
    expect(CAPABILITIES.filter(([candidate]) => candidate === 'ACADEMIC_STRUCTURE_MANAGE')).toEqual([['ACADEMIC_STRUCTURE_MANAGE', expect.any(String), ['SCHOOL_WIDE']]]);
  });
});
