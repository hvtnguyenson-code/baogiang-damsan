import { OperationalLessonDispositionType, Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import { PreviewCalendarExceptionDto, PreviewLessonDispositionDto } from '../../src/operational-overlays/dto';
import { OperationalOverlaysService } from '../../src/operational-overlays/operational-overlays.service';
import { OperationalWorkspaceContextService } from '../../src/operational-overlays/operational-workspace-context.service';
import { NormalStructuralOccurrence } from '../../src/resolved-occurrences/resolved-occurrence.types';

const now = new Date('2026-08-15T01:00:00.000Z');
const civilDate = '2026-08-17' as const;
const request = { auth: { user: { id: 'operator', mustChangePassword: false } } } as AuthenticatedRequest;
const unassessed = { ppctItemAllocation: 'NOT_ASSESSED', workload: 'NOT_ASSESSED', debt: 'NOT_ASSESSED' };
const calendarInput: PreviewCalendarExceptionDto = {
  academicYearId: 'year', academicCalendarVersionId: 'calendar', civilDate,
  scope: 'SCHOOL_WIDE', timeSelector: 'WHOLE_DAY',
};
const dispositionInput: PreviewLessonDispositionDto = {
  academicYearId: 'year', subjectId: 'subject', timetableEntryId: 'entry', sourceCivilDate: civilDate,
  dispositionType: 'SAME_SUBJECT_SUBSTITUTION', assignedTeacherUserId: 'substitute',
};
const teacherTypes = ['SAME_SUBJECT_SUBSTITUTION', 'DIFFERENT_SUBJECT_SUPERVISION'];
const dispositionTypes = Object.values(OperationalLessonDispositionType);
const calendar = {
  id: 'calendar', academicYearId: 'year', isActive: true,
  startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2027-05-31T00:00:00.000Z'),
};
const slot = {
  id: 'slot', academicYearId: 'year', weekday: 'MONDAY', session: 'MORNING',
  startTime: new Date('1970-01-01T07:00:00.000Z'), endTime: new Date('1970-01-01T07:45:00.000Z'),
  isActive: true, allowRegularTeaching: true,
};
const entry = {
  id: 'entry', academicYearId: 'year', subjectId: 'subject', schoolClassId: 'class',
  teacherUserId: 'responsible', weekday: 'MONDAY', timeSlotDefinitionId: 'slot',
  timetableVersion: {
    id: 'timetable', calendarVersionId: 'calendar', calendarVersion: calendar, status: 'ACTIVE',
    effectiveFrom: calendar.startDate, effectiveUntil: null,
  },
  timeSlotDefinition: slot, schoolClass: { gradeLevel: 10, status: 'ACTIVE' },
  subject: { status: 'ACTIVE' }, teacher: { status: 'ACTIVE', profile: { isTeachingStaff: true } },
  teachingAssignment: { validFrom: calendar.startDate, validUntil: null },
};
const occurrence: NormalStructuralOccurrence = {
  occurrenceKey: `NORMAL:entry:${civilDate}`, family: 'NORMAL_TIMETABLE_OPPORTUNITY', civilDate,
  academicYearId: 'year', academicCalendarVersionId: 'calendar', timetableVersionId: 'timetable',
  timetableEntryId: 'entry', teachingAssignmentId: 'assignment', subjectId: 'subject',
  responsibleTeacherUserId: 'responsible', schoolClass: { id: 'class', gradeLevel: 10 },
  timeSlot: { id: 'slot', weekday: 'MONDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
  ppctBinding: { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'version', ppctVersionStatus: 'PUBLISHED' },
  effectiveKind: 'BASE_TIMETABLE', interruptionIds: [], exceptionIds: [], suppressingSpecialActivityIds: [], disposition: null,
};

function inputFor(dispositionType: OperationalLessonDispositionType): PreviewLessonDispositionDto {
  return { ...dispositionInput, dispositionType, assignedTeacherUserId: teacherTypes.includes(dispositionType) ? 'substitute' : undefined };
}

// Only persistence and structural-source reads are fixtures. The workspace calls the real
// overlay validators, including eligibility, calendar scope/selector and interval collisions.
function harness() {
  const write = jest.fn(() => { throw new Error('Preview attempted a write'); });
  const mutations = { create: write, createMany: write, update: write, updateMany: write, delete: write, deleteMany: write };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year' }) },
    academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue(calendar) },
    schoolClass: {
      findUnique: jest.fn().mockResolvedValue({ id: 'class', academicYearId: 'year', gradeLevel: 10 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ gradeLevel: 10 }), findMany: jest.fn().mockResolvedValue([]),
    },
    timeSlotDefinition: { findUnique: jest.fn().mockResolvedValue(slot), findMany: jest.fn().mockResolvedValue([slot]) },
    timetableVersion: { findMany: jest.fn().mockResolvedValue([{ id: 'timetable' }]) },
    timetableEntry: { findUnique: jest.fn().mockResolvedValue(entry), findMany: jest.fn().mockResolvedValue([]), ...mutations },
    calendarInterruption: { findFirst: jest.fn().mockResolvedValue(null) },
    calendarException: { findMany: jest.fn().mockResolvedValue([]), ...mutations },
    operationalLessonDisposition: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), ...mutations },
    makeupTeachingSchedule: { findMany: jest.fn().mockResolvedValue([]), ...mutations },
    specialActivity: { findMany: jest.fn().mockResolvedValue([]), ...mutations },
    curricularTeachingExecution: { ...mutations },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'substitute', status: 'ACTIVE', profile: { isTeachingStaff: true } }),
      findMany: jest.fn().mockResolvedValue([{ id: 'substitute', profile: { displayName: 'Giáo viên thay' } }]),
    },
    staffSubject: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-subject' }) },
  };
  const prisma = { ...tx, $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
  const audit = { write: jest.fn() };
  const occurrences = {
    resolveInTransaction: jest.fn<Promise<{ status: string; coverage: { ppctItemAllocation: string }; normalOccurrences: NormalStructuralOccurrence[]; findings: unknown[] }>, [unknown, unknown]>().mockResolvedValue({ status: 'PASS', coverage: { ppctItemAllocation: 'NOT_ASSESSED' }, normalOccurrences: [occurrence], findings: [] }),
  };
  // This fixture intentionally supplies only structural coverage. It is never
  // evidence of assessed PPCT/workload; PostgreSQL tests exercise the real V2 orchestrator.
  const consequences = { evaluate: jest.fn(async (client: unknown) => {
    const source = await occurrences.resolveInTransaction(client, { academicYearId: 'year', civilDate });
    if (source.status !== 'PASS') throw new Error('UPSTREAM_BLOCKED');
    return { status: 'PASS', coverage: unassessed, streams: [], teachers: [], consequenceFingerprint: 'a'.repeat(64) };
  }) };
  const overlays = new OperationalOverlaysService(prisma as never, audit as never, {} as never, { now: () => now }, consequences as never);
  const authorization = { listEffectiveCapabilities: jest.fn().mockResolvedValue([
    { key: 'CALENDAR_EXCEPTION_MANAGE', scope: 'SCHOOL_WIDE' },
    { key: 'TEACHING_OPERATION_MANAGE', scope: 'SCHOOL_WIDE' },
  ]) };
  const service = new OperationalWorkspaceContextService(prisma as never, authorization as never, occurrences as never, overlays);
  return { service, prisma, tx, occurrences, audit, write };
}

describe('P5-054 T53-A/B preview consequence coverage boundary', () => {
  it.each([
    { scope: 'SCHOOL_WIDE' }, { scope: 'GRADE', gradeLevel: 10 }, { scope: 'CLASS', schoolClassId: 'class' },
  ] as const)('calendar $scope uses real coverage predicates without certifying consequences', async (scope) => {
    const h = harness();
    const result = await h.service.previewCalendarException(request, { ...calendarInput, ...scope });
    expect(result.status).toBe('BLOCKED'); // source/selector validity only
    expect(result.affected).toEqual([]);
    expect(result.coverage).toEqual(unassessed);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.occurrences.resolveInTransaction).not.toHaveBeenCalled();
    expect(h.tx.academicCalendarVersion.findUnique).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
    expect(h.audit.write).not.toHaveBeenCalled();
  });

  it.each([
    { timeSelector: 'SESSION', session: 'MORNING' },
    { timeSelector: 'EXACT_SLOTS', exactTimeSlotDefinitionIds: ['slot'] },
  ] as const)('calendar $timeSelector retains unassessed coverage after a valid exact selection', async (selector) => {
    const h = harness();
    const result = await h.service.previewCalendarException(request, { ...calendarInput, ...selector } as PreviewCalendarExceptionDto);
    expect(result.status).toBe('BLOCKED');
    expect(result.affected).toHaveLength(0);
    expect(result.coverage).toEqual(unassessed);
    expect(h.write).not.toHaveBeenCalled();
  });

  it.each(dispositionTypes)('%s validates the source and any assigned teacher but leaves all consequences unassessed', async (type) => {
    const h = harness();
    const result = await h.service.previewLessonDisposition(request, inputFor(type));
    expect(result).toMatchObject({ status: 'PASS', sourceTimetableEntryId: 'entry', coverage: unassessed });
    expect(h.tx.timetableEntry.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'entry' } }));
    expect(h.tx.user.findUnique).toHaveBeenCalledTimes(teacherTypes.includes(type) ? 1 : 0);
    expect(h.tx.staffSubject.findFirst).toHaveBeenCalledTimes(type === 'SAME_SUBJECT_SUBSTITUTION' ? 1 : 0);
    expect(h.tx.timeSlotDefinition.findUnique).toHaveBeenCalledTimes(teacherTypes.includes(type) ? 1 : 0);
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
    expect(h.occurrences.resolveInTransaction).toHaveBeenCalledWith(h.tx, { academicYearId: 'year', civilDate });
    expect(h.write).not.toHaveBeenCalled();
    expect(h.audit.write).not.toHaveBeenCalled();
  });

  it.each([
    { scope: 'GRADE', gradeLevel: 11 },
    { timeSelector: 'SESSION', session: 'AFTERNOON' },
  ] as const)('does not certify consequences when a valid calendar selection has no affected occurrence (%j)', async (selection) => {
    const h = harness();
    const result = await h.service.previewCalendarException(request, { ...calendarInput, ...selection });
    expect(result.status).toBe('BLOCKED');
    expect(result.affected).toEqual([]);
    expect(result.coverage).toEqual(unassessed);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('accepts adjacent intervals without promoting collision validity to consequence coverage', async () => {
    const h = harness();
    h.tx.makeupTeachingSchedule.findMany.mockResolvedValue([{
      targetTimeSlotDefinition: { ...slot, startTime: slot.endTime, endTime: new Date('1970-01-01T08:30:00.000Z') },
    }]);
    expect(await h.service.previewLessonDisposition(request, dispositionInput)).toMatchObject({ status: 'PASS', coverage: unassessed });
    expect(h.write).not.toHaveBeenCalled();
  });

  it.each(['calendar', ...dispositionTypes])('%s cannot turn blocked upstream diagnostics into assessed coverage', async (type) => {
    const h = harness();
    h.occurrences.resolveInTransaction.mockResolvedValue({
      status: 'BLOCKED', normalOccurrences: [occurrence], coverage: { ppctItemAllocation: 'ASSESSED' },
      findings: [{ entityIds: ['private-upstream-id'] }],
    });
    const result = type === 'calendar'
      ? await h.service.previewCalendarException(request, calendarInput)
      : await h.service.previewLessonDisposition(request, inputFor(type as OperationalLessonDispositionType));
    expect(result.status).toBe('BLOCKED');
    expect(result.coverage).toEqual(unassessed);
    expect(JSON.stringify(result)).not.toContain('private-upstream-id');
    expect(h.write).not.toHaveBeenCalled();
    expect(h.audit.write).not.toHaveBeenCalled();
  });

  it.each(teacherTypes)('%s blocks when command-time collision authority rejects an overlapping slot', async (type) => {
    for (const family of ['timetable', 'disposition', 'makeup', 'activity']) {
      const h = harness();
      // Distinct slot identity, real overlapping wall-clock interval.
      const overlapping = { ...slot, id: 'other-slot', startTime: new Date('1970-01-01T07:30:00.000Z') };
      if (family === 'timetable') h.tx.timetableEntry.findMany.mockResolvedValue([{ ...entry, timeSlotDefinition: overlapping }]);
      if (family === 'disposition') h.tx.operationalLessonDisposition.findMany.mockResolvedValue([{ timetableEntry: { timeSlotDefinition: overlapping } }]);
      if (family === 'makeup') h.tx.makeupTeachingSchedule.findMany.mockResolvedValue([{ targetTimeSlotDefinition: overlapping }]);
      if (family === 'activity') h.tx.specialActivity.findMany.mockResolvedValue([{ timeSlots: [{ timeSlotDefinition: overlapping }] }]);
      const result = await h.service.previewLessonDisposition(request, inputFor(type as OperationalLessonDispositionType));
      expect(result.status).toBe('BLOCKED');
      expect(result.coverage).toEqual(unassessed);
      expect(h.write).not.toHaveBeenCalled();
      expect(h.audit.write).not.toHaveBeenCalled();
    }
  });

  it('does not treat advisory teacher options as collision proof when the teacher later collides', async () => {
    const h = harness();
    const options = await h.service.getTeacherOptions(request, {
      academicYearId: 'year', subjectId: 'subject', dispositionType: 'SAME_SUBJECT_SUBSTITUTION',
    });
    expect(options.status).toBe('OPTIONS_NOT_COLLISION_CHECKED');
    expect(options.items).toHaveLength(1);
    expect(h.tx.timeSlotDefinition.findUnique).not.toHaveBeenCalled();
    h.tx.makeupTeachingSchedule.findMany.mockResolvedValue([{ targetTimeSlotDefinition: slot }]);
    expect(await h.service.previewLessonDisposition(request, dispositionInput)).toMatchObject({ status: 'BLOCKED', coverage: unassessed });
    expect(h.write).not.toHaveBeenCalled();
  });

  it('fails closed when same-subject eligibility disappears after candidate discovery', async () => {
    const h = harness();
    h.tx.staffSubject.findFirst.mockResolvedValue(null);
    expect(await h.service.previewLessonDisposition(request, dispositionInput)).toMatchObject({ status: 'BLOCKED', coverage: unassessed });
    expect(h.tx.timeSlotDefinition.findUnique).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });

  it.each(['disposition', 'makeup'])('calendar suppression blocks an ACTIVE %s instead of returning a complete preview', async (family) => {
    const h = harness();
    if (family === 'disposition') h.tx.operationalLessonDisposition.findMany.mockResolvedValue([{
      schoolClassId: 'class', timeSlotDefinitionId: 'slot', timetableEntry: { schoolClass: { gradeLevel: 10 }, timeSlotDefinition: slot },
    }]);
    else h.tx.makeupTeachingSchedule.findMany.mockResolvedValue([{ schoolClassId: 'class', targetTimeSlotDefinitionId: 'slot', targetTimeSlotDefinition: slot }]);
    expect(await h.service.previewCalendarException(request, calendarInput)).toMatchObject({ status: 'BLOCKED', affected: [], coverage: unassessed });
    expect(h.occurrences.resolveInTransaction).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });

  it.each(['calendar', ...dispositionTypes])('%s discards a preview when its transaction fails after validation', async (type) => {
    const h = harness();
    h.prisma.$transaction.mockImplementation(async (callback) => {
      await callback(h.tx);
      throw new Error('private-snapshot-failure');
    });
    const result = type === 'calendar'
      ? await h.service.previewCalendarException(request, calendarInput)
      : await h.service.previewLessonDisposition(request, inputFor(type as OperationalLessonDispositionType));
    expect(result.status).toBe('BLOCKED');
    expect(result.coverage).toEqual(unassessed);
    expect(JSON.stringify(result)).not.toContain('private-snapshot-failure');
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(type === 'calendar' ? 0 : 1);
    expect(h.write).not.toHaveBeenCalled();
    expect(h.audit.write).not.toHaveBeenCalled();
  });
});
