import { PpctClassCurricularProfile, PpctCurricularComponent } from '@prisma/client';
import { PpctOccurrenceAllocationV2Service } from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation-v2.service';
import { NormalStructuralOccurrence } from '../../src/resolved-occurrences/resolved-occurrence.types';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

type CivilDate = `${number}-${number}-${number}`;

function normal(
  civilDate: CivilDate,
  weekday: NormalStructuralOccurrence['timeSlot']['weekday'],
  entryId: string,
  effectiveKind: NormalStructuralOccurrence['effectiveKind'] = 'BASE_TIMETABLE',
): NormalStructuralOccurrence {
  return {
    occurrenceKey: `NORMAL:${entryId}:${civilDate}`,
    family: 'NORMAL_TIMETABLE_OPPORTUNITY',
    civilDate,
    academicYearId: 'year',
    academicCalendarVersionId: 'calendar',
    timetableVersionId: 'timetable',
    timetableEntryId: entryId,
    timeSlot: { id: `slot-${entryId}`, weekday, session: 'MORNING', startTime: entryId === 'fri' ? '09:00:00' : '07:00:00', endTime: entryId === 'fri' ? '09:45:00' : '07:45:00' },
    schoolClass: { id: 'class', gradeLevel: 10 },
    subjectId: 'subject',
    teachingAssignmentId: 'assignment',
    responsibleTeacherUserId: 'teacher',
    ppctBinding: { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'version', ppctVersionStatus: 'PUBLISHED' },
    effectiveKind,
    interruptionIds: [], exceptionIds: [], suppressingSpecialActivityIds: [], disposition: null,
  };
}

function harness(options?: {
  profile?: PpctClassCurricularProfile;
  through?: CivilDate;
  suppressFirstFriday?: boolean;
  specializedCount?: number;
  onlyMonday?: boolean;
  segmentWeeks?: Array<{ id: string; start: CivilDate; end: CivilDate }>;
}) {
  const profile = options?.profile ?? PpctClassCurricularProfile.CORE_PLUS_SPECIALIZED_STUDY;
  const onlyMonday = options?.onlyMonday ?? false;
  const segmentWeeks = options?.segmentWeeks ?? [{ id: 'w1', start: '2026-09-07', end: '2026-09-13' }];
  const entries = [
    { weekday: 'MONDAY', timetableVersion: { effectiveFrom: date('2026-09-07'), effectiveUntil: null } },
    ...(!onlyMonday ? [{ weekday: 'FRIDAY', timetableVersion: { effectiveFrom: date('2026-09-07'), effectiveUntil: null } }] : []),
  ];
  const segments = segmentWeeks.map((week, index) => ({ id: `seg-${week.id}`, academicWeekId: week.id, calendarVersionId: 'calendar', segmentOrder: index + 1, startDate: date(week.start), endDate: date(week.end) }));
  const core = ['C1', 'C2', 'C3'].map((title, index) => ({ id: `r-${title}`, ppctVersionId: 'version', ppctPlanId: 'plan', ppctItemId: title, component: PpctCurricularComponent.CORE, sequence: index + 1, title, lessonType: 'LESSON' }));
  const specialized = Array.from({ length: options?.specializedCount ?? 2 }, (_, index) => ({ id: `r-S${index + 1}`, ppctVersionId: 'version', ppctPlanId: 'plan', ppctItemId: `S${index + 1}`, component: PpctCurricularComponent.SPECIALIZED_STUDY, sequence: index + 1, title: `S${index + 1}`, lessonType: 'LESSON' }));
  const tx = {
    timetableEntry: { findMany: jest.fn().mockResolvedValue(entries) },
    academicWeekSegment: { findMany: jest.fn().mockResolvedValue(segments) },
    ppctClassAssociation: { findMany: jest.fn().mockResolvedValue([{ id: 'association', curricularProfile: profile, effectiveFrom: date('2026-09-07'), effectiveUntil: null }]) },
    ppctVersion: { findMany: jest.fn().mockResolvedValue([{ id: 'version', ppctPlanId: 'plan', versionNumber: 1, status: 'PUBLISHED', itemRevisions: [...core, ...specialized] }]) },
    ppctItemLineage: { findMany: jest.fn().mockResolvedValue([]) },
    makeupTeachingSchedule: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
  const structural = {
    resolveInTransaction: jest.fn(async (_tx: unknown, input: { civilDate: CivilDate }) => {
      const day = new Date(`${input.civilDate}T00:00:00Z`).getUTCDay();
      const isFriday = day === 5;
      const occurrence = normal(input.civilDate, isFriday ? 'FRIDAY' : 'MONDAY', isFriday ? 'fri' : 'mon', options?.suppressFirstFriday && input.civilDate === '2026-09-11' ? 'SPECIAL_ACTIVITY_SUPPRESSED' : 'BASE_TIMETABLE');
      return { normalOccurrences: [occurrence], findings: [] };
    }),
  };
  return { tx, prisma, structural, service: new PpctOccurrenceAllocationV2Service(prisma as never, structural as never) };
}

describe('PpctOccurrenceAllocationV2Service', () => {
  it('keeps CORE_ONLY routing entirely in CORE', async () => {
    const h = harness({ profile: PpctClassCurricularProfile.CORE_ONLY });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-09-11' });
    expect(result.status).toBe('PASS');
    expect(result.normalAllocations.map((row) => row.plannedComponent)).toEqual([PpctCurricularComponent.CORE, PpctCurricularComponent.CORE]);
    expect(result.normalAllocations.map((row) => row.expectedPpctItem?.component)).toEqual([PpctCurricularComponent.CORE, PpctCurricularComponent.CORE]);
  });

  it('routes the last exact weekly member to SPECIALIZED_STUDY', async () => {
    const h = harness();
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-09-11' });
    expect(result.status).toBe('PASS');
    expect(result.normalAllocations.map((row) => [row.occurrence.civilDate, row.plannedComponent, row.expectedPpctItem?.title])).toEqual([
      ['2026-09-07', PpctCurricularComponent.CORE, 'C1'],
      ['2026-09-11', PpctCurricularComponent.SPECIALIZED_STUDY, 'S1'],
    ]);
  });

  it('keeps a suppressed weekly-last opportunity specialized without promoting CORE', async () => {
    const h = harness({ suppressFirstFriday: true });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-09-11' });
    expect(result.status).toBe('PASS');
    expect(result.normalAllocations[0]).toMatchObject({ plannedComponent: PpctCurricularComponent.CORE, allocationStatus: 'ALLOCATED', expectedPpctItem: { title: 'C1' } });
    expect(result.normalAllocations[1]).toMatchObject({ plannedComponent: PpctCurricularComponent.SPECIALIZED_STUDY, allocationStatus: 'NOT_CONSUMED', expectedPpctItem: null });
  });

  it('fails closed when a specialized-enabled exact week has one routing member', async () => {
    const h = harness({ onlyMonday: true });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-09-07' });
    expect(result.status).toBe('BLOCKED');
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PPCT_COMPONENT_WEEK_CAPACITY_INVALID' })]));
  });

  it('progresses CORE and SPECIALIZED_STUDY independently across weeks', async () => {
    const h = harness({ suppressFirstFriday: true, segmentWeeks: [
      { id: 'w1', start: '2026-09-07', end: '2026-09-13' },
      { id: 'w2', start: '2026-09-14', end: '2026-09-20' },
    ] });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-09-18' });
    expect(result.status).toBe('PASS');
    expect(result.normalAllocations.map((row) => row.expectedPpctItem?.title ?? null)).toEqual(['C1', null, 'C2', 'S1']);
    expect(result.normalAllocations.map((row) => row.plannedComponent)).toEqual([
      PpctCurricularComponent.CORE,
      PpctCurricularComponent.SPECIALIZED_STUDY,
      PpctCurricularComponent.CORE,
      PpctCurricularComponent.SPECIALIZED_STUDY,
    ]);
  });

  it('blocks specialized exhaustion with component context and never borrows CORE', async () => {
    const h = harness({ specializedCount: 1, segmentWeeks: [
      { id: 'w1', start: '2026-09-07', end: '2026-09-13' },
      { id: 'w2', start: '2026-09-14', end: '2026-09-20' },
    ] });
    const result = await h.service.resolve({ academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', throughCivilDate: '2026-09-18' });
    expect(result.status).toBe('BLOCKED');
    expect(result.normalAllocations[2]).toMatchObject({ plannedComponent: PpctCurricularComponent.CORE, expectedPpctItem: { title: 'C2' } });
    expect(result.normalAllocations[3]).toMatchObject({ plannedComponent: PpctCurricularComponent.SPECIALIZED_STUDY, allocationStatus: 'BLOCKED', expectedPpctItem: null });
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PPCT_ALLOCATION_EXHAUSTED', component: PpctCurricularComponent.SPECIALIZED_STUDY })]));
  });
});
