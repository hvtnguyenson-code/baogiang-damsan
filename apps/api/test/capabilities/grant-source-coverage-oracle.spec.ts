/**
 * P5-057 WS1-B / B2 — independent deterministic reference oracle.
 *
 * TEST ONLY. Synthetic evidence is deliberately marked verified inside the
 * pure planner tests. There is NO trusted production source validator or
 * writer. This does not unlock B2 confirmation.
 */
import {
  planSourceTerminationCoverage,
  SourceCoverageSpan,
  VerifiedSourceInterval,
} from '../../src/capabilities/grant-source-coverage-planner';

const origin = Date.parse('2026-11-08T00:00:00.000Z');
const tick = (n: number): Date => new Date(origin + n * 60_000);
const ms = (n: number): number => tick(n).getTime();

type Window = { id: string; from: number; until: number | null };
type Snapshot = { sources: Window[]; toEnd: string[]; at: number };

function intervals(items: Window[]): VerifiedSourceInterval[] {
  return items.map((item) => ({
    sourceId: item.id,
    validFrom: tick(item.from),
    validUntil: item.until === null ? null : tick(item.until),
  }));
}
function sorted(values: string[]): string[] { return [...values].sort(); }
function currentSourceIds(items: Window[], t: number): string[] {
  return sorted([...new Set(items.filter((item) =>
    item.from <= t && (item.until === null || t < item.until),
  ).map((item) => item.id))]);
}
function afterSourceIds(sample: Snapshot, t: number): string[] {
  const before = currentSourceIds(sample.sources, t);
  return t < sample.at ? before : before.filter((id) => !sample.toEnd.includes(id));
}
function fromSpans(spans: SourceCoverageSpan[], point: number): string[] {
  const matching = spans.filter((span) =>
    Date.parse(span.validFrom) <= ms(point) &&
    (span.validUntil === null || ms(point) < Date.parse(span.validUntil)));
  expect(matching.length).toBeLessThanOrEqual(1);
  return matching.length ? matching[0].supportingSourceIds : [];
}
function assertSpanNormalForm(spans: SourceCoverageSpan[]): void {
  for (let i = 0; i < spans.length; i++) {
    const now = spans[i];
    expect(Date.parse(now.validFrom)).toEqual(expect.any(Number));
    expect(now.supportingSourceIds.length).toBeGreaterThan(0);
    expect(now.supportingSourceIds).toEqual(sorted(now.supportingSourceIds));
    expect(new Set(now.supportingSourceIds).size).toBe(now.supportingSourceIds.length);
    if (now.validUntil !== null) expect(Date.parse(now.validUntil)).toBeGreaterThan(Date.parse(now.validFrom));
    if (i > 0) {
      const previous = spans[i - 1];
      expect(previous.validUntil).not.toBeNull();
      expect(Date.parse(previous.validUntil!)).toBeLessThanOrEqual(Date.parse(now.validFrom));
      if (previous.validUntil === now.validFrom) {
        // Adjacent identical supporters must be normalized into one span.
        expect(previous.supportingSourceIds).not.toEqual(now.supportingSourceIds);
      }
    }
  }
}

function checkAgainstIndependentOracle(sample: Snapshot): void {
  const input = {
    effectiveAt: tick(sample.at),
    sourceIdsToEnd: sample.toEnd,
    sourceIntervals: intervals(sample.sources),
    provenanceVerified: true,
    unknownLegacyGrantCount: 0,
  };
  const frozenBefore = JSON.stringify({
    inputSources: sample.sources,
    targetSources: sample.toEnd,
    time: sample.at,
  });
  const plan = planSourceTerminationCoverage(input);
  expect(plan).toMatchObject({
    state: 'REVIEW_ONLY', canConfirm: false, blocker: 'B1_WRITER_NOT_ACTIVE',
  });
  if (plan.state !== 'REVIEW_ONLY') throw new Error('Synthetic verified fixture rejected unexpectedly');
  const lists = [
    plan.before,
    plan.after,
    plan.losingCoverage,
    plan.retainedByOtherSources,
  ];
  lists.forEach(assertSpanNormalForm);
  const boundary = new Set<number>([sample.at, 0, 25]);
  sample.sources.forEach((s) => {
    boundary.add(s.from);
    if (s.until !== null) boundary.add(s.until);
  });
  // Check every event boundary, immediately before it, and shortly after it.
  const samples = new Set<number>();
  for (const value of boundary) {
    for (const point of [value - 0.25, value, value + 0.25]) {
      if (point >= 0 && point <= 26) samples.add(point);
    }
  }
  for (const t of [...samples].sort((a, b) => a - b)) {
    const before = currentSourceIds(sample.sources, t);
    const after = afterSourceIds(sample, t);
    const expectedLoss = before.length && !after.length ? before : [];
    const expectedRetention = t >= sample.at &&
      before.some((id) => sample.toEnd.includes(id)) && after.length ? after : [];
    expect(fromSpans(plan.before, t)).toEqual(before);
    expect(fromSpans(plan.after, t)).toEqual(after);
    expect(fromSpans(plan.losingCoverage, t)).toEqual(expectedLoss);
    expect(fromSpans(plan.retainedByOtherSources, t)).toEqual(expectedRetention);
  }
  expect(JSON.stringify({
    inputSources: sample.sources, targetSources: sample.toEnd, time: sample.at,
  })).toBe(frozenBefore);
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

describe('P5-057 / B2 source-union independent oracle (no production writer)', () => {
  it('checks two overlapping sources and finite future handover boundaries', () => {
    checkAgainstIndependentOracle({
      sources: [
        { id: 'role', from: 0, until: null },
        { id: 'independent', from: 3, until: 12 },
        { id: 'future', from: 15, until: 20 },
      ],
      toEnd: ['role'], at: 8,
    });
  });

  it('checks independent baseline survival when two appointed roles end together', () => {
    checkAgainstIndependentOracle({
      sources: [
        { id: 'role-a', from: 0, until: null },
        { id: 'role-b', from: 0, until: 20 },
        { id: 'teacher-base', from: 1, until: null },
      ],
      toEnd: ['role-a', 'role-b'], at: 7,
    });
  });

  it('compares 500 reproducible valid multi-source interval models against oracle', () => {
    const next = random(0x5a172026);
    let checked = 0;
    for (let round = 0; round < 500; round++) {
      const sources: Window[] = [];
      const groups = 1 + Math.floor(next() * 6);
      for (let index = 0; index < groups; index++) {
        const id = 'source-' + index;
        let position = Math.floor(next() * 4);
        const segments = 1 + Math.floor(next() * 3);
        for (let j = 0; j < segments; j++) {
          const span = 1 + Math.floor(next() * 5);
          if (position + span > 22) break;
          const open = j === segments - 1 && next() < 0.25;
          sources.push({
            id, from: position,
            until: open ? null : position + span,
          });
          if (open) break;
          position += span + Math.floor(next() * 4);
        }
      }
      const at = 1 + Math.floor(next() * 19);
      const active = currentSourceIds(sources, at);
      if (!active.length) continue;
      const toEnd = active.filter(() => next() < 0.6);
      if (!toEnd.length) toEnd.push(active[0]);
      checkAgainstIndependentOracle({ sources, toEnd, at });
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('fails closed for legacy/unknown evidence even with a nominally valid union', () => {
    const sample = {
      effectiveAt: tick(5), sourceIdsToEnd: ['appointed'],
      sourceIntervals: intervals([
        { id: 'appointed', from: 0, until: null },
        { id: 'independent', from: 0, until: null },
      ]),
      provenanceVerified: false,
      unknownLegacyGrantCount: 0,
    };
    expect(planSourceTerminationCoverage(sample)).toMatchObject({
      state: 'BLOCKED', blocker: 'UNKNOWN_PROVENANCE',
      before: [], after: [], losingCoverage: [], retainedByOtherSources: [],
      canConfirm: false,
    });
    expect(planSourceTerminationCoverage({
      ...sample, provenanceVerified: true, unknownLegacyGrantCount: 1,
    })).toMatchObject({
      state: 'BLOCKED', blocker: 'UNKNOWN_PROVENANCE', canConfirm: false,
    });
  });

  it('rejects a source that is not active at server confirmation time', () => {
    const outcome = planSourceTerminationCoverage({
      effectiveAt: tick(5),
      sourceIdsToEnd: ['role'],
      sourceIntervals: intervals([
        { id: 'role', from: 5, until: 7 },
        { id: 'independent', from: 0, until: null },
      ]),
      provenanceVerified: true, unknownLegacyGrantCount: 0,
    });
    // A role becoming active precisely at t=5 is NOT stale.
    expect(outcome.state).toBe('REVIEW_ONLY');
    const expired = planSourceTerminationCoverage({
      effectiveAt: tick(5),
      sourceIdsToEnd: ['role'],
      sourceIntervals: intervals([{ id: 'role', from: 0, until: 5 }]),
      provenanceVerified: true, unknownLegacyGrantCount: 0,
    });
    expect(expired).toMatchObject({ state: 'BLOCKED', blocker: 'STALE_SOURCE' });
  });
});
