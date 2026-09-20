import { BadRequestException } from '@nestjs/common';
import {
  OPERATIONAL_START_FAMILY_DEFINITION,
  PRODUCTION_BUSINESS_POLICY_FAMILIES,
  SPECIAL_PROGRAMME_WORKLOAD_FAMILY_DEFINITION,
  SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1,
  strictObject,
  validateResource,
} from './business-policy-registry';

describe('Business policy registry boundary', () => {
  it('enables strictly authorized production policy families', () => {
    expect(PRODUCTION_BUSINESS_POLICY_FAMILIES).toHaveLength(2);
    expect(PRODUCTION_BUSINESS_POLICY_FAMILIES.map((x) => x.key)).toEqual([
      'OPERATIONAL_START',
      'SPECIAL_PROGRAMME_WORKLOAD',
    ]);

    const opStart = PRODUCTION_BUSINESS_POLICY_FAMILIES[0];
    expect(opStart).toBe(OPERATIONAL_START_FAMILY_DEFINITION);
    expect(opStart).toMatchObject({
      key: 'OPERATIONAL_START',
      resourceKind: 'ACADEMIC_YEAR',
      currentValidatorVersion: 'v1',
      publicationEnabled: true,
      downstreamAuthority: 'ADR-049',
    });
    expect(opStart.validators).toHaveLength(1);
    expect(opStart.validators[0]?.version).toBe('v1');

    const spWorkload = PRODUCTION_BUSINESS_POLICY_FAMILIES[1];
    expect(spWorkload).toBe(SPECIAL_PROGRAMME_WORKLOAD_FAMILY_DEFINITION);
    expect(spWorkload).toMatchObject({
      key: 'SPECIAL_PROGRAMME_WORKLOAD',
      resourceKind: 'ACADEMIC_YEAR',
      currentValidatorVersion: 'v1',
      publicationEnabled: true,
      downstreamAuthority: 'ADR-050',
    });
    expect(spWorkload.validators).toHaveLength(1);
    expect(spWorkload.validators[0]?.version).toBe('v1');
  });

  it('rejects non-object payloads', () => {
    expect(() => strictObject(null)).toThrow(BadRequestException);
    expect(() => strictObject([])).toThrow(BadRequestException);
  });

  it('rejects a resource kind outside the family contract', () => {
    expect(() =>
      validateResource(
        {
          key: 'TEST',
          resourceKind: 'SCHOOL_WIDE',
          currentValidatorVersion: 'v1',
          validators: [{ version: 'v1', validate: strictObject }],
          publicationEnabled: true,
          downstreamAuthority: 'test',
        },
        {
          kind: 'ACADEMIC_YEAR',
          academicYearId: '00000000-0000-4000-8000-000000000001',
        },
      ),
    ).toThrow('INVALID_POLICY_RESOURCE');
  });

  describe('SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1', () => {
    const validPayload = {
      coefficients: {
        GDDP: {
          CLASS: 1.5,
          GRADE: 1.2,
        },
        HDTN_HN: {
          CLASS: 1.0,
          GRADE: 1.1,
          SCHOOL_WIDE: 1.3,
        },
      },
    };

    it('accepts strict valid payload with finite non-negative coefficients', () => {
      const validated = SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate(validPayload);
      expect(validated).toEqual(validPayload);
    });

    it('accepts valid 0 coefficient', () => {
      const payload = {
        coefficients: {
          GDDP: {
            CLASS: 0,
            GRADE: 0,
          },
          HDTN_HN: {
            CLASS: 0,
            GRADE: 0,
            SCHOOL_WIDE: 0,
          },
        },
      };
      const validated = SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate(payload);
      expect(validated).toEqual(payload);
    });

    it('rejects missing coefficients root key', () => {
      expect(() => SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({})).toThrow(
        BadRequestException,
      );
    });

    it('rejects missing programme keys (e.g. missing HDTN_HN or GDDP)', () => {
      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            GDDP: { CLASS: 1.0, GRADE: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects missing mode keys', () => {
      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            GDDP: { CLASS: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            GDDP: { CLASS: 1.0, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects extra keys at any level (including GDDP.SCHOOL_WIDE)', () => {
      // Extra root key
      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          ...validPayload,
          extra: true,
        }),
      ).toThrow(BadRequestException);

      // Extra programme key
      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            ...validPayload.coefficients,
            OTHER: { CLASS: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);

      // GDDP cannot have SCHOOL_WIDE
      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            GDDP: {
              CLASS: 1.0,
              GRADE: 1.0,
              SCHOOL_WIDE: 1.0,
            },
            HDTN_HN: {
              CLASS: 1.0,
              GRADE: 1.0,
              SCHOOL_WIDE: 1.0,
            },
          },
        }),
      ).toThrow(BadRequestException);

      // HDTN_HN extra key
      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            GDDP: { CLASS: 1.0, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0, EXTRA: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects negative coefficients', () => {
      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            GDDP: { CLASS: -0.5, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects non-finite, NaN, Infinity, string, and boolean coefficients', () => {
      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            GDDP: { CLASS: NaN, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            GDDP: { CLASS: Infinity, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            GDDP: { CLASS: '1.0' as never, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate({
          coefficients: {
            GDDP: { CLASS: true as never, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        }),
      ).toThrow(BadRequestException);
    });

    it('does not apply defaults when keys are missing', () => {
      const partial = {
        coefficients: {
          GDDP: { CLASS: 1.0 },
          HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
        },
      };
      expect(() => SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1.validate(partial)).toThrow(
        BadRequestException,
      );
    });
  });
});
