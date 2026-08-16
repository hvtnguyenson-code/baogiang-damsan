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
