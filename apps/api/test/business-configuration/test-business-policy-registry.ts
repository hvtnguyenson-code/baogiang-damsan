import { BadRequestException } from '@nestjs/common';
import { BusinessPolicyFamilyDefinition } from '../../src/business-configuration/business-policy-registry';

export const TEST_BUSINESS_POLICY_FAMILY: BusinessPolicyFamilyDefinition = {
  key: 'TEST_BOOLEAN_THRESHOLD',
  resourceKind: 'SCHOOL_WIDE',
  validatorVersion: 'v1',
  publicationEnabled: true,
  downstreamAuthority: 'TEST_ONLY',
  validate(payload: unknown) {
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new BadRequestException('Invalid test payload');
    const row = payload as Record<string, unknown>;
    if (Object.keys(row).length !== 2 || typeof row.enabled !== 'boolean' || typeof row.threshold !== 'number' || !Number.isFinite(row.threshold)) {
      throw new BadRequestException('Invalid test payload');
    }
    return { enabled: row.enabled, threshold: row.threshold };
  },
};

export const TEST_ACADEMIC_YEAR_POLICY_FAMILY: BusinessPolicyFamilyDefinition = {
  key: 'TEST_ACADEMIC_YEAR_CONFIG',
  resourceKind: 'ACADEMIC_YEAR',
  validatorVersion: 'v1',
  publicationEnabled: true,
  downstreamAuthority: 'TEST_ONLY',
  validate(payload: unknown) {
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new BadRequestException('Invalid test payload');
    const row = payload as Record<string, unknown>;
    if (Object.keys(row).length !== 1 || typeof row.enabled !== 'boolean') {
      throw new BadRequestException('Invalid test payload');
    }
    return { enabled: row.enabled };
  },
};

export const TEST_BUSINESS_POLICY_REGISTRY = [
  TEST_BUSINESS_POLICY_FAMILY,
  TEST_ACADEMIC_YEAR_POLICY_FAMILY,
] as const;
