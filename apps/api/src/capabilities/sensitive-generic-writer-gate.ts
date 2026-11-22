/**
 * P5-057: staged ingress guard for all generic capability writers.
 *
 * DEFAULT OFF. Never enable B1_REJECT_GENERIC_SENSITIVE_WRITES on production
 * until a source-aware B1 command API, legacy inventory and 7-persona tests
 * have been accepted together. This guard alone is NOT a role writer.
 */
import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SENSITIVE_CAPABILITY_KEYS } from './sensitive-capability-policy';

const sensitiveKeys = new Set<string>(SENSITIVE_CAPABILITY_KEYS);

export function isGenericB1CutoverEnabled(): boolean {
  return process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES === 'true';
}

export function isGenericGrantSourceBlocked(capabilityKey: string): boolean {
  return isGenericB1CutoverEnabled() && sensitiveKeys.has(capabilityKey);
}

/**
 * Source-managed coordinates must not receive new legacy untracked grants,
 * even for non-sensitive full-role capabilities. The caller must lock the
 * target user row before this check to serialize with B1 role commands.
 * OFF mode performs no database query and preserves released behavior.
 */
export async function assertGenericCoordinatesUnmanaged(
  tx: Pick<Prisma.TransactionClient, 'accessCoordinate'>,
  userId: string,
  specifications: readonly {
    capabilityKey: string;
    scopeType: string;
    scopeResourceId?: string | null;
  }[],
): Promise<void> {
  if (!isGenericB1CutoverEnabled() || specifications.length === 0) return;
  const managed = await tx.accessCoordinate.findFirst({
    where: {
      userId,
      OR: specifications.map((spec) => ({
        capabilityKey: spec.capabilityKey,
        scopeType: spec.scopeType,
        scopeResourceId: spec.scopeResourceId ?? null,
      })),
    },
    select: { id: true },
  });
  if (managed) {
    throw new ForbiddenException(
      'Tọa độ quyền đã có nguồn B1; không thể cấp bằng tuyến generic cũ.',
    );
  }
}

export function assertGenericGrantSourceSafe(
  capabilityKey: string, coordinateId: string | null = null,
): void {
  // A source-linked B1 grant must never be revoked by the legacy endpoint,
  // including non-sensitive full-role keys. The gate remains inert until the
  // separately approved B1 cutover flag is enabled.
  if (process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES === 'true' &&
      coordinateId !== null) {
    throw new ForbiddenException(
      'Grant đã gắn nguồn B1 phải được quản lý qua lệnh chức trách có kiểm chứng nguồn.',
    );
  }
  if (!isGenericGrantSourceBlocked(capabilityKey)) return;
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
