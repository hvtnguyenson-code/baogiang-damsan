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

const MESSAGE: Record<TimetableValidationIssueCode, string> = {
  TARGET_REQUIRED: 'Báº£n nhÃ¡p chÆ°a chá»n phiÃªn lá»‹ch vÃ  tuáº§n hiá»‡u lá»±c.',
  TARGET_WEEK_NO_SEGMENTS: 'Tuáº§n hiá»‡u lá»±c khÃ´ng cÃ³ phÃ¢n Ä‘oáº¡n ngÃ y.',
  TARGET_EFFECTIVE_FROM_MISMATCH: 'NgÃ y hiá»‡u lá»±c khÃ´ng khá»›p ngÃ y báº¯t Ä‘áº§u sá»›m nháº¥t cá»§a tuáº§n Ä‘Ã£ chá»n.',
  EMPTY_TIMETABLE: 'Thá»i khÃ³a biá»ƒu chÆ°a cÃ³ dÃ²ng ná»™i dung.',
  WEEKDAY_NOT_IN_CALENDAR: 'Thá»© cá»§a dÃ²ng khÃ´ng thuá»™c cÃ¡c ngÃ y dáº¡y trong phiÃªn lá»‹ch.',
  SLOT_NOT_ACTIVE: 'PhiÃªn báº£n khung tiáº¿t khÃ´ng cÃ²n hoáº¡t Ä‘á»™ng.',
  SLOT_NOT_REGULAR_TEACHING: 'Khung tiáº¿t khÃ´ng cho phÃ©p tiáº¿t dáº¡y thÃ´ng thÆ°á»ng.',
  CLASS_NOT_ACTIVE: 'Lá»›p há»c khÃ´ng cÃ²n hoáº¡t Ä‘á»™ng.',
  SUBJECT_NOT_ACTIVE: 'MÃ´n há»c khÃ´ng cÃ²n hoáº¡t Ä‘á»™ng.',
  TEACHER_NOT_ACTIVE: 'TÃ i khoáº£n giÃ¡o viÃªn khÃ´ng hoáº¡t Ä‘á»™ng.',
  TEACHER_NOT_TEACHING_STAFF: 'NgÆ°á»i Ä‘Æ°á»£c phÃ¢n cÃ´ng khÃ´ng cÃ³ há»“ sÆ¡ giÃ¡o viÃªn há»£p lá»‡.',
  ASSIGNMENT_COVERAGE_GAP: 'PhÃ¢n cÃ´ng giáº£ng dáº¡y khÃ´ng bao phá»§ toÃ n bá»™ khoáº£ng hiá»‡u lá»±c cáº§n kiá»ƒm tra.',
  CLASS_TIME_OVERLAP: 'Lá»›p há»c cÃ³ hai tiáº¿t chá»“ng láº¥n thá»i gian.',
  TEACHER_TIME_OVERLAP: 'GiÃ¡o viÃªn cÃ³ hai tiáº¿t chá»“ng láº¥n thá»i gian.',
};

export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return wallClockSeconds(aStart) < wallClockSeconds(bEnd)
    && wallClockSeconds(bStart) < wallClockSeconds(aEnd);
}

export function issue(code: TimetableValidationIssueCode, context: Omit<TimetableValidationIssue, 'code' | 'message'> = {}): TimetableValidationIssue {
  return { code, message: MESSAGE[code], ...context };
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
