import { AcademicWeekKind, AcademicWeekday } from '@prisma/client';
import { CalendarAggregateInput, validateCalendarAggregate } from '../../src/academic-structure/calendar-invariants';

function base(): CalendarAggregateInput {
  return {
    startDate: '2026-08-01', endDate: '2026-08-31', officialWeekCount: 1, reserveWeekCount: 0,
    teachingWeekdays: [AcademicWeekday.MONDAY, AcademicWeekday.TUESDAY],
    semesters: [{ code: 'HK1', name: 'Học kỳ 1', ordinal: 1, startDate: '2026-08-01', endDate: '2026-08-31' }],
    weeks: [{
      kind: AcademicWeekKind.OFFICIAL, officialWeekNumber: 1, displayLabel: 'Tuần 1', sortOrder: 1,
      segments: [{ label: '1', segmentOrder: 1, startDate: '2026-08-03', endDate: '2026-08-04' }],
    }],
    interruptions: [],
  };
}

function teachingDayGap(): CalendarAggregateInput {
  const value = base();
  value.teachingWeekdays = [
    AcademicWeekday.MONDAY, AcademicWeekday.TUESDAY, AcademicWeekday.WEDNESDAY,
    AcademicWeekday.THURSDAY, AcademicWeekday.FRIDAY,
  ];
  value.weeks[0].segments = [
    { label: '1a', segmentOrder: 1, startDate: '2026-08-03', endDate: '2026-08-04' },
    { label: '1b', segmentOrder: 2, startDate: '2026-08-10', endDate: '2026-08-11' },
  ];
  return value;
}

describe('academic calendar aggregate invariants', () => {
  it('accepts a complete configurable calendar', () => expect(() => validateCalendarAggregate(base())).not.toThrow());

  it('rejects duplicate teaching weekdays', () => {
    const value = base(); value.teachingWeekdays = [AcademicWeekday.MONDAY, AcademicWeekday.MONDAY];
    expect(() => validateCalendarAggregate(value)).toThrow('không được trùng lặp');
  });

  it('rejects a segment beginning on a non-teaching weekday', () => {
    const value = base(); value.weeks[0].segments[0].startDate = '2026-08-02';
    expect(() => validateCalendarAggregate(value)).toThrow('bắt đầu và kết thúc');
  });

  it('rejects a segment ending on a non-teaching weekday', () => {
    const value = base(); value.weeks[0].segments[0].endDate = '2026-08-08';
    expect(() => validateCalendarAggregate(value)).toThrow('bắt đầu và kết thúc');
  });

  it('accepts an ordinary weekend-only internal gap without interruption', () => {
    const value = teachingDayGap();
    value.weeks[0].segments[0].endDate = '2026-08-07';
    expect(() => validateCalendarAggregate(value)).not.toThrow();
  });

  it('rejects an unexplained internal gap containing teaching dates', () => {
    expect(() => validateCalendarAggregate(teachingDayGap())).toThrow('phải được gián đoạn bao phủ');
  });

  it('rejects partial interruption coverage of teaching dates in a gap', () => {
    const value = teachingDayGap();
    value.interruptions = [{ code: 'PART', name: 'Partial', startDate: '2026-08-05', endDate: '2026-08-06' }];
    expect(() => validateCalendarAggregate(value)).toThrow('phải được gián đoạn bao phủ');
  });

  it('accepts full teaching-date coverage without requiring weekend coverage', () => {
    const value = teachingDayGap();
    value.interruptions = [{ code: 'FULL', name: 'Full', startDate: '2026-08-05', endDate: '2026-08-07' }];
    expect(() => validateCalendarAggregate(value)).not.toThrow();
  });

  it('allows an interruption to include adjacent weekend days', () => {
    const value = teachingDayGap();
    value.interruptions = [{ code: 'FULL', name: 'Full', startDate: '2026-08-05', endDate: '2026-08-09' }];
    expect(() => validateCalendarAggregate(value)).not.toThrow();
  });

  it('rejects an interruption unrelated to an internal segment gap', () => {
    const value = base();
    value.interruptions = [{ code: 'EXTRA', name: 'Extra', startDate: '2026-08-10', endDate: '2026-08-11' }];
    expect(() => validateCalendarAggregate(value)).toThrow('khoảng trống nội bộ');
  });

  it('rejects a weekend-only interruption even when it lies in an internal gap', () => {
    const value = teachingDayGap(); value.weeks[0].segments[0].endDate = '2026-08-07';
    value.interruptions = [{ code: 'WEEKEND', name: 'Weekend', startDate: '2026-08-08', endDate: '2026-08-09' }];
    expect(() => validateCalendarAggregate(value)).toThrow('ít nhất một ngày dạy học');
  });

  it.each([
    ['semester', (value: CalendarAggregateInput) => { value.semesters[0].endDate = '2026-09-01'; }],
    ['segment', (value: CalendarAggregateInput) => { value.weeks[0].segments[0].startDate = '2026-07-31'; }],
    ['interruption', (value: CalendarAggregateInput) => { value.interruptions = [{ code: 'X', name: 'X', startDate: '2026-09-01', endDate: '2026-09-02' }]; }],
  ])('rejects %s outside its parent', (_label, mutate) => {
    const value = base(); mutate(value); expect(() => validateCalendarAggregate(value)).toThrow('phạm vi phiên lịch');
  });

  it('requires exact official and reserve number sets', () => {
    const missingOfficial = base(); missingOfficial.officialWeekCount = 2;
    expect(() => validateCalendarAggregate(missingOfficial)).toThrow('1..2');
    const missingReserve = base(); missingReserve.reserveWeekCount = 1;
    expect(() => validateCalendarAggregate(missingReserve)).toThrow('1..1');
    const outOfRange = base(); outOfRange.weeks[0].officialWeekNumber = 2;
    expect(() => validateCalendarAggregate(outOfRange)).toThrow('1..1');
  });

  it('rejects invalid OFFICIAL/RESERVE discriminators', () => {
    const official = base(); official.weeks[0].reserveWeekNumber = 1;
    expect(() => validateCalendarAggregate(official)).toThrow('OFFICIAL');
    const reserve = base(); reserve.officialWeekCount = 0; reserve.reserveWeekCount = 1;
    reserve.weeks = [{ ...reserve.weeks[0], kind: AcademicWeekKind.RESERVE, officialWeekNumber: 1, reserveWeekNumber: 1 }];
    expect(() => validateCalendarAggregate(reserve)).toThrow('RESERVE');
  });

  it('accepts DP1 as reserve rather than an extra official week', () => {
    const value = base(); value.reserveWeekCount = 1;
    value.weeks.push({
      kind: AcademicWeekKind.RESERVE, reserveWeekNumber: 1, displayLabel: 'DP1', sortOrder: 2,
      segments: [{ label: 'DP1', segmentOrder: 1, startDate: '2026-08-10', endDate: '2026-08-11' }],
    });
    expect(() => validateCalendarAggregate(value)).not.toThrow();
  });

  it('accepts Week 5 split into 5a and 5b around an interruption', () => {
    const value = base(); value.endDate = '2026-09-30'; value.semesters[0].endDate = value.endDate; value.officialWeekCount = 5;
    value.teachingWeekdays = [
      AcademicWeekday.MONDAY, AcademicWeekday.TUESDAY, AcademicWeekday.WEDNESDAY,
      AcademicWeekday.THURSDAY, AcademicWeekday.FRIDAY,
    ];
    value.weeks = [1, 2, 3, 4].map((number) => ({
      kind: AcademicWeekKind.OFFICIAL, officialWeekNumber: number, displayLabel: `Tuần ${number}`, sortOrder: number,
      segments: [{ label: `${number}`, segmentOrder: 1, startDate: `2026-08-${String(3 + (number - 1) * 7).padStart(2, '0')}`, endDate: `2026-08-${String(7 + (number - 1) * 7).padStart(2, '0')}` }],
    }));
    value.weeks.push({
      kind: AcademicWeekKind.OFFICIAL, officialWeekNumber: 5, displayLabel: 'Tuần 5', sortOrder: 5,
      segments: [
        { label: '5a', segmentOrder: 1, startDate: '2026-08-31', endDate: '2026-09-01' },
        { label: '5b', segmentOrder: 2, startDate: '2026-09-07', endDate: '2026-09-08' },
      ],
    });
    value.interruptions = [{ code: 'PAUSE', name: 'Tạm nghỉ', startDate: '2026-09-02', endDate: '2026-09-06' }];
    expect(() => validateCalendarAggregate(value)).not.toThrow();
  });

  it('rejects segment chronology and interruption overlap', () => {
    const chronology = base(); chronology.weeks[0].segments.push({ label: '1b', segmentOrder: 2, startDate: '2026-08-03', endDate: '2026-08-10' });
    expect(() => validateCalendarAggregate(chronology)).toThrow('chồng lấn');
    const interruption = base(); interruption.interruptions = [{ code: 'X', name: 'X', startDate: '2026-08-04', endDate: '2026-08-05' }];
    expect(() => validateCalendarAggregate(interruption)).toThrow('phân đoạn tuần');
  });

  it('does not hard-code exactly two semesters', () => {
    const one = base(); expect(() => validateCalendarAggregate(one)).not.toThrow();
    const three = base(); three.semesters = [
      { code: 'A', name: 'A', ordinal: 1, startDate: '2026-08-01', endDate: '2026-08-10' },
      { code: 'B', name: 'B', ordinal: 2, startDate: '2026-08-11', endDate: '2026-08-20' },
      { code: 'C', name: 'C', ordinal: 3, startDate: '2026-08-21', endDate: '2026-08-31' },
    ];
    expect(() => validateCalendarAggregate(three)).not.toThrow();
  });
});
