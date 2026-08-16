import { createRequire } from 'node:module';
import { CapabilityKey } from '@baogiang/contracts';

describe('teaching execution capability catalog', () => {
  it('adds only the two explicit default-deny definitions with their exact scopes', () => {
    const load = createRequire(__filename);
    const { CAPABILITIES } = load('../../../../prisma/seed.cjs') as { CAPABILITIES: Array<[string, string, string[]]> };
    const scopes = new Map<string, string[]>(CAPABILITIES.map(([key, , allowed]) => [key, allowed]));
    const record: CapabilityKey = 'TEACHING_EXECUTION_RECORD';
    const manage: CapabilityKey = 'TEACHING_EXECUTION_MANAGE';
    expect(scopes.get(record)).toEqual(['PERSONAL']);
    expect(scopes.get(manage)).toEqual(['SUBJECT', 'SCHOOL_WIDE']);
  });
});
