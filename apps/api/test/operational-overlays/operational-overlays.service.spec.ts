import { BadRequestException, ConflictException } from '@nestjs/common';
import { CalendarExceptionScope, CalendarExceptionTimeSelector, OperationalLessonDispositionType, OperationalOverlayStatus, Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import { CreateCalendarExceptionDto, CreateLessonDispositionDto } from '../../src/operational-overlays/dto';
import { calendarCreateFingerprint, reverseFingerprint } from '../../src/operational-overlays/operational-overlay-policy';
import { OperationalOverlaysService } from '../../src/operational-overlays/operational-overlays.service';

const id = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const instant = new Date('2026-08-15T01:00:00.000Z');
const request = { auth: { user: { id: id('9'), mustChangePassword: false } }, headers: {}, method: 'POST', path: '/' } as unknown as AuthenticatedRequest;
const calendarDto = { academicYearId: id('1'), academicCalendarVersionId: id('2'), civilDate: '2026-08-17', scope: CalendarExceptionScope.SCHOOL_WIDE, timeSelector: CalendarExceptionTimeSelector.WHOLE_DAY, requestKey: 'create-key' } as CreateCalendarExceptionDto;

const calendarRow = (overrides: Record<string, unknown> = {}) => ({
  id: id('3'), academicYearId: id('1'), academicCalendarVersionId: id('2'), civilDate: new Date('2026-08-17T00:00:00.000Z'),
  scope: CalendarExceptionScope.SCHOOL_WIDE, gradeLevel: null, schoolClassId: null,
  timeSelector: CalendarExceptionTimeSelector.WHOLE_DAY, session: null, exactTimeSlots: [], note: null,
  status: OperationalOverlayStatus.ACTIVE, createRequestKey: 'create-key', createRequestFingerprint: calendarCreateFingerprint({
    academicYearId: id('1'), academicCalendarVersionId: id('2'), civilDate: '2026-08-17', scope: CalendarExceptionScope.SCHOOL_WIDE,
    gradeLevel: null, schoolClassId: null, timeSelector: CalendarExceptionTimeSelector.WHOLE_DAY, session: null,
    exactTimeSlotDefinitionIds: [], note: null, replacesId: null,
  }), reversedByUserId: null, reversedAt: null, reversalReason: null, reverseRequestKey: null,
  reverseRequestFingerprint: null, replacesId: null, createdByUserId: id('9'), createdAt: instant, updatedAt: instant, ...overrides,
});

function makeService(prisma: Record<string, unknown> = {}) {
  const audit = { write: jest.fn() };
  const access = { requireCalendar: jest.fn(), requireTeachingSchoolWide: jest.fn(), requireTeachingSubject: jest.fn() };
  const database = { ...prisma, $transaction: jest.fn((operation: ((tx: unknown) => unknown) | Promise<unknown>[]) => typeof operation === 'function' ? operation(prisma) : Promise.all(operation)) };
  const service = new OperationalOverlaysService(database as never, audit as never, access as never, { now: () => instant });
  return { service, audit, access, database };
}

describe('OperationalOverlaysService bounded command behavior', () => {
  it('replays a calendar create without validation, mutation, or duplicate success audit', async () => {
    const row = calendarRow();
    const tx = { calendarException: { findUnique: jest.fn().mockResolvedValue(row) } };
    const { service, audit, access } = makeService(tx);
    await expect(service.createCalendarException(calendarDto, request)).resolves.toMatchObject({ outcome: 'IDEMPOTENT_REPLAY', record: { id: row.id, status: 'ACTIVE' } });
    expect(access.requireCalendar).toHaveBeenCalledWith(request);
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('rejects reuse of a calendar create key with a changed fingerprint', async () => {
    const tx = { calendarException: { findUnique: jest.fn().mockResolvedValue(calendarRow({ createRequestFingerprint: 'f'.repeat(64) })) } };
    const { service } = makeService(tx);
    await expect(service.createCalendarException(calendarDto, request)).rejects.toBeInstanceOf(ConflictException);
  });

  it('replays a reverse against the retained row even after lifecycle progression', async () => {
    const expectedUpdatedAt = instant.toISOString();
    const row = calendarRow({ status: OperationalOverlayStatus.REVERSED, reverseRequestKey: 'reverse-key', reverseRequestFingerprint: reverseFingerprint(id('3'), expectedUpdatedAt, 'reason'), reversedAt: instant, reversalReason: 'reason', reversedByUserId: id('9') });
    const tx = { calendarException: { findUnique: jest.fn().mockResolvedValue(row) } };
    const { service, audit } = makeService(tx);
    await expect(service.reverseCalendarException(id('3'), { requestKey: 'reverse-key', expectedUpdatedAt, reversalReason: 'reason' }, request)).resolves.toMatchObject({ outcome: 'IDEMPOTENT_REPLAY', record: { status: 'REVERSED' } });
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('rejects a reverse key bound to another entity or payload', async () => {
    const tx = { calendarException: { findUnique: jest.fn().mockResolvedValue(calendarRow({ reverseRequestKey: 'reverse-key', reverseRequestFingerprint: 'a'.repeat(64) })) } };
    const { service } = makeService(tx);
    await expect(service.reverseCalendarException(id('3'), { requestKey: 'reverse-key', expectedUpdatedAt: instant.toISOString(), reversalReason: 'reason' }, request)).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a controlled stale conflict when calendar reverse CAS claims no row', async () => {
    const tx = { calendarException: {
      findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(calendarRow()),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    } };
    const { service, audit } = makeService(tx);
    await expect(service.reverseCalendarException(id('3'), { requestKey: 'reverse-key', expectedUpdatedAt: instant.toISOString(), reversalReason: 'reason' }, request)).rejects.toBeInstanceOf(ConflictException);
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('couples a successful reverse with one bounded success audit', async () => {
    const reversed = calendarRow({ status: OperationalOverlayStatus.REVERSED, reversedAt: instant, reversedByUserId: id('9'), reversalReason: 'reason' });
    const tx = { calendarException: {
      findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(calendarRow()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue(reversed),
    } };
    const { service, audit } = makeService(tx);
    await expect(service.reverseCalendarException(id('3'), { requestKey: 'reverse-key', expectedUpdatedAt: instant.toISOString(), reversalReason: 'reason' }, request)).resolves.toMatchObject({ outcome: 'REVERSED' });
    expect(audit.write).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'CALENDAR_EXCEPTION_REVERSED', entityType: 'CalendarException', result: 'SUCCESS' }), tx);
  });

  it('retries only a recognized serialization race and maps exhaustion to controlled 409', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: '5' });
    const database = { $transaction: jest.fn().mockRejectedValue(error) };
    const audit = { write: jest.fn() };
    const access = { requireCalendar: jest.fn() };
    const service = new OperationalOverlaysService(database as never, audit as never, access as never, { now: () => instant });
    await expect(service.createCalendarException(calendarDto, request)).rejects.toBeInstanceOf(ConflictException);
    expect(database.$transaction).toHaveBeenCalledTimes(3);
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('does not retry an unknown database failure', async () => {
    const database = { $transaction: jest.fn().mockRejectedValue(new Error('unexpected')) };
    const service = new OperationalOverlaysService(database as never, { write: jest.fn() } as never, { requireCalendar: jest.fn() } as never, { now: () => instant });
    await expect(service.createCalendarException(calendarDto, request)).rejects.toThrow('unexpected');
    expect(database.$transaction).toHaveBeenCalledTimes(1);
  });

  it('requires school-wide authority for every calendar list', async () => {
    const tx = { calendarException: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const { service, access } = makeService(tx);
    await service.listCalendarExceptions({ academicYearId: id('1'), page: 1, pageSize: 20 }, request);
    expect(access.requireCalendar).toHaveBeenCalledWith(request);
  });

  it('requires school-wide teaching authority for a broad disposition list', async () => {
    const tx = { operationalLessonDisposition: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const { service, access } = makeService(tx);
    await service.listLessonDispositions({ academicYearId: id('1'), page: 1, pageSize: 20 }, request);
    expect(access.requireTeachingSchoolWide).toHaveBeenCalledWith(request);
    expect(access.requireTeachingSubject).not.toHaveBeenCalled();
  });

  it('bounds a disposition list to the exact authorized subject', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const tx = { operationalLessonDisposition: { findMany, count: jest.fn().mockResolvedValue(0) } };
    const { service, access } = makeService(tx);
    await service.listLessonDispositions({ academicYearId: id('1'), subjectId: id('5'), page: 1, pageSize: 20 }, request);
    expect(access.requireTeachingSubject).toHaveBeenCalledWith(request, id('5'));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ subjectId: id('5') }) }));
  });

  it.each([
    [OperationalLessonDispositionType.AUTHORIZED_CANCELLATION, id('6')],
    [OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT, id('6')],
    [OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION, undefined],
    [OperationalLessonDispositionType.DIFFERENT_SUBJECT_SUPERVISION, undefined],
  ])('rejects invalid assigned-teacher shape for %s', (dispositionType, assignedTeacherUserId) => {
    const { service } = makeService();
    const internal = service as unknown as { validateDispositionShape(dto: CreateLessonDispositionDto): void };
    expect(() => internal.validateDispositionShape({ dispositionType, assignedTeacherUserId } as CreateLessonDispositionDto)).toThrow(BadRequestException);
  });

  it('normalizes duplicate exact slots deterministically before fingerprinting', () => {
    const { service } = makeService();
    const internal = service as unknown as { normalizeCalendar(dto: CreateCalendarExceptionDto): { exactTimeSlotDefinitionIds: string[] } };
    const normalized = internal.normalizeCalendar({ ...calendarDto, timeSelector: CalendarExceptionTimeSelector.EXACT_SLOTS, exactTimeSlotDefinitionIds: [id('5'), id('4'), id('5')] });
    expect(normalized.exactTimeSlotDefinitionIds).toEqual([id('4'), id('5')]);
  });

  it('rejects retrospective calendar creation without a note using the injected clock', () => {
    const { service } = makeService();
    const internal = service as unknown as { normalizeCalendar(dto: CreateCalendarExceptionDto): unknown };
    expect(() => internal.normalizeCalendar({ ...calendarDto, civilDate: '2026-08-14' })).toThrow(BadRequestException);
  });

  it('rejects invalid conditional calendar scope and selector shapes before persistence', () => {
    const { service } = makeService();
    const internal = service as unknown as { normalizeCalendar(dto: CreateCalendarExceptionDto): unknown };
    expect(() => internal.normalizeCalendar({ ...calendarDto, gradeLevel: 10 })).toThrow(BadRequestException);
    expect(() => internal.normalizeCalendar({ ...calendarDto, session: 'MORNING' })).toThrow(BadRequestException);
  });
});
