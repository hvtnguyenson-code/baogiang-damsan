import {
  WorkloadAdjustmentRuleV1,
} from '@baogiang/contracts';

/**
 * Deterministic rounding to 4 fractional decimal places.
 * Uses EPSILON to prevent binary floating-point representation drift.
 */
export function round4Decimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/**
 * Sort rules by ascending priority. Priority is authoritative.
 * Ties (which schema/validator prevents) deterministically fall back to ruleId ASC.
 */
export function sortAdjustmentRules(
  rules: readonly WorkloadAdjustmentRuleV1[],
): WorkloadAdjustmentRuleV1[] {
  return rules.slice().sort((a, b) => a.priority - b.priority || a.ruleId.localeCompare(b.ruleId));
}

/**
 * Apply a single adjustment rule according to ADR-057 standard formulas:
 * - TRU_TIET(v) => max(0, N - v)
 * - TRU_PHAN_TRAM(p) => max(0, N * (1 - p / 100))
 * - GHI_DE(v) => v (does not terminate chain)
 */
export function applyAdjustmentRule(
  currentNorm: number,
  rule: Pick<WorkloadAdjustmentRuleV1, 'calculation' | 'value'>,
): number {
  switch (rule.calculation) {
    case 'TRU_TIET':
      return Math.max(0, currentNorm - rule.value);
    case 'TRU_PHAN_TRAM':
      return Math.max(0, currentNorm * (1 - rule.value / 100));
    case 'GHI_DE':
      return rule.value;
    default:
      return currentNorm;
  }
}

/**
 * Compute the adjusted weekly norm from a base weekly norm and a list of applicable rules.
 * Rules are sorted by ascending priority and applied sequentially.
 */
export function calculateAdjustedWeeklyNorm(
  baseWeeklyNorm: number,
  applicableRules: readonly WorkloadAdjustmentRuleV1[],
): number {
  const sorted = sortAdjustmentRules(applicableRules);
  let running = baseWeeklyNorm;
  for (const rule of sorted) {
    running = applyAdjustmentRule(running, rule);
  }
  return round4Decimals(running);
}
