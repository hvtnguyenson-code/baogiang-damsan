import { BadRequestException, InjectionToken } from '@nestjs/common';
import {
  BusinessConfigurationResource,
  CivilDateString,
} from '@baogiang/contracts';
import { isCivilDate } from '../common/validation/civil-date';

export interface BusinessPolicyPayloadValidator {
  version: string;
  validate(payload: unknown): Record<string, unknown>;
}

export interface BusinessPolicyFamilyDefinition {
  key: string;
  resourceKind: BusinessConfigurationResource['kind'];
  currentValidatorVersion: string;
  validators: readonly BusinessPolicyPayloadValidator[];
  publicationEnabled: boolean;
  downstreamAuthority: string;
}

export const OPERATIONAL_START_VALIDATOR_V1: BusinessPolicyPayloadValidator = {
  version: 'v1',
  validate(payload: unknown): { operationalStartDate: CivilDateString } {
    const row = strictObject(payload);
    const keys = Object.keys(row);
    if (keys.length !== 1 || keys[0] !== 'operationalStartDate') {
      throw new BadRequestException('INVALID_OPERATIONAL_START_POLICY_PAYLOAD');
    }
    const val = row.operationalStartDate;
    if (typeof val !== 'string' || !isCivilDate(val)) {
      throw new BadRequestException('INVALID_OPERATIONAL_START_POLICY_PAYLOAD');
    }
    return { operationalStartDate: val };
  },
};

export const SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1: BusinessPolicyPayloadValidator = {
  version: 'v1',
  validate(payload: unknown): Record<string, unknown> {
    const root = strictObject(payload);
    const rootKeys = Object.keys(root);
    if (rootKeys.length !== 1 || rootKeys[0] !== 'coefficients') {
      throw new BadRequestException('INVALID_SPECIAL_PROGRAMME_WORKLOAD_POLICY_PAYLOAD');
    }
    const coefficients = strictObject(root.coefficients);
    const coefKeys = Object.keys(coefficients).sort();
    if (coefKeys.length !== 2 || coefKeys[0] !== 'GDDP' || coefKeys[1] !== 'HDTN_HN') {
      throw new BadRequestException('INVALID_SPECIAL_PROGRAMME_WORKLOAD_POLICY_PAYLOAD');
    }

    const gddp = strictObject(coefficients.GDDP);
    const gddpKeys = Object.keys(gddp).sort();
    if (gddpKeys.length !== 2 || gddpKeys[0] !== 'CLASS' || gddpKeys[1] !== 'GRADE') {
      throw new BadRequestException('INVALID_SPECIAL_PROGRAMME_WORKLOAD_POLICY_PAYLOAD');
    }

    const hdtn = strictObject(coefficients.HDTN_HN);
    const hdtnKeys = Object.keys(hdtn).sort();
    if (hdtnKeys.length !== 3 || hdtnKeys[0] !== 'CLASS' || hdtnKeys[1] !== 'GRADE' || hdtnKeys[2] !== 'SCHOOL_WIDE') {
      throw new BadRequestException('INVALID_SPECIAL_PROGRAMME_WORKLOAD_POLICY_PAYLOAD');
    }

    const checkNumber = (val: unknown): number => {
      if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
        throw new BadRequestException('INVALID_SPECIAL_PROGRAMME_WORKLOAD_POLICY_PAYLOAD');
      }
      return val;
    };

    return {
      coefficients: {
        GDDP: {
          CLASS: checkNumber(gddp.CLASS),
          GRADE: checkNumber(gddp.GRADE),
        },
        HDTN_HN: {
          CLASS: checkNumber(hdtn.CLASS),
          GRADE: checkNumber(hdtn.GRADE),
          SCHOOL_WIDE: checkNumber(hdtn.SCHOOL_WIDE),
        },
      },
    };
  },
};

export const WORKLOAD_ADJUSTMENT_VALIDATOR_V1: BusinessPolicyPayloadValidator = {
  version: 'v1',
  validate(payload: unknown): Record<string, unknown> {
    const root = strictObject(payload);
    const rootKeys = Object.keys(root);
    if (rootKeys.length !== 2 || !rootKeys.includes('baseWeeklyNorm') || !rootKeys.includes('rules')) {
      throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
    }

    const checkDecimal4 = (val: unknown): number => {
      if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }
      const s = val.toString();
      if (s.includes('e') || s.includes('E')) {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }
      const parts = s.split('.');
      if (parts.length > 1 && parts[1].length > 4) {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }
      return val;
    };

    const baseWeeklyNorm = checkDecimal4(root.baseWeeklyNorm);
    if (!Array.isArray(root.rules) || root.rules.length > 50) {
      throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    const seenRuleIds = new Set<string>();
    const seenPriorities = new Set<number>();
    const validatedRules: Array<Record<string, unknown>> = [];

    for (const rawRule of root.rules) {
      const rule = strictObject(rawRule);
      const ruleKeys = Object.keys(rule);
      if (ruleKeys.length !== 5) {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }
      for (const k of ['ruleId', 'source', 'calculation', 'value', 'priority']) {
        if (!ruleKeys.includes(k)) {
          throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
        }
      }

      if (typeof rule.ruleId !== 'string' || !rule.ruleId.trim() || rule.ruleId.length > 100) {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }
      const trimmedRuleId = rule.ruleId.trim();
      if (seenRuleIds.has(trimmedRuleId)) {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }
      seenRuleIds.add(trimmedRuleId);

      if (typeof rule.priority !== 'number' || !Number.isInteger(rule.priority) || rule.priority < 0) {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }
      if (seenPriorities.has(rule.priority)) {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }
      seenPriorities.add(rule.priority);

      if (rule.calculation !== 'TRU_TIET' && rule.calculation !== 'TRU_PHAN_TRAM' && rule.calculation !== 'GHI_DE') {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }

      const value = checkDecimal4(rule.value);
      if (rule.calculation === 'TRU_PHAN_TRAM' && value > 100) {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }

      const source = strictObject(rule.source);
      const sourceKeys = Object.keys(source);

      if (source.kind === 'HOMEROOM_RESPONSIBILITY') {
        if (sourceKeys.length !== 1 || sourceKeys[0] !== 'kind') {
          throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
        }
        validatedRules.push({
          ruleId: trimmedRuleId,
          source: { kind: 'HOMEROOM_RESPONSIBILITY' },
          calculation: rule.calculation,
          value,
          priority: rule.priority,
        });
      } else if (source.kind === 'ADDITIONAL_DUTY') {
        if (sourceKeys.length !== 2 || !sourceKeys.includes('kind') || !sourceKeys.includes('dutyDefinitionId')) {
          throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
        }
        if (typeof source.dutyDefinitionId !== 'string' || !uuidRegex.test(source.dutyDefinitionId)) {
          throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
        }
        validatedRules.push({
          ruleId: trimmedRuleId,
          source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: source.dutyDefinitionId },
          calculation: rule.calculation,
          value,
          priority: rule.priority,
        });
      } else {
        throw new BadRequestException('INVALID_WORKLOAD_ADJUSTMENT_POLICY_PAYLOAD');
      }
    }

    return {
      baseWeeklyNorm,
      rules: validatedRules,
    };
  },
};

export const OPERATIONAL_START_FAMILY_DEFINITION: BusinessPolicyFamilyDefinition = {
  key: 'OPERATIONAL_START',
  resourceKind: 'ACADEMIC_YEAR',
  currentValidatorVersion: 'v1',
  validators: [OPERATIONAL_START_VALIDATOR_V1],
  publicationEnabled: true,
  downstreamAuthority: 'ADR-049',
};

export const SPECIAL_PROGRAMME_WORKLOAD_FAMILY_DEFINITION: BusinessPolicyFamilyDefinition = {
  key: 'SPECIAL_PROGRAMME_WORKLOAD',
  resourceKind: 'ACADEMIC_YEAR',
  currentValidatorVersion: 'v1',
  validators: [SPECIAL_PROGRAMME_WORKLOAD_VALIDATOR_V1],
  publicationEnabled: true,
  downstreamAuthority: 'ADR-050',
};

export const WORKLOAD_ADJUSTMENT_FAMILY_DEFINITION: BusinessPolicyFamilyDefinition = {
  key: 'WORKLOAD_ADJUSTMENT',
  resourceKind: 'ACADEMIC_YEAR',
  currentValidatorVersion: 'v1',
  validators: [WORKLOAD_ADJUSTMENT_VALIDATOR_V1],
  publicationEnabled: true,
  downstreamAuthority: 'ADR-057',
};

/** Production business policy families. */
export const PRODUCTION_BUSINESS_POLICY_FAMILIES: readonly BusinessPolicyFamilyDefinition[] = [
  OPERATIONAL_START_FAMILY_DEFINITION,
  SPECIAL_PROGRAMME_WORKLOAD_FAMILY_DEFINITION,
  WORKLOAD_ADJUSTMENT_FAMILY_DEFINITION,
];
export const BUSINESS_POLICY_REGISTRY: InjectionToken = 'BUSINESS_POLICY_REGISTRY';



export function strictObject(payload: unknown): Record<string, unknown> {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new BadRequestException('Business policy payload phải là object hợp lệ.');
  return payload as Record<string, unknown>;
}

export function familyFor(
  families: readonly BusinessPolicyFamilyDefinition[],
  key: string,
): BusinessPolicyFamilyDefinition | undefined {
  return families.find((family) => family.key === key);
}

export function validatorForVersion(
  family: BusinessPolicyFamilyDefinition,
  version: string,
): BusinessPolicyPayloadValidator | undefined {
  return family.validators.find((validator) => validator.version === version);
}

export function currentValidator(
  family: BusinessPolicyFamilyDefinition,
): BusinessPolicyPayloadValidator {
  const validator = validatorForVersion(family, family.currentValidatorVersion);
  if (!validator) {
    throw new Error(`Current validator ${family.currentValidatorVersion} not found for family ${family.key}`);
  }
  return validator;
}

export function validateResource(family: BusinessPolicyFamilyDefinition, resource: BusinessConfigurationResource): void {
  if (family.resourceKind !== resource.kind) throw new BadRequestException('INVALID_POLICY_RESOURCE');
  if (resource.kind === 'ACADEMIC_YEAR' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(resource.academicYearId)) throw new BadRequestException('INVALID_POLICY_RESOURCE');
}
