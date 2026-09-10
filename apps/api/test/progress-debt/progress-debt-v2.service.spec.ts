import { PpctCurricularComponent } from '@prisma/client';
import { ProgressDebtService } from '../../src/progress-debt/progress-debt.service';

const asOf = new Date('2026-09-18T12:00:00.000Z');
const clock = { now: () => new Date('2026-09-19T00:00:00.000Z') };

// Keep civilDate explicit because progress/debt evaluates obligation chronology from the occurrence itself.
function normalAllocation(component: PpctCurricularComponent, occurrenceKey: string, civilDate: string, itemId: string) {
  return {
    occurrence: {
      occurrenceKey,
      family: 'NORMAL_TIMETABLE_OPPORTUNITY',
      civilDate,
      academicYearId: 'year',
      academicCalendarVersionId: 'calendar',
      timetableVersionId: 'timetable',
      timetableEntryId: occurrenceKey.includes('specialized') ? 'specialized-entry' : 'core-entry',
      timeSlot: { id: `slot-${itemId}`, weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
      schoolClass: { id: 'class', gradeLevel: 10 },
      subjectId: 'subject',
      teachingAssignmentId: 'assignment',
      responsibleTeacherUserId: 'teacher',
      ppctBinding: { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'version', ppctVersionStatus: 'PUBLISHED' },
      effectiveKind: 'BASE_TIMETABLE',
      interruptionIds: [], exceptionIds: [], suppressingSpecialActivityIds: [], disposition: null,
    },
    plannedComponent: component,
    allocationEffect: 'CONSUMES_NEXT_ITEM',
    allocationReason: 'BASE_TIMETABLE',
    allocationStatus: 'ALLOCATED',
    expectedPpctItem: {
      distributionObligationKey: `key-${itemId}`,
      ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'version',
      ppctItemId: itemId, ppctItemRevisionId: `revision-${itemId}`, component,
      sequence: 1, title: itemId, lessonType: 'LESSON',
    },
  };
}

function harness(normalAllocations: ReturnType<typeof normalAllocation>[]) {
  const tx = {
    curricularTeachingExecution: { findMany: jest.fn().mockResolvedValue([]) },
    makeupTeachingSchedule: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
  const allocation = {
    resolveInTransaction: jest.fn().mockResolvedValue({ status: 'PASS', normalAllocations, makeupSourceMatches: [], findings: [] }),
  };
  return { service: new ProgressDebtService(prisma as never, allocation as never, clock), tx, allocation };
}

describe('P2-003 TEACHING_PROGRESS_DEBT_V2', () => {
  it('carries exact component provenance while preserving combined count invariant', async () => {
    const h = harness([
      normalAllocation(PpctCurricularComponent.CORE, 'NORMAL:core:2026-09-14', '2026-09-14', 'C1'),
      normalAllocation(PpctCurricularComponent.SPECIALIZED_STUDY, 'NORMAL:specialized:2026-09-18', '2026-09-18', 'S1'),
    ]);
    const result = await h.service.resolveInTransaction(h.tx as never, { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', asOfInstant: asOf });
    expect(result.profile).toBe('TEACHING_PROGRESS_DEBT_V2');
    expect(result.status).toBe('PASS');
    expect(result.items.map((item) => item.component)).toEqual([PpctCurricularComponent.CORE, PpctCurricularComponent.SPECIALIZED_STUDY]);
    expect(result.counts).toEqual({ distributedElapsedCount: 2, completedCount: 0, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 2 });
  });

  it('does not synthesize specialized debt when upstream CORE_ONLY allocation exposes only CORE obligations', async () => {
    const h = harness([normalAllocation(PpctCurricularComponent.CORE, 'NORMAL:core:2026-09-14', '2026-09-14', 'C1')]);
    const result = await h.service.resolveInTransaction(h.tx as never, { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', asOfInstant: asOf });
    expect(result.status).toBe('PASS');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.component).toBe(PpctCurricularComponent.CORE);
    expect(result.items.some((item) => item.component === PpctCurricularComponent.SPECIALIZED_STUDY)).toBe(false);
  });
});
