import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TeachingExecutionsService } from '../../src/teaching-executions/teaching-executions.service';

const curricular = (): Prisma.CurricularTeachingExecutionGetPayload<object> => ({
  id: 'execution', kind: 'NORMAL', status: 'ACTIVE', academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', sourceNormalOccurrenceKey: 'NORMAL:entry:2026-08-01', sourceCivilDate: new Date('2026-08-01Z'), originalTimetableVersionId: 'version', originalTimetableEntryId: 'entry', sourceAcademicCalendarVersionId: 'calendar', sourceTimeSlotDefinitionId: 'slot', originalTeachingAssignmentId: 'assignment', responsibleTeacherUserId: 'responsible', ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'ppct-version', ppctItemId: 'item', ppctItemRevisionId: 'revision', operationalLessonDispositionId: null, operationalDispositionType: null, makeupTeachingScheduleId: null, executionCivilDate: new Date('2026-08-01Z'), executionAcademicCalendarVersionId: 'calendar', executionTimeSlotDefinitionId: 'slot', executionAcademicWeekId: 'week', executionAcademicWeekSegmentId: 'segment', actualTeacherUserId: 'teacher', schoolClassCodeSnapshot: '10A', schoolClassNameSnapshot: '10A', subjectCodeSnapshot: 'MATH', subjectNameSnapshot: 'Math', responsibleTeacherDisplayNameSnapshot: 'Responsible', actualTeacherDisplayNameSnapshot: 'Teacher', note: null, createRequestKey: 'internal-create-key', createRequestFingerprint: 'internal-create-fingerprint', reversedByUserId: null, reversedAt: null, reversalReason: null, reverseRequestKey: 'internal-reverse-key', reverseRequestFingerprint: 'internal-reverse-fingerprint', replacesId: null, createdByUserId: 'creator', createdAt: new Date('2026-08-01T01:00:00Z'), updatedAt: new Date('2026-08-01T01:00:00Z'),
});

function service(access = { requireCurricular: jest.fn().mockResolvedValue('PERSONAL'), requireActivity: jest.fn() }) {
  return new TeachingExecutionsService({} as never, {} as never, {} as never, {} as never, access as never, { now: () => new Date() });
}

describe('TeachingExecutionsService response and replay boundaries', () => {
  it('maps curricular evidence explicitly without idempotency internals', () => {
    const value = service()['curricularRecord'](curricular());
    expect(Object.keys(value).sort()).toEqual(expect.arrayContaining(['originalTeachingAssignmentId', 'operationalDispositionType', 'ppctItemRevisionId']));
    expect(Object.keys(value)).not.toEqual(expect.arrayContaining(['createRequestKey', 'createRequestFingerprint', 'reverseRequestKey', 'reverseRequestFingerprint']));
  });

  it('authorizes persisted curricular evidence before replay fingerprint semantics', async () => {
    const access = { requireCurricular: jest.fn().mockRejectedValue(new ForbiddenException()), requireActivity: jest.fn() };
    const sut = service(access);
    const tx = { curricularTeachingExecution: { findUnique: jest.fn().mockResolvedValue(curricular()) } };
    await expect(sut['curricularReplay'](tx as never, 'internal-create-key', 'different-fingerprint', { auth: { user: { id: 'other' } } } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.requireCurricular).toHaveBeenCalledWith(expect.any(Object), 'teacher', 'subject');
  });

  it('returns a replay only after persisted authorization succeeds', async () => {
    const access = { requireCurricular: jest.fn().mockResolvedValue('PERSONAL'), requireActivity: jest.fn() };
    const sut = service(access);
    const tx = { curricularTeachingExecution: { findUnique: jest.fn().mockResolvedValue(curricular()) } };
    const result = await sut['curricularReplay'](tx as never, 'internal-create-key', 'internal-create-fingerprint', { auth: { user: { id: 'teacher' } } } as never);
    expect(result?.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(Object.keys(result!.item)).not.toEqual(expect.arrayContaining(['createRequestKey', 'createRequestFingerprint']));
  });
});

describe('TeachingExecutionsService confirmation transaction boundary', () => {
  const request = { auth: { user: { id: 'teacher' } } } as never;
  const occurrence = (effectiveKind = 'BASE_TIMETABLE', disposition: object | null = null) => ({
    occurrenceKey: 'NORMAL:entry:2026-08-01', civilDate: '2026-08-01', academicYearId: 'year', academicCalendarVersionId: 'calendar', timetableVersionId: 'version', timetableEntryId: 'entry', timeSlot: { id: 'slot', endTime: '07:45:00' }, schoolClass: { id: 'class' }, subjectId: 'subject', teachingAssignmentId: 'assignment', responsibleTeacherUserId: 'teacher', ppctBinding: { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'ppct-version' }, effectiveKind, disposition,
  });
  const expected = { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'ppct-version', ppctItemId: 'item', ppctItemRevisionId: 'revision' };

  function normalHarness(overrides: { allocation?: object; now?: Date } = {}) {
    const tx = { curricularTeachingExecution: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(curricular()) } };
    const prisma = { $transaction: jest.fn((callback: (input: typeof tx) => Promise<unknown>) => callback(tx)) };
    const allocation = { resolve: jest.fn(), resolveInTransaction: jest.fn().mockResolvedValue(overrides.allocation ?? { normalAllocations: [{ occurrence: occurrence(), allocationStatus: 'ALLOCATED', expectedPpctItem: expected }] }) };
    const access = { requireCurricular: jest.fn().mockResolvedValue('PERSONAL'), requireActivity: jest.fn() };
    const sut = new TeachingExecutionsService(prisma as never, allocation as never, { resolveInTransaction: jest.fn() } as never, { write: jest.fn() } as never, access as never, { now: () => overrides.now ?? new Date('2026-08-01T00:45:00.000Z') });
    Object.assign(sut as object, {
      requireWeek: jest.fn().mockResolvedValue({ weekId: 'week', segmentId: 'segment' }),
      curricularSnapshots: jest.fn().mockResolvedValue({ schoolClassCodeSnapshot: '10A', schoolClassNameSnapshot: '10A', subjectCodeSnapshot: 'M', subjectNameSnapshot: 'Math', responsibleTeacherDisplayNameSnapshot: 'Teacher', actualTeacherDisplayNameSnapshot: 'Teacher' }),
      successAudit: jest.fn().mockResolvedValue(undefined),
    });
    return { sut, tx, prisma, allocation, access };
  }

  it('confirms BASE with the exact allocated PPCT evidence in one SERIALIZABLE transaction', async () => {
    const h = normalHarness();
    await h.sut.confirmNormal({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-08-01', requestKey: 'key' }, request);
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(h.allocation.resolve).not.toHaveBeenCalled();
    expect(h.allocation.resolveInTransaction).toHaveBeenCalledWith(h.tx, expect.objectContaining({ throughCivilDate: '2026-08-01' }));
    expect(h.tx.curricularTeachingExecution.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actualTeacherUserId: 'teacher', ppctItemId: 'item', ppctItemRevisionId: 'revision', operationalLessonDispositionId: null, operationalDispositionType: null }) }));
  });

  it.each(['CALENDAR_INTERRUPTION', 'CALENDAR_EXCEPTION', 'SPECIAL_ACTIVITY_SUPPRESSED', 'OPERATIONAL_DISPOSITION'])('rejects non-execution normal meaning %s', async (effectiveKind) => {
    const h = normalHarness({ allocation: { normalAllocations: [{ occurrence: occurrence(effectiveKind), allocationStatus: 'ALLOCATED', expectedPpctItem: expected }] } });
    await expect(h.sut.confirmNormal({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-08-01', requestKey: 'key' }, request)).rejects.toThrow('Ý nghĩa vận hành');
    expect(h.tx.curricularTeachingExecution.create).not.toHaveBeenCalled();
  });

  it.each(['NOT_CONSUMED', 'BLOCKED'])('rejects allocation state %s', async (allocationStatus) => {
    const h = normalHarness({ allocation: { normalAllocations: [{ occurrence: occurrence(), allocationStatus, expectedPpctItem: null }] } });
    await expect(h.sut.confirmNormal({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-08-01', requestKey: 'key' }, request)).rejects.toThrow('ALLOCATED');
  });

  it('rejects confirmation one instant before the Asia/Ho_Chi_Minh slot end', async () => {
    const h = normalHarness({ now: new Date('2026-08-01T00:44:59.999Z') });
    await expect(h.sut.confirmNormal({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-08-01', requestKey: 'key' }, request)).rejects.toThrow('Chưa đến');
  });
});
