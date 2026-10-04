import { WORKLOAD_ADJUSTMENT_VALIDATOR_V1 } from '../../src/business-configuration/business-policy-registry';

describe('WORKLOAD_ADJUSTMENT_VALIDATOR_V1 (Section 37)', () => {
  const validDutyId = '11111111-1111-4111-8111-111111111111';

  it('accepts valid payload with baseWeeklyNorm and rules', () => {
    const payload = {
      baseWeeklyNorm: 17,
      rules: [
        {
          ruleId: 'r_gvcn',
          source: { kind: 'HOMEROOM_RESPONSIBILITY' },
          calculation: 'TRU_TIET',
          value: 4,
          priority: 10,
        },
        {
          ruleId: 'r_duty',
          source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: validDutyId },
          calculation: 'TRU_PHAN_TRAM',
          value: 25,
          priority: 20,
        },
      ],
    };
    const validated = WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(payload);
    expect(validated.baseWeeklyNorm).toBe(17);
    expect(validated.rules).toHaveLength(2);
  });

  it('rejects non-object or array top-level payload', () => {
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(null)).toThrow('Business policy payload phải là object hợp lệ.');
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate([])).toThrow('Business policy payload phải là object hợp lệ.');
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate('string')).toThrow('Business policy payload phải là object hợp lệ.');
  });

  it('rejects unknown top-level fields', () => {
    const payload = {
      baseWeeklyNorm: 17,
      rules: [],
      extraField: 'not allowed',
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(payload)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
  });

  it('rejects invalid baseWeeklyNorm (negative, NaN, non-number, >4 decimals)', () => {
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate({ baseWeeklyNorm: -1, rules: [] })).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate({ baseWeeklyNorm: NaN, rules: [] })).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate({ baseWeeklyNorm: '17', rules: [] })).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate({ baseWeeklyNorm: 17.12345, rules: [] })).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
  });

  it('accepts baseWeeklyNorm with up to 4 decimals', () => {
    const validated = WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate({ baseWeeklyNorm: 17.1234, rules: [] });
    expect(validated.baseWeeklyNorm).toBe(17.1234);
  });

  it('rejects non-array rules or oversized rules array', () => {
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate({ baseWeeklyNorm: 17, rules: 'not array' })).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
    const tooMany = Array.from({ length: 101 }, (_, i) => ({
      ruleId: `r_${i}`,
      source: { kind: 'HOMEROOM_RESPONSIBILITY' },
      calculation: 'TRU_TIET',
      value: 1,
      priority: i,
    }));
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate({ baseWeeklyNorm: 17, rules: tooMany })).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
  });

  it('rejects duplicate ruleId', () => {
    const payload = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'dup', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: 1, priority: 10 },
        { ruleId: 'dup', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: 2, priority: 20 },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(payload)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
  });

  it('rejects duplicate priority', () => {
    const payload = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: 1, priority: 10 },
        { ruleId: 'r2', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: 2, priority: 10 },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(payload)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
  });

  it('rejects invalid calculation type', () => {
    const payload = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'UNKNOWN_CALC', value: 1, priority: 10 },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(payload)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
  });

  it('rejects negative value or >4 decimals in value', () => {
    const neg = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: -2, priority: 10 },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(neg)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');

    const decimals = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: 1.12345, priority: 10 },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(decimals)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
  });

  it('rejects TRU_PHAN_TRAM < 0 or > 100', () => {
    const over100 = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_PHAN_TRAM', value: 100.1, priority: 10 },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(over100)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
  });

  it('rejects invalid source kind or missing dutyDefinitionId', () => {
    const invalidKind = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'OTHER_KIND' }, calculation: 'TRU_TIET', value: 1, priority: 10 },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(invalidKind)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');

    const missingDutyId = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'ADDITIONAL_DUTY' }, calculation: 'TRU_TIET', value: 1, priority: 10 },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(missingDutyId)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');

    const invalidUuid = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: 'not-a-uuid' }, calculation: 'TRU_TIET', value: 1, priority: 10 },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(invalidUuid)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
  });

  it('rejects extra fields in rule or source object', () => {
    const extraRuleField = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: 1, priority: 10, extra: true },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(extraRuleField)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');

    const extraSourceField = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'HOMEROOM_RESPONSIBILITY', dutyDefinitionId: validDutyId }, calculation: 'TRU_TIET', value: 1, priority: 10 },
      ],
    };
    expect(() => WORKLOAD_ADJUSTMENT_VALIDATOR_V1.validate(extraSourceField)).toThrow('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
  });
});
