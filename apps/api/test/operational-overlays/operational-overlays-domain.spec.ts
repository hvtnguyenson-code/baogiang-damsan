import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CalendarExceptionScope, CalendarExceptionTimeSelector, OperationalLessonDispositionType, OperationalOverlayStatus, TimeSlotSession, TimetableVersionStatus } from '@prisma/client';
import { CreateLessonDispositionDto } from '../../src/operational-overlays/dto';
import { OperationalOverlaysService } from '../../src/operational-overlays/operational-overlays.service';

const now = new Date('2026-08-15T01:00:00.000Z');
const date = new Date('2026-08-17T00:00:00.000Z');
interface CalendarValue {
  academicYearId: string; academicCalendarVersionId: string; civilDate: string;
  scope: CalendarExceptionScope; gradeLevel: number | null; schoolClassId: string | null;
  timeSelector: CalendarExceptionTimeSelector; session: TimeSlotSession | null;
  exactTimeSlotDefinitionIds: string[]; note: string | null; replacesId: string | null;
}
const calendarValue: CalendarValue = {
  academicYearId: 'year', academicCalendarVersionId: 'calendar', civilDate: '2026-08-17',
  scope: CalendarExceptionScope.SCHOOL_WIDE, gradeLevel: null, schoolClassId: null,
  timeSelector: CalendarExceptionTimeSelector.WHOLE_DAY, session: null,
  exactTimeSlotDefinitionIds: [] as string[], note: null, replacesId: null,
};

function service() {
  return new OperationalOverlaysService({} as never, {} as never, {} as never, { now: () => now });
}

function calendarTx(overrides: Record<string, unknown> = {}) {
  return {
    academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year' }) },
    academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue({ id: 'calendar', academicYearId: 'year', startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2027-05-31T00:00:00.000Z'), isActive: true }) },
    schoolClass: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    calendarInterruption: { findFirst: jest.fn().mockResolvedValue(null) },
    timeSlotDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    calendarException: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    operationalLessonDisposition: { findMany: jest.fn().mockResolvedValue([]) },
    makeupTeachingSchedule: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry', academicYearId: 'year', timetableVersionId: 'version', weekday: 'MONDAY',
    timeSlotDefinitionId: 'slot', schoolClassId: 'class', subjectId: 'subject', teachingAssignmentId: 'assignment', teacherUserId: 'responsible',
    timetableVersion: { id: 'version', academicYearId: 'year', status: TimetableVersionStatus.ACTIVE, calendarVersionId: 'calendar', effectiveFrom: new Date('2026-08-01T00:00:00.000Z'), effectiveUntil: null, calendarVersion: { startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2027-05-31T00:00:00.000Z'), isActive: true } },
    timeSlotDefinition: { id: 'slot', weekday: 'MONDAY', session: 'MORNING', isActive: true, allowRegularTeaching: true },
    schoolClass: { gradeLevel: 10, status: 'ACTIVE' }, subject: { status: 'ACTIVE' },
    teachingAssignment: { validFrom: new Date('2026-08-01T00:00:00.000Z'), validUntil: null },
    teacher: { status: 'ACTIVE', profile: { isTeachingStaff: true } }, ...overrides,
  };
}

function sourceTx(overrides: Record<string, unknown> = {}) {
  return {
    timetableVersion: { findMany: jest.fn().mockResolvedValue([{ id: 'version' }]) },
    calendarInterruption: { findFirst: jest.fn().mockResolvedValue(null) },
    calendarException: { findMany: jest.fn().mockResolvedValue([]) }, ...overrides,
  };
}

describe('OperationalOverlaysService domain validation', () => {
  const calendarInternal = () => service() as unknown as { validateCalendarCreate(tx: unknown, value: CalendarValue): Promise<void> };
  const sourceInternal = () => service() as unknown as { validateDispositionSource(tx: unknown, entry: unknown, date: Date, note: string | null): Promise<void> };

  it('rejects an unknown academic year', async () => {
    const tx = calendarTx({ academicYear: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(calendarInternal().validateCalendarCreate(tx, calendarValue)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rejects a cross-year calendar', async () => {
    const tx = calendarTx({ academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue({ id: 'calendar', academicYearId: 'other' }) } });
    await expect(calendarInternal().validateCalendarCreate(tx, calendarValue)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects a date outside the exact calendar', async () => {
    const tx = calendarTx();
    await expect(calendarInternal().validateCalendarCreate(tx, { ...calendarValue, civilDate: '2027-06-01' })).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects an inactive calendar for a current/future command', async () => {
    const tx = calendarTx({ academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue({ id: 'calendar', academicYearId: 'year', startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2027-05-31T00:00:00.000Z'), isActive: false }) } });
    await expect(calendarInternal().validateCalendarCreate(tx, calendarValue)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects a cross-year class target', async () => {
    const tx = calendarTx({ schoolClass: { findUnique: jest.fn().mockResolvedValue({ academicYearId: 'other' }) } });
    await expect(calendarInternal().validateCalendarCreate(tx, { ...calendarValue, scope: CalendarExceptionScope.CLASS, schoolClassId: 'class' })).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects a retained interruption date', async () => {
    const tx = calendarTx({ calendarInterruption: { findFirst: jest.fn().mockResolvedValue({ id: 'interruption' }) } });
    await expect(calendarInternal().validateCalendarCreate(tx, calendarValue)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects empty or missing exact slot identities at the service boundary', () => {
    const internal = service() as unknown as { normalizeCalendar(value: object): unknown };
    expect(() => internal.normalizeCalendar({ ...calendarValue, timeSelector: CalendarExceptionTimeSelector.EXACT_SLOTS, exactTimeSlotDefinitionIds: [] })).toThrow(BadRequestException);
  });
  it.each([
    [{ id: 'slot', academicYearId: 'other', weekday: 'MONDAY', isActive: true }, 'cross-year'],
    [{ id: 'slot', academicYearId: 'year', weekday: 'TUESDAY', isActive: true }, 'weekday'],
    [{ id: 'slot', academicYearId: 'year', weekday: 'MONDAY', isActive: false }, 'inactive'],
  ])('rejects an invalid exact slot: %s %s', async (slot) => {
    const tx = calendarTx({ timeSlotDefinition: { findMany: jest.fn().mockResolvedValue([slot]) } });
    const value = { ...calendarValue, timeSelector: CalendarExceptionTimeSelector.EXACT_SLOTS, exactTimeSlotDefinitionIds: ['slot'] };
    await expect(calendarInternal().validateCalendarCreate(tx, value)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects an overlapping active calendar exception', async () => {
    const existing = { ...calendarValue, id: 'existing', exactTimeSlots: [], schoolClass: null };
    const tx = calendarTx({ calendarException: { findMany: jest.fn().mockResolvedValue([existing]), findUnique: jest.fn() } });
    await expect(calendarInternal().validateCalendarCreate(tx, calendarValue)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects suppression of an active disposition', async () => {
    const disposition = { schoolClassId: 'class', timeSlotDefinitionId: 'slot', timetableEntry: { schoolClass: { gradeLevel: 10 }, timeSlotDefinition: { session: 'MORNING' } } };
    const tx = calendarTx({ operationalLessonDisposition: { findMany: jest.fn().mockResolvedValue([disposition]) } });
    await expect(calendarInternal().validateCalendarCreate(tx, calendarValue)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects suppression of an active make-up target', async () => {
    const makeup = { schoolClassId: 'class', targetTimeSlotDefinitionId: 'slot', targetTimeSlotDefinition: { session: 'MORNING' } };
    const tx = calendarTx({ makeupTeachingSchedule: { findMany: jest.fn().mockResolvedValue([makeup]) }, schoolClass: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 'class', gradeLevel: 10 }]) } });
    await expect(calendarInternal().validateCalendarCreate(tx, calendarValue)).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepts a fully coherent current/future retained source', async () => {
    await expect(sourceInternal().validateDispositionSource(sourceTx(), source(), date, null)).resolves.toBeUndefined();
  });
  it('rejects source date outside timetable effectivity', async () => {
    const entry = source({ timetableVersion: { ...source().timetableVersion, effectiveFrom: new Date('2026-08-18T00:00:00.000Z') } });
    await expect(sourceInternal().validateDispositionSource(sourceTx(), entry, date, null)).rejects.toBeInstanceOf(ConflictException);
  });
  it.each([TimetableVersionStatus.DRAFT, TimetableVersionStatus.VALIDATED, TimetableVersionStatus.APPROVED, TimetableVersionStatus.SUPERSEDED])('rejects current/future source status %s', async (status) => {
    const entry = source({ timetableVersion: { ...source().timetableVersion, status } });
    await expect(sourceInternal().validateDispositionSource(sourceTx(), entry, date, null)).rejects.toBeInstanceOf(ConflictException);
  });
  it('allows a retrospective SUPERSEDED retained source with an explicit note', async () => {
    const historicalDate = new Date('2026-08-10T00:00:00.000Z');
    const entry = source({ timetableVersion: { ...source().timetableVersion, status: TimetableVersionStatus.SUPERSEDED }, weekday: 'MONDAY', timeSlotDefinition: { ...source().timeSlotDefinition, weekday: 'MONDAY' } });
    await expect(sourceInternal().validateDispositionSource(sourceTx(), entry, historicalDate, 'correction')).resolves.toBeUndefined();
  });
  it('rejects a retrospective command without a note', async () => {
    const historicalDate = new Date('2026-08-10T00:00:00.000Z');
    const entry = source({ timetableVersion: { ...source().timetableVersion, status: TimetableVersionStatus.SUPERSEDED } });
    await expect(sourceInternal().validateDispositionSource(sourceTx(), entry, historicalDate, null)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects a weekday mismatch', async () => {
    await expect(sourceInternal().validateDispositionSource(sourceTx(), source({ weekday: 'TUESDAY' }), date, null)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects an assignment validity mismatch', async () => {
    const entry = source({ teachingAssignment: { validFrom: new Date('2026-08-18T00:00:00.000Z'), validUntil: null } });
    await expect(sourceInternal().validateDispositionSource(sourceTx(), entry, date, null)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects interruption precedence', async () => {
    const tx = sourceTx({ calendarInterruption: { findFirst: jest.fn().mockResolvedValue({ id: 'interruption' }) } });
    await expect(sourceInternal().validateDispositionSource(tx, source(), date, null)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects one applicable active exception and fails closed on multiple', async () => {
    const exception = { scope: CalendarExceptionScope.SCHOOL_WIDE, gradeLevel: null, schoolClassId: null, timeSelector: CalendarExceptionTimeSelector.WHOLE_DAY, session: null, exactTimeSlots: [] };
    const one = sourceTx({ calendarException: { findMany: jest.fn().mockResolvedValue([{ ...exception, id: 'one' }]) } });
    const two = sourceTx({ calendarException: { findMany: jest.fn().mockResolvedValue([{ ...exception, id: 'one' }, { ...exception, id: 'two' }]) } });
    await expect(sourceInternal().validateDispositionSource(one, source(), date, null)).rejects.toBeInstanceOf(ConflictException);
    await expect(sourceInternal().validateDispositionSource(two, source(), date, null)).rejects.toBeInstanceOf(ConflictException);
  });

  it('freezes deterministic same-subject eligibility evidence', async () => {
    const internal = service() as unknown as { resolveEligibility(tx: unknown, dto: CreateLessonDispositionDto, subjectId: string): Promise<Record<string, unknown>> };
    const tx = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'teacher', status: 'ACTIVE', profile: { isTeachingStaff: true } }) }, staffSubject: { findFirst: jest.fn().mockResolvedValue({ id: 'proof' }) } };
    await expect(internal.resolveEligibility(tx, { assignedTeacherUserId: 'teacher', dispositionType: OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION } as CreateLessonDispositionDto, 'subject')).resolves.toMatchObject({ eligibilitySameSubject: true, eligibilityStaffSubjectId: 'proof' });
  });
  it('rejects inactive/nonteaching/missing-profile teachers', async () => {
    const internal = service() as unknown as { resolveEligibility(tx: unknown, dto: CreateLessonDispositionDto, subjectId: string): Promise<unknown> };
    for (const user of [{ status: 'INACTIVE', profile: { isTeachingStaff: true } }, { status: 'ACTIVE', profile: { isTeachingStaff: false } }, { status: 'ACTIVE', profile: null }]) {
      const tx = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
      await expect(internal.resolveEligibility(tx, { assignedTeacherUserId: 'teacher', dispositionType: OperationalLessonDispositionType.DIFFERENT_SUBJECT_SUPERVISION } as CreateLessonDispositionDto, 'subject')).rejects.toBeInstanceOf(ConflictException);
    }
  });
  it('rejects same-subject substitution without valid StaffSubject', async () => {
    const internal = service() as unknown as { resolveEligibility(tx: unknown, dto: CreateLessonDispositionDto, subjectId: string): Promise<unknown> };
    const tx = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'teacher', status: 'ACTIVE', profile: { isTeachingStaff: true } }) }, staffSubject: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(internal.resolveEligibility(tx, { assignedTeacherUserId: 'teacher', dispositionType: OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION } as CreateLessonDispositionDto, 'subject')).rejects.toBeInstanceOf(ConflictException);
  });
  it('freezes different-subject supervision without StaffSubject proof', async () => {
    const internal = service() as unknown as { resolveEligibility(tx: unknown, dto: CreateLessonDispositionDto, subjectId: string): Promise<Record<string, unknown>> };
    const tx = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'teacher', status: 'ACTIVE', profile: { isTeachingStaff: true } }) }, staffSubject: { findFirst: jest.fn() } };
    await expect(internal.resolveEligibility(tx, { assignedTeacherUserId: 'teacher', dispositionType: OperationalLessonDispositionType.DIFFERENT_SUBJECT_SUPERVISION } as CreateLessonDispositionDto, 'subject')).resolves.toMatchObject({ eligibilitySameSubject: false, eligibilityStaffSubjectId: null });
    expect(tx.staffSubject.findFirst).not.toHaveBeenCalled();
  });

  it.each(['disposition', 'makeup'])('rejects assigned-teacher overlay occupancy from %s', async (kind) => {
    const internal = service() as unknown as { assertTeacherAvailable(tx: unknown, teacher: string, date: Date, weekday: string, slot: string): Promise<void> };
    const tx = {
      operationalLessonDisposition: { findFirst: jest.fn().mockResolvedValue(kind === 'disposition' ? { id: 'busy' } : null) },
      makeupTeachingSchedule: { findFirst: jest.fn().mockResolvedValue(kind === 'makeup' ? { id: 'busy' } : null) },
      timetableEntry: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await expect(internal.assertTeacherAvailable(tx, 'teacher', date, 'MONDAY', 'slot')).rejects.toBeInstanceOf(ConflictException);
  });
  it('allows a teacher when canonical occupancy is empty', async () => {
    const internal = service() as unknown as { assertTeacherAvailable(tx: unknown, teacher: string, date: Date, weekday: string, slot: string): Promise<void> };
    const tx = { operationalLessonDisposition: { findFirst: jest.fn().mockResolvedValue(null) }, makeupTeachingSchedule: { findFirst: jest.fn().mockResolvedValue(null) }, timetableEntry: { findMany: jest.fn().mockResolvedValue([]) } };
    await expect(internal.assertTeacherAvailable(tx, 'teacher', date, 'MONDAY', 'slot')).resolves.toBeUndefined();
  });
  it('requires a reversed same-family predecessor', async () => {
    const internal = service() as unknown as { requireReplacement(tx: unknown, family: 'calendar' | 'disposition', replacesId: string | null): Promise<void> };
    const tx = { calendarException: { findUnique: jest.fn().mockResolvedValue({ status: OperationalOverlayStatus.ACTIVE }) }, operationalLessonDisposition: { findUnique: jest.fn() } };
    await expect(internal.requireReplacement(tx, 'calendar', 'predecessor')).rejects.toBeInstanceOf(ConflictException);
  });
});
