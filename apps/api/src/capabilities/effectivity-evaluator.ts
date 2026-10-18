import { EffectivityStatus } from '@baogiang/contracts';

export interface ExistingGrantRecord {
  id: string;
  validFrom: Date;
  validUntil: Date | null;
  revokedAt?: Date | null;
}

export interface EffectivityEvaluationResult {
  status: EffectivityStatus;
  reason?: string;
  existingGrantId?: string;
  conflictingGrant?: {
    id: string;
    validFrom: string;
    validUntil?: string | null;
  };
}

/**
 * Evaluates the effectivity relationship of a proposed grant interval [proposedValidFrom, proposedValidUntil)
 * against existing non-revoked grants for the exact same coordinate (userId, capabilityKey, scopeType, resourceId).
 *
 * Distinguishes:
 * - ALREADY_COVERED: Existing active grant already covers the proposed interval.
 * - MISSING: No active/overlapping grant exists; safe to insert.
 * - FUTURE_CONFLICT: An active grant starts in the future, conflicting with the proposed interval.
 * - FINITE_COVERAGE: An active grant currently covers now but is finite, conflicting with open-ended grant.
 * - OVERLAP_CONFLICT: Any other overlapping interval conflict.
 */
export function evaluateCoordinateEffectivity(
  proposedValidFrom: Date,
  proposedValidUntil: Date | null,
  existingGrants: ExistingGrantRecord[],
): EffectivityEvaluationResult {
  // 1. Filter out revoked grants — revoked grants are excluded from the PostgreSQL
  // partial exclusion constraint ("WHERE revoked_at IS NULL") and do not block new grants.
  const activeGrants = existingGrants.filter((g) => g.revokedAt === null || g.revokedAt === undefined);

  if (activeGrants.length === 0) {
    return { status: 'MISSING' };
  }

  const reqStart = proposedValidFrom.getTime();
  const reqEnd = proposedValidUntil !== null ? proposedValidUntil.getTime() : Infinity;

  let alreadyCoveredGrant: ExistingGrantRecord | null = null;
  const conflictingGrants: Array<{
    grant: ExistingGrantRecord;
    status: 'FUTURE_CONFLICT' | 'FINITE_COVERAGE' | 'OVERLAP_CONFLICT';
    reason: string;
  }> = [];

  for (const g of activeGrants) {
    const gStart = g.validFrom.getTime();
    const gEnd = g.validUntil !== null ? g.validUntil.getTime() : Infinity;

    // Check interval overlap: [max(start), min(end)) has positive duration
    const overlapStart = Math.max(reqStart, gStart);
    const overlapEnd = Math.min(reqEnd, gEnd);

    if (overlapStart >= overlapEnd) {
      // No overlap: grant is entirely in the past or entirely after proposed interval
      continue;
    }

    // Overlap exists! Classify relationship:
    if (gStart <= reqStart && gEnd >= reqEnd) {
      // Existing grant completely subsumes proposed interval
      alreadyCoveredGrant = g;
      continue;
    }

    if (gStart > reqStart) {
      conflictingGrants.push({
        grant: g,
        status: 'FUTURE_CONFLICT',
        reason: `Tồn tại quyền trong tương lai (từ ${g.validFrom.toISOString()}), xung đột với hiệu lực mới.`,
      });
      continue;
    }

    if (reqEnd === Infinity && gEnd < Infinity) {
      conflictingGrants.push({
        grant: g,
        status: 'FINITE_COVERAGE',
        reason: `Tồn tại quyền có thời hạn kết thúc (đến ${g.validUntil!.toISOString()}), xung đột với quyền vô thời hạn mới.`,
      });
      continue;
    }

    conflictingGrants.push({
      grant: g,
      status: 'OVERLAP_CONFLICT',
      reason: `Khoảng hiệu lực [${g.validFrom.toISOString()} - ${g.validUntil ? g.validUntil.toISOString() : 'vô hạn'}) xung đột với hiệu lực mới.`,
    });
  }

  // If there are conflicts, conflict takes precedence over ALREADY_COVERED
  if (conflictingGrants.length > 0) {
    const primaryConflict = conflictingGrants[0];
    return {
      status: primaryConflict.status,
      reason: primaryConflict.reason,
      existingGrantId: primaryConflict.grant.id,
      conflictingGrant: {
        id: primaryConflict.grant.id,
        validFrom: primaryConflict.grant.validFrom.toISOString(),
        ...(primaryConflict.grant.validUntil ? { validUntil: primaryConflict.grant.validUntil.toISOString() } : {}),
      },
    };
  }

  if (alreadyCoveredGrant) {
    return {
      status: 'ALREADY_COVERED',
      existingGrantId: alreadyCoveredGrant.id,
    };
  }

  return { status: 'MISSING' };
}
