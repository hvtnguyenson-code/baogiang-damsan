import { BadRequestException } from '@nestjs/common';
import { PRODUCTION_BUSINESS_POLICY_FAMILIES, strictObject, validateResource } from './business-policy-registry';

describe('Business policy registry boundary', () => {
  it('does not enable any production policy semantic', () => expect(PRODUCTION_BUSINESS_POLICY_FAMILIES).toEqual([]));
  it('rejects non-object payloads', () => {
    expect(() => strictObject(null)).toThrow(BadRequestException);
    expect(() => strictObject([])).toThrow(BadRequestException);
  });
  it('rejects a resource kind outside the family contract', () => {
    expect(() => validateResource({ key: 'TEST', resourceKind: 'SCHOOL_WIDE', validatorVersion: 'v1', publicationEnabled: true, downstreamAuthority: 'test', validate: strictObject }, { kind: 'ACADEMIC_YEAR', academicYearId: '00000000-0000-4000-8000-000000000001' })).toThrow('INVALID_POLICY_RESOURCE');
  });
});
