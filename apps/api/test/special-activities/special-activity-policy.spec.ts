import { intervalsOverlap, specialActivityCreateFingerprint, specialActivityReverseFingerprint } from '../../src/special-activities/special-activity-policy';

describe('Special Activity policy', () => {
  const base = { academicYearId: 'year', academicCalendarVersionId: 'calendar', civilDate: '2026-08-15', scope: 'SCHOOL_WIDE', gradeLevel: null, schoolClassId: null, exactTimeSlotDefinitionIds: ['a', 'b'], scheduledTeacherUserIds: ['teacher-a'], title: 'Title', note: null, replacesId: null };
  it('has a deterministic semantic create fingerprint without request identity', () => {
    expect(specialActivityCreateFingerprint(base)).toBe(specialActivityCreateFingerprint({ ...base }));
    expect(specialActivityCreateFingerprint(base)).not.toBe(specialActivityCreateFingerprint({ ...base, title: 'Other' }));
  });
  it('uses half-open wall-clock overlap', () => {
    const at = (value: string) => new Date(`1970-01-01T${value}.000Z`);
    expect(intervalsOverlap({ startTime: at('08:00:00'), endTime: at('09:00:00') }, { startTime: at('08:30:00'), endTime: at('09:30:00') })).toBe(true);
    expect(intervalsOverlap({ startTime: at('08:00:00'), endTime: at('09:00:00') }, { startTime: at('09:00:00'), endTime: at('10:00:00') })).toBe(false);
  });
  it('binds reverse fingerprint to entity, CAS token and reason', () => {
    expect(specialActivityReverseFingerprint('a', '2026-08-15T00:00:00.000Z', 'reason')).not.toBe(specialActivityReverseFingerprint('b', '2026-08-15T00:00:00.000Z', 'reason'));
  });
});
