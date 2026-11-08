import { planSourceTerminationCoverage, VerifiedSourceInterval } from '../../src/capabilities/grant-source-coverage-planner';

const d = (value: string): Date => new Date(value);
const t0 = d('2026-11-08T09:00:00.000Z');
const t1 = d('2026-11-08T10:00:00.000Z');
const t2 = d('2026-11-08T11:00:00.000Z');
const t3 = d('2026-11-08T12:00:00.000Z');
const source = (sourceId: string, validFrom: Date, validUntil: Date | null): VerifiedSourceInterval => ({
  sourceId, validFrom, validUntil,
});
const plan = (sources: VerifiedSourceInterval[], remove: string[], at = t1) =>
  planSourceTerminationCoverage({
    effectiveAt: at, sourceIdsToEnd: remove, sourceIntervals: sources,
    provenanceVerified: true, unknownLegacyGrantCount: 0,
  });

describe('B1/B2 source-union coverage planner (pure read-only)', () => {
  it('single source: ends coverage at the confirmation instant, never retroactively', () => {
    const result = plan([source('role', t0, null)], ['role']);
    expect(result.state).toBe('REVIEW_ONLY');
    expect(result.canConfirm).toBe(false);
    if (result.state !== 'REVIEW_ONLY') throw new Error('Blocked unexpectedly');
    expect(result.before).toEqual([{
      validFrom: t0.toISOString(), validUntil: null, supportingSourceIds: ['role'],
    }]);
    expect(result.after).toEqual([{
      validFrom: t0.toISOString(), validUntil: t1.toISOString(), supportingSourceIds: ['role'],
    }]);
    expect(result.losingCoverage).toEqual([{
      validFrom: t1.toISOString(), validUntil: null, supportingSourceIds: ['role'],
    }]);
  });

  it('two overlapping independent sources: ending the role retains continuous coverage', () => {
    const result = plan([source('role', t0, null), source('independent', t0, null)], ['role']);
    expect(result.state).toBe('REVIEW_ONLY');
    if (result.state !== 'REVIEW_ONLY') throw new Error('Blocked unexpectedly');
    expect(result.losingCoverage).toHaveLength(0);
    expect(result.retainedByOtherSources).toEqual([{
      validFrom: t1.toISOString(), validUntil: null, supportingSourceIds: ['independent'],
    }]);
  });

  it('finite independent source protects now but a future loss is visible', () => {
    const result = plan([
      source('role', t0, null),
      source('independent', t0, t2),
    ], ['role']);
    expect(result.state).toBe('REVIEW_ONLY');
    if (result.state !== 'REVIEW_ONLY') throw new Error('Blocked unexpectedly');
    expect(result.retainedByOtherSources).toEqual([{
      validFrom: t1.toISOString(), validUntil: t2.toISOString(), supportingSourceIds: ['independent'],
    }]);
    expect(result.losingCoverage).toEqual([{
      validFrom: t2.toISOString(), validUntil: null, supportingSourceIds: ['role'],
    }]);
  });

  it('half-open boundaries do not falsely cover the exact expiration time', () => {
    const result = plan([
      source('role', t0, null),
      source('independent', t0, t1),
      source('future', t2, t3),
    ], ['role']);
    expect(result.state).toBe('REVIEW_ONLY');
    if (result.state !== 'REVIEW_ONLY') throw new Error('Blocked unexpectedly');
    expect(result.losingCoverage).toEqual([
      { validFrom: t1.toISOString(), validUntil: t2.toISOString(), supportingSourceIds: ['role'] },
      { validFrom: t3.toISOString(), validUntil: null, supportingSourceIds: ['role'] },
    ]);
  });

  it('multiple sources selected: preserves a third independent grant source', () => {
    const result = plan([
      source('role-a', t0, null),
      source('role-b', t0, null),
      source('independent', t0, null),
    ], ['role-a', 'role-b']);
    expect(result.state).toBe('REVIEW_ONLY');
    if (result.state !== 'REVIEW_ONLY') throw new Error('Blocked unexpectedly');
    expect(result.losingCoverage).toHaveLength(0);
    expect(result.retainedByOtherSources[0].supportingSourceIds).toEqual(['independent']);
  });

  it('legacy unknown and unverified B1 evidence return no actionable intervals', () => {
    const input = {
      effectiveAt: t1, sourceIdsToEnd: ['role'],
      sourceIntervals: [source('role', t0, null)],
      provenanceVerified: false, unknownLegacyGrantCount: 0,
    };
    expect(planSourceTerminationCoverage(input)).toMatchObject({
      state: 'BLOCKED', blocker: 'UNKNOWN_PROVENANCE', losingCoverage: [], canConfirm: false,
    });
    expect(planSourceTerminationCoverage({
      ...input, provenanceVerified: true, unknownLegacyGrantCount: 1,
    })).toMatchObject({
      state: 'BLOCKED', blocker: 'UNKNOWN_PROVENANCE', before: [], after: [],
    });
  });

  it('rejects ending nonexistent, expired or future-only source', () => {
    for (const rows of [
      [source('other', t0, null)],
      [source('role', t0, t1)],
      [source('role', t2, null)],
    ]) {
      expect(plan(rows, ['role'])).toMatchObject({ state: 'BLOCKED', blocker: 'STALE_SOURCE' });
    }
  });

  it('rejects corrupt, duplicated and overlapping source revisions', () => {
    const cases: Array<{ rows: VerifiedSourceInterval[]; ids: string[] }> = [
      { rows: [source('role', t0, t1), source('role', t0, t3)], ids: ['role'] },
      { rows: [source('role', t1, t0)], ids: ['role'] },
      { rows: [source('role', new Date(NaN), null)], ids: ['role'] },
      { rows: [source('role', t0, new Date(NaN))], ids: ['role'] },
      { rows: [source('role', t0, null)], ids: ['role', 'role'] },
      { rows: [source('role', t0, null)], ids: [] },
    ];
    for (const testCase of cases) {
      expect(plan(testCase.rows, testCase.ids)).toMatchObject({
        state: 'BLOCKED', blocker: 'INVALID_SOURCE_EVIDENCE', canConfirm: false,
      });
    }
  });

  it('supports nonoverlapping revisions for one source and merges adjacent identical windows', () => {
    const result = plan([
      source('role', t0, t1),
      source('role', t1, null),
      source('independent', t0, null),
    ], ['role']);
    expect(result.state).toBe('REVIEW_ONLY');
    if (result.state !== 'REVIEW_ONLY') throw new Error('Blocked unexpectedly');
    expect(result.retainedByOtherSources).toEqual([{
      validFrom: t1.toISOString(), validUntil: null, supportingSourceIds: ['independent'],
    }]);
    expect(result.losingCoverage).toHaveLength(0);
  });
});
