import { AcademicWeekday, CatalogStatus, UserStatus } from '@prisma/client';
import {
  CivilDateString,
  TimetableValidationIssue,
  TimetableValidationIssueCode,
} from '@baogiang/contracts';
import { formatCivilDate } from '../common/validation/civil-date';
import { formatWallClockTime, wallClockSeconds } from '../time-slots/wall-clock-time';
import { EnrichedTimetableEntry } from './mapper';

const RULE_ORDER: TimetableValidationIssueCode[] = [
  'TARGET_REQUIRED',
  'TARGET_CALENDAR_NOT_ACTIVE',
  'TARGET_WEEK_NO_SEGMENTS',
  'TARGET_EFFECTIVE_FROM_MISMATCH',
  'EMPTY_TIMETABLE',
  'WEEKDAY_NOT_IN_CALENDAR',
  'SLOT_NOT_ACTIVE',
  'SLOT_NOT_REGULAR_TEACHING',
  'CLASS_NOT_ACTIVE',
  'SUBJECT_NOT_ACTIVE',
  'TEACHER_NOT_ACTIVE',
  'TEACHER_NOT_TEACHING_STAFF',
  'ASSIGNMENT_COVERAGE_GAP',
  'CLASS_TIME_OVERLAP',
  'TEACHER_TIME_OVERLAP',
];

export const TIMETABLE_VALIDATION_MESSAGES: Record<TimetableValidationIssueCode, string> = {
  TARGET_REQUIRED: 'Bản nháp chưa chọn phiên lịch và tuần hiệu lực.',
  TARGET_CALENDAR_NOT_ACTIVE: 'Phiên lịch được chọn không còn là phiên lịch đang áp dụng của năm học.',
  TARGET_WEEK_NO_SEGMENTS: 'Tuần hiệu lực không có phân đoạn ngày.',
  TARGET_EFFECTIVE_FROM_MISMATCH: 'Ngày hiệu lực không khớp ngày bắt đầu sớm nhất của tuần đã chọn.',
  EMPTY_TIMETABLE: 'Thời khóa biểu chưa có dòng nội dung.',
  WEEKDAY_NOT_IN_CALENDAR: 'Thứ của dòng không thuộc các ngày dạy trong phiên lịch.',
  SLOT_NOT_ACTIVE: 'Phiên bản khung tiết không còn hoạt động.',
  SLOT_NOT_REGULAR_TEACHING: 'Khung tiết không cho phép tiết dạy thông thường.',
  CLASS_NOT_ACTIVE: 'Lớp học không còn hoạt động.',
  SUBJECT_NOT_ACTIVE: 'Môn học không còn hoạt động.',
  TEACHER_NOT_ACTIVE: 'Tài khoản giáo viên không hoạt động.',
  TEACHER_NOT_TEACHING_STAFF: 'Người được phân công không có hồ sơ giáo viên hợp lệ.',
  ASSIGNMENT_COVERAGE_GAP: 'Phân công giảng dạy không bao phủ toàn bộ khoảng hiệu lực cần kiểm tra.',
  CLASS_TIME_OVERLAP: 'Lớp học có hai tiết chồng lấn thời gian.',
  TEACHER_TIME_OVERLAP: 'Giáo viên có hai tiết chồng lấn thời gian.',
};

export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return wallClockSeconds(aStart) < wallClockSeconds(bEnd)
    && wallClockSeconds(bStart) < wallClockSeconds(aEnd);
}

export function issue(code: TimetableValidationIssueCode, context: Omit<TimetableValidationIssue, 'code' | 'message'> = {}): TimetableValidationIssue {
  return { code, message: TIMETABLE_VALIDATION_MESSAGES[code], ...context };
}

export function sortValidationIssues(issues: TimetableValidationIssue[]): TimetableValidationIssue[] {
  const index = new Map(RULE_ORDER.map((code, position) => [code, position]));
  return [...issues].sort((a, b) => {
    const rule = (index.get(a.code) ?? RULE_ORDER.length) - (index.get(b.code) ?? RULE_ORDER.length);
    if (rule !== 0) return rule;
    return issueKey(a).localeCompare(issueKey(b));
  });
}

export function evaluateTimetableEntries(input: {
  entries: EnrichedTimetableEntry[];
  teachingWeekdays?: AcademicWeekday[];
  effectiveFrom?: CivilDateString;
  calendarEndDate?: CivilDateString;
}): TimetableValidationIssue[] {
  const issues: TimetableValidationIssue[] = [];
  const entries = [...input.entries].sort((a, b) => a.id.localeCompare(b.id));
  if (entries.length === 0) issues.push(issue('EMPTY_TIMETABLE'));

  for (const entry of entries) {
    const context = { entryIds: [entry.id], weekday: entry.weekday };
    if (input.teachingWeekdays && !input.teachingWeekdays.includes(entry.weekday)) {
      issues.push(issue('WEEKDAY_NOT_IN_CALENDAR', context));
    }
    if (!entry.timeSlotDefinition.isActive) issues.push(issue('SLOT_NOT_ACTIVE', context));
    if (!entry.timeSlotDefinition.allowRegularTeaching) issues.push(issue('SLOT_NOT_REGULAR_TEACHING', context));
    if (entry.schoolClass.status !== CatalogStatus.ACTIVE) issues.push(issue('CLASS_NOT_ACTIVE', context));
    if (entry.subject.status !== CatalogStatus.ACTIVE) issues.push(issue('SUBJECT_NOT_ACTIVE', context));
    if (entry.teacher.status !== UserStatus.ACTIVE) issues.push(issue('TEACHER_NOT_ACTIVE', { ...context, teacherUserId: entry.teacherUserId }));
    if (!entry.teacher.profile?.isTeachingStaff) {
      issues.push(issue('TEACHER_NOT_TEACHING_STAFF', { ...context, teacherUserId: entry.teacherUserId }));
    }
    const assignmentStart = formatCivilDate(entry.teachingAssignment.validFrom);
    const assignmentEnd = entry.teachingAssignment.validUntil ? formatCivilDate(entry.teachingAssignment.validUntil) : null;
    if (input.effectiveFrom && input.calendarEndDate
      && (assignmentStart > input.effectiveFrom || (assignmentEnd !== null && assignmentEnd < input.calendarEndDate))) {
      issues.push(issue('ASSIGNMENT_COVERAGE_GAP', context));
    }
  }

  issues.push(...collisionIssues(entries, 'class'));
  issues.push(...collisionIssues(entries, 'teacher'));
  return sortValidationIssues(issues);
}

function collisionIssues(entries: EnrichedTimetableEntry[], kind: 'class' | 'teacher'): TimetableValidationIssue[] {
  const groups = new Map<string, EnrichedTimetableEntry[]>();
  for (const entry of entries) {
    const entity = kind === 'class' ? entry.schoolClassId : entry.teacherUserId;
    const key = `${entry.weekday}:${entity}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const output: TimetableValidationIssue[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    for (let left = 0; left < ordered.length; left += 1) {
      for (let right = left + 1; right < ordered.length; right += 1) {
        const a = ordered[left]!;
        const b = ordered[right]!;
        if (!timeRangesOverlap(
          formatWallClockTime(a.timeSlotDefinition.startTime),
          formatWallClockTime(a.timeSlotDefinition.endTime),
          formatWallClockTime(b.timeSlotDefinition.startTime),
          formatWallClockTime(b.timeSlotDefinition.endTime),
        )) continue;
        output.push(issue(kind === 'class' ? 'CLASS_TIME_OVERLAP' : 'TEACHER_TIME_OVERLAP', {
          entryIds: [a.id, b.id],
          weekday: a.weekday,
          ...(kind === 'class' ? { schoolClassId: a.schoolClassId } : { teacherUserId: a.teacherUserId }),
          timeSlotDefinitionIds: [a.timeSlotDefinitionId, b.timeSlotDefinitionId],
        }));
      }
    }
  }
  return output;
}

function issueKey(value: TimetableValidationIssue): string {
  return [
    value.weekday ?? '',
    value.schoolClassId ?? '',
    value.teacherUserId ?? '',
    ...(value.entryIds ?? []),
    ...(value.timeSlotDefinitionIds ?? []),
  ].join(':');
}
