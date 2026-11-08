/**
 * P5-057 / B2 (read-only): determine which capability coverage intervals
 * remain when a verified grant source is ended at a confirmation instant.
 *
 * This is a pure planner, NOT an authority checker, Prisma writer or
 * replacement for CapabilityAuthorizationService. Call only with
 * server-verified source revision/support evidence.
 */
export interface VerifiedSourceInterval {
  sourceId: string;
  validFrom: Date;
  validUntil: Date | null;
}

export interface SourceEndCoverageInput {
  effectiveAt: Date;
  sourceIdsToEnd: string[];
  sourceIntervals: VerifiedSourceInterval[];
  /** Must be verified by server-side B1 source/support inspection, never client input. */
  provenanceVerified: boolean;
  /** Active legacy projection/grants whose provenance could not be established. */
  unknownLegacyGrantCount: number;
}

export interface SourceCoverageSpan {
  validFrom: string;
  validUntil: string | null;
  supportingSourceIds: string[];
}

export type SourceEndCoveragePlan =
  | {
      state: 'BLOCKED';
      canConfirm: false;
      blocker: 'UNKNOWN_PROVENANCE' | 'INVALID_SOURCE_EVIDENCE' | 'STALE_SOURCE';
      before: [];
      after: [];
      losingCoverage: [];
      retainedByOtherSources: [];
    }
  | {
      state: 'REVIEW_ONLY';
      canConfirm: false;
      blocker: 'B1_WRITER_NOT_ACTIVE';
      before: SourceCoverageSpan[];
      after: SourceCoverageSpan[];
      losingCoverage: SourceCoverageSpan[];
      retainedByOtherSources: SourceCoverageSpan[];
    };

const MAX_SOURCE_INTERVALS = 1000;

function blocked(blocker: Extract<SourceEndCoveragePlan, { state: 'BLOCKED' }>['blocker']): SourceEndCoveragePlan {
  return { state: 'BLOCKED', canConfirm: false, blocker, before: [], after: [], losingCoverage: [], retainedByOtherSources: [] };
}

function appendSpan(
  result: SourceCoverageSpan[],
  start: number,
  end: number,
  supporters: string[],
): void {
  if (supporters.length === 0) return;
  const sorted = [...supporters].sort();
  const previous = result[result.length - 1];
  const from = new Date(start).toISOString();
  if (previous && previous.validUntil === from &&
      previous.supportingSourceIds.length === sorted.length &&
      previous.supportingSourceIds.every((source, index) => source === sorted[index])) {
    previous.validUntil = Number.isFinite(end) ? new Date(end).toISOString() : null;
    return;
  }
  result.push({
    validFrom: from,
    validUntil: Number.isFinite(end) ? new Date(end).toISOString() : null,
    supportingSourceIds: sorted,
  });
}

/**
 * Half-open [from, until) union coverage. Ended source is effective only
 * from effectiveAt onward; the original past remains intact.
 * No actual grant is created, closed, revoked or edited here.
 */
export function planSourceTerminationCoverage(input: SourceEndCoverageInput): SourceEndCoveragePlan {
  // Unknown provenance cannot be derived from template names, actor names or
  // coordinateId. Fail closed before returning any proposed revocation span.
  if (input.provenanceVerified !== true || !Number.isInteger(input.unknownLegacyGrantCount) ||
      input.unknownLegacyGrantCount > 0 || input.unknownLegacyGrantCount < 0) {
    return blocked('UNKNOWN_PROVENANCE');
  }
  const at = input.effectiveAt?.getTime();
  if (typeof at !== 'number' || !Number.isFinite(at) ||
      !Array.isArray(input.sourceIdsToEnd) || input.sourceIdsToEnd.length === 0 ||
      !Array.isArray(input.sourceIntervals) || input.sourceIntervals.length > MAX_SOURCE_INTERVALS) {
    return blocked('INVALID_SOURCE_EVIDENCE');
  }
  const toEnd = new Set(input.sourceIdsToEnd);
  if (toEnd.size !== input.sourceIdsToEnd.length ||
      input.sourceIdsToEnd.some((id) => typeof id !== 'string' || id.trim() !== id || id.length === 0)) {
    return blocked('INVALID_SOURCE_EVIDENCE');
  }

  const bySource = new Map<string, Array<{ from: number; until: number }>>();
  const boundaries = new Set<number>([at]);
  for (const interval of input.sourceIntervals) {
    const from = interval?.validFrom?.getTime();
    const until = interval?.validUntil === null ? Infinity : interval?.validUntil?.getTime();
    if (typeof interval?.sourceId !== 'string' || !interval.sourceId.trim() ||
        interval.sourceId.trim() !== interval.sourceId ||
        typeof from !== 'number' || !Number.isFinite(from) ||
        typeof until !== 'number' || Number.isNaN(until) || until <= from) {
      return blocked('INVALID_SOURCE_EVIDENCE');
    }
    const list = bySource.get(interval.sourceId) ?? [];
    list.push({ from, until });
    bySource.set(interval.sourceId, list);
    boundaries.add(from);
    if (Number.isFinite(until)) boundaries.add(until);
  }
  for (const intervals of bySource.values()) {
    intervals.sort((a, b) => a.from - b.from);
    for (let i = 1; i < intervals.length; i += 1) {
      if (intervals[i].from < intervals[i - 1].until) {
        // Overlapping revisions for one source require independent reconciliation.
        return blocked('INVALID_SOURCE_EVIDENCE');
      }
    }
  }
  for (const sourceId of toEnd) {
    const intervals = bySource.get(sourceId);
    if (!intervals || !intervals.some((row) => row.from <= at && at < row.until)) {
      return blocked('STALE_SOURCE');
    }
  }

  const before: SourceCoverageSpan[] = [];
  const after: SourceCoverageSpan[] = [];
  const losingCoverage: SourceCoverageSpan[] = [];
  const retainedByOtherSources: SourceCoverageSpan[] = [];
  const times = [...boundaries].sort((a, b) => a - b);

  for (let i = 0; i < times.length; i += 1) {
    const from = times[i];
    const until = times[i + 1] ?? Infinity;
    const supporters = [...bySource.entries()]
      .filter(([, spans]) => spans.some((span) => span.from <= from && from < span.until))
      .map(([sourceId]) => sourceId);
    const retained = supporters.filter((sourceId) => from < at || !toEnd.has(sourceId));
    appendSpan(before, from, until, supporters);
    appendSpan(after, from, until, retained);
    if (supporters.length > 0 && retained.length === 0) {
      appendSpan(losingCoverage, from, until, supporters);
    } else if (supporters.some((sourceId) => toEnd.has(sourceId)) && retained.length > 0 && from >= at) {
      appendSpan(retainedByOtherSources, from, until, retained);
    }
  }

  return {
    state: 'REVIEW_ONLY',
    canConfirm: false,
    blocker: 'B1_WRITER_NOT_ACTIVE',
    before,
    after,
    losingCoverage,
    retainedByOtherSources,
  };
}
