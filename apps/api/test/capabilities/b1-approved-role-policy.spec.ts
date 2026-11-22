import {
  B1_APPROVED_POLICY_VERSION, B1_APPROVED_ROLE_SOURCE_KEYS,
  B1_SUPPORTED_SEATS_FOR_KEY, materializeB1RoleGrants,
} from '../../src/capabilities/b1-approved-role-policy';
import { B1_STAGED_SOURCE_KEYS, b1FullRoleSourceKeys } from '../../src/capabilities/b1-role-command-writer';
import { materializeTemplateGrants } from '../../src/capabilities/responsibility-template-catalog';
import { SENSITIVE_CAPABILITY_KEYS } from '../../src/capabilities/sensitive-capability-policy';

describe('P5-057 B1 approved G1/G3/G4 policy, separate from runtime activation', () => {
  it('retains independent role and technical source owners without introducing AI authority', () => {
    expect(B1_APPROVED_POLICY_VERSION).toBe('WS1-B1-G1-G3-G4-20261122');
    expect(B1_SUPPORTED_SEATS_FOR_KEY).toEqual({
      APPROVAL_PRINCIPAL: ['PRINCIPAL'],
      AUDIT_VIEW: ['PRINCIPAL', 'TECHNICAL_ACCOUNT_ADMIN'],
      APPROVAL_VICE_PRINCIPAL: ['VICE_PRINCIPAL_ACADEMIC'],
      ADDITIONAL_DUTY_CATALOG_MANAGE: ['VICE_PRINCIPAL_ACADEMIC', 'TECHNICAL_ACCOUNT_ADMIN'],
    });
    expect(B1_APPROVED_ROLE_SOURCE_KEYS).toEqual({
      PRINCIPAL: ['APPROVAL_PRINCIPAL', 'AUDIT_VIEW'],
      VICE_PRINCIPAL_ACADEMIC: ['APPROVAL_VICE_PRINCIPAL', 'ADDITIONAL_DUTY_CATALOG_MANAGE'],
    });
    expect(B1_STAGED_SOURCE_KEYS).toBe(B1_APPROVED_ROLE_SOURCE_KEYS);
    expect(Object.isFrozen(B1_SUPPORTED_SEATS_FOR_KEY)).toBe(true);
    expect(Object.isFrozen(B1_APPROVED_ROLE_SOURCE_KEYS)).toBe(true);
    for (const seats of Object.values(B1_SUPPORTED_SEATS_FOR_KEY)) expect(Object.isFrozen(seats)).toBe(true);
    for (const keys of Object.values(B1_APPROVED_ROLE_SOURCE_KEYS)) expect(Object.isFrozen(keys)).toBe(true);
  });

  it('adds G4 only to the staged B1 PHT specification, not generic legacy templates', () => {
    const legacy = materializeTemplateGrants({ templateKey: 'VICE_PRINCIPAL_ACADEMIC' });
    expect(legacy.some((spec) => spec.capabilityKey === 'ADDITIONAL_DUTY_CATALOG_MANAGE')).toBe(false);
    const b1 = materializeB1RoleGrants('VICE_PRINCIPAL_ACADEMIC');
    expect(b1.filter((spec) => spec.capabilityKey === 'ADDITIONAL_DUTY_CATALOG_MANAGE')).toEqual([
      expect.objectContaining({ capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE',
        scopeType: 'SCHOOL_WIDE', scopeResourceId: null, category: 'SOURCE_AUTHORITY' }),
    ]);
    expect(b1.filter((spec) => spec.capabilityKey !== 'ADDITIONAL_DUTY_CATALOG_MANAGE')).toEqual(legacy);
    expect(materializeTemplateGrants({ templateKey: 'VICE_PRINCIPAL_ACADEMIC' })).toEqual(legacy);
    expect(materializeB1RoleGrants('PRINCIPAL').some(
      (spec) => spec.capabilityKey === 'ADDITIONAL_DUTY_CATALOG_MANAGE')).toBe(false);
  });

  it.each(['PRINCIPAL', 'VICE_PRINCIPAL_ACADEMIC'] as const)(
    '%s preview and writer use identical school-wide keys, preserve PERSONAL and exclude AI',
    (role) => {
      const specs = materializeB1RoleGrants(role);
      const schoolKeys = specs.filter((spec) => spec.scopeType === 'SCHOOL_WIDE'
        && spec.scopeResourceId === null).map((spec) => spec.capabilityKey);
      expect(schoolKeys).toHaveLength(new Set(schoolKeys).size);
      expect(b1FullRoleSourceKeys(role)).toEqual([...schoolKeys].sort());
      const sensitive = schoolKeys.filter((key) => SENSITIVE_CAPABILITY_KEYS.some((s) => s === key));
      expect(sensitive.sort()).toEqual([...B1_APPROVED_ROLE_SOURCE_KEYS[role]].sort());
      expect(specs.filter((spec) => spec.scopeType === 'PERSONAL')).toEqual(
        materializeTemplateGrants({ templateKey: role }).filter((spec) => spec.scopeType === 'PERSONAL'));
      expect(specs.some((spec) => spec.capabilityKey.startsWith('AI_'))).toBe(false);
    },
  );
});
