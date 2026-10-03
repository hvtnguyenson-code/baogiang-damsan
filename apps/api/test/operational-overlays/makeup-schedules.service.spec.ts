import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AcademicWeekday,
  OperationalLessonDispositionType,
  OperationalOverlayStatus,
  TeachingExecutionStatus,
  TimeSlotSession,
  TimetableVersionStatus,
} from '@prisma/client';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import {
  CreateMakeupScheduleDto,
  ReverseOperationalOverlayDto,
} from '../../src/operational-overlays/dto';
import {
  makeupCreateFingerprint,
  reverseFingerprint,
} from '../../src/operational-overlays/operational-overlay-policy';
import { MakeupSchedulesService } from '../../src/operational-overlays/makeup-schedules.service';

const id = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const instant = new Date('2026-09-05T08:00:00.000Z'); // Command time
const request = {
  auth: { user: { id: id('9'), mustChangePassword: false } },
  headers: {},
  method: 'POST',
  path: '/',
} as unknown as AuthenticatedRequest;

const yearId = id('1');
const classId = id('2');
const subjectId = id('3');
const entryId = id('4');
const teacherId = id('5');
const otherTeacherId = id('7');
const slotId = id('6');
const targetSlotId = '66666666-6666-4666-8666-666666666666';
const calendarVersionId = '22222222-2222-4222-8222-222222222222';
const dispositionId = '33333333-3333-4333-8333-333333333333';
const ppctAssociationId = '44444444-4444-4444-8444-444444444444';
const ppctPlanId = '55555555-5555-4555-8555-555555555555';
const ppctVersionId = '77777777-7777-4777-8777-777777777777';
const ppctItemId = '88888888-8888-4888-8888-888888888888';
const ppctItemRevisionId = '99999999-9999-4999-8999-999999999999';
const staffSubjectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scheduleId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const sourceKey = `NORMAL:${entryId}:2026-09-08`;
const targetCivilDate = '2026-09-15' as const; // Future Tuesday

const createDto: CreateMakeupScheduleDto = {
  academicYearId: yearId,
  sourceNormalOccurrenceKey: sourceKey,
  targetCivilDate,
  targetTimeSlotDefinitionId: targetSlotId,
  scheduledTeacherUserId: teacherId,
  note: 'Lịch dạy bù Toán 10A1',
  requestKey: 'create-makeup-key-1',
};

const validEntry = {
  id: entryId,
  academicYearId: yearId,
  schoolClassId: classId,
  subjectId,
  teacherUserId: teacherId,
  teachingAssignmentId: id('a'),
  timeSlotDefinitionId: slotId,
  timetableVersionId: id('b'),
  weekday: AcademicWeekday.TUESDAY,
  timetableVersion: { id: id('b'), calendarVersionId, status: TimetableVersionStatus.ACTIVE },
  timeSlotDefinition: { id: slotId, academicYearId: yearId, session: TimeSlotSession.MORNING, weekday: AcademicWeekday.TUESDAY, startTime: new Date('1970-01-01T07:00:00.000Z'), endTime: new Date('1970-01-01T07:45:00.000Z') },
  schoolClass: { id: classId, gradeLevel: 10 },
};

const validTargetCalendar = {
  id: calendarVersionId,
  academicYearId: yearId,
  startDate: new Date('2026-09-01T00:00:00.000Z'),
  endDate: new Date('2027-05-31T00:00:00.000Z'),
  isActive: true,
};

const validTargetSlot = {
  id: targetSlotId,
  academicYearId: yearId,
  weekday: AcademicWeekday.TUESDAY, // 2026-09-15 is Tuesday
  session: TimeSlotSession.AFTERNOON,
  startTime: new Date('1970-01-01T14:00:00.000Z'),
  endTime: new Date('1970-01-01T14:45:00.000Z'),
  allowMakeupTeaching: true,
  isActive: true,
  displayLabel: 'Tiết 1 Chiều',
};

const validTeacher = {
  id: teacherId,
  status: 'ACTIVE',
  profile: { id: id('c'), isTeachingStaff: true, displayName: 'Thầy Nguyễn Văn A' },
};

const validStaffSubject = {
  id: staffSubjectId,
  userId: teacherId,
  subjectId,
  validFrom: new Date('2026-09-01T00:00:00.000Z'),
  validUntil: null,
  user: validTeacher,
};

const validSourceDisposition = {
  id: dispositionId,
  academicYearId: yearId,
  status: OperationalOverlayStatus.ACTIVE,
  dispositionType: OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT,
};

const validDebtItem = {
  sourceNormalOccurrenceKey: sourceKey,
  originalTimetableVersionId: id('b'),
  originalTimetableEntryId: entryId,
  sourceCivilDate: '2026-09-08' as const,
  sourceAcademicCalendarVersionId: calendarVersionId,
  sourceTimeSlotDefinitionId: slotId,
  originalTeachingAssignmentId: id('a'),
  responsibleTeacherUserId: teacherId,
  ppctClassAssociationId: ppctAssociationId,
  ppctPlanId: ppctPlanId,
  ppctVersionId: ppctVersionId,
  ppctItemId: ppctItemId,
  ppctItemRevisionId: ppctItemRevisionId,
  component: 'CORE' as const,
  operationalLessonDispositionId: dispositionId,
  operationalDispositionType: OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT,
  fulfillmentExecutionId: null,
  fulfillmentKind: null,
  makeupTeachingScheduleId: null,
  executionCivilDate: null,
  executionAcademicCalendarVersionId: null,
  executionTimeSlotDefinitionId: null,
  actualTeacherUserId: null,
  classification: 'PROVEN_OPEN_DEBT' as const,
};

const validScheduleRow = (overrides: Record<string, unknown> = {}) => ({
  id: scheduleId,
  academicYearId: yearId,
  originalTimetableVersionId: id('b'),
  originalTimetableEntryId: entryId,
  originalCivilDate: new Date('2026-09-08T00:00:00.000Z'),
  originalAcademicCalendarVersionId: calendarVersionId,
  originalTimeSlotDefinitionId: slotId,
  schoolClassId: classId,
  subjectId,
  originalTeachingAssignmentId: id('a'),
  responsibleTeacherUserId: teacherId,
  ppctClassAssociationId: ppctAssociationId,
  ppctPlanId: ppctPlanId,
  ppctVersionId: ppctVersionId,
  ppctItemId: ppctItemId,
  sourceDispositionId: dispositionId,
  targetCivilDate: new Date('2026-09-15T00:00:00.000Z'),
  targetAcademicCalendarVersionId: calendarVersionId,
  targetTimeSlotDefinitionId: targetSlotId,
  scheduledTeacherUserId: teacherId,
  eligibilityCheckedAt: instant,
  eligibilityWasActive: true,
  eligibilityWasTeachingStaff: true,
  eligibilitySameSubject: true,
  eligibilityStaffSubjectId: staffSubjectId,
  note: 'Lịch dạy bù Toán 10A1',
  status: OperationalOverlayStatus.ACTIVE,
  createRequestKey: 'create-makeup-key-1',
  createRequestFingerprint: makeupCreateFingerprint({
    academicYearId: yearId,
    sourceNormalOccurrenceKey: sourceKey,
    targetCivilDate,
    targetTimeSlotDefinitionId: targetSlotId,
    scheduledTeacherUserId: teacherId,
    note: 'Lịch dạy bù Toán 10A1',
    replacesId: null,
  }),
  reversedByUserId: null,
  reversedAt: null,
  reversalReason: null,
  reverseRequestKey: null,
  reverseRequestFingerprint: null,
  replacesId: null,
  createdByUserId: id('9'),
  createdAt: instant,
  updatedAt: instant,
  ...overrides,
});

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const audit = { write: jest.fn().mockResolvedValue(undefined) };
  const access = {
    requireTeachingSchoolWide: jest.fn().mockResolvedValue(undefined),
    requireTeachingSubject: jest.fn().mockResolvedValue(undefined),
  };
  const businessConfiguration = {
    resolveOperationalStartPolicy: jest.fn().mockResolvedValue({
      academicYearId: yearId,
      operationalStartDate: '2026-09-01',
      resolutionSource: 'RECORDED_ACTUAL_START',
      recordId: id('d'),
      recordedAt: instant.toISOString(),
      updatedAt: instant.toISOString(),
      sourceAuthorityType: 'ACTUAL_DELAYED_START',
      note: null,
    }),
  };
  const progressDebt = {
    resolveInTransactionV2: jest.fn().mockResolvedValue({
      status: 'PASS',
      items: [validDebtItem],
      counts: { distributedElapsedCount: 1, completedCount: 0, openDebtCount: 1, lateCount: 1, unconfirmedGapCount: 0 },
      findings: [],
    }),
  };

  const defaultPrisma = {
    makeupTeachingSchedule: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(validScheduleRow()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(validScheduleRow({ status: OperationalOverlayStatus.REVERSED })),
      count: jest.fn().mockResolvedValue(0),
    },
    timetableEntry: {
      findUnique: jest.fn().mockResolvedValue(validEntry),
      findMany: jest.fn().mockResolvedValue([]),
    },
    academicCalendarVersion: {
      findFirst: jest.fn().mockResolvedValue(validTargetCalendar),
      findMany: jest.fn().mockResolvedValue([validTargetCalendar]),
      findUnique: jest.fn().mockResolvedValue(validTargetCalendar),
    },
    calendarInterruption: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    calendarException: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    timeSlotDefinition: {
      findUnique: jest.fn().mockResolvedValue(validTargetSlot),
      findMany: jest.fn().mockResolvedValue([validTargetSlot]),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(validTeacher),
      findMany: jest.fn().mockResolvedValue([validTeacher]),
    },
    staffSubject: {
      findMany: jest.fn().mockResolvedValue([validStaffSubject]),
      findFirst: jest.fn().mockResolvedValue(validStaffSubject),
    },
    specialActivity: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    operationalLessonDisposition: {
      findUnique: jest.fn().mockResolvedValue(validSourceDisposition),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    curricularTeachingExecution: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    teachingAssignment: {
      findMany: jest.fn().mockResolvedValue([{ schoolClassId: classId, subjectId }]),
    },
    schoolClass: {
      findUnique: jest.fn().mockResolvedValue({ id: classId, gradeLevel: 10, name: '10A1' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: classId, gradeLevel: 10, name: '10A1' }),
      findMany: jest.fn().mockResolvedValue([{ id: classId, gradeLevel: 10, name: '10A1' }]),
    },
    subject: {
      findMany: jest.fn().mockResolvedValue([{ id: subjectId, name: 'Toán học' }]),
    },
    ppctItemRevision: {
      findMany: jest.fn().mockResolvedValue([{ ppctItemId, title: 'Bài 1: Mệnh đề', sequence: 1 }]),
    },
    ...prismaOverrides,
  };

  const database = {
    ...defaultPrisma,
    $transaction: jest.fn((operation: ((tx: unknown) => unknown) | Promise<unknown>[]) =>
      typeof operation === 'function' ? operation(defaultPrisma) : Promise.all(operation),
    ),
  };

  const resolvedOccurrences = {
    resolveInTransaction: jest.fn().mockResolvedValue({
      status: 'PASS',
      normalOccurrences: [],
      makeupOccurrences: [],
      specialActivityOccurrences: [],
      findings: [],
    }),
  };

  const service = new MakeupSchedulesService(
    database as never,
    audit as never,
    access as never,
    businessConfiguration as never,
    progressDebt as never,
    resolvedOccurrences as never,
    { now: () => instant },
  );

  return { service, audit, access, businessConfiguration, progressDebt, resolvedOccurrences, prisma: defaultPrisma };
}

describe('MakeupSchedulesService unit test matrix', () => {
  describe('Source / Debt Validation', () => {
    it('1. accepts valid PROVEN_OPEN_DEBT source', async () => {
      const { service, access, audit } = makeService();
      const result = await service.create(createDto, request);
      expect(result.outcome).toBe('CREATED');
      expect(result.record.status).toBe('ACTIVE');
      expect(result.record.scheduledTeacherUserId).toBe(teacherId);
      expect(access.requireTeachingSubject).toHaveBeenCalledWith(request, subjectId);
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MAKEUP_TEACHING_SCHEDULE_CREATED',
          entityType: 'MakeupTeachingSchedule',
        }),
        expect.anything(),
      );
    });

    it('2. rejects UNCONFIRMED_COMPLETION_GAP source', async () => {
      const { service, progressDebt } = makeService();
      progressDebt.resolveInTransactionV2.mockResolvedValueOnce({
        status: 'PASS',
        items: [{ ...validDebtItem, classification: 'UNCONFIRMED_COMPLETION_GAP' }],
        counts: {},
        findings: [],
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('3. rejects missing execution alone without valid disposition proof', async () => {
      const { service, progressDebt } = makeService();
      progressDebt.resolveInTransactionV2.mockResolvedValueOnce({
        status: 'PASS',
        items: [{ ...validDebtItem, operationalLessonDispositionId: null, classification: 'UNCONFIRMED_COMPLETION_GAP' }],
        counts: {},
        findings: [],
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('4. rejects already completed obligation', async () => {
      const { service, progressDebt } = makeService();
      progressDebt.resolveInTransactionV2.mockResolvedValueOnce({
        status: 'PASS',
        items: [{ ...validDebtItem, classification: 'COMPLETED' }],
        counts: {},
        findings: [],
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('5. rejects pre-operational source obligation', async () => {
      const { service } = makeService();
      const preOpDto = {
        ...createDto,
        sourceNormalOccurrenceKey: `NORMAL:${entryId}:2026-08-25`, // before 2026-09-01
      };
      await expect(service.create(preOpDto, request)).rejects.toThrow(ConflictException);
    });

    it('6. derives PPCT coordinates server-side without caller PPCT input', async () => {
      const { service, prisma } = makeService();
      await service.create(createDto, request);
      expect(prisma.makeupTeachingSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ppctClassAssociationId: ppctAssociationId,
            ppctPlanId,
            ppctVersionId,
            ppctItemId,
            sourceDispositionId: dispositionId,
          }),
        }),
      );
    });
  });

  describe('Target Validation', () => {
    it('7. accepts valid prospective target', async () => {
      const { service } = makeService();
      await expect(service.create(createDto, request)).resolves.toMatchObject({ outcome: 'CREATED' });
    });

    it('8. rejects target slot starting before or at command time', async () => {
      const { service, prisma } = makeService();
      // Target slot start time is 07:00 on 2026-09-05 (which is before or equal to commandNow 08:00)
      prisma.timeSlotDefinition.findUnique.mockResolvedValueOnce({
        ...validTargetSlot,
        startTime: new Date('1970-01-01T07:00:00.000Z'),
        endTime: new Date('1970-01-01T07:45:00.000Z'),
      });
      const backdatedDto: CreateMakeupScheduleDto = { ...createDto, targetCivilDate: '2026-09-05' as const };
      await expect(service.create(backdatedDto, request)).rejects.toThrow(ConflictException);
    });

    it('9. rejects wrong weekday slot', async () => {
      const { service, prisma } = makeService();
      prisma.timeSlotDefinition.findUnique.mockResolvedValueOnce({
        ...validTargetSlot,
        weekday: AcademicWeekday.FRIDAY, // Mismatch with Tuesday 2026-09-15
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('10. rejects slot where allowMakeupTeaching is false', async () => {
      const { service, prisma } = makeService();
      prisma.timeSlotDefinition.findUnique.mockResolvedValueOnce({
        ...validTargetSlot,
        allowMakeupTeaching: false,
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('11. rejects target within CalendarInterruption', async () => {
      const { service, prisma } = makeService();
      prisma.calendarInterruption.findFirst.mockResolvedValueOnce({ id: id('e') });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('12. rejects target suppressed by applicable CalendarException', async () => {
      const { service, prisma } = makeService();
      prisma.calendarException.findMany.mockResolvedValueOnce([
        {
          id: id('f'),
          scope: 'SCHOOL_WIDE',
          timeSelector: 'WHOLE_DAY',
          exactTimeSlots: [],
        },
      ]);
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('13. rejects target outside academic year / inactive calendar', async () => {
      const { service, prisma } = makeService();
      prisma.academicCalendarVersion.findMany.mockResolvedValueOnce([]);
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('13b. rejects ambiguous active calendars (>1 matching active versions)', async () => {
      const { service, prisma } = makeService();
      prisma.academicCalendarVersion.findMany.mockResolvedValueOnce([validTargetCalendar, { ...validTargetCalendar, id: id('8') }]);
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });
  });

  describe('Teacher Eligibility', () => {
    it('14. accepts active eligible same-subject teacher with frozen provenance', async () => {
      const { service, prisma } = makeService();
      const result = await service.create(createDto, request);
      expect(result.outcome).toBe('CREATED');
      expect(prisma.makeupTeachingSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eligibilityWasActive: true,
            eligibilityWasTeachingStaff: true,
            eligibilitySameSubject: true,
            eligibilityStaffSubjectId: staffSubjectId,
          }),
        }),
      );
    });

    it('15. rejects inactive user', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        ...validTeacher,
        status: 'INACTIVE',
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('16. rejects non-teaching StaffProfile', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        ...validTeacher,
        profile: { ...validTeacher.profile, isTeachingStaff: false },
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('17. rejects missing StaffSubject', async () => {
      const { service, prisma } = makeService();
      prisma.staffSubject.findMany.mockResolvedValueOnce([]);
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('18. rejects ambiguous/multiple StaffSubject proofs', async () => {
      const { service, prisma } = makeService();
      prisma.staffSubject.findMany.mockResolvedValueOnce([
        validStaffSubject,
        { ...validStaffSubject, id: id('9') },
      ]);
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });
  });

  describe('Collision Checks', () => {
    it('21. rejects normal timetable class collision via canonical occupancy', async () => {
      const { service, resolvedOccurrences } = makeService();
      resolvedOccurrences.resolveInTransaction.mockResolvedValueOnce({
        status: 'PASS',
        normalOccurrences: [
          {
            occurrenceKey: 'NORMAL:occ-1:2026-09-15',
            effectiveKind: 'BASE_TIMETABLE',
            timeSlot: { id: targetSlotId, startTime: '14:00:00', endTime: '14:45:00', weekday: 'TUESDAY', session: 'AFTERNOON' },
            schoolClass: { id: classId, gradeLevel: 10 },
            responsibleTeacherUserId: otherTeacherId,
            subjectId,
          },
        ],
        makeupOccurrences: [],
        specialActivityOccurrences: [],
        findings: [],
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('22. rejects normal timetable teacher collision via canonical occupancy', async () => {
      const { service, resolvedOccurrences } = makeService();
      resolvedOccurrences.resolveInTransaction.mockResolvedValueOnce({
        status: 'PASS',
        normalOccurrences: [
          {
            occurrenceKey: 'NORMAL:occ-2:2026-09-15',
            effectiveKind: 'BASE_TIMETABLE',
            timeSlot: { id: targetSlotId, startTime: '14:00:00', endTime: '14:45:00', weekday: 'TUESDAY', session: 'AFTERNOON' },
            schoolClass: { id: id('9'), gradeLevel: 10 },
            responsibleTeacherUserId: teacherId,
            subjectId,
          },
        ],
        makeupOccurrences: [],
        specialActivityOccurrences: [],
        findings: [],
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('23. rejects ACTIVE make-up class collision via canonical occupancy', async () => {
      const { service, resolvedOccurrences } = makeService();
      resolvedOccurrences.resolveInTransaction.mockResolvedValueOnce({
        status: 'PASS',
        normalOccurrences: [],
        makeupOccurrences: [
          {
            occurrenceKey: 'MAKEUP:m-1',
            target: {
              id: id('m1'),
              scheduledTeacherUserId: otherTeacherId,
              schoolClassId: classId,
              targetCivilDate: '2026-09-15',
              targetTimeSlotDefinitionId: targetSlotId,
              targetSlot: { startTime: '14:00:00', endTime: '14:45:00', weekday: 'TUESDAY', session: 'AFTERNOON' },
            },
          },
        ],
        specialActivityOccurrences: [],
        findings: [],
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('24. rejects ACTIVE make-up teacher collision via canonical occupancy', async () => {
      const { service, resolvedOccurrences } = makeService();
      resolvedOccurrences.resolveInTransaction.mockResolvedValueOnce({
        status: 'PASS',
        normalOccurrences: [],
        makeupOccurrences: [
          {
            occurrenceKey: 'MAKEUP:m-2',
            target: {
              id: id('m2'),
              scheduledTeacherUserId: teacherId,
              schoolClassId: id('9'),
              targetCivilDate: '2026-09-15',
              targetTimeSlotDefinitionId: targetSlotId,
              targetSlot: { startTime: '14:00:00', endTime: '14:45:00', weekday: 'TUESDAY', session: 'AFTERNOON' },
            },
          },
        ],
        specialActivityOccurrences: [],
        findings: [],
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('25. rejects SpecialActivity class collision via canonical occupancy', async () => {
      const { service, resolvedOccurrences } = makeService();
      resolvedOccurrences.resolveInTransaction.mockResolvedValueOnce({
        status: 'PASS',
        normalOccurrences: [],
        makeupOccurrences: [],
        specialActivityOccurrences: [
          {
            occurrenceKey: 'SPECIAL_ACTIVITY:sa-1',
            id: id('sa1'),
            civilDate: '2026-09-15',
            classTargetIds: [classId],
            staffing: [],
            timeSlots: [{ id: targetSlotId, startTime: '14:00:00', endTime: '14:45:00', weekday: 'TUESDAY', session: 'AFTERNOON' }],
          },
        ],
        findings: [],
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('26. rejects SpecialActivity teacher collision via canonical occupancy', async () => {
      const { service, resolvedOccurrences } = makeService();
      resolvedOccurrences.resolveInTransaction.mockResolvedValueOnce({
        status: 'PASS',
        normalOccurrences: [],
        makeupOccurrences: [],
        specialActivityOccurrences: [
          {
            occurrenceKey: 'SPECIAL_ACTIVITY:sa-2',
            id: id('sa2'),
            civilDate: '2026-09-15',
            classTargetIds: [],
            staffing: [{ scheduledTeacherUserId: teacherId }],
            timeSlots: [{ id: targetSlotId, startTime: '14:00:00', endTime: '14:45:00', weekday: 'TUESDAY', session: 'AFTERNOON' }],
          },
        ],
        findings: [],
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('27. allows make-up when normal occurrence was released by AUTHORIZED_CANCELLATION in resolution', async () => {
      const { service, resolvedOccurrences } = makeService();
      resolvedOccurrences.resolveInTransaction.mockResolvedValueOnce({
        status: 'PASS',
        normalOccurrences: [
          {
            occurrenceKey: 'NORMAL:occ-3:2026-09-15',
            effectiveKind: 'OPERATIONAL_DISPOSITION',
            disposition: { dispositionType: 'AUTHORIZED_CANCELLATION' },
            timeSlot: { id: targetSlotId, startTime: '14:00:00', endTime: '14:45:00', weekday: 'TUESDAY', session: 'AFTERNOON' },
            schoolClass: { id: classId, gradeLevel: 10 },
            responsibleTeacherUserId: otherTeacherId,
            subjectId,
          },
        ],
        makeupOccurrences: [],
        specialActivityOccurrences: [],
        findings: [],
      });
      await expect(service.create(createDto, request)).resolves.toMatchObject({ outcome: 'CREATED' });
    });

    it('28. fails closed with sanitized error when canonical resolution is BLOCKED', async () => {
      const { service, resolvedOccurrences } = makeService();
      resolvedOccurrences.resolveInTransaction.mockResolvedValueOnce({
        status: 'BLOCKED',
        findings: [{ code: 'PPCT_ASSOCIATION_MISSING', severity: 'BLOCKER', entityIds: [] }],
        normalOccurrences: [],
        makeupOccurrences: [],
        specialActivityOccurrences: [],
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });
  });

  describe('Concurrency & Idempotency', () => {
    it('36. replays identical requestKey and fingerprint', async () => {
      const row = validScheduleRow();
      const { service, audit, access } = makeService({
        makeupTeachingSchedule: {
          findUnique: jest.fn().mockResolvedValue(row),
        },
      });
      const result = await service.create(createDto, request);
      expect(result.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(result.record.id).toBe(row.id);
      expect(access.requireTeachingSubject).toHaveBeenCalledWith(request, row.subjectId);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('36b. requires subject authorization on idempotent replay (Finding 5)', async () => {
      const row = validScheduleRow();
      const { service, access } = makeService({
        makeupTeachingSchedule: {
          findUnique: jest.fn().mockResolvedValue(row),
        },
      });
      access.requireTeachingSubject.mockRejectedValueOnce(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );
      await expect(service.create(createDto, request)).rejects.toThrow(ForbiddenException);
      expect(access.requireTeachingSubject).toHaveBeenCalledWith(request, row.subjectId);
    });

    it('37. rejects same requestKey with different fingerprint', async () => {
      const row = validScheduleRow({ createRequestFingerprint: 'different-fingerprint' });
      const { service } = makeService({
        makeupTeachingSchedule: {
          findUnique: jest.fn().mockResolvedValue(row),
        },
      });
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });

    it('38. rejects duplicate ACTIVE schedule for same obligation', async () => {
      const { service, prisma } = makeService();
      prisma.makeupTeachingSchedule.findFirst.mockResolvedValueOnce(validScheduleRow());
      await expect(service.create(createDto, request)).rejects.toThrow(ConflictException);
    });
  });

  describe('Reversal', () => {
    it('40. reverses an ACTIVE schedule successfully', async () => {
      const { service, audit, access } = makeService({
        makeupTeachingSchedule: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.reverseRequestKey) return Promise.resolve(null);
            return Promise.resolve(validScheduleRow());
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(validScheduleRow({ status: OperationalOverlayStatus.REVERSED })),
        },
      });
      const reverseDto: ReverseOperationalOverlayDto = {
        expectedUpdatedAt: instant.toISOString(),
        reversalReason: 'Đổi ngày dạy bù theo kế hoạch trường',
        requestKey: 'reverse-key-1',
      };
      const result = await service.reverse(scheduleId, reverseDto, request);
      expect(result.outcome).toBe('REVERSED');
      expect(result.record.status).toBe(OperationalOverlayStatus.REVERSED);
      expect(access.requireTeachingSubject).toHaveBeenCalledWith(request, subjectId);
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MAKEUP_TEACHING_SCHEDULE_REVERSED' }),
        expect.anything(),
      );
    });

    it('41. rejects stale expectedUpdatedAt (CAS failure)', async () => {
      const { service } = makeService({
        makeupTeachingSchedule: {
          findUnique: jest.fn().mockResolvedValue(validScheduleRow()),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      });
      const reverseDto: ReverseOperationalOverlayDto = {
        expectedUpdatedAt: new Date('2026-08-01T00:00:00.000Z').toISOString(),
        reversalReason: 'Đổi ngày',
        requestKey: 'reverse-key-2',
      };
      await expect(service.reverse(scheduleId, reverseDto, request)).rejects.toThrow(ConflictException);
    });

    it('42. replays duplicate reverse request idempotently', async () => {
      const row = validScheduleRow({
        status: OperationalOverlayStatus.REVERSED,
        reverseRequestKey: 'reverse-key-replay',
        reverseRequestFingerprint: reverseFingerprint(scheduleId, instant.toISOString(), 'Lý do đảo'),
      });
      const { service, audit } = makeService({
        makeupTeachingSchedule: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.reverseRequestKey) return Promise.resolve(row);
            return Promise.resolve(row);
          }),
        },
      });
      const reverseDto: ReverseOperationalOverlayDto = {
        expectedUpdatedAt: instant.toISOString(),
        reversalReason: 'Lý do đảo',
        requestKey: 'reverse-key-replay',
      };
      const result = await service.reverse(scheduleId, reverseDto, request);
      expect(result.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('43. rejects reversal when schedule is referenced by ACTIVE CurricularTeachingExecution', async () => {
      const { service, prisma } = makeService({
        makeupTeachingSchedule: {
          findUnique: jest.fn().mockResolvedValue(validScheduleRow()),
        },
      });
      prisma.curricularTeachingExecution.findFirst.mockResolvedValueOnce({
        id: id('exec-1'),
        status: TeachingExecutionStatus.ACTIVE,
      });
      const reverseDto: ReverseOperationalOverlayDto = {
        expectedUpdatedAt: instant.toISOString(),
        reversalReason: 'Đổi ngày',
        requestKey: 'reverse-key-blocked',
      };
      await expect(service.reverse(scheduleId, reverseDto, request)).rejects.toThrow(ConflictException);
    });
  });

  describe('Replacement', () => {
    it('46. accepts replacement of a REVERSED schedule', async () => {
      const predecessor = validScheduleRow({
        id: id('pred-1'),
        status: OperationalOverlayStatus.REVERSED,
      });
      const { service, prisma } = makeService();
      prisma.makeupTeachingSchedule.findUnique.mockImplementation(({ where }: { where: { id?: string; createRequestKey?: string } }) => {
        if (where.id === predecessor.id) return Promise.resolve(predecessor);
        return Promise.resolve(null);
      });
      const replaceDto: CreateMakeupScheduleDto = {
        ...createDto,
        replacesId: predecessor.id,
        requestKey: 'replace-create-key',
      };
      const result = await service.create(replaceDto, request);
      expect(result.outcome).toBe('CREATED');
    });

    it('47. rejects replacement from ACTIVE predecessor', async () => {
      const predecessor = validScheduleRow({
        id: id('pred-active'),
        status: OperationalOverlayStatus.ACTIVE,
      });
      const { service, prisma } = makeService();
      prisma.makeupTeachingSchedule.findUnique.mockImplementation(({ where }: { where: { id?: string; createRequestKey?: string } }) => {
        if (where.id === predecessor.id) return Promise.resolve(predecessor);
        return Promise.resolve(null);
      });
      const replaceDto: CreateMakeupScheduleDto = {
        ...createDto,
        replacesId: predecessor.id,
      };
      await expect(service.create(replaceDto, request)).rejects.toThrow(ConflictException);
    });

    it('48. rejects replacement attempting to change original obligation', async () => {
      const predecessor = validScheduleRow({
        id: id('pred-mismatch'),
        status: OperationalOverlayStatus.REVERSED,
        schoolClassId: id('other-class'), // Mismatch
      });
      const { service, prisma } = makeService();
      prisma.makeupTeachingSchedule.findUnique.mockImplementation(({ where }: { where: { id?: string; createRequestKey?: string } }) => {
        if (where.id === predecessor.id) return Promise.resolve(predecessor);
        return Promise.resolve(null);
      });
      const replaceDto: CreateMakeupScheduleDto = {
        ...createDto,
        replacesId: predecessor.id,
      };
      await expect(service.create(replaceDto, request)).rejects.toThrow(ConflictException);
    });
  });

  describe('Candidate Read Model', () => {
    it('returns candidate proven debt items and flags active make-up schedules', async () => {
      const { service, prisma } = makeService();
      prisma.makeupTeachingSchedule.findMany.mockResolvedValueOnce([
        validScheduleRow(),
      ]);
      const result = await service.listCandidates(
        { academicYearId: yearId, page: 1, pageSize: 20 },
        request,
      );
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.sourceNormalOccurrenceKey).toBe(sourceKey);
      expect(result.items[0]!.hasActiveMakeupSchedule).toBe(true);
      expect(result.items[0]!.activeMakeupScheduleId).toBe(scheduleId);
    });
  });

  describe('Authorization Matrix (P3-031 negative proof)', () => {
    it('accepts exact TEACHING_OPERATION_MANAGE / SUBJECT grant', async () => {
      const { service, access } = makeService();
      access.requireTeachingSubject.mockResolvedValueOnce(undefined);
      const res = await service.create(createDto, request);
      expect(res.outcome).toBe('CREATED');
      expect(access.requireTeachingSubject).toHaveBeenCalledWith(request, subjectId);
    });

    it('rejects wrong subject grant with ForbiddenException', async () => {
      const { service, access } = makeService();
      access.requireTeachingSubject.mockRejectedValueOnce(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );
      await expect(service.create(createDto, request)).rejects.toThrow(ForbiddenException);
    });

    it('accepts SCHOOL_WIDE caller for subject operation', async () => {
      const { service, access } = makeService();
      access.requireTeachingSubject.mockResolvedValueOnce(undefined);
      const res = await service.create(createDto, request);
      expect(res.outcome).toBe('CREATED');
    });

    it('rejects SYSTEM_ADMIN alone (without TEACHING_OPERATION_MANAGE)', async () => {
      const { service, access } = makeService();
      access.requireTeachingSubject.mockRejectedValueOnce(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );
      await expect(service.create(createDto, request)).rejects.toThrow(ForbiddenException);
    });

    it('rejects PPCT_MANAGE alone', async () => {
      const { service, access } = makeService();
      access.requireTeachingSubject.mockRejectedValueOnce(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );
      await expect(service.create(createDto, request)).rejects.toThrow(ForbiddenException);
    });

    it('rejects TEACHING_EXECUTION_MANAGE alone', async () => {
      const { service, access } = makeService();
      access.requireTeachingSubject.mockRejectedValueOnce(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );
      await expect(service.create(createDto, request)).rejects.toThrow(ForbiddenException);
    });

    it('rejects teaching staff eligibility alone (StaffSubject coverage without capability grant)', async () => {
      const { service, access } = makeService();
      access.requireTeachingSubject.mockRejectedValueOnce(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );
      await expect(service.create(createDto, request)).rejects.toThrow(ForbiddenException);
    });

    it('requires exact retained subject authorization on idempotent replay (Finding 5)', async () => {
      const row = validScheduleRow();
      const { service, access } = makeService({
        makeupTeachingSchedule: {
          findUnique: jest.fn().mockResolvedValue(row),
        },
      });
      access.requireTeachingSubject.mockRejectedValueOnce(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );
      await expect(service.create(createDto, request)).rejects.toThrow(ForbiddenException);
      expect(access.requireTeachingSubject).toHaveBeenCalledWith(request, row.subjectId);
    });

    it('rejects cross-subject candidate enumeration when caller lacks SCHOOL_WIDE', async () => {
      const { service, access } = makeService();
      access.requireTeachingSchoolWide.mockRejectedValueOnce(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );
      await expect(
        service.listCandidates({ academicYearId: yearId, page: 1, pageSize: 20 }, request),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cross-subject schedule list when caller lacks SCHOOL_WIDE', async () => {
      const { service, access } = makeService();
      access.requireTeachingSchoolWide.mockRejectedValueOnce(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );
      await expect(
        service.list({ academicYearId: yearId, page: 1, pageSize: 20 }, request),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Advisory Target Options (Finding 7 / 9)', () => {
    it('returns human-readable slots and teachers', async () => {
      const { service, access } = makeService();
      const options = await service.getTargetOptions(
        { academicYearId: yearId, sourceNormalOccurrenceKey: sourceKey, targetCivilDate },
        request,
      );
      expect(access.requireTeachingSubject).toHaveBeenCalledWith(request, subjectId);
      expect(options.academicYearId).toBe(yearId);
      expect(options.targetCivilDate).toBe(targetCivilDate);
      expect(options.slots.length).toBeGreaterThan(0);
      expect(options.slots[0]!.displayLabel).toBe('Tiết 1 Chiều');
      expect(options.teachers.length).toBeGreaterThan(0);
      expect(options.teachers[0]!.displayName).toBe('Thầy Nguyễn Văn A');
    });

    it('rejects target options request when caller lacks subject authority', async () => {
      const { service, access } = makeService();
      access.requireTeachingSubject.mockRejectedValueOnce(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );
      await expect(
        service.getTargetOptions(
          { academicYearId: yearId, sourceNormalOccurrenceKey: sourceKey, targetCivilDate },
          request,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
