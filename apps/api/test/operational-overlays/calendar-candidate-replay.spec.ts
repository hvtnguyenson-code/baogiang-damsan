import { Prisma } from '@prisma/client';
import { PreviewCalendarExceptionDto } from '../../src/operational-overlays/dto';
import { OperationalOverlaysService } from '../../src/operational-overlays/operational-overlays.service';
import { OperationalWorkspaceContextService } from '../../src/operational-overlays/operational-workspace-context.service';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import { PpctOccurrenceAllocationService } from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import { ProgressDebtService } from '../../src/progress-debt/progress-debt.service';
import { CalendarExceptionReplay } from '../../src/resolved-occurrences/calendar-exception-replay';
import { ResolvedLessonOccurrencesService } from '../../src/resolved-occurrences/resolved-occurrences.service';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dates = ['2026-08-03', '2026-08-10', '2026-08-17'] as const;
const now = new Date('2026-08-17T12:00:00.000Z');
const scope = { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject' };
const candidate: PreviewCalendarExceptionDto = {
  academicYearId: 'year', academicCalendarVersionId: 'calendar', civilDate: dates[0],
  scope: 'SCHOOL_WIDE', timeSelector: 'WHOLE_DAY',
};
const coverage = { ppctItemAllocation: 'NOT_ASSESSED', debt: 'NOT_ASSESSED', workload: 'NOT_ASSESSED' };
const authority = { operationalStartDate: '2026-08-01' as const, policyVersionId: 'start-policy', validatorVersion: 'v1', effectiveFrom: '2026-08-01' as const, effectiveUntil: null };

// Only retained persistence/association reads are fixtures. Calendar command
// validation, structural resolution, allocator V2 and progress V2 are real.
function harness(twoComponents = false) {
  const calendar = { id: 'calendar', academicYearId: 'year', startDate: date('2026-08-01'), endDate: date('2026-08-31'), isActive: true };
  const version = { id: 'timetable', academicYearId: 'year', calendarVersionId: 'calendar', effectiveFrom: date(dates[0]), effectiveUntil: date(dates[2]), status: 'ACTIVE' };
  const slots = (twoComponents ? [1, 2] : [1]).map((n) => ({
    id: `slot-${n}`, academicYearId: 'year', weekday: 'MONDAY', session: n === 1 ? 'MORNING' : 'AFTERNOON',
    startTime: new Date(`1970-01-01T${n === 1 ? '07' : '13'}:00:00.000Z`),
    endTime: new Date(`1970-01-01T${n === 1 ? '07' : '13'}:45:00.000Z`), isActive: true,
  }));
  const entries = slots.map((slot, i) => ({
    id: `entry-${i + 1}`, ...scope, timetableVersionId: 'timetable', timetableVersion: version,
    weekday: 'MONDAY', timeSlotDefinitionId: slot.id, timeSlotDefinition: slot,
    teacherUserId: 'teacher', teachingAssignmentId: 'assignment',
    schoolClass: { id: 'class', academicYearId: 'year', gradeLevel: 10 },
    teachingAssignment: { ...scope, teacherUserId: 'teacher' },
  }));
  const association = { id: 'association', ...scope, curricularProfile: twoComponents ? 'CORE_PLUS_SPECIALIZED_STUDY' : 'CORE_ONLY',
    effectiveFrom: calendar.startDate, effectiveUntil: null, ppctPlanId: 'plan', ppctVersionId: 'version', ppctVersionStatus: 'PUBLISHED' };
  const segments = dates.map((day, i) => ({ academicWeekId: `week-${i}`, calendarVersionId: 'calendar', startDate: date(day),
    endDate: new Date(date(day).getTime() + 4 * 86400000), segmentOrder: 1, academicWeek: { id: `week-${i}` } }));
  const revisions = ['CORE', 'SPECIALIZED_STUDY'].flatMap((component) => [1, 2, 3].map((sequence) => ({
    id: `${component}-revision-${sequence}`, ppctVersionId: 'version', ppctPlanId: 'plan', ppctItemId: `${component}-item-${sequence}`,
    sequence, component, title: `${component} ${sequence}`, lessonType: 'LESSON',
  })));
  const write = jest.fn(() => { throw new Error('Replay attempted persistence'); });
  const mutations = { create: write, createMany: write, update: write, updateMany: write, delete: write, deleteMany: write, upsert: write };
  const tx = {
    academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year' }), ...mutations },
    academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue(calendar), ...mutations },
    schoolClass: { findUnique: jest.fn().mockResolvedValue(entries[0]!.schoolClass), findUniqueOrThrow: jest.fn().mockResolvedValue(entries[0]!.schoolClass), ...mutations },
    timeSlotDefinition: { findMany: jest.fn().mockResolvedValue(slots), ...mutations },
    timetableVersion: { findMany: jest.fn().mockResolvedValue([version]), ...mutations },
    timetableEntry: { findMany: jest.fn().mockResolvedValue(entries), ...mutations },
    calendarInterruption: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), ...mutations },
    calendarException: { findMany: jest.fn().mockResolvedValue([]), ...mutations },
    operationalLessonDisposition: { findMany: jest.fn().mockResolvedValue([]), ...mutations },
    specialActivity: { findMany: jest.fn().mockResolvedValue([]), ...mutations },
    makeupTeachingSchedule: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), ...mutations },
    curricularTeachingExecution: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), ...mutations },
    academicWeekSegment: { findMany: jest.fn().mockResolvedValue(segments), ...mutations },
    ppctClassAssociation: { findMany: jest.fn().mockResolvedValue([association]), ...mutations },
    ppctVersion: { findMany: jest.fn().mockResolvedValue([{ id: 'version', ppctPlanId: 'plan', versionNumber: 1, status: 'PUBLISHED', itemRevisions: revisions }]), ...mutations },
    ppctItemLineage: { findMany: jest.fn().mockResolvedValue([]), ...mutations },
    $executeRaw: write, $queryRaw: write,
  };
  const prisma = { $transaction: jest.fn(async <T>(work: (client: Prisma.TransactionClient) => Promise<T>, _options: object) => work(tx as never)) };
  const audit = { write: jest.fn() };
  const overlays = new OperationalOverlaysService(prisma as never, audit as never, {} as never, { now: () => date('2026-08-01') });
  const associations = { findOverlappingRange: jest.fn().mockResolvedValue([association]) };
  const structural = new ResolvedLessonOccurrencesService(prisma as never, associations as never);
  const sourceReads = jest.spyOn(structural, 'resolveInTransaction');
  const allocation = new PpctOccurrenceAllocationService(prisma as never, structural);
  const config = { businessCivilDate: jest.fn().mockReturnValue('2026-08-17'), resolveOperationalStartPolicy: jest.fn().mockResolvedValue(authority) };
  const progress = new ProgressDebtService(prisma as never, allocation, { now: () => now }, config as never);
  const run = <T>(work: (replay: CalendarExceptionReplay, client: Prisma.TransactionClient) => Promise<T>, input = candidate) =>
    overlays.withCalendarPreviewReplay(input, work);
  return { tx, prisma, audit, write, allocation, progress, structural, sourceReads, config, entries, run, overlays };
}

describe('P5-054 T53-B bounded internal calendar candidate replay', () => {
  it.each([dates[0], dates[1]])('retained calendar replay cannot discard or rebind execution sourced on %s', async (sourceDate) => {
    const baseline = harness();
    const allocated = await baseline.allocation.resolveInTransactionV2(baseline.tx as never, { ...scope, throughCivilDate: dates[2] });
    expect(allocated.status).toBe('PASS');
    const row = allocated.normalAllocations.find((item) => item.occurrence.civilDate === sourceDate)!;
    const source = row.occurrence;
    const expected = row.expectedPpctItem!;
    const execution = {
      id: 'retained-execution', ...scope, status: 'ACTIVE', kind: 'NORMAL',
      sourceNormalOccurrenceKey: source.occurrenceKey, originalTimetableVersionId: source.timetableVersionId,
      originalTimetableEntryId: source.timetableEntryId, sourceCivilDate: date(sourceDate),
      sourceAcademicCalendarVersionId: source.academicCalendarVersionId, sourceTimeSlotDefinitionId: source.timeSlot.id,
      originalTeachingAssignmentId: source.teachingAssignmentId, responsibleTeacherUserId: source.responsibleTeacherUserId,
      ppctClassAssociationId: expected.ppctClassAssociationId, ppctPlanId: expected.ppctPlanId,
      ppctVersionId: expected.ppctVersionId, ppctItemId: expected.ppctItemId, ppctItemRevisionId: expected.ppctItemRevisionId,
      operationalLessonDispositionId: null, operationalDispositionType: null, makeupTeachingScheduleId: null,
      executionCivilDate: date(sourceDate), executionAcademicCalendarVersionId: source.academicCalendarVersionId,
      executionTimeSlotDefinitionId: source.timeSlot.id, actualTeacherUserId: source.responsibleTeacherUserId,
      executionTimeSlot: { endTime: new Date(`1970-01-01T${source.timeSlot.endTime}.000Z`) },
    };
    baseline.tx.curricularTeachingExecution.findMany.mockResolvedValue([execution]);
    expect(await baseline.progress.resolveInTransactionV2(baseline.tx as never, { ...scope, asOfInstant: now }, authority))
      .toMatchObject({ status: 'PASS', counts: { completedCount: 1, distributedElapsedCount: 3 } });

    // Separate retained-state fixture, not a simulated write in a read snapshot:
    // real structural + allocator V2 suppress date 1 and move later PPCT items.
    const changed = harness();
    changed.tx.curricularTeachingExecution.findMany.mockResolvedValue([execution]);
    changed.tx.calendarException.findMany.mockImplementation(async ({ where }) => where.civilDate.getTime() === date(dates[0]).getTime()
      ? [{ id: 'retained-exception', scope: 'SCHOOL_WIDE', timeSelector: 'WHOLE_DAY', exactTimeSlots: [] }] : []);
    const saved = JSON.stringify(execution);
    const result = await changed.prisma.$transaction((tx) => changed.progress.resolveInTransactionV2(tx,
      { ...scope, asOfInstant: now }, authority), { isolationLevel: 'RepeatableRead' });
    expect(result).toMatchObject({ status: 'BLOCKED', counts: null, items: [], findings: [
      expect.objectContaining({ code: 'RECONCILIATION_REQUIRED', occurrenceKey: source.occurrenceKey, entityIds: ['retained-execution'] }),
    ] });
    expect(result).toMatchObject({ findings: [expect.objectContaining({
      reason: expect.stringContaining(sourceDate === dates[0] ? 'no current authoritative elapsed direct obligation' : 'ppctItemId'),
    })] });
    for (const [tx] of changed.sourceReads.mock.calls) expect(tx).toBe(changed.tx);
    expect(JSON.stringify(execution)).toBe(saved);
    expect(changed.write).not.toHaveBeenCalled();
    expect(changed.audit.write).not.toHaveBeenCalled();
  });

  it('replays BEFORE/AFTER through subsequent opportunities in one snapshot, without persisting or changing retained reads', async () => {
    const h = harness();
    const original = JSON.stringify(h.entries);
    const evidence = await h.run((replay, tx) => h.allocation.replayCalendarCandidateInTransactionV2(tx, { ...scope, throughCivilDate: dates[2] }, replay));
    expect(evidence).toMatchObject({ profile: 'CALENDAR_CANDIDATE_REPLAY_PARTIAL_V1', status: 'NOT_ASSESSED', coverage,
      candidate: { civilDate: dates[0], academicCalendarVersionId: 'calendar' } });
    expect(evidence.limitations).toContain('WORKLOAD_CANDIDATE_REPLAY_UNAVAILABLE');
    expect(evidence.limitations).toContain('MUTATION_REVALIDATION_UNAVAILABLE');
    const { before, after } = evidence.projection;
    expect(before.status).toBe('PASS');
    expect(after.status).toBe('PASS');
    expect(before.normalAllocations.map((row) => row.expectedPpctItem?.ppctItemId)).toEqual(['CORE-item-1', 'CORE-item-2', 'CORE-item-3']);
    expect(after.normalAllocations.map((row) => row.expectedPpctItem?.ppctItemId ?? null)).toEqual([null, 'CORE-item-1', 'CORE-item-2']);
    expect(after.normalAllocations[1]).toMatchObject({ plannedComponent: 'CORE', expectedPpctItem: {
      ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'version', ppctItemRevisionId: 'CORE-revision-1', component: 'CORE',
    } });
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    for (const [tx] of h.sourceReads.mock.calls) expect(tx).toBe(h.tx);
    expect(JSON.stringify(h.entries)).toBe(original);
    const retained = await h.structural.resolveInTransaction(h.tx as never, { academicYearId: 'year', civilDate: dates[0] });
    expect(retained.normalOccurrences[0]).toMatchObject({ effectiveKind: 'BASE_TIMETABLE', exceptionIds: [] });
    expect(h.write).not.toHaveBeenCalled();
    expect(h.audit.write).not.toHaveBeenCalled();
  });

  it('keeps component routing frozen when the last specialized opportunity is suppressed', async () => {
    const h = harness(true);
    h.tx.timeSlotDefinition.findMany.mockResolvedValue([h.entries[1]!.timeSlotDefinition]);
    const evidence = await h.run((replay, tx) => h.allocation.replayCalendarCandidateInTransactionV2(tx, { ...scope, throughCivilDate: dates[2] }, replay),
      { ...candidate, timeSelector: 'EXACT_SLOTS', exactTimeSlotDefinitionIds: ['slot-2'] });
    expect(evidence.status).toBe('NOT_ASSESSED');
    const { before, after } = evidence.projection;
    expect(before.status).toBe('PASS');
    expect(after.status).toBe('PASS');
    expect(after.normalAllocations.map((row) => row.plannedComponent)).toEqual(before.normalAllocations.map((row) => row.plannedComponent));
    expect(after.normalAllocations.map((row) => row.expectedPpctItem?.ppctItemId ?? null)).toEqual([
      'CORE-item-1', null, 'CORE-item-2', 'SPECIALIZED_STUDY-item-1', 'CORE-item-3', 'SPECIALIZED_STUDY-item-2',
    ]);
    expect(after.normalAllocations[1]).toMatchObject({ plannedComponent: 'SPECIALIZED_STUDY', allocationStatus: 'NOT_CONSUMED' });
  });

  it('uses the candidate in weekly look-ahead even when throughDate precedes the candidate date', async () => {
    const h = harness();
    // One retained business week spanning non-contiguous Monday opportunities.
    h.tx.academicWeekSegment.findMany.mockResolvedValue(dates.map((day, i) => ({
      academicWeekId: 'week', calendarVersionId: 'calendar', startDate: date(day), endDate: date(day),
      segmentOrder: i + 1, academicWeek: { id: 'week' },
    })));
    const applySpy = jest.spyOn(CalendarExceptionReplay.prototype, 'apply');
    try {
      const result = await h.run((replay, tx) => h.allocation.replayCalendarCandidateInTransactionV2(tx, { ...scope, throughCivilDate: dates[0] }, replay),
        { ...candidate, civilDate: dates[1] });
      expect(result.status).toBe('NOT_ASSESSED');
      expect(applySpy.mock.calls.some(([, source]) => source.scope.civilDate === dates[1])).toBe(true);
      const index = applySpy.mock.calls.findIndex(([, source]) => source.scope.civilDate === dates[1]);
      expect(applySpy.mock.results[index]!.value.normalOccurrences[0].effectiveKind).toBe('CALENDAR_EXCEPTION');
    } finally { applySpy.mockRestore(); }
  });

  it('reuses progress V2 as-of and operational start; suppression creates neither completion nor debt', async () => {
    const h = harness();
    const result = await h.run((replay, tx) => h.progress.replayCalendarCandidateInTransactionV2(tx, { ...scope, asOfInstant: now }, replay));
    expect(result.status).toBe('NOT_ASSESSED');
    expect(result.coverage).toEqual(coverage);
    expect(result.projection.operationalStartAuthority).toEqual(authority);
    expect(result.projection.before.counts).toMatchObject({ distributedElapsedCount: 3, unconfirmedGapCount: 3, openDebtCount: 0, completedCount: 0 });
    expect(result.projection.after.counts).toMatchObject({ distributedElapsedCount: 2, unconfirmedGapCount: 2, openDebtCount: 0, completedCount: 0 });
    expect(result.projection.after.items.map((row) => row.ppctItemId)).toEqual(['CORE-item-1', 'CORE-item-2']);
    expect(h.config.resolveOperationalStartPolicy).toHaveBeenCalledTimes(1);
    expect(h.config.resolveOperationalStartPolicy).toHaveBeenCalledWith('year', '2026-08-17', h.tx);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('does not project future debt or accept a future as-of instant', async () => {
    const h = harness();
    const result = await h.run((replay, tx) => h.progress.replayCalendarCandidateInTransactionV2(tx,
      { ...scope, asOfInstant: new Date('2026-08-02T12:00:00Z') }, replay, authority));
    expect(result.projection.before.items).toEqual([]);
    expect(result.projection.after.items).toEqual([]);
    await expect(h.run((replay, tx) => h.progress.replayCalendarCandidateInTransactionV2(tx,
      { ...scope, asOfInstant: new Date(now.getTime() + 1) }, replay, authority))).rejects.toThrow('cannot be in the future');
  });

  it('preserves pre-operational exclusion instead of converting unconfirmed history into debt', async () => {
    const h = harness();
    const result = await h.run((replay, tx) => h.progress.replayCalendarCandidateInTransactionV2(tx,
      { ...scope, asOfInstant: now }, replay, { ...authority, operationalStartDate: '2026-08-18' }));
    expect(result.projection.before.items).toEqual([]);
    expect(result.projection.after.items).toEqual([]);
    expect(result.projection.after.counts).toMatchObject({ completedCount: 0, openDebtCount: 0, unconfirmedGapCount: 0 });
  });

  it('does not expose internal evidence through public preview or weaken its authorization boundary', async () => {
    const h = harness();
    const authorization = { listEffectiveCapabilities: jest.fn().mockResolvedValue([{ key: 'CALENDAR_EXCEPTION_MANAGE', scope: 'SCHOOL_WIDE' }]) };
    const workspace = new OperationalWorkspaceContextService(h.prisma as never, authorization as never, h.structural, h.overlays);
    const request = { auth: { user: { id: 'operator', mustChangePassword: false } } } as AuthenticatedRequest;
    const result = await workspace.previewCalendarException(request, candidate);
    expect(result).toMatchObject({ status: 'PASS', coverage }); // validation only
    expect(result).not.toHaveProperty('projection');
    expect(result).not.toHaveProperty('candidate');
    expect(result.affected).toHaveLength(1);
    authorization.listEffectiveCapabilities.mockResolvedValue([]);
    await expect(workspace.previewCalendarException(request, candidate)).rejects.toThrow('Không có quyền');
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.write).not.toHaveBeenCalled();
    expect(h.audit.write).not.toHaveBeenCalled();
  });

  it.each(['curricularTeachingExecution', 'makeupTeachingSchedule'] as const)('refuses %s ACTIVE anywhere in the stream, including outside the replay horizon', async (delegate) => {
    const h = harness();
    h.tx[delegate].findFirst.mockResolvedValue({ id: 'retained-outside-horizon' });
    await expect(h.run((replay, tx) => h.allocation.replayCalendarCandidateInTransactionV2(tx, { ...scope, throughCivilDate: dates[0] }, replay)))
      .rejects.toThrow('RECONCILIATION_REQUIRED');
    expect(h.tx[delegate].findFirst).toHaveBeenCalledWith({ where: { ...scope, status: 'ACTIVE' }, select: { id: true }, orderBy: { id: 'asc' } });
    expect(h.sourceReads).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
    expect(h.audit.write).not.toHaveBeenCalled();
  });

  it.each([
    ['curricularTeachingExecution', '2026-08-03', 'NORMAL'],
    ['curricularTeachingExecution', '2026-08-17', 'MAKEUP'],
    ['curricularTeachingExecution', '2026-08-31', 'NORMAL'],
    ['makeupTeachingSchedule', '2026-08-31', 'MAKEUP'],
  ] as const)('fails closed on %s %s %s with exact retained identity and missing authority', async (delegate, retainedDate, kind) => {
    const h = harness();
    const retained = { id: 'retained-evidence', ...scope, status: 'ACTIVE', kind,
      sourceCivilDate: date(retainedDate), executionCivilDate: date(retainedDate), targetCivilDate: date(retainedDate) };
    h.tx[delegate].findFirst.mockImplementation(async ({ where }) => {
      // A date-restricted guard would miss future/out-of-horizon evidence.
      expect(where).toEqual({ ...scope, status: 'ACTIVE' });
      return retained;
    });
    const saved = JSON.stringify(retained);
    await expect(h.run((replay, tx) => h.progress.replayCalendarCandidateInTransactionV2(tx,
      { ...scope, asOfInstant: now }, replay))).rejects.toMatchObject({
      name: 'CalendarReplayReconciliationRequired', retainedEntityId: retained.id,
      missingAuthority: 'CANDIDATE_RETAINED_EXECUTION_AND_OFFICIAL_WORKLOAD_RECONCILIATION',
    });
    expect(JSON.stringify(retained)).toBe(saved);
    expect(h.sourceReads).not.toHaveBeenCalled();
    expect(h.config.resolveOperationalStartPolicy).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
    expect(h.audit.write).not.toHaveBeenCalled();
  });

  it('propagates failed retained evidence reads without producing a projection or success audit', async () => {
    const h = harness();
    h.tx.curricularTeachingExecution.findFirst.mockRejectedValue(new Error('snapshot evidence read failed'));
    await expect(h.run((replay, tx) => h.progress.replayCalendarCandidateInTransactionV2(tx,
      { ...scope, asOfInstant: now }, replay))).rejects.toThrow('snapshot evidence read failed');
    expect(h.sourceReads).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
    expect(h.audit.write).not.toHaveBeenCalled();
  });

  it.each([
    { scope: 'GRADE', gradeLevel: 11 }, { scope: 'CLASS', schoolClassId: 'other-class' },
    { timeSelector: 'SESSION', session: 'AFTERNOON' },
  ] as const)('does not invent a delta for a valid non-matching selector %j', async (selector) => {
    const h = harness();
    const result = await h.run((replay, tx) => h.allocation.replayCalendarCandidateInTransactionV2(tx, { ...scope, throughCivilDate: dates[2] }, replay),
      { ...candidate, ...selector });
    expect(result.status).toBe('NOT_ASSESSED');
    expect(result.projection.after).toEqual(result.projection.before);
    expect(result.coverage).toEqual(coverage);
  });

  it('rejects an invalid calendar before evaluating any candidate replay', async () => {
    const h = harness();
    h.tx.academicCalendarVersion.findUnique.mockResolvedValue(null);
    const evaluate = jest.fn();
    await expect(h.run(evaluate)).rejects.toThrow();
    expect(evaluate).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });

  it('cannot reuse the adapter with another transaction/year, or after its validation scope ends', async () => {
    const h = harness();
    let escaped: CalendarExceptionReplay | undefined;
    await h.run(async (replay, tx) => {
      escaped = replay;
      await expect(replay.assertStream({} as never, scope)).rejects.toThrow('TRANSACTION_MISMATCH');
      await expect(replay.assertStream(tx, { ...scope, academicYearId: 'other-year' })).rejects.toThrow('YEAR_MISMATCH');
    });
    await expect(escaped!.assertStream(h.tx as never, scope)).rejects.toThrow('TRANSACTION_MISMATCH');
  });

  it('invalidates the adapter after failure and preserves validation selection against caller mutation', async () => {
    const h = harness();
    const input = { ...candidate, timeSelector: 'EXACT_SLOTS' as const, exactTimeSlotDefinitionIds: ['slot-1'] };
    let escaped: CalendarExceptionReplay | undefined;
    await expect(h.run(async (replay, tx) => {
      escaped = replay;
      input.exactTimeSlotDefinitionIds[0] = 'wrong-slot';
      const source = await h.structural.resolveInTransaction(tx, { academicYearId: 'year', civilDate: dates[0] });
      expect(replay.apply(tx, source).normalOccurrences[0]!.effectiveKind).toBe('CALENDAR_EXCEPTION');
      expect(source.normalOccurrences[0]!.effectiveKind).toBe('BASE_TIMETABLE');
      expect(Object.isFrozen(replay.candidate.exactTimeSlotDefinitionIds)).toBe(true);
      throw new Error('snapshot failed');
    }, input)).rejects.toThrow('snapshot failed');
    await expect(escaped!.assertStream(h.tx as never, scope)).rejects.toThrow('TRANSACTION_MISMATCH');
    expect(h.write).not.toHaveBeenCalled();
  });

  it('rejects blocked/non-base structural source and never applies to another retained calendar', async () => {
    const h = harness();
    await h.run(async (replay, tx) => {
      const source = await h.structural.resolveInTransaction(tx, { academicYearId: 'year', civilDate: dates[0] });
      expect(() => replay.apply(tx, { ...source, status: 'BLOCKED' })).toThrow('SOURCE_BLOCKED');
      for (const effectiveKind of ['CALENDAR_INTERRUPTION', 'CALENDAR_EXCEPTION', 'SPECIAL_ACTIVITY_SUPPRESSED', 'OPERATIONAL_DISPOSITION'] as const) {
        expect(() => replay.apply(tx, { ...source, normalOccurrences: [{ ...source.normalOccurrences[0]!, effectiveKind }] })).toThrow('NON_BASE_SOURCE');
      }
      const differentCalendar = { ...source, normalOccurrences: [{ ...source.normalOccurrences[0]!, academicCalendarVersionId: 'historical-calendar' }] };
      expect(replay.apply(tx, differentCalendar)).toEqual(differentCalendar);
    });
  });

  it('keeps a blocked V2 authority blocked instead of using apparently valid candidate rows as proof', async () => {
    const h = harness();
    h.tx.ppctVersion.findMany.mockResolvedValue([]);
    const result = await h.run((replay, tx) => h.allocation.replayCalendarCandidateInTransactionV2(tx, { ...scope, throughCivilDate: dates[2] }, replay));
    expect(result.status).toBe('BLOCKED');
    expect(result.coverage).toEqual(coverage);
    expect(h.write).not.toHaveBeenCalled();
  });
});
