/**
 * P5-057: staged ingress guard for all generic capability writers.
 *
 * DEFAULT OFF. Never enable B1_REJECT_GENERIC_SENSITIVE_WRITES on production
 * until a source-aware B1 command API, legacy inventory and 7-persona tests
 * have been accepted together. This guard alone is NOT a role writer.
 */
import { ForbiddenException } from '@nestjs/common';
import { SENSITIVE_CAPABILITY_KEYS } from './sensitive-capability-policy';

const sensitiveKeys = new Set<string>(SENSITIVE_CAPABILITY_KEYS);

export function assertGenericGrantSourceSafe(capabilityKey: string): void {
  if (process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES !== 'true') return;
  if (!sensitiveKeys.has(capabilityKey)) return;
  throw new ForbiddenException(
    'Quyền nhạy cảm phải được cấp hoặc thu hồi bằng lệnh B1 có chứng minh nguồn.',
  );
}

export function assertGenericTemplateSourceSafe(
  specifications: readonly { capabilityKey: string }[],
): void {
  for (const specification of specifications) {
    assertGenericGrantSourceSafe(specification.capabilityKey);
  }
}
