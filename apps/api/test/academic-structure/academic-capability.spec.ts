import fs from 'node:fs';
import path from 'node:path';
import { CapabilityKey } from '@baogiang/contracts';
import { BOOTSTRAP_TECHNICAL_CAPABILITIES } from '../../src/bootstrap/bootstrap-admin';

describe('academic structure capability catalog', () => {
  it('is a public capability and an explicit bootstrap grant', () => {
    const key: CapabilityKey = 'ACADEMIC_STRUCTURE_MANAGE';
    expect(BOOTSTRAP_TECHNICAL_CAPABILITIES).toContain(key);
  });

  it('is seeded with SCHOOL_WIDE as its only allowed scope', () => {
    const seed = fs.readFileSync(path.resolve(__dirname, '../../../../prisma/seed.cjs'), 'utf8');
    expect(seed).toMatch(/\['ACADEMIC_STRUCTURE_MANAGE',[\s\S]*?\['SCHOOL_WIDE'\]\]/u);
  });
});
