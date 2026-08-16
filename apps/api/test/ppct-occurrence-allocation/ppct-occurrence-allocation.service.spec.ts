import { PpctOccurrenceAllocationService } from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import { NormalStructuralOccurrence } from '../../src/resolved-occurrences/resolved-occurrence.types';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
function normal(civilDate: `${number}-${number}-${number}`, effectiveKind: NormalStructuralOccurrence['effectiveKind'] = 'BASE_TIMETABLE'): NormalStructuralOccurrence {
  return { occurrenceKey: `NORMAL:entry:${civilDate}`, family: 'NORMAL_TIMETABLE_OPPORTUNITY', civilDate, academicYearId: 'year', academicCalendarVersionId: 'calendar', timetableVersionId: 'timetable', timetableEntryId: 'entry', timeSlot: { id: 'slot', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' }, schoolClass: { id: 'class', gradeLevel: 10 }, subjectId: 'subject', teachingAssignmentId: 'assignment', responsibleTeacherUserId: 'teacher', ppctBinding: { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'version', ppctVersionStatus: 'PUBLISHED' }, effectiveKind, interruptionIds: [], exceptionIds: [], suppressingSpecialActivityIds: [], disposition: null };
}

function disposition(civilDate: `${number}-${number}-${number}`, dispositionType: string): NormalStructuralOccurrence {
  return { ...normal(civilDate, 'OPERATIONAL_DISPOSITION'), disposition: { id: `disposition-${civilDate}`, dispositionType, responsibleTeacherUserId: 'teacher', assignedTeacherUserId: null, eligibilityCheckedAt: null, eligibilityWasActive: null, eligibilityWasTeachingStaff: null } };
}

function bound(occurrence: NormalStructuralOccurrence, planId: string, ppctVersionId: string): NormalStructuralOccurrence {
  return { ...occurrence, ppctBinding: { ppctClassAssociationId: `association-${planId}`, ppctPlanId: planId, ppctVersionId, ppctVersionStatus: 'PUBLISHED' } };
}

function makeup(options: { id: string; sourceDate: string; sourceEntryId?: string; sourceStart?: string; sourceEnd?: string; ppctItemId?: string }) {
  const sourceEntryId = options.sourceEntryId ?? 'missing-entry';
  return {
    id: options.id, academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', originalTimetableEntryId: sourceEntryId, originalCivilDate: date(options.sourceDate),
    ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'version', ppctItemId: options.ppctItemId ?? 'item-1',
    targetCivilDate: date('2026-08-17'), targetTimeSlotDefinition: { startTime: new Date('1970-01-01T10:00:00Z') },
    originalTimetableEntry: { timeSlotDefinition: { startTime: new Date(`1970-01-01T${options.sourceStart ?? '07:00:00'}Z`), endTime: new Date(`1970-01-01T${options.sourceEnd ?? '07:45:00'}Z`) } },
  };
}

function harness(structuralResults?: Record<string, object>) {
  const tx = {
    timetableEntry: { findMany: jest.fn().mockResolvedValue([{ weekday: 'MONDAY', timetableVersion: { effectiveFrom: date('2026-08-03'), effectiveUntil: date('2026-08-17') } }]) },
    ppctVersion: { findMany: jest.fn().mockResolvedValue([{ id: 'version', ppctPlanId: 'plan', versionNumber: 1, status: 'PUBLISHED', itemRevisions: [1, 2, 3].map((sequence) => ({ id: `revision-${sequence}`, ppctVersionId: 'version', ppctPlanId: 'plan', ppctItemId: `item-${sequence}`, sequence, title: `Item ${sequence}`, lessonType: 'LESSON' })) }]) },
    ppctItemLineage: { findMany: jest.fn().mockResolvedValue([]) },
    makeupTeachingSchedule: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
  const structural = { resolveInTransaction: jest.fn(async (_tx: unknown, input: { civilDate: string }) => structuralResults?.[input.civilDate] ?? { normalOccurrences: [normal(input.civilDate as `${number}-${number}-${number}`)], findings: [] }), resolve: jest.fn() };
  return { tx, prisma, structural, service: new PpctOccurrenceAllocationService(prisma as never, structural as never) };
}

describe('PpctOccurrenceAllocationService', () => {
  it('uses one RepeatableRead snapshot, the same tx for every inclusive candidate, and no nested structural resolve', async () => {
    const h = harness(); const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-17' });
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1); expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(h.structural.resolveInTransaction).toHaveBeenCalledTimes(3); expect(h.structural.resolveInTransaction.mock.calls.every((call) => call[0] === h.tx)).toBe(true); expect(h.structural.resolve).not.toHaveBeenCalled();
    expect(result.replayOrigin).toBe('2026-08-03'); expect(result.normalAllocations.map((row) => row.occurrence.civilDate)).toEqual(['2026-08-03', '2026-08-10', '2026-08-17']);
  });

  it('uses a supplied transaction without opening a RepeatableRead transaction', async () => {
    const h = harness();
    await h.service.resolveInTransaction(h.tx as never, { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-03' });
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.structural.resolveInTransaction).toHaveBeenCalledWith(h.tx, expect.any(Object));
  });

  it('does not consume suppression and allocates the same first item to the next normal', async () => {
    const h = harness({ '2026-08-03': { normalOccurrences: [normal('2026-08-03', 'SPECIAL_ACTIVITY_SUPPRESSED')], findings: [] } });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-17' });
    expect(result.normalAllocations[0]).toMatchObject({ allocationStatus: 'NOT_CONSUMED', expectedPpctItem: null });
    expect(result.normalAllocations[1]?.expectedPpctItem).toMatchObject({ ppctItemId: 'item-1' });
  });

  it('does not consume an authorized cancellation and leaves the first item for the next normal', async () => {
    const h = harness({ '2026-08-03': { normalOccurrences: [disposition('2026-08-03', 'AUTHORIZED_CANCELLATION')], findings: [] } });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-10' });
    expect(result.normalAllocations.map((row) => row.allocationStatus)).toEqual(['NOT_CONSUMED', 'ALLOCATED']); expect(result.normalAllocations[1]?.expectedPpctItem?.ppctItemId).toBe('item-1');
  });

  it.each(['ABSENCE_NO_REPLACEMENT', 'SAME_SUBJECT_SUBSTITUTION', 'DIFFERENT_SUBJECT_SUPERVISION'])('allocates one item for consuming disposition %s', async (dispositionType) => {
    const h = harness({ '2026-08-03': { normalOccurrences: [disposition('2026-08-03', dispositionType)], findings: [] } });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-03' });
    expect(result.normalAllocations[0]).toMatchObject({ allocationEffect: 'CONSUMES_NEXT_ITEM', allocationStatus: 'ALLOCATED', expectedPpctItem: { ppctItemId: 'item-1' } });
  });

  it('ignores an unrelated occurrence finding and blocks later guesses after a relevant one', async () => {
    const h = harness({
      '2026-08-03': { normalOccurrences: [normal('2026-08-03')], findings: [{ severity: 'BLOCKER', code: 'NORMAL_PROVENANCE_INVALID', occurrenceKey: 'NORMAL:other:2026-08-03', entityIds: ['other'] }] },
      '2026-08-10': { normalOccurrences: [normal('2026-08-10')], findings: [{ severity: 'BLOCKER', code: 'NORMAL_PROVENANCE_INVALID', occurrenceKey: 'NORMAL:entry:2026-08-10', entityIds: ['entry'] }] },
    });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-17' });
    expect(result.normalAllocations.map((row) => row.allocationStatus)).toEqual(['ALLOCATED', 'BLOCKED', 'BLOCKED']);
    expect(result.findings).toEqual([expect.objectContaining({ occurrenceKey: 'NORMAL:entry:2026-08-10' })]);
  });

  it('applies an activity collision only at the target occurrence whose suppression evidence participates', async () => {
    const earlier = { ...normal('2026-08-03'), occurrenceKey: 'NORMAL:early:2026-08-03', timetableEntryId: 'early' };
    const affected = { ...normal('2026-08-03', 'SPECIAL_ACTIVITY_SUPPRESSED'), occurrenceKey: 'NORMAL:late:2026-08-03', timetableEntryId: 'late', timeSlot: { ...normal('2026-08-03').timeSlot, id: 'later', startTime: '08:00:00', endTime: '08:45:00' }, suppressingSpecialActivityIds: ['activity-a'] };
    const h = harness({ '2026-08-03': { normalOccurrences: [affected, earlier], findings: [{ severity: 'BLOCKER', code: 'ACTIVE_SPECIAL_ACTIVITY_COLLISION', occurrenceKey: null, entityIds: ['activity-a', 'activity-b'] }] } });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-03' });
    expect(result.normalAllocations.map((row) => row.allocationStatus)).toEqual(['ALLOCATED', 'BLOCKED']); expect(result.findings[0]).toMatchObject({ code: 'ACTIVE_SPECIAL_ACTIVITY_COLLISION', occurrenceKey: null });
  });

  it('blocks later allocation for a global structural failure on a candidate date with no target normal', async () => {
    const h = harness({ '2026-08-03': { normalOccurrences: [], findings: [{ severity: 'BLOCKER', code: 'TIMETABLE_EFFECTIVE_VERSION_MISSING', occurrenceKey: null, entityIds: ['year'] }] } });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-10' });
    expect(result.normalAllocations).toEqual([expect.objectContaining({ allocationStatus: 'BLOCKED', expectedPpctItem: null })]); expect(result.findings).toEqual([expect.objectContaining({ code: 'TIMETABLE_EFFECTIVE_VERSION_MISSING' })]);
  });

  it('fails closed on a non-forward exact version transition', async () => {
    const first = bound(normal('2026-08-03'), 'plan', 'v2'); const second = bound(normal('2026-08-10'), 'plan', 'v1');
    const h = harness({ '2026-08-03': { normalOccurrences: [first], findings: [] }, '2026-08-10': { normalOccurrences: [second], findings: [] } });
    h.tx.ppctVersion.findMany.mockResolvedValue([
      { id: 'v1', ppctPlanId: 'plan', versionNumber: 1, status: 'SUPERSEDED', itemRevisions: [{ id: 'r1', ppctVersionId: 'v1', ppctPlanId: 'plan', ppctItemId: 'A', sequence: 1, title: 'A', lessonType: 'LESSON' }] },
      { id: 'v2', ppctPlanId: 'plan', versionNumber: 2, status: 'PUBLISHED', itemRevisions: [{ id: 'r2', ppctVersionId: 'v2', ppctPlanId: 'plan', ppctItemId: 'B', sequence: 1, title: 'B', lessonType: 'LESSON' }] },
    ]);
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-10' });
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PPCT_ALLOCATION_HISTORY_BLOCKED', reason: 'NON_FORWARD_VERSION_TRANSITION' })])); expect(result.normalAllocations[1]?.allocationStatus).toBe('BLOCKED');
  });

  it('fails closed when the exact stream changes PPCT plan', async () => {
    const first = bound(normal('2026-08-03'), 'plan-a', 'va'); const second = bound(normal('2026-08-10'), 'plan-b', 'vb');
    const h = harness({ '2026-08-03': { normalOccurrences: [first], findings: [] }, '2026-08-10': { normalOccurrences: [second], findings: [] } });
    h.tx.ppctVersion.findMany.mockImplementation(async (query: { where: { ppctPlanId: string } }) => query.where.ppctPlanId === 'plan-a'
      ? [{ id: 'va', ppctPlanId: 'plan-a', versionNumber: 1, status: 'PUBLISHED', itemRevisions: [{ id: 'ra', ppctVersionId: 'va', ppctPlanId: 'plan-a', ppctItemId: 'A', sequence: 1, title: 'A', lessonType: 'LESSON' }] }]
      : [{ id: 'vb', ppctPlanId: 'plan-b', versionNumber: 1, status: 'PUBLISHED', itemRevisions: [{ id: 'rb', ppctVersionId: 'vb', ppctPlanId: 'plan-b', ppctItemId: 'B', sequence: 1, title: 'B', lessonType: 'LESSON' }] }]);
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-10' });
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PPCT_ALLOCATION_HISTORY_BLOCKED', reason: 'PLAN_CONTEXT_CHANGED' })]));
  });

  it('M1 keeps an absent claimed source before a later blocker as MISMATCH', async () => {
    const h = harness({ '2026-08-10': { normalOccurrences: [normal('2026-08-10')], findings: [{ severity: 'BLOCKER', code: 'NORMAL_PROVENANCE_INVALID', occurrenceKey: 'NORMAL:entry:2026-08-10', entityIds: ['entry'] }] } });
    h.tx.makeupTeachingSchedule.findMany.mockResolvedValue([makeup({ id: 'm1', sourceDate: '2026-08-03' })]);
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-17' });
    expect(result.makeupSourceMatches).toEqual([expect.objectContaining({ status: 'MISMATCH' })]); expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH', occurrenceKey: 'MAKEUP:m1' })]));
  });

  it('M2 marks an absent claimed source after the first blocker as NOT_ASSESSED_HISTORY_BLOCKED', async () => {
    const h = harness({ '2026-08-10': { normalOccurrences: [normal('2026-08-10')], findings: [{ severity: 'BLOCKER', code: 'NORMAL_PROVENANCE_INVALID', occurrenceKey: 'NORMAL:entry:2026-08-10', entityIds: ['entry'] }] } });
    h.tx.makeupTeachingSchedule.findMany.mockResolvedValue([makeup({ id: 'm2', sourceDate: '2026-08-17' })]);
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-17' });
    expect(result.makeupSourceMatches).toEqual([expect.objectContaining({ status: 'NOT_ASSESSED_HISTORY_BLOCKED' })]); expect(result.findings.map((finding) => finding.code)).not.toContain('PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH');
  });

  it('M3 preserves an exact direct MATCH before a later blocker', async () => {
    const h = harness({ '2026-08-10': { normalOccurrences: [normal('2026-08-10')], findings: [{ severity: 'BLOCKER', code: 'NORMAL_PROVENANCE_INVALID', occurrenceKey: 'NORMAL:entry:2026-08-10', entityIds: ['entry'] }] } });
    h.tx.makeupTeachingSchedule.findMany.mockResolvedValue([makeup({ id: 'm3', sourceDate: '2026-08-03', sourceEntryId: 'entry' })]);
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-17' });
    expect(result.makeupSourceMatches).toEqual([expect.objectContaining({ status: 'MATCH', expectedPpctItem: expect.objectContaining({ ppctItemId: 'item-1' }) })]);
  });

  it('M4 keeps a same-day absent earlier-slot source as MISMATCH when the blocker is later', async () => {
    const blocked = { ...normal('2026-08-03'), occurrenceKey: 'NORMAL:blocked:2026-08-03', timetableEntryId: 'blocked', timeSlot: { ...normal('2026-08-03').timeSlot, startTime: '08:00:00', endTime: '08:45:00' } };
    const h = harness({ '2026-08-03': { normalOccurrences: [blocked], findings: [{ severity: 'BLOCKER', code: 'NORMAL_PROVENANCE_INVALID', occurrenceKey: blocked.occurrenceKey, entityIds: ['blocked'] }] } });
    h.tx.makeupTeachingSchedule.findMany.mockResolvedValue([makeup({ id: 'm4', sourceDate: '2026-08-03', sourceStart: '07:00:00', sourceEnd: '07:45:00' })]);
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-03' }); expect(result.makeupSourceMatches[0]?.status).toBe('MISMATCH');
  });

  it('M5 marks a same-day later-slot source after the blocker as NOT_ASSESSED_HISTORY_BLOCKED', async () => {
    const blocked = { ...normal('2026-08-03'), occurrenceKey: 'NORMAL:blocked:2026-08-03', timetableEntryId: 'blocked', timeSlot: { ...normal('2026-08-03').timeSlot, startTime: '08:00:00', endTime: '08:45:00' } };
    const h = harness({ '2026-08-03': { normalOccurrences: [blocked], findings: [{ severity: 'BLOCKER', code: 'NORMAL_PROVENANCE_INVALID', occurrenceKey: blocked.occurrenceKey, entityIds: ['blocked'] }] } });
    h.tx.makeupTeachingSchedule.findMany.mockResolvedValue([makeup({ id: 'm5', sourceDate: '2026-08-03', sourceStart: '09:00:00', sourceEnd: '09:45:00' })]);
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-03' }); expect(result.makeupSourceMatches[0]?.status).toBe('NOT_ASSESSED_HISTORY_BLOCKED'); expect(result.findings.map((finding) => finding.code)).not.toContain('PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH');
  });

  it('S1 denies both overlapping consumers and every later consuming allocation', async () => {
    const first = { ...normal('2026-08-03'), occurrenceKey: 'NORMAL:first:2026-08-03', timetableEntryId: 'first', timeSlot: { ...normal('2026-08-03').timeSlot, startTime: '07:00:00', endTime: '08:00:00' } };
    const second = { ...normal('2026-08-03'), occurrenceKey: 'NORMAL:second:2026-08-03', timetableEntryId: 'second', timeSlot: { ...normal('2026-08-03').timeSlot, startTime: '07:30:00', endTime: '08:30:00' } };
    const later = { ...normal('2026-08-03'), occurrenceKey: 'NORMAL:later:2026-08-03', timetableEntryId: 'later', timeSlot: { ...normal('2026-08-03').timeSlot, startTime: '09:00:00', endTime: '09:45:00' } };
    const h = harness({ '2026-08-03': { normalOccurrences: [later, second, first], findings: [] } });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-03' });
    expect(result.normalAllocations.map((allocation) => allocation.allocationStatus)).toEqual(['BLOCKED', 'BLOCKED', 'BLOCKED']); expect(result.normalAllocations.every((allocation) => allocation.expectedPpctItem === null)).toBe(true); expect(result.findings).toEqual([expect.objectContaining({ code: 'PPCT_ALLOCATION_OCCURRENCE_ORDER_AMBIGUOUS' })]);
  });

  it('S2 preserves the earliest pre-association replay candidate and blocks later allocation', async () => {
    const missing = { ...normal('2026-08-03'), ppctBinding: null };
    const h = harness({ '2026-08-03': { normalOccurrences: [missing], findings: [{ severity: 'BLOCKER', code: 'PPCT_ASSOCIATION_MISSING', occurrenceKey: missing.occurrenceKey, entityIds: ['entry'] }] } });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-08-10' });
    expect(result.replayOrigin).toBe('2026-08-03'); expect(result.normalAllocations.map((allocation) => allocation.allocationStatus)).toEqual(['BLOCKED', 'BLOCKED']); expect(result.findings).toEqual([expect.objectContaining({ code: 'PPCT_ASSOCIATION_MISSING', occurrenceKey: missing.occurrenceKey })]);
  });
});
