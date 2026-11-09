import {
  B1EvidenceInput, inspectB1SourceEvidence,
} from '../../src/capabilities/b1-source-evidence-inspector';

const date = (value: string) => new Date(value);
const t0 = date('2026-11-08T08:00:00Z');
const t1 = date('2026-11-08T09:00:00Z');
const t2 = date('2026-11-08T10:00:00Z');
const base = (): B1EvidenceInput => ({
  userId: 'user', grantId: 'grant', coordinateId: 'coordinate', at: t1,
  grantValidFrom: t0, grantValidUntil: null, grantRevokedAt: null,
  historiesComplete: true,
  sourceRevisionHistory: [
    { id: 'rev1', sourceId: 'appointment', coordinateId: 'coordinate',
      userId: 'user', revision: 1n, validFrom: t0, validUntil: null, disposition: 'ACCEPTED' },
  ],
  projectionHistory: [{
    coordinateId: 'coordinate', version: 1n,
    slices: [{ grantId: 'grant', coordinateId: 'coordinate', validFrom: t0, validUntil: null,
      supports: [{ sourceRevisionId: 'rev1', coordinateId: 'coordinate', coveredFrom: t0, coveredUntil: null }] }],
  }],
});

describe('WS1-B B1 provenance evidence inspector: strictly read-only advisory', () => {
  it('finds current evidence candidate without ever authorizing appointment or revocation', () => {
    expect(inspectB1SourceEvidence(base())).toEqual({
      verdict: 'SUPPORT_CANDIDATE', reason: 'CANDIDATE_ONLY',
      canConfirm: false, provenanceVerified: false, supportingSourceCount: 1,
    });
  });

  it('preserves candidate coverage from independent source and counts two supports', () => {
    const v = base();
    v.sourceRevisionHistory.push({ ...v.sourceRevisionHistory[0], sourceId: 'independent', id: 'rev-other' });
    v.projectionHistory[0].slices[0].supports.push({
      sourceRevisionId: 'rev-other', coordinateId: 'coordinate', coveredFrom: t0, coveredUntil: null,
    });
    expect(inspectB1SourceEvidence(v).supportingSourceCount).toBe(2);
    expect(inspectB1SourceEvidence(v).canConfirm).toBe(false);
  });

  it('does not infer B1 source from a legacy NULL coordinate', () => {
    expect(inspectB1SourceEvidence({ ...base(), coordinateId: null })).toMatchObject({
      verdict: 'UNVERIFIED', reason: 'MISSING_OR_LEGACY_COORDINATE', supportingSourceCount: 0,
    });
  });

  it('fails closed if B1 history is incomplete', () => {
    expect(inspectB1SourceEvidence({ ...base(), historiesComplete: false })).toMatchObject({
      verdict: 'UNVERIFIED', reason: 'INCOMPLETE_HISTORY', canConfirm: false,
    });
  });

  it('never uses a support from a stale source revision even if the old revision is ACCEPTED', () => {
    const v = base();
    v.sourceRevisionHistory.push({
      id: 'rev2', sourceId: 'appointment', coordinateId: 'coordinate',
      userId: 'user', revision: 2n, validFrom: t0, validUntil: t1, disposition: 'ENDED',
    });
    expect(inspectB1SourceEvidence(v)).toMatchObject({
      verdict: 'UNVERIFIED', reason: 'NO_CURRENT_SOURCE_SUPPORT',
    });
  });

  it('ignores source support after half-open expiration boundary', () => {
    const v = base();
    v.projectionHistory[0].slices[0].supports[0].coveredUntil = t1;
    expect(inspectB1SourceEvidence(v).verdict).toBe('UNVERIFIED');
    v.projectionHistory[0].slices[0].supports[0].coveredUntil = t2;
    expect(inspectB1SourceEvidence(v).verdict).toBe('SUPPORT_CANDIDATE');
  });

  it('checks the latest projection, not a former valid projection', () => {
    const v = base();
    v.projectionHistory.push({ coordinateId: 'coordinate', version: 2n, slices: [] });
    expect(inspectB1SourceEvidence(v)).toMatchObject({
      verdict: 'UNVERIFIED', reason: 'NO_CURRENT_SOURCE_SUPPORT',
    });
  });

  it('rejects cross-user, cross-coordinate and duplicate source revision evidence', () => {
    const bad = [
      { ...base(), sourceRevisionHistory: [{ ...base().sourceRevisionHistory[0], userId: 'another' }] },
      { ...base(), sourceRevisionHistory: [{ ...base().sourceRevisionHistory[0], coordinateId: 'another' }] },
      { ...base(), sourceRevisionHistory: [
        ...base().sourceRevisionHistory, { ...base().sourceRevisionHistory[0], id: 'other' },
      ] },
    ];
    for (const v of bad) expect(inspectB1SourceEvidence(v)).toMatchObject({
      verdict: 'UNVERIFIED', reason: 'INVALID_EVIDENCE',
    });
  });

  it('does not treat wrong grant, missing projection, revoked or expired grant as supported', () => {
    const missing = { ...base(), projectionHistory: [] };
    expect(inspectB1SourceEvidence(missing).reason).toBe('NO_CURRENT_PROJECTION');
    const wrong = base();
    wrong.projectionHistory[0].slices[0].grantId = 'unrelated';
    expect(inspectB1SourceEvidence(wrong).reason).toBe('NO_CURRENT_SOURCE_SUPPORT');
    expect(inspectB1SourceEvidence({ ...base(), grantRevokedAt: t0 }).reason).toBe('INVALID_EVIDENCE');
    expect(inspectB1SourceEvidence({ ...base(), grantValidUntil: t1 }).reason).toBe('INVALID_EVIDENCE');
  });

  it('rejects duplicate source-revision IDs across distinct sources', () => {
    const v = base();
    v.sourceRevisionHistory.push({ ...v.sourceRevisionHistory[0], sourceId: 'independent' });
    expect(inspectB1SourceEvidence(v).reason).toBe('INVALID_EVIDENCE');
  });

  it('rejects a dangling support revision even alongside a valid support', () => {
    const v = base();
    v.projectionHistory[0].slices[0].supports.push({
      sourceRevisionId: 'absent', coordinateId: 'coordinate', coveredFrom: t0, coveredUntil: null,
    });
    expect(inspectB1SourceEvidence(v).reason).toBe('INVALID_EVIDENCE');
  });

  it('rejects duplicate grant slices in the same projection', () => {
    const v = base();
    v.projectionHistory[0].slices.push({ ...v.projectionHistory[0].slices[0], supports: [] });
    expect(inspectB1SourceEvidence(v).reason).toBe('INVALID_EVIDENCE');
  });

  it('rejects malformed support time intervals instead of ignoring them', () => {
    const v = base();
    v.projectionHistory[0].slices[0].supports.push({
      sourceRevisionId: 'rev1', coordinateId: 'coordinate', coveredFrom: t2, coveredUntil: t1,
    });
    expect(inspectB1SourceEvidence(v).reason).toBe('INVALID_EVIDENCE');
  });
  it('is deterministic and never mutates caller evidence', () => {
    const snapshot = base();
    const before = snapshot.projectionHistory[0].slices[0].supports.length;
    const first = inspectB1SourceEvidence(snapshot);
    const second = inspectB1SourceEvidence(snapshot);
    expect(first).toEqual(second);
    expect(snapshot.projectionHistory[0].slices[0].supports).toHaveLength(before);
  });
});
