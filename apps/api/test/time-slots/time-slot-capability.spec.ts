import { createRequire } from 'node:module';
import { CapabilityKey } from '@baogiang/contracts';
import { BOOTSTRAP_TECHNICAL_CAPABILITIES } from '../../src/bootstrap/bootstrap-admin';

describe('time-slot capability catalog', () => {
  it('publishes one professional capability without making it a bootstrap grant', () => {
    const key: CapabilityKey = 'TIMETABLE_MANAGE';
    expect(key).toBe('TIMETABLE_MANAGE');
    expect(BOOTSTRAP_TECHNICAL_CAPABILITIES).not.toContain(key);
  });

  it('defines TIMETABLE_MANAGE exactly once at SCHOOL_WIDE', () => {
    const key: CapabilityKey = 'TIMETABLE_MANAGE';
    const load = createRequire(__filename);
    const { CAPABILITIES } = load('../../../../prisma/capability-catalog.cjs') as {
      CAPABILITIES: Array<[string, string, string[]]>;
    };
    expect(CAPABILITIES.filter(([candidate]) => candidate === key)).toEqual([[key, expect.any(String), ['SCHOOL_WIDE']]]);
  });
});
