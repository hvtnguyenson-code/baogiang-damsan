import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TeachingExecutionsService } from '../../src/teaching-executions/teaching-executions.service';

const curricular = (patch: Partial<Prisma.CurricularTeachingExecutionGetPayload<object>> = {}): Prisma.CurricularTeachingExecutionGetPayload<object> => ({
  id: 'execution', kind: 'NORMAL', status: 'ACTIVE', academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', sourceNormalOccurrenceKey: 'NORMAL:entry:2026-08-01', sourceCivilDate: new Date('2026-08-01Z'), originalTimetableVersionId: 'version', originalTimetableEntryId: 'entry', sourceAcademicCalendarVersionId: 'calendar', sourceTimeSlotDefinitionId: 'slot', originalTeachingAssignmentId: 'assignment', responsibleTeacherUserId: 'responsible', ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'ppct-version', ppctItemId: 'item', ppctItemRevisionId: 'revision', operationalLessonDispositionId: null, operationalDispositionType: null, makeupTeachingScheduleId: null, executionCivilDate: new Date('2026-08-01Z'), executionAcademicCalendarVersionId: 'calendar', executionTimeSlotDefinitionId: 'slot', executionAcademicWeekId: 'week', executionAcademicWeekSegmentId: 'segment', actualTeacherUserId: 'teacher', schoolClassCodeSnapshot: '10A', schoolClassNameSnapshot: '10A', subjectCodeSnapshot: 'MATH', subjectNameSnapshot: 'Math', responsibleTeacherDisplayNameSnapshot: 'Responsible', actualTeacherDisplayNameSnapshot: 'Teacher', note: null, createRequestKey: 'internal-create-key', createRequestFingerprint: 'internal-create-fingerprint', reversedByUserId: null, reversedAt: null, reversalReason: null, reverseRequestKey: 'internal-reverse-key', reverseRequestFingerprint: 'internal-reverse-fingerprint', replacesId: null, createdByUserId: 'creator', createdAt: new Date('2026-08-01T01:00:00Z'), updatedAt: new Date('2026-08-01T01:00:00Z'), ...patch,
});

function service(
  access = { requireCurricular: jest.fn().mockResolvedValue('PERSONAL'), requireActivity: jest.fn() },
  businessConfiguration = { resolveOperationalStartPolicy: jest.fn() },
) {
  return new TeachingExecutionsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    access as never,
    businessConfiguration as never,
    { now: () => new Date() },
  );
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

  function normalHarness(overrides: { allocation?: object; now?: Date; policy?: object; policyError?: Error; replayRow?: object | null } = {}) {
    const tx = {
      curricularTeachingExecution: {
        findUnique: jest.fn().mockResolvedValue(overrides.replayRow ?? null),
        create: jest.fn().mockResolvedValue(curricular()),
      },
    };
    const prisma = { $transaction: jest.fn((callback: (input: typeof tx) => Promise<unknown>) => callback(tx)) };
    const defaultAlloc = overrides.allocation ?? { normalAllocations: [{ occurrence: occurrence(), allocationStatus: 'ALLOCATED', expectedPpctItem: expected }] };
    const allocation = {
      resolve: jest.fn(),
      resolveInTransaction: jest.fn().mockResolvedValue(defaultAlloc),
      resolveInTransactionV2: jest.fn().mockResolvedValue(defaultAlloc),
    };
    const access = { requireCurricular: jest.fn().mockResolvedValue('PERSONAL'), requireActivity: jest.fn() };
    const defaultPolicy = {
      academicYearId: 'year',
      operationalStartDate: '2026-08-01',
      policyVersionId: 'policy-version',
      validatorVersion: 'v1',
      effectiveFrom: '2026-08-01',
      effectiveUntil: null,
    };
    const businessConfiguration = {
      resolveOperationalStartPolicy: overrides.policyError
        ? jest.fn().mockRejectedValue(overrides.policyError)
        : jest.fn().mockResolvedValue(overrides.policy ?? defaultPolicy),
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const sut = new TeachingExecutionsService(
      prisma as never,
      allocation as never,
      { resolveInTransaction: jest.fn() } as never,
      audit as never,
      access as never,
      businessConfiguration as never,
      { now: () => overrides.now ?? new Date('2026-08-01T00:45:00.000Z') },
    );
    Object.assign(sut as object, {
      requireWeek: jest.fn().mockResolvedValue({ weekId: 'week', segmentId: 'segment' }),
      curricularSnapshots: jest.fn().mockResolvedValue({ schoolClassCodeSnapshot: '10A', schoolClassNameSnapshot: '10A', subjectCodeSnapshot: 'M', subjectNameSnapshot: 'Math', responsibleTeacherDisplayNameSnapshot: 'Teacher', actualTeacherDisplayNameSnapshot: 'Teacher' }),
      successAudit: jest.fn().mockResolvedValue(undefined),
    });
    return { sut, tx, prisma, allocation, access, businessConfiguration, audit };
  }

  it('confirms BASE with the exact allocated PPCT evidence in one SERIALIZABLE transaction', async () => {
    const h = normalHarness();
    await h.sut.confirmNormal({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-08-01', requestKey: 'key' }, request);
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(h.allocation.resolve).not.toHaveBeenCalled();
    expect(h.allocation.resolveInTransactionV2).toHaveBeenCalledWith(h.tx, expect.objectContaining({ throughCivilDate: '2026-08-01' }));
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

  describe('NORMAL OPERATIONAL_START guards (CheckPoint 3 Matrix)', () => {
    it('Case A: NEW normal with sourceCivilDate before OSD fails closed', async () => {
      const now = new Date('2026-09-13T08:00:00.000Z'); // HCM civil date 2026-09-13
      const h = normalHarness({
        now,
        policy: {
          academicYearId: 'year',
          operationalStartDate: '2026-09-15',
          policyVersionId: 'policy-version',
          validatorVersion: 'v1',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
        },
      });

      await expect(
        h.sut.confirmNormal(
          { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-09-14', requestKey: 'key' },
          request,
        ),
      ).rejects.toThrow('CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION');

      // Assert resolver called with command-time HCM date, NOT dto.sourceCivilDate
      expect(h.businessConfiguration.resolveOperationalStartPolicy).toHaveBeenCalledWith('year', '2026-09-13', h.tx);
      expect(h.allocation.resolveInTransactionV2).not.toHaveBeenCalled();
      expect(h.tx.curricularTeachingExecution.create).not.toHaveBeenCalled();
      expect(h.audit.write).not.toHaveBeenCalled();
    });

    it('Case B: sourceCivilDate === OSD is allowed', async () => {
      const h = normalHarness({
        now: new Date('2026-09-15T02:00:00.000Z'),
        policy: {
          academicYearId: 'year',
          operationalStartDate: '2026-09-15',
          policyVersionId: 'policy-version',
          validatorVersion: 'v1',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
        },
        allocation: {
          normalAllocations: [
            {
              occurrence: { ...occurrence(), civilDate: '2026-09-15', occurrenceKey: 'NORMAL:entry:2026-09-15' },
              allocationStatus: 'ALLOCATED',
              expectedPpctItem: expected,
            },
          ],
        },
      });

      const result = await h.sut.confirmNormal(
        { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-09-15', requestKey: 'key' },
        request,
      );
      expect(result.outcome).toBe('CREATED');
      expect(h.tx.curricularTeachingExecution.create).toHaveBeenCalled();
    });

    it('Case C: sourceCivilDate > OSD is allowed', async () => {
      const h = normalHarness({
        now: new Date('2026-09-16T02:00:00.000Z'),
        policy: {
          academicYearId: 'year',
          operationalStartDate: '2026-09-15',
          policyVersionId: 'policy-version',
          validatorVersion: 'v1',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
        },
        allocation: {
          normalAllocations: [
            {
              occurrence: { ...occurrence(), civilDate: '2026-09-16', occurrenceKey: 'NORMAL:entry:2026-09-16' },
              allocationStatus: 'ALLOCATED',
              expectedPpctItem: expected,
            },
          ],
        },
      });

      const result = await h.sut.confirmNormal(
        { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-09-16', requestKey: 'key' },
        request,
      );
      expect(result.outcome).toBe('CREATED');
      expect(h.tx.curricularTeachingExecution.create).toHaveBeenCalled();
    });

    it('Case D: resolver throws POLICY_NOT_CONFIGURED -> propagates ConflictException without allocation or create', async () => {
      const h = normalHarness({
        policyError: new ConflictException('POLICY_NOT_CONFIGURED'),
      });

      await expect(
        h.sut.confirmNormal(
          { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-08-01', requestKey: 'key' },
          request,
        ),
      ).rejects.toThrow('POLICY_NOT_CONFIGURED');

      expect(h.allocation.resolveInTransactionV2).not.toHaveBeenCalled();
      expect(h.tx.curricularTeachingExecution.create).not.toHaveBeenCalled();
    });

    it('Case E: idempotent replay of existing pre-op execution returns replay without calling resolver', async () => {
      const preOpRow = curricular({
        id: 'existing-pre-op',
        sourceCivilDate: new Date('2026-07-15Z'),
        createRequestKey: 'key',
        createRequestFingerprint: '45d0cbb4121bf9f7fe49b251347614d95be0bf73bc03d12c8ff46d84a7e934ec', // compute later or mock
      });
      const h = normalHarness();
      // Mock curricularReplay to return IDEMPOTENT_REPLAY
      jest.spyOn(h.sut as unknown as { curricularReplay: (...args: unknown[]) => Promise<unknown> }, 'curricularReplay').mockResolvedValue({ outcome: 'IDEMPOTENT_REPLAY', item: h.sut['curricularRecord'](preOpRow) });

      const result = await h.sut.confirmNormal(
        { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-07-15', requestKey: 'key' },
        request,
      );

      expect(result.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(h.businessConfiguration.resolveOperationalStartPolicy).not.toHaveBeenCalled();
      expect(h.allocation.resolveInTransactionV2).not.toHaveBeenCalled();
    });

    it('Case F: HCM anchor boundary converts UTC 17:00 of day X to day X+1 civilDate', async () => {
      // 2026-09-12T17:00:00.000Z = 2026-09-13 00:00:00 HCM
      const commandNow = new Date('2026-09-12T17:00:00.000Z');
      const h = normalHarness({
        now: commandNow,
        policy: {
          academicYearId: 'year',
          operationalStartDate: '2026-09-10',
          policyVersionId: 'policy-version',
          validatorVersion: 'v1',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
        },
        allocation: {
          normalAllocations: [
            {
              occurrence: { ...occurrence(), civilDate: '2026-09-12', occurrenceKey: 'NORMAL:entry:2026-09-12' },
              allocationStatus: 'ALLOCATED',
              expectedPpctItem: expected,
            },
          ],
        },
      });

      await h.sut.confirmNormal(
        { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: '2026-09-12', requestKey: 'key' },
        request,
      );

      expect(h.businessConfiguration.resolveOperationalStartPolicy).toHaveBeenCalledWith('year', '2026-09-13', h.tx);
    });
  });
});

describe('TeachingExecutionsService makeup and activity confirmation', () => {
  const request = { auth: { user: { id: 'teacher' } } } as never;
  const ppct = { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'ppct-version', ppctItemId: 'item', ppctItemRevisionId: 'revision' };
  const makeup = (status = 'ACTIVE', overrides: Partial<ReturnType<typeof defaultMakeup>> = {}) => ({ ...defaultMakeup(status), ...overrides });
  function defaultMakeup(status = 'ACTIVE') {
    return {
      id: 'makeup',
      status,
      academicYearId: 'year',
      schoolClassId: 'class',
      subjectId: 'subject',
      originalTimetableVersionId: 'original-version',
      originalTimetableEntryId: 'original-entry',
      originalCivilDate: new Date('2026-07-31Z'),
      originalAcademicCalendarVersionId: 'original-calendar',
      originalTimeSlotDefinitionId: 'original-slot',
      originalTeachingAssignmentId: 'assignment',
      responsibleTeacherUserId: 'responsible',
      ppctClassAssociationId: 'association',
      ppctPlanId: 'plan',
      ppctVersionId: 'ppct-version',
      ppctItemId: 'item',
      targetCivilDate: new Date('2026-08-01Z'),
      targetAcademicCalendarVersionId: 'target-calendar',
      targetTimeSlotDefinitionId: 'target-slot',
      scheduledTeacherUserId: 'teacher',
      targetTimeSlotDefinition: { endTime: new Date('1970-01-01T07:45:00Z') },
    };
  }

  function makeupHarness(overrides: {
    makeupSchedule?: object | null;
    allocation?: object;
    now?: Date;
    policy?: object;
    policyError?: Error;
  } = {}) {
    const tx = {
      curricularTeachingExecution: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(curricular()) },
      makeupTeachingSchedule: { findUnique: jest.fn().mockResolvedValue(overrides.makeupSchedule === undefined ? makeup() : overrides.makeupSchedule) },
    };
    const prisma = { $transaction: jest.fn((callback: (input: typeof tx) => Promise<unknown>) => callback(tx)) };
    const matchPayload = overrides.allocation ?? {
      makeupSourceMatches: [{ makeupTeachingScheduleId: 'makeup', sourceNormalOccurrenceKey: 'NORMAL:original-entry:2026-07-31', status: 'MATCH', expectedPpctItem: ppct }],
    };
    const allocation = {
      resolve: jest.fn(),
      resolveInTransaction: jest.fn().mockResolvedValue(matchPayload),
      resolveInTransactionV2: jest.fn().mockResolvedValue(matchPayload),
    };
    const defaultPolicy = {
      academicYearId: 'year',
      operationalStartDate: '2026-07-01',
      policyVersionId: 'policy-version',
      validatorVersion: 'v1',
      effectiveFrom: '2026-07-01',
      effectiveUntil: null,
    };
    const businessConfiguration = {
      resolveOperationalStartPolicy: overrides.policyError
        ? jest.fn().mockRejectedValue(overrides.policyError)
        : jest.fn().mockResolvedValue(overrides.policy ?? defaultPolicy),
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const sut = new TeachingExecutionsService(
      prisma as never,
      allocation as never,
      {} as never,
      audit as never,
      { requireCurricular: jest.fn().mockResolvedValue('PERSONAL') } as never,
      businessConfiguration as never,
      { now: () => overrides.now ?? new Date('2026-08-01T00:45:00Z') },
    );
    Object.assign(sut as object, {
      requireWeek: jest.fn().mockResolvedValue({ weekId: 'week', segmentId: 'segment' }),
      requireCurricularReplacement: jest.fn(),
      curricularSnapshots: jest.fn().mockResolvedValue({ schoolClassCodeSnapshot: '10A', schoolClassNameSnapshot: '10A', subjectCodeSnapshot: 'M', subjectNameSnapshot: 'Math', responsibleTeacherDisplayNameSnapshot: 'Responsible', actualTeacherDisplayNameSnapshot: 'Teacher' }),
      successAudit: jest.fn().mockResolvedValue(undefined),
    });
    return { sut, tx, prisma, allocation, businessConfiguration, audit };
  }

  it('confirms an ACTIVE MATCH makeup with retained original and target bundles', async () => {
    const h = makeupHarness();
    await h.sut.confirmMakeup({ makeupTeachingScheduleId: 'makeup', requestKey: 'key' }, request);
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(h.allocation.resolve).not.toHaveBeenCalled();
    expect(h.tx.curricularTeachingExecution.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'MAKEUP', makeupTeachingScheduleId: 'makeup', sourceCivilDate: new Date('2026-07-31Z'), executionCivilDate: new Date('2026-08-01Z'), actualTeacherUserId: 'teacher', ppctItemRevisionId: 'revision' }) }));
  });

  it.each(['REVERSED', 'INACTIVE'])('rejects non-ACTIVE makeup schedules and skips policy resolution', async (status) => {
    const tx = { curricularTeachingExecution: { findUnique: jest.fn().mockResolvedValue(null) }, makeupTeachingSchedule: { findUnique: jest.fn().mockResolvedValue(makeup(status)) } };
    const businessConfiguration = { resolveOperationalStartPolicy: jest.fn() };
    const sut = new TeachingExecutionsService({ $transaction: (cb: (input: typeof tx) => unknown) => cb(tx) } as never, {} as never, {} as never, {} as never, {} as never, businessConfiguration as never, { now: () => new Date() });
    await expect(sut.confirmMakeup({ makeupTeachingScheduleId: 'makeup', requestKey: 'key' }, request)).rejects.toThrow('không còn ACTIVE');
    expect(businessConfiguration.resolveOperationalStartPolicy).not.toHaveBeenCalled();
  });

  describe('MAKEUP OPERATIONAL_START guards (Checkpoint 3 Matrix)', () => {
    it('Case A: originalCivilDate < OSD, targetCivilDate >= OSD rejects CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION', async () => {
      const h = makeupHarness({
        now: new Date('2026-09-20T02:00:00.000Z'),
        makeupSchedule: makeup('ACTIVE', {
          originalCivilDate: new Date('2026-09-01Z'), // pre-op obligation
          targetCivilDate: new Date('2026-09-20Z'),   // post-op target
        }),
        policy: {
          academicYearId: 'year',
          operationalStartDate: '2026-09-15',
          policyVersionId: 'policy-version',
          validatorVersion: 'v1',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
        },
      });

      await expect(
        h.sut.confirmMakeup({ makeupTeachingScheduleId: 'makeup', requestKey: 'key' }, request),
      ).rejects.toThrow('CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION');

      expect(h.allocation.resolveInTransactionV2).not.toHaveBeenCalled();
      expect(h.tx.curricularTeachingExecution.create).not.toHaveBeenCalled();
    });

    it('Case B: originalCivilDate === OSD is allowed', async () => {
      const h = makeupHarness({
        now: new Date('2026-09-20T02:00:00.000Z'),
        makeupSchedule: makeup('ACTIVE', {
          originalCivilDate: new Date('2026-09-15Z'), // exact OSD
          targetCivilDate: new Date('2026-09-20Z'),
        }),
        policy: {
          academicYearId: 'year',
          operationalStartDate: '2026-09-15',
          policyVersionId: 'policy-version',
          validatorVersion: 'v1',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
        },
      });

      const result = await h.sut.confirmMakeup({ makeupTeachingScheduleId: 'makeup', requestKey: 'key' }, request);
      expect(result.outcome).toBe('CREATED');
    });

    it('Case C: originalCivilDate > OSD is allowed', async () => {
      const h = makeupHarness({
        now: new Date('2026-09-20T02:00:00.000Z'),
        makeupSchedule: makeup('ACTIVE', {
          originalCivilDate: new Date('2026-09-16Z'),
          targetCivilDate: new Date('2026-09-20Z'),
        }),
        policy: {
          academicYearId: 'year',
          operationalStartDate: '2026-09-15',
          policyVersionId: 'policy-version',
          validatorVersion: 'v1',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
        },
      });

      const result = await h.sut.confirmMakeup({ makeupTeachingScheduleId: 'makeup', requestKey: 'key' }, request);
      expect(result.outcome).toBe('CREATED');
    });

    it('Case D: resolver receives commandNow HCM date, NOT originalCivilDate, NOT targetCivilDate', async () => {
      const now = new Date('2026-09-25T01:00:00.000Z'); // HCM civilDate 2026-09-25
      const h = makeupHarness({
        now,
        makeupSchedule: makeup('ACTIVE', {
          originalCivilDate: new Date('2026-09-16Z'),
          targetCivilDate: new Date('2026-09-22Z'),
        }),
        policy: {
          academicYearId: 'year',
          operationalStartDate: '2026-09-15',
          policyVersionId: 'policy-version',
          validatorVersion: 'v1',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
        },
      });

      await h.sut.confirmMakeup({ makeupTeachingScheduleId: 'makeup', requestKey: 'key' }, request);

      expect(h.businessConfiguration.resolveOperationalStartPolicy).toHaveBeenCalledWith('year', '2026-09-25', h.tx);
    });

    it('Case E: missing policy propagates POLICY_NOT_CONFIGURED', async () => {
      const h = makeupHarness({
        policyError: new ConflictException('POLICY_NOT_CONFIGURED'),
      });

      await expect(
        h.sut.confirmMakeup({ makeupTeachingScheduleId: 'makeup', requestKey: 'key' }, request),
      ).rejects.toThrow('POLICY_NOT_CONFIGURED');

      expect(h.allocation.resolveInTransactionV2).not.toHaveBeenCalled();
      expect(h.tx.curricularTeachingExecution.create).not.toHaveBeenCalled();
    });

    it('Case F: idempotent replay of retained makeup returns replay without calling policy resolver', async () => {
      const h = makeupHarness();
      jest.spyOn(h.sut as unknown as { curricularReplay: (...args: unknown[]) => Promise<unknown> }, 'curricularReplay').mockResolvedValue({
        outcome: 'IDEMPOTENT_REPLAY',
        item: h.sut['curricularRecord'](curricular({ kind: 'MAKEUP' })),
      });

      const result = await h.sut.confirmMakeup({ makeupTeachingScheduleId: 'makeup', requestKey: 'key' }, request);

      expect(result.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(h.businessConfiguration.resolveOperationalStartPolicy).not.toHaveBeenCalled();
    });
  });
});

describe('TeachingExecutionsService non-curricular and reverse isolation', () => {
  it('reverseCurricular does NOT invoke resolveOperationalStartPolicy', async () => {
    const businessConfiguration = { resolveOperationalStartPolicy: jest.fn() };
    const row = curricular({ reverseRequestKey: null, reverseRequestFingerprint: null });
    const reversed = curricular({ status: 'REVERSED', reversedByUserId: 'teacher', reversedAt: new Date(), reversalReason: 'Reason' });
    const tx = {
      curricularTeachingExecution: {
        findUnique: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(reversed),
      },
    };
    const prisma = { $transaction: jest.fn((cb: (client: typeof tx) => Promise<unknown>) => cb(tx)) };
    const sut = new TeachingExecutionsService(
      prisma as never,
      {} as never,
      {} as never,
      { write: jest.fn().mockResolvedValue(undefined) } as never,
      { requireCurricular: jest.fn().mockResolvedValue('PERSONAL') } as never,
      businessConfiguration as never,
      { now: () => new Date() },
    );

    await sut.reverseCurricular(
      'execution',
      { requestKey: 'rev-key', expectedUpdatedAt: row.updatedAt.toISOString(), reversalReason: 'Reason' },
      { auth: { user: { id: 'teacher' } }, headers: {} } as never,
    );

    expect(businessConfiguration.resolveOperationalStartPolicy).not.toHaveBeenCalled();
  });

  it('confirmActivity does NOT require or call resolveOperationalStartPolicy', async () => {
    const businessConfiguration = { resolveOperationalStartPolicy: jest.fn() };
    const activity = {
      id: 'activity',
      status: 'ACTIVE',
      academicYearId: 'year',
      academicCalendarVersionId: 'calendar',
      civilDate: new Date('2026-08-01Z'),
      title: 'Activity',
      staffing: [{ id: 'staffing', scheduledTeacherUserId: 'teacher', scheduledTeacher: { profile: { displayName: 'Teacher' } } }],
      timeSlots: [{ id: 'activity-slot', timeSlotDefinitionId: 'slot', timeSlotDefinition: { endTime: new Date('1970-01-01T07:45:00Z') } }],
    };
    const tx = {
      specialActivityParticipationExecution: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'part', status: 'ACTIVE', academicYearId: 'year', executionCivilDate: new Date('2026-08-01Z'), executionAcademicCalendarVersionId: 'calendar', executionTimeSlotDefinitionId: 'slot', executionAcademicWeekId: null, executionAcademicWeekSegmentId: null, actualTeacherUserId: 'teacher', activityTitleSnapshot: 'Activity', actualTeacherDisplayNameSnapshot: 'Teacher', replacesId: null, reversedByUserId: null, reversedAt: null, reversalReason: null, createdByUserId: 'teacher', createdAt: new Date(), updatedAt: new Date() }) },
      specialActivity: { findUnique: jest.fn().mockResolvedValue(activity) },
      academicWeekSegment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    const sut = new TeachingExecutionsService(
      prisma as never,
      {} as never,
      { resolveInTransaction: jest.fn().mockResolvedValue({ findings: [] }) } as never,
      { write: jest.fn().mockResolvedValue(undefined) } as never,
      { requireActivity: jest.fn().mockResolvedValue('PERSONAL') } as never,
      businessConfiguration as never,
      { now: () => new Date('2026-08-01T08:00:00Z') },
    );

    await sut.confirmActivity(
      { specialActivityId: 'activity', specialActivityStaffingId: 'staffing', specialActivityTimeSlotId: 'activity-slot', requestKey: 'k' },
      { auth: { user: { id: 'teacher' } }, headers: {} } as never,
    );

    expect(businessConfiguration.resolveOperationalStartPolicy).not.toHaveBeenCalled();
  });
});
