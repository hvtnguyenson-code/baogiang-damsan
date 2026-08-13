import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CapabilityKey } from '@baogiang/contracts';
import { BOOTSTRAP_TECHNICAL_CAPABILITIES } from '../../src/bootstrap/bootstrap-admin';

describe('time-slot capability catalog', () => {
  it('publishes one professional capability without making it a bootstrap grant', () => {
    const key: CapabilityKey = 'TIMETABLE_MANAGE';
    expect(key).toBe('TIMETABLE_MANAGE');
    expect(BOOTSTRAP_TECHNICAL_CAPABILITIES).not.toContain(key);
  });

  it('seeds exactly 28 definitions and TIMETABLE_MANAGE exactly once at SCHOOL_WIDE', () => {
    const load = createRequire(__filename);
    const { CAPABILITIES } = load('../../../../prisma/seed.cjs') as {
      CAPABILITIES: Array<[string, string, string[]]>;
    };
    const seed = fs.readFileSync(path.resolve(__dirname, '../../../../prisma/seed.cjs'), 'utf8');
    const keys = CAPABILITIES.map(([key]) => key);
    expect(keys).toHaveLength(28);
    expect(keys.filter((key) => key === 'TIMETABLE_MANAGE')).toHaveLength(1);
    expect(seed).toMatch(/\['TIMETABLE_MANAGE',[\s\S]*?\['SCHOOL_WIDE'\]\]/u);
    expect(seed.match(/TIMETABLE_MANAGE/gu)).toHaveLength(1);
    expect(seed).toContain('prisma.capabilityDefinition.upsert');
  });
});
