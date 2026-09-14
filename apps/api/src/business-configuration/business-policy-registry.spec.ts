import { BadRequestException } from '@nestjs/common';
import {
  OPERATIONAL_START_FAMILY_DEFINITION,
  PRODUCTION_BUSINESS_POLICY_FAMILIES,
  strictObject,
  validateResource,
} from './business-policy-registry';

describe('Business policy registry boundary', () => {
  it('enables strictly authorized production policy families', () => {
    expect(PRODUCTION_BUSINESS_POLICY_FAMILIES).toHaveLength(1);
    expect(PRODUCTION_BUSINESS_POLICY_FAMILIES.map((x) => x.key)).toEqual(['OPERATIONAL_START']);

    const family = PRODUCTION_BUSINESS_POLICY_FAMILIES[0];
    expect(family).toBe(OPERATIONAL_START_FAMILY_DEFINITION);
    expect(family).toMatchObject({
      key: 'OPERATIONAL_START',
      resourceKind: 'ACADEMIC_YEAR',
      currentValidatorVersion: 'v1',
      publicationEnabled: true,
      downstreamAuthority: 'ADR-049',
    });
    expect(family.validators).toHaveLength(1);
    expect(family.validators[0]?.version).toBe('v1');
  });
  it('rejects non-object payloads', () => {
    expect(() => strictObject(null)).toThrow(BadRequestException);
    expect(() => strictObject([])).toThrow(BadRequestException);
  });
  it('rejects a resource kind outside the family contract', () => {
    expect(() => validateResource({
      key: 'TEST',
      resourceKind: 'SCHOOL_WIDE',
      currentValidatorVersion: 'v1',
      validators: [{ version: 'v1', validate: strictObject }],
      publicationEnabled: true,
      downstreamAuthority: 'test',
    }, { kind: 'ACADEMIC_YEAR', academicYearId: '00000000-0000-4000-8000-000000000001' })).toThrow('INVALID_POLICY_RESOURCE');
  });
});
