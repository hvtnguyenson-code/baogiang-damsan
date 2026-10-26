import { ForbiddenException } from '@nestjs/common';
import { OperationalWorkspaceContextService } from '../../src/operational-overlays/operational-workspace-context.service';

const request = { auth: { user: { id: 'user-1', mustChangePassword: false } } };
const yearFindMany = jest.fn(async () => [{ id: 'year-1', code: '2026-2027', name: 'Năm học 2026-2027' }]);
const subjectFindMany = jest.fn(async () => [{ id: 'subject-1', code: 'TOAN', name: 'Toán' }]);
const listEffectiveCapabilities = jest.fn();
const resolve = jest.fn();
const resolveInTransaction = jest.fn();
const validateCalendarPreviewCandidate = jest.fn();
const calendarPreviewCoversOccurrence = jest.fn();
const validateDispositionPreviewCandidate = jest.fn();
const previewDispositionConsequences = jest.fn();
const resolveNow = jest.fn();
const transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn({}));
const service = new OperationalWorkspaceContextService(
  { $transaction: transaction, academicYear: { findMany: yearFindMany }, subject: { findMany: subjectFindMany }, schoolClass: { findMany: jest.fn(async () => [{ id: 'class-1', name: '10A1' }]) }, user: { findMany: jest.fn(async () => [{ id: 'teacher', profile: { displayName: 'Giáo viên A' } }]) } } as never,
  { listEffectiveCapabilities } as never,
  { resolve, resolveInTransaction } as never,
  { validateCalendarPreviewCandidate, calendarPreviewCoversOccurrence, validateDispositionPreviewCandidate, previewDispositionConsequences, dispositionConsequenceSummary: (e: unknown) => e } as never,
  { resolveNow } as never,
);

beforeEach(() => {
  jest.clearAllMocks();
  previewDispositionConsequences.mockRejectedValue(new Error('consequence-authority-unavailable'));
  resolveNow.mockRejectedValue(new Error('consequence-authority-unavailable'));
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

  const previewInput = {
    academicYearId: 'year-1', academicCalendarVersionId: 'calendar-1',
    civilDate: '2026-10-22', scope: 'SCHOOL_WIDE', timeSelector: 'WHOLE_DAY',
  };

  it('denies calendar preview to subject-only users before touching the database', async () => {
    listEffectiveCapabilities.mockResolvedValue([
      { key: 'TEACHING_OPERATION_MANAGE', scope: 'SUBJECT', resourceId: 'subject-1' },
    ]);
    await expect(service.previewCalendarException(request as never, previewInput as never))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
    expect(validateCalendarPreviewCandidate).not.toHaveBeenCalled();
  });

  it('publishes only authoritative all-consequence evidence and its optimistic fingerprint', async () => {
    listEffectiveCapabilities.mockResolvedValue([{ key: 'CALENDAR_EXCEPTION_MANAGE', scope: 'SCHOOL_WIDE' }]);
    validateCalendarPreviewCandidate.mockResolvedValue(previewInput);
    const make = (id: string, effectiveKind = 'BASE_TIMETABLE') => ({
      occurrenceKey: 'NORMAL:' + id + ':2026-10-22', timetableEntryId: id,
      academicCalendarVersionId: 'calendar-1', schoolClass: { id: 'class-1', gradeLevel: 10 },
      subjectId: 'subject-1', responsibleTeacherUserId: 'teacher-1',
      timeSlot: { id: 'slot-1', weekday: 'THURSDAY', session: 'MORNING', startTime: '07:00', endTime: '07:45' },
      effectiveKind,
    });
    resolveInTransaction.mockResolvedValue({
      status: 'PASS', normalOccurrences: [make('first'), make('second', 'CALENDAR_EXCEPTION'), make('third')],
    });
    calendarPreviewCoversOccurrence.mockImplementation((_, row: { timetableEntryId: string }) => row.timetableEntryId === 'first');
    resolveNow.mockResolvedValue({ status: 'PASS', coverage: { ppctItemAllocation: 'ASSESSED', workload: 'ASSESSED', debt: 'ASSESSED' },
      affectedOccurrenceKeys: ['NORMAL:first:2026-10-22'], classIds: ['class-1'], teachers: [], consequenceFingerprint: 'a'.repeat(64),
      streams: [{ scope: { schoolClassId: 'class-1', subjectId: 'subject-1' }, progress: { before: { counts: null }, after: { counts: null } }, ppct: { before: { normalAllocations: [{ occurrence: make('first') }] } } }] });
    const result = await service.previewCalendarException(request as never, previewInput as never);
    expect(result.status).toBe('PASS');
    expect(result.affected).toHaveLength(1);
    expect(result.affected[0]?.timetableEntryId).toBe('first');
    expect(result.coverage).toEqual({
      ppctItemAllocation: 'ASSESSED', workload: 'ASSESSED', debt: 'ASSESSED',
    });
    expect(resolveNow).toHaveBeenCalledWith(previewInput);
    expect(result).toMatchObject({ consequenceFingerprint: 'a'.repeat(64) });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('fails closed when canonical occurrences are blocked or validation rejects the candidate', async () => {
    listEffectiveCapabilities.mockResolvedValue([{ key: 'CALENDAR_EXCEPTION_MANAGE', scope: 'SCHOOL_WIDE' }]);
    validateCalendarPreviewCandidate.mockResolvedValue(previewInput);
    resolveInTransaction.mockResolvedValue({ status: 'BLOCKED', normalOccurrences: [], findings: [{ entityIds: ['secret'] }] });
    const blocked = await service.previewCalendarException(request as never, previewInput as never);
    expect(blocked.status).toBe('BLOCKED');
    expect(blocked.affected).toEqual([]);
    expect(JSON.stringify(blocked)).not.toContain('secret');
    validateCalendarPreviewCandidate.mockRejectedValue(new Error('collision secret'));
    const rejected = await service.previewCalendarException(request as never, previewInput as never);
    expect(rejected.status).toBe('BLOCKED');
    expect(rejected.affected).toEqual([]);
    expect(JSON.stringify(rejected)).not.toContain('collision secret');
  });


  const dispositionInput = {
    academicYearId: 'year-1', subjectId: 'subject-1', timetableEntryId: 'entry-1',
    sourceCivilDate: '2026-10-22', dispositionType: 'SAME_SUBJECT_SUBSTITUTION',
    assignedTeacherUserId: 'teacher-2',
  };

  it('rejects out-of-scope disposition candidate checks without source or teacher lookup', async () => {
    listEffectiveCapabilities.mockResolvedValue([
      { key: 'TEACHING_OPERATION_MANAGE', scope: 'SUBJECT', resourceId: 'subject-2' },
    ]);
    await expect(service.previewLessonDisposition(request as never, dispositionInput as never))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(resolveInTransaction).not.toHaveBeenCalled();
    expect(validateDispositionPreviewCandidate).not.toHaveBeenCalled();
  });

  it('delegates disposition evidence to the complete snapshot authority without upgrading partial coverage', async () => {
    listEffectiveCapabilities.mockResolvedValue([
      { key: 'TEACHING_OPERATION_MANAGE', scope: 'SUBJECT', resourceId: 'subject-1' },
    ]);
    resolveInTransaction.mockResolvedValue({
      status: 'PASS', normalOccurrences: [{
        timetableEntryId: 'entry-1', subjectId: 'subject-1', effectiveKind: 'BASE_TIMETABLE',
      }],
    });
    validateDispositionPreviewCandidate.mockResolvedValue({
      sourceTimetableEntryId: 'entry-1', candidateTeacherUserId: 'teacher-2', eligibilitySameSubject: true,
    });
    previewDispositionConsequences.mockResolvedValue({ status: 'PASS', coverage: { ppctItemAllocation: 'NOT_ASSESSED', workload: 'NOT_ASSESSED', debt: 'NOT_ASSESSED' } });
    const result = await service.previewLessonDisposition(request as never, dispositionInput as never);
    expect(result.status).toBe('PASS');
    expect(result.coverage).toEqual({
      ppctItemAllocation: 'NOT_ASSESSED', workload: 'NOT_ASSESSED', debt: 'NOT_ASSESSED',
    });
    expect(previewDispositionConsequences).toHaveBeenCalledWith(dispositionInput);
  });

  it('blocks when canonical opportunity is not base timetable or teacher collides', async () => {
    listEffectiveCapabilities.mockResolvedValue([
      { key: 'TEACHING_OPERATION_MANAGE', scope: 'SCHOOL_WIDE' },
    ]);
    resolveInTransaction.mockResolvedValue({
      status: 'PASS', normalOccurrences: [{
        timetableEntryId: 'entry-1', subjectId: 'subject-1', effectiveKind: 'CALENDAR_EXCEPTION',
      }],
    });
    const blocked = await service.previewLessonDisposition(request as never, dispositionInput as never);
    expect(blocked.status).toBe('BLOCKED');
    expect(validateDispositionPreviewCandidate).not.toHaveBeenCalled();
    resolveInTransaction.mockResolvedValue({
      status: 'PASS', normalOccurrences: [{
        timetableEntryId: 'entry-1', subjectId: 'subject-1', effectiveKind: 'BASE_TIMETABLE',
      }],
    });
    validateDispositionPreviewCandidate.mockRejectedValue(new Error('private collision id'));
    const collision = await service.previewLessonDisposition(request as never, dispositionInput as never);
    expect(collision.status).toBe('BLOCKED');
    expect(JSON.stringify(collision)).not.toContain('private collision id');
  });

  it('denies school cancellation preview to a subject-only user', async () => {
    listEffectiveCapabilities.mockResolvedValue([
      { key: 'TEACHING_OPERATION_MANAGE', scope: 'SUBJECT', resourceId: 'subject-1' },
    ]);
    await expect(service.previewLessonDisposition(request as never,
      { ...dispositionInput, dispositionType: 'AUTHORIZED_CANCELLATION', assignedTeacherUserId: undefined } as never))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only offers same-subject teachers to a subject-scoped user, pending collision check', async () => {
    listEffectiveCapabilities.mockResolvedValue([
      { key: 'TEACHING_OPERATION_MANAGE', scope: 'SUBJECT', resourceId: 'subject-1' },
    ]);
    const response = await service.getTeacherOptions(request as never, {
      academicYearId: 'year-1', subjectId: 'subject-1', dispositionType: 'SAME_SUBJECT_SUBSTITUTION',
    } as never);
    expect(response.status).toBe('OPTIONS_NOT_COLLISION_CHECKED');
    expect(response.items).toHaveLength(1);
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
