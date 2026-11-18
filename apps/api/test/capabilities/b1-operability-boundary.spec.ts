import { getTemplateDefinition } from '../../src/capabilities/responsibility-template-catalog';

describe('P5-057 WS1 B1 activation boundary — full workspace is not a two-key role writer', () => {
  const cases = [
    { key: 'PRINCIPAL' as const, approvalKey: 'APPROVAL_PRINCIPAL' },
    { key: 'VICE_PRINCIPAL_ACADEMIC' as const, approvalKey: 'APPROVAL_VICE_PRINCIPAL' },
  ];

  it.each(cases)('retains teacher and school-operability entitlements for $key', ({ key, approvalKey }) => {
    const template = getTemplateDefinition(key);
    const sourceKeys = new Set<string>(template.sourceAuthorityGrants.map((entry) => entry.capabilityKey));
    const operabilityKeys = new Set<string>(template.productOperabilityGrants.map((entry) => entry.capabilityKey));

    expect(sourceKeys.has('TEACHER_BASE')).toBe(true);
    expect(sourceKeys.has(approvalKey)).toBe(true);
    for (const required of [
      'REPORTING_READ',
      'TIMETABLE_MANAGE',
      'PPCT_MANAGE',
      'TEACHING_OPERATION_MANAGE',
    ]) {
      expect(operabilityKeys.has(required)).toBe(true);
    }

    // B1RoleCommandWriter deliberately emits only two sensitive sources per
    // appointment. It cannot, by itself, deliver the full leadership workspace.
    expect(operabilityKeys.size).toBeGreaterThan(5);
    const allKeys = new Set([...sourceKeys, ...operabilityKeys]);
    for (const forbidden of ['SYSTEM_ADMIN', 'USER_MANAGE', 'CAPABILITY_GRANT']) {
      expect(allKeys.has(forbidden)).toBe(false);
    }
  });
});
