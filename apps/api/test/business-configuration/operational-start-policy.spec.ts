import { BadRequestException } from '@nestjs/common';
import {
  OPERATIONAL_START_FAMILY_DEFINITION,
  OPERATIONAL_START_VALIDATOR_V1,
  PRODUCTION_BUSINESS_POLICY_FAMILIES,
} from '../../src/business-configuration/business-policy-registry';

describe('OPERATIONAL_START policy family registry and validator v1', () => {
  describe('production registry catalog', () => {
    it('registers OPERATIONAL_START in PRODUCTION_BUSINESS_POLICY_FAMILIES', () => {
      const family = PRODUCTION_BUSINESS_POLICY_FAMILIES.find((f) => f.key === 'OPERATIONAL_START');
      expect(family).toBeDefined();
      expect(family?.resourceKind).toBe('ACADEMIC_YEAR');
      expect(family?.currentValidatorVersion).toBe('v1');
      expect(family?.publicationEnabled).toBe(true);
      expect(family?.downstreamAuthority).toBe('ADR-049');
      expect(family?.validators).toHaveLength(1);
      expect(family?.validators[0]?.version).toBe('v1');
    });

    it('exposes exactly OPERATIONAL_START as production registered family', () => {
      expect(PRODUCTION_BUSINESS_POLICY_FAMILIES).toEqual([OPERATIONAL_START_FAMILY_DEFINITION]);
      expect(PRODUCTION_BUSINESS_POLICY_FAMILIES.some((f) => f.key === 'TEST_BOOLEAN_THRESHOLD')).toBe(false);
      expect(PRODUCTION_BUSINESS_POLICY_FAMILIES.some((f) => f.key === 'TEST_ACADEMIC_YEAR_CONFIG')).toBe(false);
    });
  });

  describe('OPERATIONAL_START validator v1', () => {
    it('accepts valid payload with canonical civil date string', () => {
      const result = OPERATIONAL_START_VALIDATOR_V1.validate({
        operationalStartDate: '2026-09-01',
      });
      expect(result).toEqual({ operationalStartDate: '2026-09-01' });
    });

    it('rejects empty object payload', () => {
      expect(() => OPERATIONAL_START_VALIDATOR_V1.validate({})).toThrow(BadRequestException);
      expect(() => OPERATIONAL_START_VALIDATOR_V1.validate({})).toThrow(
        'INVALID_OPERATIONAL_START_POLICY_PAYLOAD',
      );
    });

    it('rejects payload with extra keys', () => {
      expect(() =>
        OPERATIONAL_START_VALIDATOR_V1.validate({
          operationalStartDate: '2026-09-01',
          extraField: true,
        }),
      ).toThrow('INVALID_OPERATIONAL_START_POLICY_PAYLOAD');
    });

    it('rejects ISO timestamp string', () => {
      expect(() =>
        OPERATIONAL_START_VALIDATOR_V1.validate({
          operationalStartDate: '2026-09-01T00:00:00.000Z',
        }),
      ).toThrow('INVALID_OPERATIONAL_START_POLICY_PAYLOAD');
    });

    it('rejects offset datetime string', () => {
      expect(() =>
        OPERATIONAL_START_VALIDATOR_V1.validate({
          operationalStartDate: '2026-09-01+07:00',
        }),
      ).toThrow('INVALID_OPERATIONAL_START_POLICY_PAYLOAD');
    });

    it('rejects non-existent civil date', () => {
      expect(() =>
        OPERATIONAL_START_VALIDATOR_V1.validate({
          operationalStartDate: '2026-02-30',
        }),
      ).toThrow('INVALID_OPERATIONAL_START_POLICY_PAYLOAD');
    });

    it('rejects non-string values', () => {
      expect(() =>
        OPERATIONAL_START_VALIDATOR_V1.validate({
          operationalStartDate: 20260901,
        }),
      ).toThrow('INVALID_OPERATIONAL_START_POLICY_PAYLOAD');

      expect(() =>
        OPERATIONAL_START_VALIDATOR_V1.validate({
          operationalStartDate: null,
        }),
      ).toThrow('INVALID_OPERATIONAL_START_POLICY_PAYLOAD');
    });

    it('rejects non-object payload', () => {
      expect(() => OPERATIONAL_START_VALIDATOR_V1.validate(null)).toThrow(BadRequestException);
      expect(() => OPERATIONAL_START_VALIDATOR_V1.validate(['2026-09-01'])).toThrow(BadRequestException);
      expect(() => OPERATIONAL_START_VALIDATOR_V1.validate('2026-09-01')).toThrow(BadRequestException);
    });
  });
});
