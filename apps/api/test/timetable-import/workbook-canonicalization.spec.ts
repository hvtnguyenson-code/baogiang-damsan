import { computePreviewDiff, parsePeriodOrdinal, parseSession, parseWeekday, resolveTeacherCandidates, sortPreviewIssues } from '../../src/timetable-import/workbook-canonicalization';
import { normalizeLookupKey } from '../../src/timetable-import/normalization';

describe('workbook canonicalization', () => {
  it.each([
    ['MONDAY', 'MONDAY'], ['Thứ 2', 'MONDAY'], ['Thứ hai', 'MONDAY'], ['T2', 'MONDAY'],
    ['TUESDAY', 'TUESDAY'], ['Thứ ba', 'TUESDAY'], ['T7', 'SATURDAY'], ['Chủ nhật', 'SUNDAY'], ['CN', 'SUNDAY'],
  ])('parses exact weekday token %s', (source, expected) => expect(parseWeekday(source)).toBe(expected));

  it.each([
    ['MORNING', 'MORNING'], ['Sáng', 'MORNING'], ['AFTERNOON', 'AFTERNOON'],
    ['Chiều', 'AFTERNOON'], ['EVENING', 'EVENING'], ['Tối', 'EVENING'],
  ])('parses exact session token %s', (source, expected) => expect(parseSession(source)).toBe(expected));

  it('rejects fuzzy tokens and validates ordinal bounds exactly', () => {
    expect(parseWeekday('Thứ Hai gần đúng')).toBeUndefined();
    expect(parseWeekday('Thu 2')).toBeUndefined();
    expect(parseSession('buổi sáng')).toBeUndefined();
    expect(parsePeriodOrdinal('1')).toBe(1);
    expect(parsePeriodOrdinal('99')).toBe(99);
    for (const invalid of ['0', '100', '-1', '1.5', '1e1', 'NaN']) expect(parsePeriodOrdinal(invalid)).toBeUndefined();
  });

  it('preserves Vietnamese diacritics and does not accent-fold lookup keys', () => {
    expect(normalizeLookupKey('  TIẾT HỌC  ')).toBe('tiết học');
    expect(normalizeLookupKey('TIẾT')).not.toBe(normalizeLookupKey('TIET'));
  });

  it('resolves teacher namespaces exactly, dedupes the same user, detects multi-user ambiguity and ignores display names', () => {
    const users = [
      { id: 'one', username: 'gv01', profile: { staffCode: 'GV01', displayName: 'Nguyễn Văn Một' } },
      { id: 'two', username: 'other', profile: { staffCode: 'GV02', displayName: 'GV01' } },
    ];
    expect(resolveTeacherCandidates('GV01', 'GENERIC_EXACT', users, [{ sourceValueKey: 'gv01', teacherUserId: 'one' }]).map((user) => user.id)).toEqual(['one']);
    expect(resolveTeacherCandidates('GV01', 'GENERIC_EXACT', users, [{ sourceValueKey: 'gv01', teacherUserId: 'two' }]).map((user) => user.id)).toEqual(['one', 'two']);
    expect(resolveTeacherCandidates('Nguyễn Văn Một', 'GENERIC_EXACT', users, [])).toEqual([]);
    expect(resolveTeacherCandidates('GV01', 'STAFF_CODE', users, [{ sourceValueKey: 'gv01', teacherUserId: 'two' }]).map((user) => user.id)).toEqual(['one']);
  });

  it('computes deterministic coordinate/payload diff and changed fields', () => {
    const common = { weekday: 'MONDAY' as const, timeSlotDefinitionId: 'slot-1', schoolClassId: 'class-1' };
    const result = computePreviewDiff(
      [{ ...common, subjectId: 'new-subject', teachingAssignmentId: 'new-assignment', teacherUserId: 'new-teacher', sourceRowNumber: 2 }, { ...common, timeSlotDefinitionId: 'slot-2', subjectId: 's', teachingAssignmentId: 'a', teacherUserId: 't' }],
      [{ ...common, subjectId: 'old-subject', teachingAssignmentId: 'old-assignment', teacherUserId: 'old-teacher' }, { ...common, timeSlotDefinitionId: 'slot-old', subjectId: 's', teachingAssignmentId: 'a', teacherUserId: 't' }],
    );
    expect(result.changed[0]?.changedFields).toEqual(['SUBJECT', 'TEACHING_ASSIGNMENT', 'TEACHER']);
    expect(result.counts).toEqual({ added: 1, changed: 1, removed: 1, unchanged: 0 });
  });

  it('orders issues deterministically by source row, code and semantic field', () => {
    const issues = sortPreviewIssues([
      { code: 'TEACHER_NOT_FOUND', severity: 'ERROR', category: 'RESOLUTION', message: 'x', sourceRowNumber: 4 },
      { code: 'INVALID_WEEKDAY', severity: 'ERROR', category: 'RESOLUTION', message: 'x', sourceRowNumber: 2 },
      { code: 'FORMULA_IN_MAPPED_CELL', severity: 'ERROR', category: 'ROW', message: 'x', sourceRowNumber: 2 },
    ]);
    expect(issues.map((issue) => issue.code)).toEqual(['FORMULA_IN_MAPPED_CELL', 'INVALID_WEEKDAY', 'TEACHER_NOT_FOUND']);
  });
});
