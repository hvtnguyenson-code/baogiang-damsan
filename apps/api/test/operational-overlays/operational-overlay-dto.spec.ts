import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CalendarExceptionScope, CalendarExceptionTimeSelector, OperationalLessonDispositionType } from '@prisma/client';
import { CreateCalendarExceptionDto, CreateLessonDispositionDto, ListCalendarExceptionsDto, ListLessonDispositionsDto, ReverseOperationalOverlayDto } from '../../src/operational-overlays/dto';

async function errors<T extends object>(type: new () => T, value: object) {
  return validate(plainToInstance(type, value), { whitelist: true, forbidNonWhitelisted: true });
}

const uuid = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const calendarBase = {
  academicYearId: uuid('1'), academicCalendarVersionId: uuid('2'), civilDate: '2026-08-17',
  scope: CalendarExceptionScope.SCHOOL_WIDE, timeSelector: CalendarExceptionTimeSelector.WHOLE_DAY, requestKey: 'request',
};
const dispositionBase = { timetableEntryId: uuid('3'), sourceCivilDate: '2026-08-17', dispositionType: OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT, requestKey: 'request' };

describe('operational overlay DTO boundary', () => {
  it('accepts the minimum school-wide whole-day calendar intent', async () => expect(await errors(CreateCalendarExceptionDto, calendarBase)).toHaveLength(0));
  it('accepts grade scope with THPT grade', async () => expect(await errors(CreateCalendarExceptionDto, { ...calendarBase, scope: CalendarExceptionScope.GRADE, gradeLevel: 11 })).toHaveLength(0));
  it('rejects grade outside 10-12', async () => expect(await errors(CreateCalendarExceptionDto, { ...calendarBase, scope: CalendarExceptionScope.GRADE, gradeLevel: 9 })).not.toHaveLength(0));
  it('accepts class scope with an exact UUID', async () => expect(await errors(CreateCalendarExceptionDto, { ...calendarBase, scope: CalendarExceptionScope.CLASS, schoolClassId: uuid('4') })).toHaveLength(0));
  it('accepts session selector with canonical session', async () => expect(await errors(CreateCalendarExceptionDto, { ...calendarBase, timeSelector: CalendarExceptionTimeSelector.SESSION, session: 'MORNING' })).toHaveLength(0));
  it('rejects a noncanonical session', async () => expect(await errors(CreateCalendarExceptionDto, { ...calendarBase, timeSelector: CalendarExceptionTimeSelector.SESSION, session: 'NOON' })).not.toHaveLength(0));
  it('accepts exact retained slot UUIDs', async () => expect(await errors(CreateCalendarExceptionDto, { ...calendarBase, timeSelector: CalendarExceptionTimeSelector.EXACT_SLOTS, exactTimeSlotDefinitionIds: [uuid('5')] })).toHaveLength(0));
  it('rejects malformed exact slot IDs', async () => expect(await errors(CreateCalendarExceptionDto, { ...calendarBase, timeSelector: CalendarExceptionTimeSelector.EXACT_SLOTS, exactTimeSlotDefinitionIds: ['slot'] })).not.toHaveLength(0));
  it('trims request key and note before length/nonblank validation', async () => {
    const dto = plainToInstance(CreateCalendarExceptionDto, { ...calendarBase, requestKey: '  key  ', note: '  reason  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ requestKey: 'key', note: 'reason' });
  });
  it('rejects a blank normalized request key', async () => expect(await errors(CreateCalendarExceptionDto, { ...calendarBase, requestKey: '   ' })).not.toHaveLength(0));
  it('rejects a blank normalized optional note', async () => expect(await errors(CreateCalendarExceptionDto, { ...calendarBase, note: '   ' })).not.toHaveLength(0));
  it('rejects a calendar date range field', async () => expect(await errors(CreateCalendarExceptionDto, { ...calendarBase, endDate: '2026-08-18' })).not.toHaveLength(0));

  it.each(Object.values(OperationalLessonDispositionType))('accepts exact disposition type %s', async (dispositionType) => {
    const assignedTeacherUserId = dispositionType === OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION
      || dispositionType === OperationalLessonDispositionType.DIFFERENT_SUBJECT_SUPERVISION ? uuid('6') : undefined;
    expect(await errors(CreateLessonDispositionDto, { ...dispositionBase, dispositionType, assignedTeacherUserId })).toHaveLength(0);
  });
  it.each(['academicYearId', 'timetableVersionId', 'academicCalendarVersionId', 'timeSlotDefinitionId', 'schoolClassId', 'subjectId', 'teachingAssignmentId', 'responsibleTeacherUserId', 'ppctItemId'])('rejects client-supplied derived field %s', async (field) => {
    expect(await errors(CreateLessonDispositionDto, { ...dispositionBase, [field]: uuid('7') })).not.toHaveLength(0);
  });
  it('rejects a malformed source civil date', async () => expect(await errors(CreateLessonDispositionDto, { ...dispositionBase, sourceCivilDate: '17/08/2026' })).not.toHaveLength(0));

  it('accepts an explicit reversal command and trims its text', async () => {
    const dto = plainToInstance(ReverseOperationalOverlayDto, { requestKey: ' reverse ', expectedUpdatedAt: '2026-08-15T01:02:03.000Z', reversalReason: ' correction ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ requestKey: 'reverse', reversalReason: 'correction' });
  });
  it('rejects a reversal without an absolute CAS timestamp', async () => expect(await errors(ReverseOperationalOverlayDto, { requestKey: 'reverse', expectedUpdatedAt: '2026-08-15', reversalReason: 'reason' })).not.toHaveLength(0));
  it('rejects a blank reversal reason', async () => expect(await errors(ReverseOperationalOverlayDto, { requestKey: 'reverse', expectedUpdatedAt: '2026-08-15T01:02:03.000Z', reversalReason: '  ' })).not.toHaveLength(0));

  it('bounds calendar pagination', async () => expect(await errors(ListCalendarExceptionsDto, { academicYearId: uuid('1'), page: 1, pageSize: 101 })).not.toHaveLength(0));
  it('requires academicYearId for disposition lists', async () => expect(await errors(ListLessonDispositionsDto, {})).not.toHaveLength(0));
});
