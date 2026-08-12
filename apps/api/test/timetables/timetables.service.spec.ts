import { ConflictException, NotFoundException } from '@nestjs/common';
import { STALE_MESSAGE, TimetablesService } from '../../src/timetables/timetables.service';

const now = new Date('2026-08-12T00:00:00.000Z');
const version = (overrides: Record<string, unknown> = {}) => ({
  id: 'version-1', academicYearId: 'year-1', versionNumber: 1, status: 'DRAFT', calendarVersionId: null,
  effectiveAcademicWeekId: null, effectiveFrom: null, effectiveUntil: null, contentChecksum: null, note: null,
  createdByUserId: 'actor', validatedByUserId: null, validatedAt: null, approvedByUserId: null, approvedAt: null,
  activatedByUserId: null, activatedAt: null, supersededAt: null, createdAt: now, updatedAt: now,
  _count: { entries: 0 }, ...overrides,
});

function harness(tx: Record<string, unknown>, root: Record<string, unknown> = tx) {
  const audit = { write: jest.fn() };
  const prisma = {
    ...root,
    $transaction: jest.fn((input: ((client: unknown) => unknown) | Promise<unknown>[]) => (
      Array.isArray(input) ? Promise.all(input) : input(tx)
    )),
  };
  return { service: new TimetablesService(prisma as never, audit as never), audit };
}

const requestedEntry = {
  weekday: 'MONDAY' as const,
  timeSlotDefinitionId: 'slot-1',
  schoolClassId: 'class-1',
  subjectId: 'subject-1',
  teachingAssignmentId: 'assignment-1',
};

function authoringTx(overrides: {
  slot?: Record<string, unknown>;
  schoolClass?: Record<string, unknown>;
  subject?: Record<string, unknown>;
  assignment?: Record<string, unknown>;
  teacher?: Record<string, unknown>;
  profile?: Record<string, unknown> | null;
} = {}) {
  const teacher = {
    status: 'ACTIVE',
    profile: { isTeachingStaff: true },
    ...overrides.teacher,
  };
  if ('profile' in overrides) teacher.profile = overrides.profile as never;
  return {
    timetableVersion: {
      findUnique: jest.fn().mockResolvedValue(version()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(version({ updatedAt: new Date(now.getTime() + 1) })),
    },
    timeSlotDefinition: { findMany: jest.fn().mockResolvedValue([{
      id: 'slot-1', academicYearId: 'year-1', weekday: 'MONDAY', isActive: true,
      allowRegularTeaching: true, ...overrides.slot,
    }]) },
    schoolClass: { findMany: jest.fn().mockResolvedValue([{
      id: 'class-1', academicYearId: 'year-1', status: 'ACTIVE', ...overrides.schoolClass,
    }]) },
    subject: { findMany: jest.fn().mockResolvedValue([{
      id: 'subject-1', status: 'ACTIVE', ...overrides.subject,
    }]) },
    teachingAssignment: { findMany: jest.fn().mockResolvedValue([{
      id: 'assignment-1', academicYearId: 'year-1', schoolClassId: 'class-1', subjectId: 'subject-1',
      teacherUserId: 'teacher-from-assignment', teacher, ...overrides.assignment,
    }]) },
    timetableEntry: {
      count: jest.fn().mockResolvedValue(1),
      deleteMany: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('TimetablesService draft commands', () => {
  it('creates a normalized DRAFT with server numbering and null target/checksum', async () => {
    const create = jest.fn().mockResolvedValue(version({ note: 'Ghi chú' }));
    const tx = {
      academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year-1' }) },
      timetableVersion: { aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: null } }), create },
    };
    const { service, audit } = harness(tx);
    const result = await service.createVersion('year-1', { note: ' Ghi chú ' }, 'actor', { requestId: 'req' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ versionNumber: 1, status: 'DRAFT', note: 'Ghi chú', contentChecksum: null }) }));
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'TIMETABLE_VERSION_DRAFT_CREATED' }), tx);
    expect(result.entryCount).toBe(0);
  });

  it('returns 404 for unknown academic year', async () => {
    const { service } = harness({ academicYear: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(service.createVersion('missing', {}, 'actor', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('derives target effectiveFrom from the minimum split-week segment and advances token', async () => {
    const updated = version({ calendarVersionId: 'calendar-1', effectiveAcademicWeekId: 'week-1', effectiveFrom: new Date('2026-09-07Z'), updatedAt: new Date('2026-08-12T00:00:00.001Z') });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      timetableVersion: { findUnique: jest.fn().mockResolvedValue(version()), findUniqueOrThrow: jest.fn().mockResolvedValue(updated), updateMany },
      academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue({ id: 'calendar-1', academicYearId: 'year-1', isActive: false }) },
      academicWeek: { findUnique: jest.fn().mockResolvedValue({ id: 'week-1', calendarVersionId: 'calendar-1', kind: 'RESERVE', segments: [
        { id: 'segment-1', startDate: new Date('2026-09-07Z') }, { id: 'segment-2', startDate: new Date('2026-09-10Z') },
      ] }) },
    };
    const { service } = harness(tx);
    const result = await service.setTarget('version-1', { expectedUpdatedAt: now.toISOString(), calendarVersionId: 'calendar-1', effectiveAcademicWeekId: 'week-1' }, 'actor', {});
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ effectiveFrom: new Date('2026-09-07Z') }) }));
    expect(result.effectiveFrom).toBe('2026-09-07');
    expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(now.getTime());
  });

  it('rejects a stale expectedUpdatedAt token', async () => {
    const tx = {
      timetableVersion: { findUnique: jest.fn().mockResolvedValue(version()), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue({ id: 'calendar-1', academicYearId: 'year-1' }) },
      academicWeek: { findUnique: jest.fn().mockResolvedValue({ id: 'week-1', calendarVersionId: 'calendar-1', segments: [{ startDate: new Date('2026-09-07Z') }] }) },
    };
    const { service } = harness(tx);
    await expect(service.setTarget('version-1', { expectedUpdatedAt: '2026-08-11T00:00:00.000Z', calendarVersionId: 'calendar-1', effectiveAcademicWeekId: 'week-1' }, 'actor', {}))
      .rejects.toMatchObject({ message: STALE_MESSAGE });
  });

  it('rejects all 04B1 mutations once status is not DRAFT', async () => {
    const tx = { timetableVersion: { findUnique: jest.fn().mockResolvedValue(version({ status: 'VALIDATED' })) } };
    const { service } = harness(tx);
    await expect(service.replaceEntries('version-1', { expectedUpdatedAt: now.toISOString(), entries: [] }, 'actor', {}))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('resolves the teacher snapshot from the exact assignment and replaces all rows atomically', async () => {
    const reloaded = version({ updatedAt: new Date('2026-08-12T00:00:00.001Z'), _count: { entries: 1 } });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      timetableVersion: {
        findUnique: jest.fn().mockResolvedValue(version()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(reloaded),
      },
      timeSlotDefinition: { findMany: jest.fn().mockResolvedValue([{ id: 'slot-1', academicYearId: 'year-1', weekday: 'MONDAY', isActive: true, allowRegularTeaching: true }]) },
      schoolClass: { findMany: jest.fn().mockResolvedValue([{ id: 'class-1', academicYearId: 'year-1', status: 'ACTIVE' }]) },
      subject: { findMany: jest.fn().mockResolvedValue([{ id: 'subject-1', status: 'ACTIVE' }]) },
      teachingAssignment: { findMany: jest.fn().mockResolvedValue([{
        id: 'assignment-1', academicYearId: 'year-1', schoolClassId: 'class-1', subjectId: 'subject-1',
        teacherUserId: 'teacher-from-assignment', teacher: { status: 'ACTIVE', profile: { isTeachingStaff: true } },
      }]) },
      timetableEntry: { count: jest.fn().mockResolvedValue(2), deleteMany: jest.fn(), createMany },
    };
    const { service, audit } = harness(tx);
    const result = await service.replaceEntries('version-1', {
      expectedUpdatedAt: now.toISOString(),
      entries: [{ weekday: 'MONDAY', timeSlotDefinitionId: 'slot-1', schoolClassId: 'class-1', subjectId: 'subject-1', teachingAssignmentId: 'assignment-1' }],
    }, 'actor', {});
    expect(createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ teacherUserId: 'teacher-from-assignment' })] });
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'TIMETABLE_ENTRIES_REPLACED', metadata: expect.objectContaining({ previousCount: 2, entryCount: 1 }) }), tx);
    expect(result).toMatchObject({ previousCount: 2, entryCount: 1, version: { entryCount: 1 } });
  });

  it('validates every replacement reference before claiming the token or deleting old content', async () => {
    const updateMany = jest.fn();
    const deleteMany = jest.fn();
    const tx = {
      timetableVersion: { findUnique: jest.fn().mockResolvedValue(version()), updateMany },
      timeSlotDefinition: { findMany: jest.fn().mockResolvedValue([]) },
      schoolClass: { findMany: jest.fn().mockResolvedValue([]) },
      subject: { findMany: jest.fn().mockResolvedValue([]) },
      teachingAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      timetableEntry: { deleteMany },
    };
    const { service, audit } = harness(tx);
    await expect(service.replaceEntries('version-1', {
      expectedUpdatedAt: now.toISOString(),
      entries: [{ weekday: 'MONDAY', timeSlotDefinitionId: 'missing', schoolClassId: 'missing', subjectId: 'missing', teachingAssignmentId: 'missing' }],
    }, 'actor', {})).rejects.toBeInstanceOf(NotFoundException);
    expect(updateMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it.each([
    ['slot from another year', { slot: { academicYearId: 'year-2' } }],
    ['slot weekday mismatch', { slot: { weekday: 'TUESDAY' } }],
    ['inactive slot', { slot: { isActive: false } }],
    ['non-regular slot', { slot: { allowRegularTeaching: false } }],
    ['class from another year', { schoolClass: { academicYearId: 'year-2' } }],
    ['inactive class', { schoolClass: { status: 'INACTIVE' } }],
    ['inactive subject', { subject: { status: 'INACTIVE' } }],
    ['assignment from another year', { assignment: { academicYearId: 'year-2' } }],
    ['assignment for another class', { assignment: { schoolClassId: 'class-2' } }],
    ['assignment for another subject', { assignment: { subjectId: 'subject-2' } }],
    ['inactive teacher', { teacher: { status: 'DISABLED' } }],
    ['missing teacher profile', { profile: null }],
    ['non-teaching user', { profile: { isTeachingStaff: false } }],
  ])('rejects authoring policy violation: %s', async (_label, overrides) => {
    const tx = authoringTx(overrides);
    const { service, audit } = harness(tx);
    await expect(service.replaceEntries('version-1', {
      expectedUpdatedAt: now.toISOString(), entries: [requestedEntry],
    }, 'actor', {})).rejects.toBeInstanceOf(ConflictException);
    expect(tx.timetableVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.timetableEntry.deleteMany).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('treats entries=[] as an atomic clear and advances the draft token', async () => {
    const tx = authoringTx();
    const { service, audit } = harness(tx);
    const result = await service.replaceEntries('version-1', {
      expectedUpdatedAt: now.toISOString(), entries: [],
    }, 'actor', {});
    expect(tx.timetableVersion.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.timetableEntry.deleteMany).toHaveBeenCalledWith({ where: { timetableVersionId: 'version-1' } });
    expect(tx.timetableEntry.createMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ previousCount: 1, entryCount: 0 });
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TIMETABLE_ENTRIES_REPLACED', metadata: expect.objectContaining({ previousCount: 1, entryCount: 0 }),
    }), tx);
  });

  it.each([
    ['calendar from another year', { calendarYear: 'year-2', weekCalendar: 'calendar-1', segments: [{ startDate: new Date('2026-09-07Z') }] }],
    ['week from another calendar', { calendarYear: 'year-1', weekCalendar: 'calendar-2', segments: [{ startDate: new Date('2026-09-07Z') }] }],
    ['week without segments', { calendarYear: 'year-1', weekCalendar: 'calendar-1', segments: [] }],
  ])('rejects invalid target composition: %s', async (_label, input) => {
    const tx = {
      timetableVersion: { findUnique: jest.fn().mockResolvedValue(version()), updateMany: jest.fn() },
      academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue({ id: 'calendar-1', academicYearId: input.calendarYear, isActive: false }) },
      academicWeek: { findUnique: jest.fn().mockResolvedValue({ id: 'week-1', calendarVersionId: input.weekCalendar, kind: 'RESERVE', segments: input.segments }) },
    };
    const { service, audit } = harness(tx);
    await expect(service.setTarget('version-1', {
      expectedUpdatedAt: now.toISOString(), calendarVersionId: 'calendar-1', effectiveAcademicWeekId: 'week-1',
    }, 'actor', {})).rejects.toBeInstanceOf(ConflictException);
    expect(tx.timetableVersion.updateMany).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });
});

describe('TimetablesService read model', () => {
  it('applies version status filtering and returns stable pagination metadata', async () => {
    const root = {
      academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year-1' }) },
      timetableVersion: {
        findMany: jest.fn().mockResolvedValue([version({ status: 'VALIDATED' })]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const { service, audit } = harness({}, root);
    const result = await service.listVersions('year-1', { status: 'VALIDATED', page: 2, pageSize: 5 });
    expect(root.timetableVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { academicYearId: 'year-1', status: 'VALIDATED' }, skip: 5, take: 5,
    }));
    expect(result).toMatchObject({ page: 2, pageSize: 5, total: 1, items: [{ status: 'VALIDATED' }] });
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('reads historical non-DRAFT metadata without applying authoring policy', async () => {
    const root = { timetableVersion: { findUnique: jest.fn().mockResolvedValue(version({ status: 'SUPERSEDED' })) } };
    const { service, audit } = harness({}, root);
    await expect(service.getVersion('version-1')).resolves.toMatchObject({ status: 'SUPERSEDED' });
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('filters entries while retaining a historical inactive slot snapshot', async () => {
    const entry = {
      id: 'entry-1', timetableVersionId: 'version-1', academicYearId: 'year-1', weekday: 'MONDAY',
      timeSlotDefinitionId: 'slot-1', schoolClassId: 'class-1', subjectId: 'subject-1',
      teachingAssignmentId: 'assignment-1', teacherUserId: 'teacher-1', createdAt: now,
      timeSlotDefinition: {
        id: 'slot-1', academicYearId: 'year-1', weekday: 'MONDAY', session: 'MORNING', ordinal: 1,
        revision: 1, displayLabel: 'Tiết 1', startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'), isActive: false, allowRegularTeaching: true,
        allowMakeupTeaching: false, allowSelfStudy: false, createdAt: now, updatedAt: now,
      },
      schoolClass: { id: 'class-1', code: '10A1', name: '10A1', gradeLevel: 10, status: 'INACTIVE' },
      subject: { id: 'subject-1', code: 'TOAN', name: 'Toán', status: 'INACTIVE' },
      teacher: { id: 'teacher-1', username: 'teacher', status: 'DISABLED', profile: null },
      teachingAssignment: { id: 'assignment-1', validFrom: new Date('2026-09-01Z'), validUntil: null },
    };
    const root = {
      timetableVersion: { findUnique: jest.fn().mockResolvedValue({ id: 'version-1' }) },
      timetableEntry: { findMany: jest.fn().mockResolvedValue([entry]), count: jest.fn().mockResolvedValue(1) },
    };
    const { service, audit } = harness({}, root);
    const result = await service.listEntries('version-1', {
      weekday: 'MONDAY', schoolClassId: 'class-1', subjectId: 'subject-1', teacherUserId: 'teacher-1',
      page: 1, pageSize: 20,
    });
    expect(root.timetableEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        timetableVersionId: 'version-1', weekday: 'MONDAY', schoolClassId: 'class-1',
        subjectId: 'subject-1', teacherUserId: 'teacher-1',
      },
    }));
    expect(result.items[0]).toMatchObject({ timeSlot: { isActive: false }, teacher: { userStatus: 'DISABLED' } });
    expect(audit.write).not.toHaveBeenCalled();
  });
});
