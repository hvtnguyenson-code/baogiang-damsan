import { BadRequestException, InjectionToken } from '@nestjs/common';
import { BusinessConfigurationResource } from '@baogiang/contracts';

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

/** Production has intentionally no enabled policy semantics until its owner task closes them. */
export const PRODUCTION_BUSINESS_POLICY_FAMILIES: readonly BusinessPolicyFamilyDefinition[] = [];
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
