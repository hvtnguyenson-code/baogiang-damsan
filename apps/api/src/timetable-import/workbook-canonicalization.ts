import { AcademicWeekday, TimeSlotSession, TimetableImportTeacherIdentifierMode } from '@prisma/client';
import { TimetableImportPreviewDiff, TimetableImportPreviewDiffRow, TimetableImportPreviewIssue, TimetableImportSemanticField } from '@baogiang/contracts';
import { MAX_PERIOD_ORDINAL } from './workbook-limits';
import { normalizeLookupKey } from './normalization';

const WEEKDAYS: Record<string, AcademicWeekday> = {
  monday: 'MONDAY', 'thứ 2': 'MONDAY', 'thứ hai': 'MONDAY', t2: 'MONDAY',
  tuesday: 'TUESDAY', 'thứ 3': 'TUESDAY', 'thứ ba': 'TUESDAY', t3: 'TUESDAY',
  wednesday: 'WEDNESDAY', 'thứ 4': 'WEDNESDAY', 'thứ tư': 'WEDNESDAY', t4: 'WEDNESDAY',
  thursday: 'THURSDAY', 'thứ 5': 'THURSDAY', 'thứ năm': 'THURSDAY', t5: 'THURSDAY',
  friday: 'FRIDAY', 'thứ 6': 'FRIDAY', 'thứ sáu': 'FRIDAY', t6: 'FRIDAY',
  saturday: 'SATURDAY', 'thứ 7': 'SATURDAY', 'thứ bảy': 'SATURDAY', t7: 'SATURDAY',
  sunday: 'SUNDAY', 'chủ nhật': 'SUNDAY', cn: 'SUNDAY',
};
const SESSIONS: Record<string, TimeSlotSession> = { morning: 'MORNING', sáng: 'MORNING', afternoon: 'AFTERNOON', chiều: 'AFTERNOON', evening: 'EVENING', tối: 'EVENING' };

export const parseWeekday = (value: string): AcademicWeekday | undefined => WEEKDAYS[normalizeLookupKey(value)];
export const parseSession = (value: string): TimeSlotSession | undefined => SESSIONS[normalizeLookupKey(value)];
export function parsePeriodOrdinal(value: string): number | undefined {
  const normalized = normalizeLookupKey(value);
  if (!/^\d+$/u.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_PERIOD_ORDINAL ? parsed : undefined;
}

const ISSUE_ORDER = [
  'HIDDEN_MAPPED_DATA', 'NONBLANK_ROW_WITHOUT_MAPPED_DATA', 'PARTIALLY_BLANK_MAPPED_ROW',
  'FORMULA_IN_MAPPED_CELL', 'HYPERLINK_IN_MAPPED_CELL', 'MERGED_MAPPED_CELL', 'UNSUPPORTED_MAPPED_CELL_TYPE', 'MAPPED_VALUE_TOO_LONG',
  'INVALID_WEEKDAY', 'INVALID_SESSION', 'INVALID_PERIOD_ORDINAL', 'WEEKDAY_NOT_IN_CALENDAR',
  'SLOT_NOT_FOUND', 'SLOT_NOT_ACTIVE', 'SLOT_NOT_REGULAR_TEACHING', 'CLASS_NOT_FOUND', 'CLASS_INACTIVE', 'CLASS_IDENTITY_CONFLICT',
  'SUBJECT_NOT_FOUND', 'SUBJECT_INACTIVE', 'SUBJECT_IDENTITY_CONFLICT', 'TEACHER_NOT_FOUND', 'TEACHER_AMBIGUOUS', 'TEACHER_INACTIVE', 'TEACHER_NOT_TEACHING_STAFF',
  'ASSIGNMENT_NOT_FOUND', 'ASSIGNMENT_AMBIGUOUS', 'ASSIGNMENT_COVERAGE_GAP', 'DUPLICATE_CANONICAL_ROW', 'CLASS_TIME_OVERLAP', 'TEACHER_TIME_OVERLAP',
] as const;

export function sortPreviewIssues(issues: TimetableImportPreviewIssue[]): TimetableImportPreviewIssue[] {
  const order = new Map(ISSUE_ORDER.map((code, index) => [code, index]));
  return [...issues].sort((a, b) => (a.sourceRowNumber ?? 0) - (b.sourceRowNumber ?? 0)
    || (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99)
    || (a.semanticField ?? '').localeCompare(b.semanticField ?? ''));
}

const coordinate = (row: TimetableImportPreviewDiffRow): string => `${row.weekday}:${row.timeSlotDefinitionId}:${row.schoolClassId}`;
const sortRows = (rows: TimetableImportPreviewDiffRow[]): TimetableImportPreviewDiffRow[] => [...rows].sort((a, b) => coordinate(a).localeCompare(coordinate(b)));

export function computePreviewDiff(candidate: TimetableImportPreviewDiffRow[], baseline: TimetableImportPreviewDiffRow[]): TimetableImportPreviewDiff {
  const before = new Map(baseline.map((row) => [coordinate(row), row]));
  const after = new Map(candidate.map((row) => [coordinate(row), row]));
  const added: TimetableImportPreviewDiffRow[] = [];
  const removed: TimetableImportPreviewDiffRow[] = [];
  const changed: TimetableImportPreviewDiff['changed'] = [];
  let unchangedCount = 0;
  for (const [key, row] of after) {
    const old = before.get(key);
    if (!old) { added.push(row); continue; }
    const fields: Array<'SUBJECT' | 'TEACHING_ASSIGNMENT' | 'TEACHER'> = [];
    if (old.subjectId !== row.subjectId) fields.push('SUBJECT');
    if (old.teachingAssignmentId !== row.teachingAssignmentId) fields.push('TEACHING_ASSIGNMENT');
    if (old.teacherUserId !== row.teacherUserId) fields.push('TEACHER');
    fields.length ? changed.push({ before: old, after: row, changedFields: fields }) : unchangedCount += 1;
  }
  for (const [key, row] of before) if (!after.has(key)) removed.push(row);
  const sortedAdded = sortRows(added); const sortedRemoved = sortRows(removed);
  changed.sort((a, b) => coordinate(a.after).localeCompare(coordinate(b.after)));
  return { added: sortedAdded, changed, removed: sortedRemoved, unchangedCount, counts: { added: added.length, changed: changed.length, removed: removed.length, unchanged: unchangedCount } };
}

export const semanticFields: TimetableImportSemanticField[] = ['WEEKDAY', 'SESSION', 'PERIOD_ORDINAL', 'SCHOOL_CLASS', 'SUBJECT', 'TEACHER'];

export function resolveTeacherCandidates<T extends { id: string; username: string; profile: null | { staffCode: string | null } }>(
  value: string,
  mode: TimetableImportTeacherIdentifierMode,
  users: T[],
  aliases: Array<{ sourceValueKey: string; teacherUserId: string | null }>,
): T[] {
  const key = normalizeLookupKey(value);
  const ids = new Set<string>();
  if (mode === 'STAFF_CODE' || mode === 'GENERIC_EXACT') {
    for (const user of users) if (user.profile?.staffCode && normalizeLookupKey(user.profile.staffCode) === key) ids.add(user.id);
  }
  if (mode === 'USERNAME' || mode === 'GENERIC_EXACT') {
    for (const user of users) if (normalizeLookupKey(user.username) === key) ids.add(user.id);
  }
  if (mode === 'APPROVED_ALIAS' || mode === 'GENERIC_EXACT') {
    for (const alias of aliases) if (alias.sourceValueKey === key && alias.teacherUserId) ids.add(alias.teacherUserId);
  }
  return users.filter((user) => ids.has(user.id));
}
