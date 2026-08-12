import {
  computeConfirmRequestFingerprint,
  computeSemanticChecksum,
  serializeConfirmRequestV1,
  serializeSemanticV1,
} from '../../src/timetable-import/import-identity';

const entry = (overrides: Record<string, string> = {}) => ({
  weekday: 'MONDAY' as const,
  timeSlotDefinitionId: '00000000-0000-4000-8000-000000000001',
  schoolClassId: '00000000-0000-4000-8000-000000000002',
  subjectId: '00000000-0000-4000-8000-000000000003',
  teachingAssignmentId: '00000000-0000-4000-8000-000000000004',
  teacherUserId: '00000000-0000-4000-8000-000000000005',
  ...overrides,
});

const envelope = (overrides: Record<string, string | number> = {}) => ({
  workbookSha256: 'a'.repeat(64),
  profileRevisionId: '00000000-0000-4000-8000-000000000010',
  academicYearId: '00000000-0000-4000-8000-000000000011',
  calendarVersionId: '00000000-0000-4000-8000-000000000012',
  effectiveAcademicWeekId: '00000000-0000-4000-8000-000000000013',
  sheetName: 'TKB chính thức',
  headerRowNumber: 4,
  semanticChecksum: 'b'.repeat(64),
  ...overrides,
});

describe('semantic-v1 identity', () => {
  it('serializes the exact fixed-key shape and is order independent', () => {
    const second = entry({ weekday: 'TUESDAY', teacherUserId: '00000000-0000-4000-8000-000000000006' });
    expect(serializeSemanticV1([entry()])).toBe(JSON.stringify({ version: 'semantic-v1', entries: [entry()] }));
    expect(computeSemanticChecksum([entry(), second])).toBe(computeSemanticChecksum([second, entry()]));
  });

  it.each([
    ['weekday', 'TUESDAY'],
    ['timeSlotDefinitionId', '00000000-0000-4000-8000-000000000021'],
    ['schoolClassId', '00000000-0000-4000-8000-000000000022'],
    ['subjectId', '00000000-0000-4000-8000-000000000023'],
    ['teachingAssignmentId', '00000000-0000-4000-8000-000000000024'],
    ['teacherUserId', '00000000-0000-4000-8000-000000000025'],
  ])('changes when %s changes', (field, value) => {
    expect(computeSemanticChecksum([entry({ [field]: value })])).not.toBe(computeSemanticChecksum([entry()]));
  });

  it('ignores source, display and target metadata', () => {
    const rich = {
      ...entry(),
      sourceRowNumber: 99,
      schoolClassCode: '10A1',
      subjectCode: 'TOAN',
      teacherDisplayName: 'Teacher',
      normalizedSourceValues: { TEACHER: 'GV01' },
      academicYearId: 'year-not-semantic',
    };
    expect(computeSemanticChecksum([rich])).toBe(computeSemanticChecksum([entry()]));
  });

  it('returns exactly 64 lowercase hexadecimal characters', () => {
    expect(computeSemanticChecksum([entry()])).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe('confirm-request-v1 identity', () => {
  it('serializes the exact fixed-key shape deterministically', () => {
    expect(serializeConfirmRequestV1(envelope())).toBe(JSON.stringify({ version: 'confirm-request-v1', ...envelope() }));
    expect(computeConfirmRequestFingerprint(envelope())).toBe(computeConfirmRequestFingerprint(envelope()));
  });

  it.each([
    ['workbookSha256', 'c'.repeat(64)],
    ['semanticChecksum', 'd'.repeat(64)],
    ['profileRevisionId', '00000000-0000-4000-8000-000000000020'],
    ['academicYearId', '00000000-0000-4000-8000-000000000021'],
    ['calendarVersionId', '00000000-0000-4000-8000-000000000022'],
    ['effectiveAcademicWeekId', '00000000-0000-4000-8000-000000000023'],
    ['sheetName', 'Khác'],
    ['headerRowNumber', 5],
  ])('changes when %s changes', (field, value) => {
    expect(computeConfirmRequestFingerprint(envelope({ [field]: value }))).not.toBe(computeConfirmRequestFingerprint(envelope()));
  });

  it('does not admit filename, actor or request key into the serialization', () => {
    const extendedEnvelope = {
      ...envelope(),
      sourceFileName: 'renamed.xlsx',
      actorUserId: 'actor',
      requestIdempotencyKey: 'request-key',
    };
    const serialized = serializeConfirmRequestV1(extendedEnvelope);
    expect(serialized).not.toContain('renamed.xlsx');
    expect(serialized).not.toContain('actor');
    expect(serialized).not.toContain('request-key');
  });

  it('returns exactly 64 lowercase hexadecimal characters', () => {
    expect(computeConfirmRequestFingerprint(envelope())).toMatch(/^[0-9a-f]{64}$/u);
  });
});
