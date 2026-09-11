import { ProgressDebtService } from '../../src/progress-debt/progress-debt.service';
import { TEACHING_PROGRESS_DEBT_PROFILE_V2 } from '../../src/progress-debt/progress-debt.types';

const asOf = new Date('2026-08-12T12:00:00.000Z');
const clock = { now: () => new Date('2026-08-13T00:00:00.000Z') };

const expectedCore = {
  distributionObligationKey: 'key-core',
  ppctClassAssociationId: 'association',
  ppctPlanId: 'plan',
  ppctVersionId: 'version',
  ppctItemId: 'item-core',
  ppctItemRevisionId: 'revision-core',
  sequence: 1,
  title: 'Core Lesson',
  lessonType: 'LESSON',
  component: 'CORE' as const,
};

const expectedSpec = {
  distributionObligationKey: 'key-spec',
  ppctClassAssociationId: 'association',
  ppctPlanId: 'plan',
  ppctVersionId: 'version',
  ppctItemId: 'item-spec',
  ppctItemRevisionId: 'revision-spec',
  sequence: 1,
  title: 'Specialized Lesson',
  lessonType: 'LESSON',
  component: 'SPECIALIZED_STUDY' as const,
};

function allocationCore(overrides: Record<string, unknown> = {}) {
  const occurrence = {
    occurrenceKey: 'NORMAL:entry1:2026-08-10',
    family: 'NORMAL_TIMETABLE_OPPORTUNITY',
    civilDate: '2026-08-10',
    academicYearId: 'year',
    academicCalendarVersionId: 'calendar',
    timetableVersionId: 'timetable',
    timetableEntryId: 'entry1',
    timeSlot: { id: 'slot1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
    schoolClass: { id: 'class', gradeLevel: 10 },
    subjectId: 'subject',
    teachingAssignmentId: 'assignment',
    responsibleTeacherUserId: 'teacher',
    ppctBinding: { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'version', ppctVersionStatus: 'PUBLISHED' },
    effectiveKind: 'BASE_TIMETABLE',
    interruptionIds: [],
    exceptionIds: [],
    suppressingSpecialActivityIds: [],
    disposition: null,
    ...overrides,
  };
  return {
    occurrence,
    allocationEffect: 'CONSUMES_NEXT_ITEM',
    allocationReason: 'OK',
    allocationStatus: 'ALLOCATED',
    expectedPpctItem: expectedCore,
    plannedComponent: 'CORE' as const,
  };
}

function allocationSpec(overrides: Record<string, unknown> = {}) {
  const occurrence = {
    occurrenceKey: 'NORMAL:entry2:2026-08-11',
    family: 'NORMAL_TIMETABLE_OPPORTUNITY',
    civilDate: '2026-08-11',
    academicYearId: 'year',
    academicCalendarVersionId: 'calendar',
    timetableVersionId: 'timetable',
    timetableEntryId: 'entry2',
    timeSlot: { id: 'slot2', weekday: 'TUESDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
    schoolClass: { id: 'class', gradeLevel: 10 },
    subjectId: 'subject',
    teachingAssignmentId: 'assignment',
    responsibleTeacherUserId: 'teacher',
    ppctBinding: { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'version', ppctVersionStatus: 'PUBLISHED' },
    effectiveKind: 'BASE_TIMETABLE',
    interruptionIds: [],
    exceptionIds: [],
    suppressingSpecialActivityIds: [],
    disposition: null,
    ...overrides,
  };
  return {
    occurrence,
    allocationEffect: 'CONSUMES_NEXT_ITEM',
    allocationReason: 'OK',
    allocationStatus: 'ALLOCATED',
    expectedPpctItem: expectedSpec,
    plannedComponent: 'SPECIALIZED_STUDY' as const,
  };
}

function executionCore(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-core',
    kind: 'NORMAL',
    status: 'ACTIVE',
    academicYearId: 'year',
    schoolClassId: 'class',
    subjectId: 'subject',
    sourceNormalOccurrenceKey: 'NORMAL:entry1:2026-08-10',
    originalTimetableVersionId: 'timetable',
    originalTimetableEntryId: 'entry1',
    sourceCivilDate: new Date('2026-08-10T00:00:00.000Z'),
    sourceAcademicCalendarVersionId: 'calendar',
    sourceTimeSlotDefinitionId: 'slot1',
    originalTeachingAssignmentId: 'assignment',
    responsibleTeacherUserId: 'teacher',
    ppctClassAssociationId: 'association',
    ppctPlanId: 'plan',
    ppctVersionId: 'version',
    ppctItemId: 'item-core',
    ppctItemRevisionId: 'revision-core',
    operationalLessonDispositionId: null,
    operationalDispositionType: null,
    makeupTeachingScheduleId: null,
    executionCivilDate: new Date('2026-08-10T00:00:00.000Z'),
    executionAcademicCalendarVersionId: 'calendar',
    executionTimeSlotDefinitionId: 'slot1',
    actualTeacherUserId: 'teacher',
    executionTimeSlot: { endTime: new Date('1970-01-01T07:45:00.000Z') },
    ...overrides,
  };
}

function executionSpec(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-spec',
    kind: 'NORMAL',
    status: 'ACTIVE',
    academicYearId: 'year',
    schoolClassId: 'class',
    subjectId: 'subject',
    sourceNormalOccurrenceKey: 'NORMAL:entry2:2026-08-11',
    originalTimetableVersionId: 'timetable',
    originalTimetableEntryId: 'entry2',
    sourceCivilDate: new Date('2026-08-11T00:00:00.000Z'),
    sourceAcademicCalendarVersionId: 'calendar',
    sourceTimeSlotDefinitionId: 'slot2',
    originalTeachingAssignmentId: 'assignment',
    responsibleTeacherUserId: 'teacher',
    ppctClassAssociationId: 'association',
    ppctPlanId: 'plan',
    ppctVersionId: 'version',
    ppctItemId: 'item-spec',
    ppctItemRevisionId: 'revision-spec',
    operationalLessonDispositionId: null,
    operationalDispositionType: null,
    makeupTeachingScheduleId: null,
    executionCivilDate: new Date('2026-08-11T00:00:00.000Z'),
    executionAcademicCalendarVersionId: 'calendar',
    executionTimeSlotDefinitionId: 'slot2',
    actualTeacherUserId: 'teacher',
    executionTimeSlot: { endTime: new Date('1970-01-01T07:45:00.000Z') },
    ...overrides,
  };
}

function harness(
  normalAllocations: object[] = [allocationCore()],
  executions: object[] = [],
  schedules: object[] = [],
  makeupSourceMatches: object[] = [],
  findings: object[] = [],
  status: 'PASS' | 'BLOCKED' = 'PASS',
) {
  const tx = {
    curricularTeachingExecution: { findMany: jest.fn().mockResolvedValue(executions) },
    makeupTeachingSchedule: { findMany: jest.fn().mockResolvedValue(schedules) },
  };
  const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
  const resolver = {
    resolveInTransactionV2: jest.fn().mockResolvedValue({
      status,
      normalAllocations,
      makeupSourceMatches,
      findings,
    }),
  };
  const service = new ProgressDebtService(prisma as never, resolver as never, clock);
  return { tx, prisma, resolver, service };
}

const input = () => ({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', asOfInstant: asOf });

describe('ProgressDebtService V2 Unit Tests', () => {
  it('1. CORE direct obligation -> CORE progress item with exact provenance', async () => {
    const h = harness([allocationCore()], [executionCore()]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('PASS');
    expect(result.profile).toBe(TEACHING_PROGRESS_DEBT_PROFILE_V2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.component).toBe('CORE');
    expect(result.items[0]!.classification).toBe('COMPLETED');
    expect(result.counts?.completedCount).toBe(1);
  });

  it('2. SPECIALIZED_STUDY direct obligation -> specialized progress item with exact provenance', async () => {
    const h = harness([allocationSpec()], [executionSpec()]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('PASS');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.component).toBe('SPECIALIZED_STUDY');
    expect(result.items[0]!.classification).toBe('COMPLETED');
    expect(result.counts?.completedCount).toBe(1);
  });

  it('3. CORE_ONLY produces no specialized debt or obligation', async () => {
    const h = harness([allocationCore()]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('PASS');
    expect(result.items.every((item) => item.component === 'CORE')).toBe(true);
    expect(result.counts?.openDebtCount).toBe(0);
  });

  it('4. Absence of execution alone does not create proven debt (creates unconfirmed gap)', async () => {
    const h = harness([allocationCore()]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('PASS');
    expect(result.items[0]!.classification).toBe('UNCONFIRMED_COMPLETION_GAP');
    expect(result.counts?.openDebtCount).toBe(0);
    expect(result.counts?.unconfirmedGapCount).toBe(1);
  });

  it('5. ABSENCE_NO_REPLACEMENT operational disposition creates proven debt and late', async () => {
    const alloc = allocationCore({
      effectiveKind: 'OPERATIONAL_DISPOSITION',
      disposition: { id: 'disp1', dispositionType: 'ABSENCE_NO_REPLACEMENT', assignedTeacherUserId: null },
    });
    const h = harness([alloc]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('PASS');
    expect(result.items[0]!.classification).toBe('PROVEN_OPEN_DEBT');
    expect(result.counts?.openDebtCount).toBe(1);
    expect(result.counts?.lateCount).toBe(1);
  });

  it('6. DIFFERENT_SUBJECT_SUPERVISION creates proven debt and late', async () => {
    const alloc = allocationSpec({
      effectiveKind: 'OPERATIONAL_DISPOSITION',
      disposition: { id: 'disp2', dispositionType: 'DIFFERENT_SUBJECT_SUPERVISION', assignedTeacherUserId: 'other' },
    });
    const h = harness([alloc]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('PASS');
    expect(result.items[0]!.component).toBe('SPECIALIZED_STUDY');
    expect(result.items[0]!.classification).toBe('PROVEN_OPEN_DEBT');
    expect(result.counts?.openDebtCount).toBe(1);
    expect(result.counts?.lateCount).toBe(1);
  });

  it('7. BASE_TIMETABLE without execution is classified as unconfirmed gap', async () => {
    const h = harness([allocationCore()]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.items[0]!.classification).toBe('UNCONFIRMED_COMPLETION_GAP');
  });

  it('8. SAME_SUBJECT_SUBSTITUTION without execution is classified as unconfirmed gap', async () => {
    const alloc = allocationCore({
      effectiveKind: 'OPERATIONAL_DISPOSITION',
      disposition: { id: 'disp-sub', dispositionType: 'SAME_SUBJECT_SUBSTITUTION', assignedTeacherUserId: 'sub-teacher' },
    });
    const h = harness([alloc]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.items[0]!.classification).toBe('UNCONFIRMED_COMPLETION_GAP');
  });

  it('9. Exact valid ACTIVE execution fulfills obligation', async () => {
    const h = harness([allocationCore()], [executionCore()]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.items[0]!.classification).toBe('COMPLETED');
    expect(result.counts?.completedCount).toBe(1);
  });

  it('10. Execution without corresponding direct obligation does not create obligation', async () => {
    // Allocation list is empty (e.g. slot not ended or no direct obligation)
    const h = harness([], [executionCore()]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('PASS');
    expect(result.items).toHaveLength(0);
    expect(result.counts?.distributedElapsedCount).toBe(0);
  });

  it('11. MAKEUP fulfills exact original obligation', async () => {
    const match = {
      makeupTeachingScheduleId: 'sched-1',
      sourceNormalOccurrenceKey: 'NORMAL:entry1:2026-08-10',
      status: 'MATCH',
      expectedPpctItem: expectedCore,
    };
    const schedule = {
      id: 'sched-1',
      status: 'ACTIVE',
      academicYearId: 'year',
      schoolClassId: 'class',
      subjectId: 'subject',
      originalTimetableVersionId: 'timetable',
      originalTimetableEntryId: 'entry1',
      originalCivilDate: new Date('2026-08-10T00:00:00.000Z'),
      originalAcademicCalendarVersionId: 'calendar',
      originalTimeSlotDefinitionId: 'slot1',
      originalTeachingAssignmentId: 'assignment',
      responsibleTeacherUserId: 'teacher',
      ppctClassAssociationId: 'association',
      ppctPlanId: 'plan',
      ppctVersionId: 'version',
      ppctItemId: 'item-core',
      targetCivilDate: new Date('2026-08-11T00:00:00.000Z'),
      targetAcademicCalendarVersionId: 'target-cal',
      targetTimeSlotDefinitionId: 'target-slot',
      scheduledTeacherUserId: 'makeup-teacher',
    };
    const exec = executionCore({
      kind: 'MAKEUP',
      makeupTeachingScheduleId: 'sched-1',
      executionCivilDate: new Date('2026-08-11T00:00:00.000Z'),
      executionAcademicCalendarVersionId: 'target-cal',
      executionTimeSlotDefinitionId: 'target-slot',
      actualTeacherUserId: 'makeup-teacher',
    });
    const alloc = allocationCore({
      effectiveKind: 'OPERATIONAL_DISPOSITION',
      disposition: { id: 'd1', dispositionType: 'ABSENCE_NO_REPLACEMENT', assignedTeacherUserId: null },
    });
    const h = harness([alloc], [exec], [schedule], [match]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('PASS');
    expect(result.items[0]!.classification).toBe('COMPLETED');
    expect(result.items[0]!.fulfillmentKind).toBe('MAKEUP');
    expect(result.counts?.completedCount).toBe(1);
    expect(result.counts?.openDebtCount).toBe(0);
  });

  it('12. MAKEUP does not consume new PPCT item or advance cursor', async () => {
    // With 1 direct obligation fulfilled by MAKEUP, count remains exactly 1
    const match = {
      makeupTeachingScheduleId: 'sched-1',
      sourceNormalOccurrenceKey: 'NORMAL:entry1:2026-08-10',
      status: 'MATCH',
      expectedPpctItem: expectedCore,
    };
    const schedule = {
      id: 'sched-1',
      status: 'ACTIVE',
      academicYearId: 'year',
      schoolClassId: 'class',
      subjectId: 'subject',
      originalTimetableVersionId: 'timetable',
      originalTimetableEntryId: 'entry1',
      originalCivilDate: new Date('2026-08-10T00:00:00.000Z'),
      originalAcademicCalendarVersionId: 'calendar',
      originalTimeSlotDefinitionId: 'slot1',
      originalTeachingAssignmentId: 'assignment',
      responsibleTeacherUserId: 'teacher',
      ppctClassAssociationId: 'association',
      ppctPlanId: 'plan',
      ppctVersionId: 'version',
      ppctItemId: 'item-core',
      targetCivilDate: new Date('2026-08-11T00:00:00.000Z'),
      targetAcademicCalendarVersionId: 'target-cal',
      targetTimeSlotDefinitionId: 'target-slot',
      scheduledTeacherUserId: 'makeup-teacher',
    };
    const exec = executionCore({
      kind: 'MAKEUP',
      makeupTeachingScheduleId: 'sched-1',
      executionCivilDate: new Date('2026-08-11T00:00:00.000Z'),
      executionAcademicCalendarVersionId: 'target-cal',
      executionTimeSlotDefinitionId: 'target-slot',
      actualTeacherUserId: 'makeup-teacher',
    });
    const alloc = allocationCore({
      effectiveKind: 'OPERATIONAL_DISPOSITION',
      disposition: { id: 'd1', dispositionType: 'ABSENCE_NO_REPLACEMENT', assignedTeacherUserId: null },
    });
    const h = harness([alloc], [exec], [schedule], [match]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.counts?.distributedElapsedCount).toBe(1);
    expect(result.counts?.completedCount).toBe(1);
  });

  it('13. MAKEUP source mismatch fails closed with RECONCILIATION_REQUIRED', async () => {
    const match = {
      makeupTeachingScheduleId: 'sched-1',
      sourceNormalOccurrenceKey: 'NORMAL:different-entry:2026-08-10',
      status: 'MATCH',
      expectedPpctItem: expectedCore,
    };
    const schedule = {
      id: 'sched-1',
      status: 'ACTIVE',
      academicYearId: 'year',
      schoolClassId: 'class',
      subjectId: 'subject',
      originalTimetableVersionId: 'timetable',
      originalTimetableEntryId: 'entry1',
      originalCivilDate: new Date('2026-08-10T00:00:00.000Z'),
      originalAcademicCalendarVersionId: 'calendar',
      originalTimeSlotDefinitionId: 'slot1',
      originalTeachingAssignmentId: 'assignment',
      responsibleTeacherUserId: 'teacher',
      ppctClassAssociationId: 'association',
      ppctPlanId: 'plan',
      ppctVersionId: 'version',
      ppctItemId: 'item-core',
      targetCivilDate: new Date('2026-08-11T00:00:00.000Z'),
      targetAcademicCalendarVersionId: 'target-cal',
      targetTimeSlotDefinitionId: 'target-slot',
      scheduledTeacherUserId: 'makeup-teacher',
    };
    const exec = executionCore({
      kind: 'MAKEUP',
      makeupTeachingScheduleId: 'sched-1',
      executionCivilDate: new Date('2026-08-11T00:00:00.000Z'),
      executionAcademicCalendarVersionId: 'target-cal',
      executionTimeSlotDefinitionId: 'target-slot',
      actualTeacherUserId: 'makeup-teacher',
    });
    const h = harness([allocationCore()], [exec], [schedule], [match]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('BLOCKED');
    expect(result.findings[0]!.code).toBe('RECONCILIATION_REQUIRED');
  });

  it('14. MAKEUP cross-component mismatch fails closed with RECONCILIATION_REQUIRED', async () => {
    // Schedule and match have SPECIALIZED_STUDY component while direct obligation is CORE
    const mismatchPpct = { ...expectedCore, component: 'SPECIALIZED_STUDY' as const };
    const match = {
      makeupTeachingScheduleId: 'sched-1',
      sourceNormalOccurrenceKey: 'NORMAL:entry1:2026-08-10',
      status: 'MATCH',
      expectedPpctItem: mismatchPpct,
    };
    const schedule = {
      id: 'sched-1',
      status: 'ACTIVE',
      academicYearId: 'year',
      schoolClassId: 'class',
      subjectId: 'subject',
      originalTimetableVersionId: 'timetable',
      originalTimetableEntryId: 'entry1',
      originalCivilDate: new Date('2026-08-10T00:00:00.000Z'),
      originalAcademicCalendarVersionId: 'calendar',
      originalTimeSlotDefinitionId: 'slot1',
      originalTeachingAssignmentId: 'assignment',
      responsibleTeacherUserId: 'teacher',
      ppctClassAssociationId: 'association',
      ppctPlanId: 'plan',
      ppctVersionId: 'version',
      ppctItemId: 'item-core',
      targetCivilDate: new Date('2026-08-11T00:00:00.000Z'),
      targetAcademicCalendarVersionId: 'target-cal',
      targetTimeSlotDefinitionId: 'target-slot',
      scheduledTeacherUserId: 'makeup-teacher',
    };
    const exec = executionCore({
      kind: 'MAKEUP',
      makeupTeachingScheduleId: 'sched-1',
      executionCivilDate: new Date('2026-08-11T00:00:00.000Z'),
      executionAcademicCalendarVersionId: 'target-cal',
      executionTimeSlotDefinitionId: 'target-slot',
      actualTeacherUserId: 'makeup-teacher',
    });
    const h = harness([allocationCore()], [exec], [schedule], [match]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('BLOCKED');
    expect(result.findings[0]!.code).toBe('RECONCILIATION_REQUIRED');
  });

  it('15. One obligation claimed by multiple ended ACTIVE executions fails closed with ACTIVE_FULFILLMENT_AMBIGUOUS', async () => {
    const h = harness([allocationCore()], [executionCore(), executionCore({ id: 'exec-core-dup' })]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('BLOCKED');
    expect(result.findings[0]!.code).toBe('ACTIVE_FULFILLMENT_AMBIGUOUS');
  });

  it('16. CORE and SPECIALIZED_STUDY obligations in same class-subject preserve independent components', async () => {
    const h = harness([allocationCore(), allocationSpec()], [executionCore(), executionSpec()]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('PASS');
    expect(result.items).toHaveLength(2);
    const coreItem = result.items.find((i) => i.component === 'CORE');
    const specItem = result.items.find((i) => i.component === 'SPECIALIZED_STUDY');
    expect(coreItem).toBeDefined();
    expect(specItem).toBeDefined();
    expect(coreItem!.classification).toBe('COMPLETED');
    expect(specItem!.classification).toBe('COMPLETED');
  });

  it('17. Aggregate counts sum without double counting', async () => {
    const alloc1 = allocationCore();
    const alloc2 = allocationSpec({
      effectiveKind: 'OPERATIONAL_DISPOSITION',
      disposition: { id: 'd2', dispositionType: 'ABSENCE_NO_REPLACEMENT', assignedTeacherUserId: null },
    });
    const h = harness([alloc1, alloc2], [executionCore()]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('PASS');
    expect(result.counts?.distributedElapsedCount).toBe(2);
    expect(result.counts?.completedCount).toBe(1);
    expect(result.counts?.openDebtCount).toBe(1);
    expect(result.counts?.unconfirmedGapCount).toBe(0);
    expect(result.counts?.distributedElapsedCount).toBe(
      result.counts!.completedCount + result.counts!.openDebtCount + result.counts!.unconfirmedGapCount,
    );
  });

  it('18. Direct allocation with planned component mismatching PPCT item component fails closed', async () => {
    const corruptedAlloc = {
      ...allocationCore(),
      plannedComponent: 'SPECIALIZED_STUDY' as const, // planned as specialized but expected item is CORE
    };
    const h = harness([corruptedAlloc]);
    const result = await h.service.resolveInTransactionV2(h.tx as never, input());
    expect(result.status).toBe('BLOCKED');
    expect(result.findings[0]!.code).toBe('RECONCILIATION_REQUIRED');
  });
});
