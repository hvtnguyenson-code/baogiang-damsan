import { TimetableValidationIssueCode } from '@baogiang/contracts';
import {
  evaluateTimetableEntries,
  issue,
  sortValidationIssues,
  timeRangesOverlap,
} from '../../src/timetables/timetable-validation';

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1', timetableVersionId: 'version-1', academicYearId: 'year-1', weekday: 'MONDAY',
    timeSlotDefinitionId: 'slot-1', schoolClassId: 'class-1', subjectId: 'subject-1',
    teachingAssignmentId: 'assignment-1', teacherUserId: 'teacher-1', createdAt: new Date(),
    timeSlotDefinition: {
      id: 'slot-1', academicYearId: 'year-1', weekday: 'MONDAY', session: 'MORNING', ordinal: 1,
      revision: 1, displayLabel: 'Tiết 1', startTime: new Date('1970-01-01T07:00:00Z'),
      endTime: new Date('1970-01-01T07:45:00Z'), isActive: true, allowRegularTeaching: true,
      allowMakeupTeaching: false, allowSelfStudy: false, createdAt: new Date(), updatedAt: new Date(),
    },
    schoolClass: { id: 'class-1', academicYearId: 'year-1', code: '10A1', name: '10A1', gradeLevel: 10, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() },
    subject: { id: 'subject-1', code: 'TOAN', name: 'Toán', status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() },
    teacher: { id: 'teacher-1', username: 'gv1', status: 'ACTIVE', profile: { isTeachingStaff: true } },
    teachingAssignment: { id: 'assignment-1', academicYearId: 'year-1', schoolClassId: 'class-1', subjectId: 'subject-1', teacherUserId: 'teacher-1', validFrom: new Date('2026-09-01Z'), validUntil: new Date('2027-05-31Z') },
    ...overrides,
  } as never;
}

const evaluate = (entries: never[]) => evaluateTimetableEntries({
  entries,
  teachingWeekdays: ['MONDAY'],
  effectiveFrom: '2026-09-07',
  calendarEndDate: '2027-05-31',
});

describe('timetable validation evaluator', () => {
  it('publishes exact UTF-8 Vietnamese validation messages', () => {
    expect(issue('TARGET_REQUIRED').message).toBe('Bản nháp chưa chọn phiên lịch và tuần hiệu lực.');
    expect(issue('TARGET_CALENDAR_NOT_ACTIVE').message)
      .toBe('Phiên lịch được chọn không còn là phiên lịch đang áp dụng của năm học.');
    expect(issue('TEACHER_TIME_OVERLAP').message).toBe('Giáo viên có hai tiết chồng lấn thời gian.');
  });
  it('uses half-open wall-clock intervals', () => {
    expect(timeRangesOverlap('07:00:00', '07:45:00', '07:45:00', '08:30:00')).toBe(false);
    expect(timeRangesOverlap('07:00:00', '07:45:00', '07:44:00', '08:30:00')).toBe(true);
  });

  it('detects class and teacher overlap across different exact slot ids', () => {
    const second = entry({
      id: 'entry-2', timeSlotDefinitionId: 'slot-2',
      timeSlotDefinition: {
        ...(entry() as never as { timeSlotDefinition: Record<string, unknown> }).timeSlotDefinition,
        id: 'slot-2', startTime: new Date('1970-01-01T07:30:00Z'), endTime: new Date('1970-01-01T08:15:00Z'),
      },
    });
    const codes = evaluate([entry(), second]).map((value) => value.code);
    expect(codes).toContain('CLASS_TIME_OVERLAP');
    expect(codes).toContain('TEACHER_TIME_OVERLAP');
  });

  it('does not collide for different resources, weekdays, or sequential boundaries', () => {
    const baseSlot = (entry() as never as { timeSlotDefinition: Record<string, unknown> }).timeSlotDefinition;
    const sequential = entry({
      id: 'entry-2', schoolClassId: 'class-2', teacherUserId: 'teacher-2', weekday: 'MONDAY',
      timeSlotDefinitionId: 'slot-2',
      timeSlotDefinition: { ...baseSlot, id: 'slot-2', startTime: new Date('1970-01-01T07:45:00Z'), endTime: new Date('1970-01-01T08:30:00Z') },
      schoolClass: { ...(entry() as never as { schoolClass: Record<string, unknown> }).schoolClass, id: 'class-2' },
      teacher: { ...(entry() as never as { teacher: Record<string, unknown> }).teacher, id: 'teacher-2' },
    });
    expect(evaluate([entry(), sequential]).filter((value) => value.code.endsWith('_TIME_OVERLAP'))).toEqual([]);
  });

  it('reports current dependency and coverage failures without inventing completeness', () => {
    const invalid = entry({
      weekday: 'SUNDAY',
      timeSlotDefinition: { ...(entry() as never as { timeSlotDefinition: Record<string, unknown> }).timeSlotDefinition, isActive: false, allowRegularTeaching: false },
      schoolClass: { ...(entry() as never as { schoolClass: Record<string, unknown> }).schoolClass, status: 'INACTIVE' },
      subject: { ...(entry() as never as { subject: Record<string, unknown> }).subject, status: 'INACTIVE' },
      teacher: { ...(entry() as never as { teacher: Record<string, unknown> }).teacher, status: 'DISABLED', profile: null },
      teachingAssignment: { ...(entry() as never as { teachingAssignment: Record<string, unknown> }).teachingAssignment, validUntil: new Date('2026-12-31Z') },
    });
    const codes = evaluate([invalid]).map((value) => value.code);
    expect(codes).toEqual([
      'WEEKDAY_NOT_IN_CALENDAR', 'SLOT_NOT_ACTIVE', 'SLOT_NOT_REGULAR_TEACHING', 'CLASS_NOT_ACTIVE',
      'SUBJECT_NOT_ACTIVE', 'TEACHER_NOT_ACTIVE', 'TEACHER_NOT_TEACHING_STAFF', 'ASSIGNMENT_COVERAGE_GAP',
    ]);
  });

  it('orders issues deterministically by rule then context', () => {
    const codes: TimetableValidationIssueCode[] = [
      'TEACHER_NOT_ACTIVE', 'EMPTY_TIMETABLE', 'TARGET_CALENDAR_NOT_ACTIVE', 'TARGET_REQUIRED',
    ];
    expect(sortValidationIssues(codes.map((code) => ({ code, message: code }))).map((value) => value.code))
      .toEqual(['TARGET_REQUIRED', 'TARGET_CALENDAR_NOT_ACTIVE', 'EMPTY_TIMETABLE', 'TEACHER_NOT_ACTIVE']);
  });
});
