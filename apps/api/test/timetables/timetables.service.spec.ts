import { ConflictException, NotFoundException } from '@nestjs/common';
import { TimetablesService } from '../../src/timetables/timetables.service';

const now = new Date('2026-08-12T00:00:00.000Z');
const version = (overrides: Record<string, unknown> = {}) => ({
  id: 'version-1', academicYearId: 'year-1', versionNumber: 1, status: 'DRAFT', calendarVersionId: null,
  effectiveAcademicWeekId: null, effectiveFrom: null, effectiveUntil: null, contentChecksum: null, note: null,
  createdByUserId: 'actor', validatedByUserId: null, validatedAt: null, approvedByUserId: null, approvedAt: null,
  activatedByUserId: null, activatedAt: null, supersededAt: null, createdAt: now, updatedAt: now,
  _count: { entries: 0 }, ...overrides,
});

function harness(tx: Record<string, unknown>) {
  const audit = { write: jest.fn() };
  const prisma = { $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) };
  return { service: new TimetablesService(prisma as never, audit as never), audit };
}

describe('TimetablesService draft commands', () => {
  it('creates a normalized DRAFT with server numbering and null target/checksum', async () => {
    const create = jest.fn().mockResolvedValue(version({ note: 'Ghi chÃº' }));
    const tx = {
      academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year-1' }) },
      timetableVersion: { aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: null } }), create },
    };
    const { service, audit } = harness(tx);
    const result = await service.createVersion('year-1', { note: ' Ghi chÃº ' }, 'actor', { requestId: 'req' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ versionNumber: 1, status: 'DRAFT', note: 'Ghi chÃº', contentChecksum: null }) }));
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
      .rejects.toBeInstanceOf(ConflictException);
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
});
