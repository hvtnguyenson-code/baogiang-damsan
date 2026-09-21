import {
  computeConfirmRequestFingerprint,
  computeSemanticChecksum,
  computeSemanticChecksumV2,
  serializeConfirmRequestV1,
  serializeSemanticV1,
  serializeSemanticV2,
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
  it('serializes multiple entries in exact ordinal tuple order with the fixed-key byte shape', () => {
    const second = entry({ weekday: 'FRIDAY', teacherUserId: '00000000-0000-4000-8000-000000000006' });
    const expected = '{"version":"semantic-v1","entries":[{"weekday":"FRIDAY","timeSlotDefinitionId":"00000000-0000-4000-8000-000000000001","schoolClassId":"00000000-0000-4000-8000-000000000002","subjectId":"00000000-0000-4000-8000-000000000003","teachingAssignmentId":"00000000-0000-4000-8000-000000000004","teacherUserId":"00000000-0000-4000-8000-000000000006"},{"weekday":"MONDAY","timeSlotDefinitionId":"00000000-0000-4000-8000-000000000001","schoolClassId":"00000000-0000-4000-8000-000000000002","subjectId":"00000000-0000-4000-8000-000000000003","teachingAssignmentId":"00000000-0000-4000-8000-000000000004","teacherUserId":"00000000-0000-4000-8000-000000000005"}]}';
    expect(serializeSemanticV1([entry(), second])).toBe(expected);
    expect(serializeSemanticV1([second, entry()])).toBe(expected);
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

describe('semantic-v2 identity', () => {
  const marker = (overrides: Record<string, string> = {}) => ({
    schoolClassId: '00000000-0000-4000-8000-000000000031',
    timeSlotDefinitionId: '00000000-0000-4000-8000-000000000032',
    kind: 'GDDP' as const,
    ...overrides,
  });

  it('serializes entries and markers deterministically', () => {
    const e1 = entry({ weekday: 'MONDAY' });
    const e2 = entry({ weekday: 'TUESDAY' });
    const m1 = marker({ kind: 'GDDP', schoolClassId: '00000000-0000-4000-8000-000000000031' });
    const m2 = marker({ kind: 'HDTN_HN', schoolClassId: '00000000-0000-4000-8000-000000000032' });

    const expected = JSON.stringify({
      version: 'semantic-v2',
      entries: [e1, e2],
      markers: [m1, m2],
    });

    expect(serializeSemanticV2({ entries: [e2, e1], markers: [m2, m1] })).toBe(expected);
    expect(computeSemanticChecksumV2({ entries: [e2, e1], markers: [m2, m1] }))
      .toBe(computeSemanticChecksumV2({ entries: [e1, e2], markers: [m1, m2] }));
  });

  it('moving one TN-HN marker changes semantic checksum', () => {
    const mOriginal = marker({ kind: 'HDTN_HN', timeSlotDefinitionId: '00000000-0000-4000-8000-000000000032' });
    const mMoved = marker({ kind: 'HDTN_HN', timeSlotDefinitionId: '00000000-0000-4000-8000-000000000033' });

    const c1 = computeSemanticChecksumV2({ entries: [entry()], markers: [mOriginal] });
    const c2 = computeSemanticChecksumV2({ entries: [entry()], markers: [mMoved] });
    expect(c1).not.toBe(c2);
  });

  it('moving one GDĐP marker changes semantic checksum', () => {
    const mOriginal = marker({ kind: 'GDDP', timeSlotDefinitionId: '00000000-0000-4000-8000-000000000032' });
    const mMoved = marker({ kind: 'GDDP', timeSlotDefinitionId: '00000000-0000-4000-8000-000000000033' });

    const c1 = computeSemanticChecksumV2({ entries: [entry()], markers: [mOriginal] });
    const c2 = computeSemanticChecksumV2({ entries: [entry()], markers: [mMoved] });
    expect(c1).not.toBe(c2);
  });

  it('changing kind between GDDP and HDTN_HN changes checksum', () => {
    const m1 = marker({ kind: 'GDDP' });
    const m2 = marker({ kind: 'HDTN_HN' });

    const c1 = computeSemanticChecksumV2({ entries: [entry()], markers: [m1] });
    const c2 = computeSemanticChecksumV2({ entries: [entry()], markers: [m2] });
    expect(c1).not.toBe(c2);
  });

  it('changing input order of markers only does not change checksum', () => {
    const m1 = marker({ schoolClassId: '00000000-0000-4000-8000-000000000031' });
    const m2 = marker({ schoolClassId: '00000000-0000-4000-8000-000000000032' });

    const c1 = computeSemanticChecksumV2({ entries: [entry()], markers: [m1, m2] });
    const c2 = computeSemanticChecksumV2({ entries: [entry()], markers: [m2, m1] });
    expect(c1).toBe(c2);
  });

  it('empty markers produces valid 64 character hex checksum', () => {
    const checksum = computeSemanticChecksumV2({ entries: [entry()], markers: [] });
    expect(checksum).toMatch(/^[0-9a-f]{64}$/u);
  });
});
