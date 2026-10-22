import { ForbiddenException } from '@nestjs/common';
import { OperationalWorkspaceContextService } from '../../src/operational-overlays/operational-workspace-context.service';

const request = { auth: { user: { id: 'user-1', mustChangePassword: false } } };
const yearFindMany = jest.fn(async () => [{ id: 'year-1', code: '2026-2027', name: 'Năm học 2026-2027' }]);
const subjectFindMany = jest.fn(async () => [{ id: 'subject-1', code: 'TOAN', name: 'Toán' }]);
const listEffectiveCapabilities = jest.fn();
const resolve = jest.fn();
const service = new OperationalWorkspaceContextService(
  { academicYear: { findMany: yearFindMany }, subject: { findMany: subjectFindMany }, schoolClass: { findMany: jest.fn(async () => [{ id: 'class-1', name: '10A1' }]) }, user: { findMany: jest.fn(async () => [{ id: 'teacher', profile: { displayName: 'Giáo viên A' } }]) } } as never,
  { listEffectiveCapabilities } as never,
  { resolve } as never,
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('P5-054 operational workspace context', () => {
  it('fails closed for unauthorized users without exposing year and subject data', async () => {
    listEffectiveCapabilities.mockResolvedValue([]);
    await expect(service.getContext(request as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(yearFindMany).not.toHaveBeenCalled();
    expect(subjectFindMany).not.toHaveBeenCalled();
  });

  it('rejects first-password-change accounts before any data access', async () => {
    await expect(service.getContext({ auth: { user: { id: 'user-1', mustChangePassword: true } } } as never))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(listEffectiveCapabilities).not.toHaveBeenCalled();
  });

  it('restricts subject metadata to exact authorized subject IDs', async () => {
    listEffectiveCapabilities.mockResolvedValue([
      { key: 'TEACHING_OPERATION_MANAGE', scope: 'SUBJECT', resourceId: 'subject-1' },
    ]);
    const result = await service.getContext(request as never);
    expect(result.permissions.teachingSchoolWide).toBe(false);
    expect(result.permissions.teachingSubjectIds).toEqual(['subject-1']);
    expect(subjectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['subject-1'] }, status: 'ACTIVE' },
    }));
    expect(yearFindMany).toHaveBeenCalledTimes(1);
  });

  it('does not confer subject authority from calendar-only grant', async () => {
    listEffectiveCapabilities.mockResolvedValue([
      { key: 'CALENDAR_EXCEPTION_MANAGE', scope: 'SCHOOL_WIDE' },
    ]);
    const result = await service.getContext(request as never);
    expect(result.permissions.calendarSchoolWide).toBe(true);
    expect(result.permissions.teachingSchoolWide).toBe(false);
    expect(result.subjects).toEqual([]);
  });

  it('blocks source discovery without authorized subject, before resolving', async () => {
    listEffectiveCapabilities.mockResolvedValue([{ key: 'TEACHING_OPERATION_MANAGE', scope: 'SUBJECT', resourceId: 'subject-1' }]);
    await expect(service.getSourceOccurrences(request as never, { academicYearId: 'year-1', civilDate: '2026-10-22', subjectId: 'subject-2' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('fails closed on a blocked canonical source without exposing findings', async () => {
    listEffectiveCapabilities.mockResolvedValue([{ key: 'TEACHING_OPERATION_MANAGE', scope: 'SUBJECT', resourceId: 'subject-1' }]);
    resolve.mockResolvedValue({ status: 'BLOCKED', normalOccurrences: [], findings: [{ entityIds: ['secret'] }], coverage: { ppctItemAllocation: 'NOT_ASSESSED' } });
    const result = await service.getSourceOccurrences(request as never, { academicYearId: 'year-1', civilDate: '2026-10-22', subjectId: 'subject-1' } as never);
    expect(result.status).toBe('BLOCKED');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('filters cross-subject occurrences before returning data', async () => {
    listEffectiveCapabilities.mockResolvedValue([{ key: 'TEACHING_OPERATION_MANAGE', scope: 'SUBJECT', resourceId: 'subject-1' }]);
    const make = (subjectId: string) => ({ occurrenceKey: 'NORMAL:entry:2026-10-22', timetableEntryId: 'entry', civilDate: '2026-10-22', schoolClass: { id: 'class-1', gradeLevel: 10 }, subjectId, responsibleTeacherUserId: 'teacher', timeSlot: { id: 'slot', session: 'MORNING' }, effectiveKind: 'BASE_TIMETABLE' });
    resolve.mockResolvedValue({ status: 'PASS', normalOccurrences: [make('subject-1'), make('subject-2')], coverage: { ppctItemAllocation: 'NOT_ASSESSED' } });
    const result = await service.getSourceOccurrences(request as never, { academicYearId: 'year-1', civilDate: '2026-10-22', subjectId: 'subject-1' } as never);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.subjectId).toBe('subject-1');
    expect(result.items[0]?.schoolClassName).toBe('10A1');
    expect(JSON.stringify(result)).not.toContain('subject-2');
  });
  it('permits school-wide teaching administrators to discover active subjects', async () => {
    listEffectiveCapabilities.mockResolvedValue([
      { key: 'TEACHING_OPERATION_MANAGE', scope: 'SCHOOL_WIDE' },
    ]);
    const result = await service.getContext(request as never);
    expect(result.permissions.teachingSchoolWide).toBe(true);
    expect(subjectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'ACTIVE' },
    }));
  });
});
