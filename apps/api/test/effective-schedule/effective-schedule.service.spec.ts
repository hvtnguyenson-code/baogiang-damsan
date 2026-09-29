import { EffectiveScheduleService } from '../../src/effective-schedule/effective-schedule.service';
import { ResolvedLessonOccurrencesService } from '../../src/resolved-occurrences/resolved-occurrences.service';
import {
  ResolvedLessonOccurrencesResult,
  RESOLVED_LESSON_OCCURRENCE_PROFILE,
} from '../../src/resolved-occurrences/resolved-occurrence.types';

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const defaultUser = {
    id: 'user-1',
    status: 'ACTIVE',
    profile: { displayName: 'Nguyễn Văn A', staffCode: 'GV01', isTeachingStaff: true },
  };
  const peerUser = {
    id: 'user-2',
    status: 'ACTIVE',
    profile: { displayName: 'Trần Thị B', staffCode: 'GV02', isTeachingStaff: true },
  };
  const week = {
    id: 'week-1',
    displayLabel: 'Tuần 1',
    officialWeekNumber: 1,
    segments: [
      { startDate: new Date('2026-09-07T00:00:00Z'), endDate: new Date('2026-09-12T00:00:00Z'), segmentOrder: 1 },
    ],
    calendarVersion: {
      id: 'cal-1',
      academicYearId: 'year-1',
      isActive: true,
      teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
    },
  };
  const slotDef = {
    id: 'slot-1',
    academicYearId: 'year-1',
    weekday: 'MONDAY',
    session: 'MORNING',
    ordinal: 1,
    displayLabel: 'Tiết 1',
    startTime: new Date('1970-01-01T07:00:00Z'),
    endTime: new Date('1970-01-01T07:45:00Z'),
    isActive: true,
  };

  const tx = {
    user: {
      findMany: jest.fn().mockResolvedValue([defaultUser, peerUser]),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'user-1') return Promise.resolve(defaultUser);
        if (where.id === 'user-2') return Promise.resolve(peerUser);
        return Promise.resolve(null);
      }),
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'user-1') return Promise.resolve(defaultUser);
        if (where.id === 'user-2') return Promise.resolve(peerUser);
        return Promise.resolve(null);
      }),
      count: jest.fn().mockResolvedValue(2),
    },
    academicYear: {
      findMany: jest.fn().mockResolvedValue([{ id: 'year-1', code: '2026-2027', name: 'Năm học 2026 - 2027' }]),
    },
    academicCalendarVersion: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'cal-1',
        academicYearId: 'year-1',
        isActive: true,
        startDate: new Date('2026-09-01T00:00:00Z'),
        endDate: new Date('2027-05-31T00:00:00Z'),
        weeks: [week],
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'cal-1',
          academicYearId: 'year-1',
          isActive: true,
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: new Date('2027-05-31T00:00:00Z'),
        },
      ]),
    },
    academicWeek: {
      findUnique: jest.fn().mockResolvedValue(week),
    },
    timeSlotDefinition: {
      findMany: jest.fn().mockResolvedValue([slotDef]),
    },
    schoolClass: {
      findMany: jest.fn().mockResolvedValue([{ id: 'class-1', name: '10A1', code: '10A1' }]),
    },
    subject: {
      findMany: jest.fn().mockResolvedValue([{ id: 'sub-1', name: 'Toán', code: 'TOAN' }]),
    },
    ...overrides,
  };

  const prisma = {
    $transaction: jest.fn().mockImplementation((fn: (txClient: typeof tx) => unknown) => {
      if (Array.isArray(fn)) return Promise.all(fn);
      return fn(tx);
    }),
    user: tx.user,
    academicYear: tx.academicYear,
    academicCalendarVersion: tx.academicCalendarVersion,
  };

  return { prisma, tx };
}

function mockResolvedResult(overrides: Partial<ResolvedLessonOccurrencesResult> = {}): ResolvedLessonOccurrencesResult {
  return {
    profile: RESOLVED_LESSON_OCCURRENCE_PROFILE,
    scope: { academicYearId: 'year-1', civilDate: '2026-09-07' },
    status: 'PASS',
    coverage: { ppctItemAllocation: 'NOT_ASSESSED' },
    normalOccurrences: [],
    makeupOccurrences: [],
    specialActivityOccurrences: [],
    findings: [],
    evaluatedAt: '2026-09-07T00:00:00.000Z',
    ...overrides,
  };
}

describe('EffectiveScheduleService (Unit Regression Coverage)', () => {
  let resolvedOccurrencesService: jest.Mocked<ResolvedLessonOccurrencesService>;

  beforeEach(() => {
    resolvedOccurrencesService = {
      resolve: jest.fn(),
      resolveInTransaction: jest.fn().mockResolvedValue(mockResolvedResult()),
    } as unknown as jest.Mocked<ResolvedLessonOccurrencesService>;
  });

  describe('Surface A: Teacher Options (items 18 & 19)', () => {
    it('returns minimal teacher identity payload without exposing sensitive fields (item 19)', async () => {
      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const result = await service.listTeachers({ page: 1, pageSize: 20 });
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        userId: 'user-1',
        displayName: 'Nguyễn Văn A',
        code: 'GV01',
      });
      // Data minimization check:
      expect(result.items[0]).not.toHaveProperty('passwordHash');
      expect(result.items[0]).not.toHaveProperty('email');
      expect(result.items[0]).not.toHaveProperty('username');
      expect(result.items[0]).not.toHaveProperty('capabilityGrants');
    });

    it('orders teachers deterministically and paginates (item 18)', async () => {
      const { prisma, tx } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      await service.listTeachers({ search: 'Nguyễn', page: 2, pageSize: 10 });
      expect(tx.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ profile: { displayName: 'asc' } }, { id: 'asc' }],
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('Surface B: Individual Weekly Effective Schedule', () => {
    it('1. TEACHER_BASE self read resolves weekly schedule for authenticated teacher', async () => {
      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1' },
        'user-1',
      );
      expect(res.profile).toBe('SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1');
      expect(res.teacherUserId).toBe('user-1');
      expect(res.teacherDisplayName).toBe('Nguyễn Văn A');
      expect(res.status).toBe('PASS');
      expect(res.days.length).toBeGreaterThan(0);
    });

    it('2. TEACHER_BASE peer read resolves weekly schedule for peer teacher', async () => {
      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-2' },
        'user-1',
      );
      expect(res.teacherUserId).toBe('user-2');
      expect(res.teacherDisplayName).toBe('Trần Thị B');
    });

    it('7. base timetable occupancy occupies responsible teacher', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          normalOccurrences: [
            {
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-1',
              timeSlot: { id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-1',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'BASE_TIMETABLE',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: null,
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-1' },
        'user-1',
      );

      const monday = res.days.find((d) => d.civilDate === '2026-09-07');
      expect(monday).toBeDefined();
      const slot = monday!.slots.find((s) => s.timeSlotId === 'slot-1');
      expect(slot).toMatchObject({
        occupancyState: 'OCCUPIED',
        sourceKind: 'BASE_TIMETABLE',
        sourceLabel: 'Lịch cơ sở',
        className: '10A1',
        subjectName: 'Toán',
      });
    });

    it('8. authorized cancellation removes occupancy for responsible teacher', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          normalOccurrences: [
            {
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-1',
              timeSlot: { id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-1',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'OPERATIONAL_DISPOSITION',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: {
                id: 'disp-1',
                dispositionType: 'AUTHORIZED_CANCELLATION',
                responsibleTeacherUserId: 'user-1',
                assignedTeacherUserId: null,
                eligibilityCheckedAt: null,
                eligibilityWasActive: null,
                eligibilityWasTeachingStaff: null,
              },
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-1' },
        'user-1',
      );
      const slot = res.days.find((d) => d.civilDate === '2026-09-07')?.slots.find((s) => s.timeSlotId === 'slot-1');
      expect(slot?.occupancyState).toBe('FREE');
    });

    it('9. absence without replacement removes occupancy for responsible teacher', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          normalOccurrences: [
            {
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-1',
              timeSlot: { id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-1',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'OPERATIONAL_DISPOSITION',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: {
                id: 'disp-abs',
                dispositionType: 'ABSENCE_NO_REPLACEMENT',
                responsibleTeacherUserId: 'user-1',
                assignedTeacherUserId: null,
                eligibilityCheckedAt: null,
                eligibilityWasActive: null,
                eligibilityWasTeachingStaff: null,
              },
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-1' },
        'user-1',
      );
      const slot = res.days.find((d) => d.civilDate === '2026-09-07')?.slots.find((s) => s.timeSlotId === 'slot-1');
      expect(slot?.occupancyState).toBe('FREE');
    });

    it('10. same-subject substitution moves occupancy to assigned teacher', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          normalOccurrences: [
            {
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-1',
              timeSlot: { id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-1',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'OPERATIONAL_DISPOSITION',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: {
                id: 'disp-sub',
                dispositionType: 'SAME_SUBJECT_SUBSTITUTION',
                responsibleTeacherUserId: 'user-1',
                assignedTeacherUserId: 'user-2', // substituted to user-2
                eligibilityCheckedAt: '2026-09-01T00:00:00Z',
                eligibilityWasActive: true,
                eligibilityWasTeachingStaff: true,
              },
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      // user-1 is FREE
      const resUser1 = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-1' },
        'user-1',
      );
      const slotUser1 = resUser1.days.find((d) => d.civilDate === '2026-09-07')?.slots.find((s) => s.timeSlotId === 'slot-1');
      expect(slotUser1?.occupancyState).toBe('FREE');

      // user-2 is OCCUPIED with SAME_SUBJECT_SUBSTITUTION
      const resUser2 = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-2' },
        'user-1',
      );
      const slotUser2 = resUser2.days.find((d) => d.civilDate === '2026-09-07')?.slots.find((s) => s.timeSlotId === 'slot-1');
      expect(slotUser2?.occupancyState).toBe('OCCUPIED');
      expect(slotUser2?.sourceKind).toBe('SAME_SUBJECT_SUBSTITUTION');
      expect(slotUser2?.sourceLabel).toBe('Dạy thay (cùng môn)');
    });

    it('11. different-subject supervision moves occupancy to assigned teacher', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          normalOccurrences: [
            {
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-1',
              timeSlot: { id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-1',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'OPERATIONAL_DISPOSITION',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: {
                id: 'disp-sup',
                dispositionType: 'DIFFERENT_SUBJECT_SUPERVISION',
                responsibleTeacherUserId: 'user-1',
                assignedTeacherUserId: 'user-2',
                eligibilityCheckedAt: '2026-09-01T00:00:00Z',
                eligibilityWasActive: true,
                eligibilityWasTeachingStaff: true,
              },
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const resUser2 = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-2' },
        'user-1',
      );
      const slotUser2 = resUser2.days.find((d) => d.civilDate === '2026-09-07')?.slots.find((s) => s.timeSlotId === 'slot-1');
      expect(slotUser2?.occupancyState).toBe('OCCUPIED');
      expect(slotUser2?.sourceKind).toBe('DIFFERENT_SUBJECT_SUPERVISION');
      expect(slotUser2?.sourceLabel).toBe('Coi thay (khác môn)');
    });

    it('12. make-up occupancy appears on scheduled teacher at target interval', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          makeupOccurrences: [
            {
              occurrenceKey: 'MAKEUP:mu-1',
              family: 'MAKEUP_TEACHING',
              target: {
                id: 'mu-1',
                academicYearId: 'year-1',
                targetCivilDate: '2026-09-07',
                targetAcademicCalendarVersionId: 'cal-1',
                targetTimeSlotDefinitionId: 'slot-1',
                targetSlot: { session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00', weekday: 'MONDAY' },
                schoolClassId: 'class-1',
                subjectId: 'sub-1',
                scheduledTeacherUserId: 'user-2',
              },
              originalObligation: {} as never,
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-2' },
        'user-1',
      );
      const slot = res.days.find((d) => d.civilDate === '2026-09-07')?.slots.find((s) => s.timeSlotId === 'slot-1');
      expect(slot?.occupancyState).toBe('OCCUPIED');
      expect(slot?.sourceKind).toBe('MAKEUP_TEACHING');
      expect(slot?.sourceLabel).toBe('Dạy bù');
    });

    it('13. SpecialActivity suppression suppresses normal and occupies exact staffing teachers', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          normalOccurrences: [
            {
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-1',
              timeSlot: { id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-1',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'SPECIAL_ACTIVITY_SUPPRESSED',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: ['act-1'],
              disposition: null,
            },
          ],
          specialActivityOccurrences: [
            {
              occurrenceKey: 'SPECIAL_ACTIVITY:act-1',
              family: 'SPECIAL_ACTIVITY',
              id: 'act-1',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              civilDate: '2026-09-07',
              title: 'Hoạt động trải nghiệm Khối 10',
              note: null,
              classTargetIds: ['class-1'],
              timeSlots: [{ id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' }],
              staffing: [{ scheduledTeacherUserId: 'user-2', staffProfileId: 'p2', eligibilityCheckedAt: '2026-09-01Z', eligibilityWasActive: true, eligibilityWasTeachingStaff: true }],
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      // user-1 was suppressed -> FREE
      const res1 = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-1' },
        'user-1',
      );
      expect(res1.days.find((d) => d.civilDate === '2026-09-07')?.slots[0]?.occupancyState).toBe('FREE');

      // user-2 is staffing -> OCCUPIED with SPECIAL_ACTIVITY
      const res2 = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-2' },
        'user-1',
      );
      const slot2 = res2.days.find((d) => d.civilDate === '2026-09-07')?.slots[0];
      expect(slot2?.occupancyState).toBe('OCCUPIED');
      expect(slot2?.sourceKind).toBe('SPECIAL_ACTIVITY');
      expect(slot2?.activityTitle).toBe('Hoạt động trải nghiệm Khối 10');
      expect(slot2?.sourceLabel).toBe('Hoạt động chuyên biệt');
    });

    it('14. materialized GDĐP appears through SpecialActivity without a parallel schedule source', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          specialActivityOccurrences: [
            {
              occurrenceKey: 'SPECIAL_ACTIVITY:gddp-act',
              family: 'SPECIAL_ACTIVITY',
              id: 'gddp-act',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              civilDate: '2026-09-07',
              title: 'Giáo dục địa phương Khối 10 - Tiết 1',
              note: 'Materialized from GDĐP workbook',
              classTargetIds: ['class-1'],
              timeSlots: [{ id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' }],
              staffing: [{ scheduledTeacherUserId: 'user-1', staffProfileId: 'p1', eligibilityCheckedAt: '2026-09-01Z', eligibilityWasActive: true, eligibilityWasTeachingStaff: true }],
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-1' },
        'user-1',
      );
      const slot = res.days.find((d) => d.civilDate === '2026-09-07')?.slots[0];
      expect(slot?.occupancyState).toBe('OCCUPIED');
      expect(slot?.sourceKind).toBe('SPECIAL_ACTIVITY');
      expect(slot?.activityTitle).toBe('Giáo dục địa phương Khối 10 - Tiết 1');
    });

    it('15. duplicate source presentation does not duplicate effective occupancy', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          normalOccurrences: [
            {
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-1',
              timeSlot: { id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-1',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'BASE_TIMETABLE',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: null,
            },
            // Duplicate row with same entry
            {
              occurrenceKey: 'NORMAL:entry-1-dup:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-1',
              timeSlot: { id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-1',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'BASE_TIMETABLE',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: null,
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-1' },
        'user-1',
      );
      const mondaySlots = res.days.find((d) => d.civilDate === '2026-09-07')?.slots;
      // Must not create two slot items for slot-1
      expect(mondaySlots?.filter((s) => s.timeSlotId === 'slot-1')).toHaveLength(1);
    });

    it('16. structural BLOCKED never becomes Trống (Fail-closed)', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          status: 'BLOCKED',
          findings: [
            {
              severity: 'BLOCKER',
              code: 'PPCT_ASSOCIATION_MISSING',
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              entityIds: ['entry-1'],
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-1' },
        'user-1',
      );

      expect(res.status).toBe('BLOCKED');
      expect(res.blockedReasons).toContain('Chưa liên kết phân phối chương trình');
      expect(res.blockedReasons?.[0]).not.toContain('PPCT_ASSOCIATION_MISSING');
      expect(res.blockedReasons?.[0]).not.toContain('BLOCKER');

      const monday = res.days.find((d) => d.civilDate === '2026-09-07');
      expect(monday?.isBlocked).toBe(true);
      const slot = monday?.slots.find((s) => s.timeSlotId === 'slot-1');
      // CRITICAL ASSERTION: occupancyState must be BLOCKED, NEVER FREE
      expect(slot?.occupancyState).toBe('BLOCKED');
      expect(slot?.occupancyState).not.toBe('FREE');
    });
  });

  describe('Surface C: School-wide Selected-day Schedule', () => {
    it('3. TEACHER_BASE school-wide read returns deterministic matrix (item 3 & 18)', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          normalOccurrences: [
            {
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-1',
              timeSlot: { id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-1',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'BASE_TIMETABLE',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: null,
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getSchoolWideDaySchedule({
        academicYearId: 'year-1',
        civilDate: '2026-09-07',
      });

      expect(res.profile).toBe('SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1');
      expect(res.civilDate).toBe('2026-09-07');
      expect(res.weekday).toBe('MONDAY');
      expect(res.status).toBe('PASS');
      expect(res.teachers).toHaveLength(2);
      expect(res.teachers[0]?.teacherDisplayName).toBe('Nguyễn Văn A');
      expect(res.teachers[0]?.slots[0]?.occupancyState).toBe('OCCUPIED');
      expect(res.teachers[1]?.teacherDisplayName).toBe('Trần Thị B');
      expect(res.teachers[1]?.slots[0]?.occupancyState).toBe('FREE');
    });
  });

  describe('Surface D: Compare with my schedule', () => {
    it('17. real-interval overlap comparison returns descriptive facts only without swap eligibility', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          normalOccurrences: [
            // user-1 has class in slot-1 (07:00 - 07:45)
            {
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-1',
              timeSlot: { id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-1',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'BASE_TIMETABLE',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: null,
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.compareSchedules(
        {
          academicYearId: 'year-1',
          academicWeekId: 'week-1',
          peerTeacherUserId: 'user-2',
        },
        'user-1',
      );

      expect(res.profile).toBe('SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1');
      expect(res.selfTeacher.userId).toBe('user-1');
      expect(res.peerTeacher.userId).toBe('user-2');

      const fact = res.facts.find((f) => f.civilDate === '2026-09-07' && f.slotLabel === 'Tiết 1');
      expect(fact).toBeDefined();
      expect(fact?.comparisonState).toBe('SELF_BUSY_PEER_FREE');
      expect(fact?.comparisonLabel).toBe('Tôi bận / Đồng nghiệp trống');
      expect(fact?.selfOccupancy.isBusy).toBe(true);
      expect(fact?.selfOccupancy.occupancyState).toBe('OCCUPIED');
      expect(fact?.peerOccupancy.isBusy).toBe(false);
      expect(fact?.peerOccupancy.occupancyState).toBe('FREE');

      // Verify no swap eligibility conclusion
      expect(fact).not.toHaveProperty('eligibleForSwap');
      expect(fact).not.toHaveProperty('canSwap');
      expect(fact).not.toHaveProperty('isSwapAllowed');
    });
  });

  describe('Independent Review Correction 001 Hardening', () => {
    it('Finding 1: blocked comparison contains zero FREE semantic and self/peer occupancyState are BLOCKED', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          status: 'BLOCKED',
          findings: [
            {
              severity: 'BLOCKER',
              code: 'ACTIVE_SPECIAL_ACTIVITY_COLLISION',
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              entityIds: ['entry-1'],
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.compareSchedules(
        {
          academicYearId: 'year-1',
          academicWeekId: 'week-1',
          peerTeacherUserId: 'user-2',
        },
        'user-1',
      );

      expect(res.status).toBe('BLOCKED');
      expect(res.blockedReasons).toContain('Xung đột với hoạt động chuyên biệt');
      expect(res.facts.length).toBeGreaterThan(0);

      for (const fact of res.facts) {
        expect(fact.comparisonState).toBe('BLOCKED');
        expect(fact.selfOccupancy.occupancyState).toBe('BLOCKED');
        expect(fact.selfOccupancy.isBusy).toBe(false);
        expect(fact.peerOccupancy.occupancyState).toBe('BLOCKED');
        expect(fact.peerOccupancy.isBusy).toBe(false);
        // Zero FREE semantics under fail-closed guarantee
        expect(fact.selfOccupancy.occupancyState).not.toBe('FREE');
        expect(fact.peerOccupancy.occupancyState).not.toBe('FREE');
      }
    });

    it('Finding 2: unknown finding code falls back safely without leaking technical codes', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          status: 'BLOCKED',
          findings: [
            {
              severity: 'BLOCKER',
              code: 'VERY_CUSTOM_UNEXPECTED_FINDING_CODE' as never,
              occurrenceKey: 'NORMAL:entry-1:2026-09-07',
              entityIds: ['entry-1'],
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const res = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-1' },
        'user-1',
      );

      expect(res.status).toBe('BLOCKED');
      expect(res.blockedReasons).toEqual(['Dữ liệu lịch dạy chưa đủ nhất quán để xác định.']);
      expect(JSON.stringify(res.blockedReasons)).not.toContain('VERY_CUSTOM_UNEXPECTED_FINDING_CODE');
      expect(JSON.stringify(res.blockedReasons)).not.toContain('BLOCKER');
    });

    it('Finding 3: SpecialActivity.note sentinel is not exposed in public DTOs', async () => {
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          specialActivityOccurrences: [
            {
              occurrenceKey: 'SPECIAL_ACTIVITY:act-sentinel',
              family: 'SPECIAL_ACTIVITY',
              id: 'act-sentinel',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              civilDate: '2026-09-07',
              title: 'Hoạt động trải nghiệm Khối 10',
              note: 'PRIVATE_ADMIN_NOTE_SENTINEL',
              classTargetIds: ['class-1'],
              timeSlots: [{ id: 'slot-1', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' }],
              staffing: [{ scheduledTeacherUserId: 'user-1', staffProfileId: 'p1', eligibilityCheckedAt: '2026-09-01Z', eligibilityWasActive: true, eligibilityWasTeachingStaff: true }],
            },
          ],
        }),
      );

      const { prisma } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      const weekly = await service.getWeeklySchedule(
        { academicYearId: 'year-1', academicWeekId: 'week-1', teacherUserId: 'user-1' },
        'user-1',
      );
      const schoolWide = await service.getSchoolWideDaySchedule({
        academicYearId: 'year-1',
        civilDate: '2026-09-07',
      });

      expect(JSON.stringify(weekly)).not.toContain('PRIVATE_ADMIN_NOTE_SENTINEL');
      expect(JSON.stringify(schoolWide)).not.toContain('PRIVATE_ADMIN_NOTE_SENTINEL');
    });

    it('Finding 4: rejects week belonging to another year or inactive calendar version', async () => {
      const { prisma, tx } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      // A. Week from year-2 requested with year-1
      tx.academicWeek.findUnique.mockResolvedValueOnce({
        id: 'week-diff-year',
        calendarVersion: { academicYearId: 'year-2', isActive: true },
        segments: [],
      });
      await expect(
        service.getWeeklySchedule(
          { academicYearId: 'year-1', academicWeekId: 'week-diff-year', teacherUserId: 'user-1' },
          'user-1',
        ),
      ).rejects.toThrow('Tuần học không thuộc năm học được chỉ định.');

      // B. Week belonging to inactive calendar version
      tx.academicWeek.findUnique.mockResolvedValueOnce({
        id: 'week-inactive',
        calendarVersion: { academicYearId: 'year-1', isActive: false },
        segments: [],
      });
      await expect(
        service.getWeeklySchedule(
          { academicYearId: 'year-1', academicWeekId: 'week-inactive', teacherUserId: 'user-1' },
          'user-1',
        ),
      ).rejects.toThrow('Tuần học thuộc phiên bản lịch không còn hiệu lực.');
    });

    it('Finding 5: context resolution matches today against active calendar and respects segment gaps', async () => {
      const { prisma, tx } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      // Split segment with a gap between 2026-09-01..2026-09-05 and 2026-09-10..2026-09-15
      // Today is 2026-09-29 -> not in segment
      tx.academicCalendarVersion.findFirst.mockResolvedValueOnce({
        id: 'cal-split',
        academicYearId: 'year-1',
        isActive: true,
        weeks: [
          {
            id: 'week-split',
            displayLabel: 'Tuần gián đoạn',
            officialWeekNumber: 1,
            segments: [
              { startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-09-05T00:00:00Z') },
              { startDate: new Date('2026-09-10T00:00:00Z'), endDate: new Date('2026-09-15T00:00:00Z') },
            ],
          },
        ],
      });

      const ctx = await service.getContext({ academicYearId: 'year-1' });
      // Today (2026-09-29) does not lie in either segment, must remain null
      expect(ctx.currentAcademicWeekId).toBeNull();
    });

    it('Finding 6: school-wide rejects date outside active calendar', async () => {
      const { prisma, tx } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      // Date outside calendar bounds: 2026-09-01 to 2027-05-31, querying 2028-01-01
      tx.academicCalendarVersion.findFirst.mockResolvedValueOnce({
        id: 'cal-1',
        academicYearId: 'year-1',
        isActive: true,
        startDate: new Date('2026-09-01T00:00:00Z'),
        endDate: new Date('2027-05-31T00:00:00Z'),
      });

      await expect(
        service.getSchoolWideDaySchedule({
          academicYearId: 'year-1',
          civilDate: '2028-01-01',
        }),
      ).rejects.toThrow('Ngày đã chọn không nằm trong phạm vi lịch học hiệu lực của năm học này.');
    });

    it('Finding 7: rejects peer target that is inactive or non-teaching staff with generic 404', async () => {
      const { prisma, tx } = createMockPrisma();
      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);

      // findFirst returns null for inactive / non-teaching user
      tx.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.compareSchedules(
          { academicYearId: 'year-1', academicWeekId: 'week-1', peerTeacherUserId: 'inactive-or-admin-user' },
          'user-1',
        ),
      ).rejects.toThrow('Không tìm thấy thông tin giáo viên hoặc giáo viên không thuộc diện phân công giảng dạy.');
    });

    it('Finding 8: distinct slot IDs with overlapping real intervals derive comparison from intervals, not slot IDs', async () => {
      const slotDef1 = {
        id: 'slot-early',
        academicYearId: 'year-1',
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 1,
        displayLabel: 'Tiết 1 sớm',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true,
      };
      const slotDef2 = {
        id: 'slot-mid-overlap',
        academicYearId: 'year-1',
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 2,
        displayLabel: 'Tiết đan xen',
        startTime: new Date('1970-01-01T07:30:00Z'),
        endTime: new Date('1970-01-01T08:15:00Z'),
        isActive: true,
      };
      const slotDef3 = {
        id: 'slot-touching',
        academicYearId: 'year-1',
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 3,
        displayLabel: 'Tiết chạm biên',
        startTime: new Date('1970-01-01T07:45:00Z'),
        endTime: new Date('1970-01-01T08:30:00Z'),
        isActive: true,
      };

      const { prisma } = createMockPrisma({
        timeSlotDefinition: {
          findMany: jest.fn().mockResolvedValue([slotDef1, slotDef2, slotDef3]),
        },
      });

      // Teacher A has occupancy in slot-early (07:00 - 07:45)
      // Teacher B has occupancy in slot-mid-overlap (07:30 - 08:15)
      resolvedOccurrencesService.resolveInTransaction.mockResolvedValue(
        mockResolvedResult({
          normalOccurrences: [
            {
              occurrenceKey: 'NORMAL:entry-teacher-a:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-a',
              timeSlot: { id: 'slot-early', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-a',
              responsibleTeacherUserId: 'user-1',
              ppctBinding: null,
              effectiveKind: 'BASE_TIMETABLE',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: null,
            },
            {
              occurrenceKey: 'NORMAL:entry-teacher-b:2026-09-07',
              family: 'NORMAL_TIMETABLE_OPPORTUNITY',
              civilDate: '2026-09-07',
              academicYearId: 'year-1',
              academicCalendarVersionId: 'cal-1',
              timetableVersionId: 'tb-1',
              timetableEntryId: 'entry-b',
              timeSlot: { id: 'slot-mid-overlap', weekday: 'MONDAY', session: 'MORNING', startTime: '07:30:00', endTime: '08:15:00' },
              schoolClass: { id: 'class-1', gradeLevel: 10 },
              subjectId: 'sub-1',
              teachingAssignmentId: 'assign-b',
              responsibleTeacherUserId: 'user-2',
              ppctBinding: null,
              effectiveKind: 'BASE_TIMETABLE',
              interruptionIds: [],
              exceptionIds: [],
              suppressingSpecialActivityIds: [],
              disposition: null,
            },
          ],
        }),
      );

      const service = new EffectiveScheduleService(prisma as never, resolvedOccurrencesService);
      const res = await service.compareSchedules(
        { academicYearId: 'year-1', academicWeekId: 'week-1', peerTeacherUserId: 'user-2' },
        'user-1',
      );

      const factEarly = res.facts.find((f) => f.slotLabel === 'Tiết 1 sớm');
      expect(factEarly?.comparisonState).toBe('BOTH_BUSY');
      expect(factEarly?.selfOccupancy.isBusy).toBe(true);
      expect(factEarly?.peerOccupancy.isBusy).toBe(true);

      const factMid = res.facts.find((f) => f.slotLabel === 'Tiết đan xen');
      expect(factMid?.comparisonState).toBe('BOTH_BUSY');
      expect(factMid?.selfOccupancy.isBusy).toBe(true);
      expect(factMid?.peerOccupancy.isBusy).toBe(true);

      // Touching boundary slot: 07:45 - 08:30 does NOT overlap with Teacher A's 07:00 - 07:45
      // but DOES overlap with Teacher B's 07:30 - 08:15
      const factTouching = res.facts.find((f) => f.slotLabel === 'Tiết chạm biên');
      expect(factTouching?.selfOccupancy.isBusy).toBe(false); // Touching boundary 07:45 is NOT busy for Teacher A
      expect(factTouching?.peerOccupancy.isBusy).toBe(true);  // Overlaps with 07:30 - 08:15 for Teacher B
      expect(factTouching?.comparisonState).toBe('SELF_FREE_PEER_BUSY');
    });
  });
});
