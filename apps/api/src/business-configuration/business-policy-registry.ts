import { BadRequestException, InjectionToken } from '@nestjs/common';
import { BusinessConfigurationResource, CivilDateString } from '@baogiang/contracts';
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

export const OPERATIONAL_START_FAMILY_DEFINITION: BusinessPolicyFamilyDefinition = {
  key: 'OPERATIONAL_START',
  resourceKind: 'ACADEMIC_YEAR',
  currentValidatorVersion: 'v1',
  validators: [OPERATIONAL_START_VALIDATOR_V1],
  publicationEnabled: true,
  downstreamAuthority: 'ADR-049',
};

/** Production business policy families. */
export const PRODUCTION_BUSINESS_POLICY_FAMILIES: readonly BusinessPolicyFamilyDefinition[] = [
  OPERATIONAL_START_FAMILY_DEFINITION,
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
