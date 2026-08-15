import { CalendarExceptionScope, CalendarExceptionTimeSelector, OperationalLessonDispositionType } from '@prisma/client';
import { calendarCreateFingerprint, COLLISION_COVERAGE, dispositionCreateFingerprint, reverseFingerprint, sha256, weekdayForCivilDate } from '../../src/operational-overlays/operational-overlay-policy';

describe('operational overlay deterministic policy', () => {
  const calendar = {
    academicYearId: 'year', academicCalendarVersionId: 'calendar', civilDate: '2026-08-17',
    scope: CalendarExceptionScope.SCHOOL_WIDE, gradeLevel: null, schoolClassId: null,
    timeSelector: CalendarExceptionTimeSelector.EXACT_SLOTS, session: null,
    exactTimeSlotDefinitionIds: ['a', 'b'], note: 'reason', replacesId: null,
  };

  it('uses a lowercase SHA-256 hexadecimal digest', () => expect(sha256({ version: 'test' })).toMatch(/^[0-9a-f]{64}$/u));
  it('keeps calendar fingerprint deterministic', () => expect(calendarCreateFingerprint(calendar)).toBe(calendarCreateFingerprint({ ...calendar })));
  it('changes calendar fingerprint when semantic payload changes', () => expect(calendarCreateFingerprint(calendar)).not.toBe(calendarCreateFingerprint({ ...calendar, note: 'changed' })));
  it('does not include request identity in calendar fingerprint input', () => expect(calendarCreateFingerprint(calendar)).toBe(calendarCreateFingerprint(calendar)));
  it('keeps exact slot order semantic only after caller normalization', () => expect(calendarCreateFingerprint(calendar)).not.toBe(calendarCreateFingerprint({ ...calendar, exactTimeSlotDefinitionIds: ['b', 'a'] })));
  it('uses disposition-create-v1 semantics', () => {
    const input = { timetableEntryId: 'entry', sourceCivilDate: '2026-08-17', dispositionType: OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT, assignedTeacherUserId: null, note: null, replacesId: null };
    expect(dispositionCreateFingerprint(input)).toMatch(/^[0-9a-f]{64}$/u);
    expect(dispositionCreateFingerprint(input)).not.toBe(dispositionCreateFingerprint({ ...input, dispositionType: OperationalLessonDispositionType.AUTHORIZED_CANCELLATION }));
  });
  it('binds reverse fingerprint to entity, CAS token, and reason', () => {
    const value = reverseFingerprint('entity', '2026-08-15T00:00:00.000Z', 'reason');
    expect(value).not.toBe(reverseFingerprint('other', '2026-08-15T00:00:00.000Z', 'reason'));
    expect(value).not.toBe(reverseFingerprint('entity', '2026-08-15T00:00:00.001Z', 'reason'));
    expect(value).not.toBe(reverseFingerprint('entity', '2026-08-15T00:00:00.000Z', 'other'));
  });
  it.each([
    ['2026-08-17', 'MONDAY'], ['2026-08-18', 'TUESDAY'], ['2026-08-19', 'WEDNESDAY'],
    ['2026-08-20', 'THURSDAY'], ['2026-08-21', 'FRIDAY'], ['2026-08-22', 'SATURDAY'], ['2026-08-23', 'SUNDAY'],
  ])('maps %s to retained weekday %s', (civilDate, weekday) => expect(weekdayForCivilDate(new Date(`${civilDate}T00:00:00.000Z`))).toBe(weekday));
  it('reports bounded SpecialActivity coverage honestly', () => expect(COLLISION_COVERAGE).toEqual({ profile: 'CANONICAL_CLASS_TEACHER_TIME_V1', specialActivity: 'ASSESSED', room: 'NOT_ASSESSED' }));
});
