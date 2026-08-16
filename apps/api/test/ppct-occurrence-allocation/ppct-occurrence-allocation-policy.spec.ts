import { NormalStructuralOccurrence } from '../../src/resolved-occurrences/resolved-occurrence.types';
import {
  applyVersionTransition,
  compareHistoryPositions,
  compareNormalOccurrences,
  consumingOverlapKeys,
  consumptionDecision,
  distributionObligationKey,
  historyPositionAtDateStart,
  historyPositionForNormal,
  pendingRevisions,
} from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation.policy';
import { PpctGraphLineage, PpctGraphVersion, PpctPlanGraph } from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation.types';

function normal(effectiveKind: NormalStructuralOccurrence['effectiveKind'], dispositionType?: string, startTime = '07:00:00', endTime = '07:45:00', key = 'NORMAL:entry:2026-08-17'): NormalStructuralOccurrence {
  return {
    occurrenceKey: key, family: 'NORMAL_TIMETABLE_OPPORTUNITY', civilDate: '2026-08-17', academicYearId: 'year', academicCalendarVersionId: 'calendar', timetableVersionId: 'timetable', timetableEntryId: 'entry',
    timeSlot: { id: 'slot', weekday: 'MONDAY', session: 'MORNING', startTime, endTime }, schoolClass: { id: 'class', gradeLevel: 10 }, subjectId: 'subject', teachingAssignmentId: 'assignment', responsibleTeacherUserId: 'teacher',
    ppctBinding: { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'v1', ppctVersionStatus: 'PUBLISHED' }, effectiveKind, interruptionIds: [], exceptionIds: [], suppressingSpecialActivityIds: [],
    disposition: dispositionType ? { id: 'disposition', dispositionType, responsibleTeacherUserId: 'teacher', assignedTeacherUserId: null, eligibilityCheckedAt: null, eligibilityWasActive: null, eligibilityWasTeachingStaff: null } : null,
  };
}

function version(id: string, versionNumber: number, items: string[], status: PpctGraphVersion['status'] = 'PUBLISHED'): PpctGraphVersion {
  return { id, ppctPlanId: 'plan', versionNumber, status, itemRevisions: items.map((ppctItemId, index) => ({ id: `${id}-${ppctItemId}`, ppctVersionId: id, ppctPlanId: 'plan', ppctItemId, sequence: index + 1, title: ppctItemId, lessonType: 'LESSON' })) };
}
const edge = (id: string, predecessorVersionId: string, predecessorItemId: string, successorVersionId: string, successorItemId: string): PpctGraphLineage => ({ id, ppctPlanId: 'plan', predecessorVersionId, predecessorItemId, successorVersionId, successorItemId });
const graph = (versions: PpctGraphVersion[], lineages: PpctGraphLineage[] = []): PpctPlanGraph => ({ planId: 'plan', versions, lineages });

describe('PPCT occurrence allocation pure policy', () => {
  it.each([
    ['BASE_TIMETABLE', undefined, 'CONSUMES_NEXT_ITEM'],
    ['OPERATIONAL_DISPOSITION', 'AUTHORIZED_CANCELLATION', 'DOES_NOT_CONSUME_ITEM'],
    ['OPERATIONAL_DISPOSITION', 'ABSENCE_NO_REPLACEMENT', 'CONSUMES_NEXT_ITEM'],
    ['OPERATIONAL_DISPOSITION', 'SAME_SUBJECT_SUBSTITUTION', 'CONSUMES_NEXT_ITEM'],
    ['OPERATIONAL_DISPOSITION', 'DIFFERENT_SUBJECT_SUPERVISION', 'CONSUMES_NEXT_ITEM'],
    ['CALENDAR_INTERRUPTION', undefined, 'DOES_NOT_CONSUME_ITEM'],
    ['CALENDAR_EXCEPTION', undefined, 'DOES_NOT_CONSUME_ITEM'],
    ['SPECIAL_ACTIVITY_SUPPRESSED', undefined, 'DOES_NOT_CONSUME_ITEM'],
  ] as const)('classifies %s/%s exhaustively', (kind, disposition, effect) => expect(consumptionDecision(normal(kind, disposition)).effect).toBe(effect));

  it('builds the exact stable distribution identity', () => expect(distributionObligationKey({ academicYearId: 'y', schoolClassId: 'c', subjectId: 's', normalOccurrenceKey: 'NORMAL:e:2026-08-17', ppctClassAssociationId: 'a', ppctVersionId: 'v', ppctItemId: 'i' })).toBe('PPCT_DISTRIBUTION:y:c:s:NORMAL:e:2026-08-17:a:v:i'));

  it('treats touching slots as disjoint and flags both overlapping consumers', () => {
    expect(consumingOverlapKeys([normal('BASE_TIMETABLE'), normal('BASE_TIMETABLE', undefined, '07:45:00', '08:30:00', 'touching')])).toEqual(new Set());
    expect(consumingOverlapKeys([normal('BASE_TIMETABLE'), normal('BASE_TIMETABLE', undefined, '07:30:00', '08:15:00', 'overlap')])).toEqual(new Set(['NORMAL:entry:2026-08-17', 'overlap']));
  });

  it('sorts by civil date, real start/end, then occurrence key', () => {
    const later = { ...normal('BASE_TIMETABLE', undefined, '08:00:00', '08:45:00', 'z'), civilDate: '2026-08-17' as const };
    const earlier = { ...normal('BASE_TIMETABLE', undefined, '07:00:00', '07:45:00', 'b'), civilDate: '2026-08-10' as const };
    const same = { ...earlier, occurrenceKey: 'a' };
    expect([later, earlier, same].sort(compareNormalOccurrences).map((item) => item.occurrenceKey)).toEqual(['a', 'b', 'z']);
  });

  it('orders a global date-start boundary before slots and preserves same-day slot/key order', () => {
    const early = normal('BASE_TIMETABLE', undefined, '07:00:00', '07:45:00', 'a');
    const late = normal('BASE_TIMETABLE', undefined, '08:00:00', '08:45:00', 'b');
    expect(compareHistoryPositions(historyPositionAtDateStart('2026-08-17'), historyPositionForNormal(early))).toBeLessThan(0);
    expect(compareHistoryPositions(historyPositionForNormal(early), historyPositionForNormal(late))).toBeLessThan(0);
  });

  it('keeps stable UUID carry-forward covered and preserves coverage over removal/reappearance', () => {
    const v3 = version('v3', 3, ['A', 'B']); const covered = new Set(['A']);
    expect(pendingRevisions(v3, covered).map((item) => item.ppctItemId)).toEqual(['B']);
    expect(pendingRevisions(version('v5', 5, ['A']), covered)).toEqual([]);
  });

  it('leaves uncovered split children pending and blocks split after distribution', () => {
    const v1 = version('v1', 1, ['A']); const v2 = version('v2', 2, ['B', 'C']); const g = graph([v1, v2], [edge('e1', 'v1', 'A', 'v2', 'B'), edge('e2', 'v1', 'A', 'v2', 'C')]);
    expect(applyVersionTransition(g, v2, new Set())).toBeNull();
    expect(applyVersionTransition(g, v2, new Set(['A']))).toMatchObject({ code: 'PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION' });
  });

  it('handles zero/all/partial merge coverage and composes merge-derived coverage', () => {
    const v1 = version('v1', 1, ['A', 'X']); const v2 = version('v2', 2, ['M']); const lineages = [edge('e1', 'v1', 'A', 'v2', 'M'), edge('e2', 'v1', 'X', 'v2', 'M')]; const g = graph([v1, v2], lineages);
    const none = new Set<string>(); expect(applyVersionTransition(g, v2, none)).toBeNull(); expect(none.has('M')).toBe(false);
    const all = new Set(['A', 'X']); expect(applyVersionTransition(g, v2, all)).toBeNull(); expect(all.has('M')).toBe(true); expect(pendingRevisions(v2, all)).toEqual([]);
    expect(applyVersionTransition(g, v2, new Set(['A']))).toMatchObject({ code: 'PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION' });
  });

  it('keeps explicit 1-to-1 new UUID pending even when predecessor is covered', () => {
    const v1 = version('v1', 1, ['A']); const v2 = version('v2', 2, ['B']); const covered = new Set(['A']);
    expect(applyVersionTransition(graph([v1, v2], [edge('e', 'v1', 'A', 'v2', 'B')]), v2, covered)).toBeNull();
    expect(pendingRevisions(v2, covered).map((item) => item.ppctItemId)).toEqual(['B']);
  });

  it('allows a non-adjacent authoritative predecessor and ignores an unrelated DRAFT frontier node', () => {
    const v1 = version('v1', 1, ['A']); const draft = version('v2', 2, ['D'], 'DRAFT'); const v3 = version('v3', 3, ['B']);
    expect(applyVersionTransition(graph([v1, draft, v3], [edge('e', 'v1', 'A', 'v3', 'B')]), v3, new Set(['A']))).toBeNull();
  });

  it('rejects DRAFT predecessors, many-to-many and mixed carry-forward/reshape', () => {
    const draft = version('draft', 1, ['A'], 'DRAFT'); const target = version('target', 2, ['B']);
    expect(applyVersionTransition(graph([draft, target], [edge('e', 'draft', 'A', 'target', 'B')]), target, new Set())).toMatchObject({ reason: 'MALFORMED_LINEAGE_PREDECESSOR' });
    const v1 = version('v1', 1, ['A', 'X']); const many = version('many', 2, ['B', 'C']);
    expect(applyVersionTransition(graph([v1, many], [edge('1', 'v1', 'A', 'many', 'B'), edge('2', 'v1', 'X', 'many', 'C'), edge('3', 'v1', 'A', 'many', 'C')]), many, new Set())).toMatchObject({ reason: 'MANY_TO_MANY_LINEAGE' });
    const mixed = version('mixed', 2, ['A', 'B']);
    expect(applyVersionTransition(graph([v1, mixed], [edge('m', 'v1', 'A', 'mixed', 'B')]), mixed, new Set())).toMatchObject({ reason: 'MIXED_CARRY_FORWARD_AND_LINEAGE' });
  });

  it('classifies independent components separately instead of inventing many-to-many', () => {
    const v1 = version('v1', 1, ['A', 'X']); const v2 = version('v2', 2, ['B', 'Y']);
    expect(applyVersionTransition(graph([v1, v2], [edge('1', 'v1', 'A', 'v2', 'B'), edge('2', 'v1', 'X', 'v2', 'Y')]), v2, new Set(['A', 'X']))).toBeNull();
  });

  it('blocks a later split of a merge-derived covered successor', () => {
    const v1 = version('v1', 1, ['A', 'X']); const v2 = version('v2', 2, ['M']); const v3 = version('v3', 3, ['B', 'C']);
    const g = graph([v1, v2, v3], [edge('1', 'v1', 'A', 'v2', 'M'), edge('2', 'v1', 'X', 'v2', 'M'), edge('3', 'v2', 'M', 'v3', 'B'), edge('4', 'v2', 'M', 'v3', 'C')]);
    const covered = new Set(['A', 'X']); expect(applyVersionTransition(g, v2, covered)).toBeNull();
    expect(applyVersionTransition(g, v3, covered)).toMatchObject({ code: 'PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION' });
  });
});
