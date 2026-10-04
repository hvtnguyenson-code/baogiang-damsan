import {
  WorkloadAdjustmentRuleV1,
} from '@baogiang/contracts';
import {
  Rational,
  ZERO_RATIONAL,
  ONE_RATIONAL,
  rationalFromNumber,
  rationalSub,
  rationalMul,
  rationalDivInt,
  rationalMax,
  rationalRound4,
} from '../common/decimal/exact-decimal';

/**
 * Deterministic rounding to 4 fractional decimal places via exact rational arithmetic.
 */
export function round4Decimals(value: number): number {
  return rationalRound4(rationalFromNumber(value));
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
 * Apply a single adjustment rule using exact rational arithmetic according to ADR-057:
 * - TRU_TIET(v) => max(0, N - v)
 * - TRU_PHAN_TRAM(p) => max(0, N * (1 - p / 100))
 * - GHI_DE(v) => v (does not terminate chain)
 */
export function applyAdjustmentRuleRational(
  currentNorm: Rational,
  rule: Pick<WorkloadAdjustmentRuleV1, 'calculation' | 'value'>,
): Rational {
  switch (rule.calculation) {
    case 'TRU_TIET': {
      const v = rationalFromNumber(rule.value);
      return rationalMax(ZERO_RATIONAL, rationalSub(currentNorm, v));
    }
    case 'TRU_PHAN_TRAM': {
      const p = rationalFromNumber(rule.value);
      const factor = rationalSub(ONE_RATIONAL, rationalDivInt(p, 100));
      return rationalMax(ZERO_RATIONAL, rationalMul(currentNorm, factor));
    }
    case 'GHI_DE':
      return rationalFromNumber(rule.value);
    default:
      return currentNorm;
  }
}

/**
 * Compute the adjusted weekly norm as an exact Rational.
 * Rules are sorted by ascending priority and applied sequentially without intermediate rounding.
 */
export function calculateAdjustedWeeklyNormRational(
  baseWeeklyNorm: number,
  applicableRules: readonly WorkloadAdjustmentRuleV1[],
): Rational {
  const sorted = sortAdjustmentRules(applicableRules);
  let running = rationalFromNumber(baseWeeklyNorm);
  for (const rule of sorted) {
    running = applyAdjustmentRuleRational(running, rule);
  }
  return running;
}

/**
 * Compute the adjusted weekly norm from a base weekly norm and a list of applicable rules.
 * Rounded to 4 decimal places at the output boundary.
 */
export function calculateAdjustedWeeklyNorm(
  baseWeeklyNorm: number,
  applicableRules: readonly WorkloadAdjustmentRuleV1[],
): number {
  return rationalRound4(calculateAdjustedWeeklyNormRational(baseWeeklyNorm, applicableRules));
}
