import { describe, expect, it } from 'vitest';
import {
  findUiAdapter,
  initialWorkloadAdjustmentPayload,
  matchUiAdapterForMutation,
  matchUiAdapterForRead,
  PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS,
  validateWorkloadAdjustmentPayload,
  WORKLOAD_ADJUSTMENT_UI_ADAPTER,
} from '../lib/business-policy-ui-registry';

describe('WorkloadAdjustment UI Adapter (apps/web)', () => {
  it('registers WORKLOAD_ADJUSTMENT in PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS', () => {
    const adapter = findUiAdapter(
      PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS,
      'WORKLOAD_ADJUSTMENT',
      'v1',
      'ACADEMIC_YEAR',
    );
    expect(adapter).toBeDefined();
    expect(adapter?.familyKey).toBe('WORKLOAD_ADJUSTMENT');
    expect(adapter?.validatorVersion).toBe('v1');
    expect(adapter?.resourceKind).toBe('ACADEMIC_YEAR');
    expect(adapter?.displayName).toBe('Điều chỉnh định mức');
    expect(adapter).toBe(WORKLOAD_ADJUSTMENT_UI_ADAPTER);
  });

  it('initialWorkloadAdjustmentPayload returns standard 17 baseWeeklyNorm and empty rules', () => {
    const initial = initialWorkloadAdjustmentPayload();
    expect(initial.baseWeeklyNorm).toBe(17);
    expect(initial.rules).toEqual([]);
  });

  it('validateWorkloadAdjustmentPayload accepts valid payload', () => {
    const valid = {
      baseWeeklyNorm: 17,
      rules: [
        {
          ruleId: 'r1',
          source: { kind: 'HOMEROOM_RESPONSIBILITY' },
          calculation: 'TRU_TIET',
          value: 4,
          priority: 10,
        },
        {
          ruleId: 'r2',
          source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: '00000000-0000-0000-0000-000000000001' },
          calculation: 'TRU_PHAN_TRAM',
          value: 30,
          priority: 20,
        },
      ],
    };
    const result = validateWorkloadAdjustmentPayload(valid);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.baseWeeklyNorm).toBe(17);
      expect(result.payload.rules).toHaveLength(2);
    }
  });

  it('validateWorkloadAdjustmentPayload rejects invalid payload', () => {
    expect(validateWorkloadAdjustmentPayload(null).valid).toBe(false);
    expect(validateWorkloadAdjustmentPayload({ baseWeeklyNorm: -5, rules: [] }).valid).toBe(false);
    expect(validateWorkloadAdjustmentPayload({ baseWeeklyNorm: 17.12345, rules: [] }).valid).toBe(false);
    expect(validateWorkloadAdjustmentPayload({ baseWeeklyNorm: 17, rules: 'invalid' }).valid).toBe(false);

    // Duplicate ruleId
    const dupRuleId = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'dup', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: 1, priority: 10 },
        { ruleId: 'dup', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: 2, priority: 20 },
      ],
    };
    expect(validateWorkloadAdjustmentPayload(dupRuleId).valid).toBe(false);

    // Duplicate priority
    const dupPriority = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: 1, priority: 10 },
        { ruleId: 'r2', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_TIET', value: 2, priority: 10 },
      ],
    };
    expect(validateWorkloadAdjustmentPayload(dupPriority).valid).toBe(false);

    // Percentage > 100
    const over100 = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'HOMEROOM_RESPONSIBILITY' }, calculation: 'TRU_PHAN_TRAM', value: 105, priority: 10 },
      ],
    };
    expect(validateWorkloadAdjustmentPayload(over100).valid).toBe(false);

    // Missing dutyDefinitionId
    const missingDuty = {
      baseWeeklyNorm: 17,
      rules: [
        { ruleId: 'r1', source: { kind: 'ADDITIONAL_DUTY' }, calculation: 'TRU_TIET', value: 2, priority: 10 },
      ],
    };
    expect(validateWorkloadAdjustmentPayload(missingDuty).valid).toBe(false);
  });

  it('matches UI adapter for read and mutation when publication is enabled', () => {
    const family = {
      key: 'WORKLOAD_ADJUSTMENT',
      resourceKind: 'ACADEMIC_YEAR' as const,
      currentValidatorVersion: 'v1',
      publicationEnabled: true,
    };

    const readMatch = matchUiAdapterForRead(PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS, family);
    expect(readMatch.isEligibleForRead).toBe(true);
    expect(readMatch.adapter?.familyKey).toBe('WORKLOAD_ADJUSTMENT');

    const mutationMatch = matchUiAdapterForMutation(PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS, family);
    expect(mutationMatch.isEligibleForMutation).toBe(true);
    expect(mutationMatch.adapter?.familyKey).toBe('WORKLOAD_ADJUSTMENT');
  });
});
