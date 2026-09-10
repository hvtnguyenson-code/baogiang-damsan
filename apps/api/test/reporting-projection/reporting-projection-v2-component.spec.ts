import { PpctCurricularComponent } from '@prisma/client';
import { ReportingProjectionService } from '../../src/reporting-projection/reporting-projection.service';

const asOf = new Date('2026-09-18T12:00:00.000Z');

function progressItem(component: PpctCurricularComponent, occurrenceKey: string, date: string, suffix: string) {
  return {
    classification: 'UNCONFIRMED_COMPLETION_GAP' as const,
    sourceNormalOccurrenceKey: occurrenceKey,
    originalTimetableVersionId: 'timetable',
    originalTimetableEntryId: `entry-${suffix}`,
    sourceCivilDate: date as `${number}-${number}-${number}`,
    sourceAcademicCalendarVersionId: 'calendar',
    sourceTimeSlotDefinitionId: `slot-${suffix}`,
    originalTeachingAssignmentId: 'assignment',
    responsibleTeacherUserId: 'teacher',
    ppctClassAssociationId: 'association',
    ppctPlanId: 'plan',
    ppctVersionId: 'version',
    ppctItemId: `item-${suffix}`,
    ppctItemRevisionId: `revision-${suffix}`,
    component,
    operationalLessonDispositionId: null,
    operationalDispositionType: null,
    fulfillmentExecutionId: null,
    fulfillmentKind: null,
    makeupTeachingScheduleId: null,
    executionCivilDate: null,
    executionAcademicCalendarVersionId: null,
    executionTimeSlotDefinitionId: null,
    actualTeacherUserId: null,
  };
}

describe('P2-003 ordinary reporting combines curricular components', () => {
  it('keeps one class-subject root and counts CORE + SPECIALIZED_STUDY exactly once', async () => {
    const tx = {
      academicCalendarVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'calendar', startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2027-05-31T00:00:00Z') }) },
      schoolClass: { findMany: jest.fn().mockResolvedValue([{ id: 'class', academicYearId: 'year' }]) },
      timeSlotDefinition: { findMany: jest.fn().mockResolvedValue([
        { id: 'slot-c', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z') },
        { id: 'slot-s', startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T08:45:00Z') },
      ]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const progressDebt = { resolveInTransaction: jest.fn().mockResolvedValue({
      profile: 'TEACHING_PROGRESS_DEBT_V2', status: 'PASS', findings: [],
      items: [
        progressItem(PpctCurricularComponent.CORE, 'NORMAL:c:2026-09-14', '2026-09-14', 'c'),
        progressItem(PpctCurricularComponent.SPECIALIZED_STUDY, 'NORMAL:s:2026-09-18', '2026-09-18', 's'),
      ],
      counts: { distributedElapsedCount: 2, completedCount: 0, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 2 },
    }) };
    const service = new ReportingProjectionService(prisma as never, progressDebt as never);
    const result = await service.resolveInTransaction(tx as never, {
      academicYearId: 'year', roots: [{ schoolClassId: 'class', subjectId: 'subject' }],
      fromCivilDate: '2026-09-01', toCivilDate: '2026-09-30', asOfInstant: asOf,
    });
    expect(result.profile).toBe('TEACHING_REPORTING_PROJECTION_V1');
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]?.details.map((detail) => detail.component)).toEqual([
      PpctCurricularComponent.CORE,
      PpctCurricularComponent.SPECIALIZED_STUDY,
    ]);
    expect(result.roots[0]?.counts).toEqual({ distributedElapsedCount: 2, completedCount: 0, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 2 });
    expect(result.counts?.distributedElapsedCount).toBe(2);
  });
});
