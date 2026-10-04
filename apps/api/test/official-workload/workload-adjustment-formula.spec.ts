import {
  calculateAdjustedWeeklyNorm,
  round4Decimals,
  sortAdjustmentRules,
} from '../../src/official-workload/workload-adjustment-formula';
import { WorkloadAdjustmentRuleV1 } from '@baogiang/contracts';

describe('WorkloadAdjustmentFormula Engine (ADR-057)', () => {
  it('TRU_TIET: 17 - 4 = 13', () => {
    const rules: WorkloadAdjustmentRuleV1[] = [
      {
        ruleId: 'r1',
        source: { kind: 'HOMEROOM_RESPONSIBILITY' },
        calculation: 'TRU_TIET',
        value: 4,
        priority: 10,
      },
    ];
    const result = calculateAdjustedWeeklyNorm(17, rules);
    expect(result).toBe(13);
  });

  it('TRU_PHAN_TRAM: 20 - 20% = 16', () => {
    const rules: WorkloadAdjustmentRuleV1[] = [
      {
        ruleId: 'r1',
        source: { kind: 'HOMEROOM_RESPONSIBILITY' },
        calculation: 'TRU_PHAN_TRAM',
        value: 20,
        priority: 10,
      },
    ];
    const result = calculateAdjustedWeeklyNorm(20, rules);
    expect(result).toBe(16);
  });

  it('GHI_DE: 17 -> 12', () => {
    const rules: WorkloadAdjustmentRuleV1[] = [
      {
        ruleId: 'r1',
        source: { kind: 'HOMEROOM_RESPONSIBILITY' },
        calculation: 'GHI_DE',
        value: 12,
        priority: 10,
      },
    ];
    const result = calculateAdjustedWeeklyNorm(17, rules);
    expect(result).toBe(12);
  });

  it('Priority order: base = 20, priority 100: GHI_DE 15, priority 200: TRU_TIET 3 => result = 12', () => {
    const rules: WorkloadAdjustmentRuleV1[] = [
      {
        ruleId: 'r2',
        source: { kind: 'HOMEROOM_RESPONSIBILITY' },
        calculation: 'TRU_TIET',
        value: 3,
        priority: 200,
      },
      {
        ruleId: 'r1',
        source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: '00000000-0000-0000-0000-000000000001' },
        calculation: 'GHI_DE',
        value: 15,
        priority: 100,
      },
    ];
    // Sắp xếp theo priority ASC: GHI_DE (15) chạy trước, sau đó TRU_TIET 3 => 15 - 3 = 12
    const sorted = sortAdjustmentRules(rules);
    const result = calculateAdjustedWeeklyNorm(20, sorted);
    expect(result).toBe(12);
  });

  it('GHI_DE does NOT terminate the chain; subsequent rules continue to apply', () => {
    const rules: WorkloadAdjustmentRuleV1[] = [
      {
        ruleId: 'r1',
        source: { kind: 'HOMEROOM_RESPONSIBILITY' },
        calculation: 'TRU_TIET',
        value: 5,
        priority: 10, // 20 - 5 = 15
      },
      {
        ruleId: 'r2',
        source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: '00000000-0000-0000-0000-000000000001' },
        calculation: 'GHI_DE',
        value: 10, // ghi đè thành 10
        priority: 20,
      },
      {
        ruleId: 'r3',
        source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: '00000000-0000-0000-0000-000000000002' },
        calculation: 'TRU_PHAN_TRAM',
        value: 50, // 10 * (1 - 0.5) = 5
        priority: 30,
      },
    ];
    const sorted = sortAdjustmentRules(rules);
    const result = calculateAdjustedWeeklyNorm(20, sorted);
    expect(result).toBe(5);
  });

  it('Zero floor: calculated weekly norm never falls below 0', () => {
    const rules: WorkloadAdjustmentRuleV1[] = [
      {
        ruleId: 'r1',
        source: { kind: 'HOMEROOM_RESPONSIBILITY' },
        calculation: 'TRU_TIET',
        value: 25,
        priority: 10,
      },
    ];
    const result = calculateAdjustedWeeklyNorm(17, rules);
    expect(result).toBe(0);
  });

  it('Decimal determinism: output boundary rounded to 4 decimals exactly', () => {
    // 17 * (1 - 33.3333 / 100) = 17 * 0.666667 = 11.333339 -> 11.3333
    const rules: WorkloadAdjustmentRuleV1[] = [
      {
        ruleId: 'r1',
        source: { kind: 'HOMEROOM_RESPONSIBILITY' },
        calculation: 'TRU_PHAN_TRAM',
        value: 33.3333,
        priority: 10,
      },
    ];
    const result = calculateAdjustedWeeklyNorm(17, rules);
    expect(result).toBe(11.3333);
  });

  it('round4Decimals handles floating point drift accurately', () => {
    expect(round4Decimals(0.1 + 0.2)).toBe(0.3);
    expect(round4Decimals(1.00005)).toBe(1.0001);
    expect(round4Decimals(1.00004)).toBe(1.0);
  });
});
