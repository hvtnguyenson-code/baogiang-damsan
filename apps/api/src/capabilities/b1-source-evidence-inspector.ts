/**
 * WS1-B: pure, read-only validation of a server-fetched B1 source/support snapshot.
 * This is an advisory evidence gate, NOT a capability evaluator, authorizer,
 * appointment command, or proof that the full source universe was fetched.
 */
export interface B1SourceRevisionEvidence {
  id: string;
  sourceId: string;
  coordinateId: string;
  userId: string;
  revision: bigint;
  validFrom: Date;
  validUntil: Date | null;
  disposition: string;
}

export interface B1ProjectionSupportEvidence {
  sourceRevisionId: string;
  coordinateId: string;
  coveredFrom: Date;
  coveredUntil: Date | null;
}

export interface B1ProjectionSliceEvidence {
  grantId: string;
  coordinateId: string;
  validFrom: Date;
  validUntil: Date | null;
  supports: B1ProjectionSupportEvidence[];
}

export interface B1ProjectionEvidence {
  coordinateId: string;
  version: bigint;
  slices: B1ProjectionSliceEvidence[];
}

export interface B1EvidenceInput {
  userId: string;
  grantId: string;
  coordinateId: string | null;
  at: Date;
  grantValidFrom: Date;
  grantValidUntil: Date | null;
  grantRevokedAt: Date | null;
  /** A complete server-selected history is required for every referenced source. */
  sourceRevisionHistory: B1SourceRevisionEvidence[];
  /** A complete server-selected projection history is required for this coordinate. */
  projectionHistory: B1ProjectionEvidence[];
  historiesComplete: boolean;
}

export type B1EvidenceResult = {
  verdict: 'SUPPORT_CANDIDATE' | 'UNVERIFIED';
  reason:
    | 'CANDIDATE_ONLY'
    | 'MISSING_OR_LEGACY_COORDINATE'
    | 'INCOMPLETE_HISTORY'
    | 'INVALID_EVIDENCE'
    | 'NO_CURRENT_PROJECTION'
    | 'NO_CURRENT_SOURCE_SUPPORT';
  canConfirm: false;
  provenanceVerified: false;
  supportingSourceCount: number;
};

const deny = (reason: Exclude<B1EvidenceResult['reason'], 'CANDIDATE_ONLY'>): B1EvidenceResult => ({
  verdict: 'UNVERIFIED', reason, canConfirm: false, provenanceVerified: false, supportingSourceCount: 0,
});

const atTime = (value: Date): number => value instanceof Date ? value.getTime() : NaN;
const covers = (from: Date, until: Date | null, at: number) => {
  const start = atTime(from);
  const end = until === null ? Infinity : atTime(until);
  return Number.isFinite(start) && !Number.isNaN(end) && start <= at && at < end;
};

export function inspectB1SourceEvidence(input: B1EvidenceInput): B1EvidenceResult {
  if (!input.coordinateId) return deny('MISSING_OR_LEGACY_COORDINATE');
  if (!input.historiesComplete) return deny('INCOMPLETE_HISTORY');
  const now = atTime(input.at);
  if (!Number.isFinite(now) || !input.userId || !input.grantId ||
      !covers(input.grantValidFrom, input.grantValidUntil, now) || input.grantRevokedAt !== null ||
      !Array.isArray(input.sourceRevisionHistory) || !Array.isArray(input.projectionHistory)) {
    return deny('INVALID_EVIDENCE');
  }

  const versions = new Set<string>();
  let latestProjection: B1ProjectionEvidence | undefined;
  for (const projection of input.projectionHistory) {
    if (projection.coordinateId !== input.coordinateId || typeof projection.version !== 'bigint' ||
        projection.version < 0n || !Array.isArray(projection.slices)) return deny('INVALID_EVIDENCE');
    const version = projection.version.toString();
    if (versions.has(version)) return deny('INVALID_EVIDENCE');
    versions.add(version);
    if (!latestProjection || projection.version > latestProjection.version) latestProjection = projection;
  }
  if (!latestProjection) return deny('NO_CURRENT_PROJECTION');

  const revisions = new Map<string, B1SourceRevisionEvidence>();
  const revisionsById = new Map<string, B1SourceRevisionEvidence>();
  const seenRevisions = new Set<string>();
  for (const row of input.sourceRevisionHistory) {
    if (!row.id || !row.sourceId || row.coordinateId !== input.coordinateId ||
        row.userId !== input.userId || typeof row.revision !== 'bigint' || row.revision < 1n ||
        !Number.isFinite(atTime(row.validFrom)) ||
        (row.validUntil !== null && (!Number.isFinite(atTime(row.validUntil)) ||
          atTime(row.validUntil) <= atTime(row.validFrom)))) return deny('INVALID_EVIDENCE');
    const key = row.sourceId + ':' + row.revision.toString();
    if (seenRevisions.has(key) || revisionsById.has(row.id)) return deny('INVALID_EVIDENCE');
    seenRevisions.add(key);
    revisionsById.set(row.id, row);
    const prior = revisions.get(row.sourceId);
    if (!prior || prior.revision < row.revision) revisions.set(row.sourceId, row);
  }

  const activeSources = new Set<string>();
  const sliceGrantIds = new Set<string>();
  for (const slice of latestProjection.slices) {
    if (slice.coordinateId !== input.coordinateId || !slice.grantId || !Array.isArray(slice.supports)) {
      return deny('INVALID_EVIDENCE');
    }
    if (sliceGrantIds.has(slice.grantId)) return deny('INVALID_EVIDENCE');
    sliceGrantIds.add(slice.grantId);
    if (slice.grantId !== input.grantId ||
        !covers(slice.validFrom, slice.validUntil, now)) continue;
    for (const support of slice.supports) {
      if (support.coordinateId !== input.coordinateId ||
          !Number.isFinite(atTime(support.coveredFrom)) ||
          (support.coveredUntil !== null && (!Number.isFinite(atTime(support.coveredUntil)) ||
            atTime(support.coveredUntil) <= atTime(support.coveredFrom)))) return deny('INVALID_EVIDENCE');
      const origin = revisionsById.get(support.sourceRevisionId);
      if (!origin) return deny('INVALID_EVIDENCE');
      if (!covers(support.coveredFrom, support.coveredUntil, now)) continue;
      const latest = revisions.get(origin.sourceId);
      if (latest?.id === support.sourceRevisionId && latest.disposition === 'ACCEPTED' &&
          covers(latest.validFrom, latest.validUntil, now)) {
        activeSources.add(latest.sourceId);
      }
    }
  }
  if (!activeSources.size) return deny('NO_CURRENT_SOURCE_SUPPORT');
  return {
    verdict: 'SUPPORT_CANDIDATE', reason: 'CANDIDATE_ONLY',
    canConfirm: false, provenanceVerified: false, supportingSourceCount: activeSources.size,
  };
}
