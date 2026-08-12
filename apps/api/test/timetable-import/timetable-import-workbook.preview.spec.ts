import { TimetableImportWorkbookService, UploadedWorkbookFile } from '../../src/timetable-import/timetable-import-workbook.service';
import { ParsedWorkbookCell, ParsedWorkbookRow } from '../../src/timetable-import/workbook-parser.types';
import { MAX_PARSER_CELL_TEXT_LENGTH } from '../../src/timetable-import/workbook-limits';
import { parseWorkbookBuffer } from '../../src/timetable-import/workbook-parser.worker';
import ExcelJS from 'exceljs';

const fields = ['WEEKDAY', 'SESSION', 'PERIOD_ORDINAL', 'SCHOOL_CLASS', 'SUBJECT', 'TEACHER'] as const;
const headers = ['Thứ', 'Buổi', 'Tiết', 'Lớp', 'Môn', 'Giáo viên'];
const identifiers = {
  year: '10000000-0000-4000-8000-000000000001', calendar: '10000000-0000-4000-8000-000000000002',
  week: '10000000-0000-4000-8000-000000000003', revision: '10000000-0000-4000-8000-000000000004',
};

const text = (value: string, overrides: Partial<ParsedWorkbookCell> = {}): ParsedWorkbookCell => ({ kind: 'TEXT', text: value, textOverLimit: false, formula: false, hyperlink: false, merged: false, ...overrides });
const blank = (): ParsedWorkbookCell => ({ kind: 'BLANK', textOverLimit: false, formula: false, hyperlink: false, merged: false });
const row = (number: number, values: string[], hidden = false): ParsedWorkbookRow => ({ number, hidden, cells: values.map((value) => value ? text(value) : blank()) });

function fixture(dataRow: ParsedWorkbookRow = row(5, ['T2', 'Sáng', '1', '10A', 'Toán', 'GV01'])) {
  const revision = { id: identifiers.revision, profileId: 'profile', isActive: true, sheetNameHint: 'TKB', teacherIdentifierMode: 'GENERIC_EXACT', profile: {}, columnMappings: fields.map((semanticField, index) => ({ semanticField, sourceHeaderKey: headers[index]!.toLocaleLowerCase('vi-VN') })) };
  const schoolClass = { id: 'class', academicYearId: identifiers.year, code: '10A', name: '10A', status: 'ACTIVE' };
  const subject = { id: 'subject', code: 'Toán', name: 'Toán', status: 'ACTIVE' };
  const teacher = { id: 'teacher', username: 'gv01', status: 'ACTIVE', profile: { staffCode: 'GV01', displayName: 'Giáo viên 01', isTeachingStaff: true } };
  const slot = { id: 'slot', academicYearId: identifiers.year, weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 1, isActive: true, allowRegularTeaching: true, startTime: new Date('1970-01-01T07:00:00.000Z'), endTime: new Date('1970-01-01T07:45:00.000Z') };
  const assignment = { id: 'assignment', academicYearId: identifiers.year, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: teacher.id, validFrom: new Date('2026-08-01T00:00:00.000Z'), validUntil: null };
  const prisma = {
    timetableImportProfileRevision: { findUnique: jest.fn().mockResolvedValue(revision) },
    academicYear: { findUnique: jest.fn().mockResolvedValue({ id: identifiers.year }) },
    academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue({ id: identifiers.calendar, academicYearId: identifiers.year, endDate: new Date('2027-05-31T00:00:00.000Z'), teachingWeekdays: ['MONDAY'] }) },
    academicWeek: { findUnique: jest.fn().mockResolvedValue({ id: identifiers.week, calendarVersionId: identifiers.calendar, segments: [{ startDate: new Date('2026-08-17T00:00:00.000Z') }] }) },
    schoolClass: { findMany: jest.fn().mockResolvedValue([schoolClass]) }, subject: { findMany: jest.fn().mockResolvedValue([subject]) },
    user: { findMany: jest.fn().mockResolvedValue([teacher]) }, timetableImportEntityAlias: { findMany: jest.fn().mockResolvedValue([]) },
    timeSlotDefinition: { findMany: jest.fn().mockResolvedValue([slot]) }, teachingAssignment: { findMany: jest.fn().mockResolvedValue([assignment]) },
    timetableVersion: { findFirst: jest.fn().mockResolvedValue(null) }, timetableEntry: { findMany: jest.fn() },
  };
  const parser = { parse: jest.fn().mockResolvedValue({ sheets: [{ name: 'TKB', state: 'VISIBLE', rowCount: dataRow.number, columnCount: 6, rows: [row(1, headers), dataRow], hiddenColumns: [] }] }) };
  return { service: new TimetableImportWorkbookService(prisma as never, parser as never), prisma };
}

const upload: UploadedWorkbookFile = { originalname: 'tkb.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 1, buffer: Buffer.from('x') };
const dto = { profileRevisionId: identifiers.revision, academicYearId: identifiers.year, calendarVersionId: identifiers.calendar, effectiveAcademicWeekId: identifiers.week, sheetName: 'TKB', headerRowNumber: 1 };

describe('TimetableImportWorkbookService canonical preview orchestration', () => {
  it('resolves a canonical row, derives assignment, historical target and ADDED diff without mutation', async () => {
    const { service, prisma } = fixture();
    const result = await service.preview(upload, dto);
    expect(result).toMatchObject({
      canConfirm: true, blockingIssueCount: 0, target: { effectiveFrom: '2026-08-17', calendarEndDate: '2027-05-31' },
      rows: [{ sourceRowNumber: 5, weekday: 'MONDAY', timeSlotDefinitionId: 'slot', schoolClassId: 'class', subjectId: 'subject', teachingAssignmentId: 'assignment', teacherUserId: 'teacher' }],
      baseline: { date: '2026-08-17', timetableVersion: null }, diff: { counts: { added: 1, changed: 0, removed: 0, unchanged: 0 } },
    });
    expect(Object.keys(prisma).some((name) => ['create', 'update', 'delete', 'upsert'].some((verb) => name.includes(verb)))).toBe(false);
  });

  it.each([
    [row(7, ['T2', 'Sáng', '', '10A', 'Toán', 'GV01']), 'PARTIALLY_BLANK_MAPPED_ROW'],
    [{ ...row(8, ['T2', 'Sáng', '1', '10A', 'Toán', 'GV01']), hidden: true }, 'HIDDEN_MAPPED_DATA'],
    [{ ...row(9, ['T2', 'Sáng', '1', '10A', 'Toán', 'GV01']), cells: [text('T2', { formula: true, kind: 'UNSUPPORTED' }), ...row(9, ['Sáng', '1', '10A', 'Toán', 'GV01']).cells] }, 'FORMULA_IN_MAPPED_CELL'],
  ])('retains blocking row context and suppresses diff', async (dataRow, code) => {
    const result = await fixture(dataRow as ParsedWorkbookRow).service.preview(upload, dto);
    expect(result.issues).toContainEqual(expect.objectContaining({ code, sourceRowNumber: dataRow.number }));
    expect(result.canConfirm).toBe(false);
    expect(result.diff).toBeNull();
  });

  it.each([
    ['plain text', (oversized: string) => oversized],
    ['rich text', (oversized: string) => ({ richText: [{ text: oversized.slice(0, 150) }, { text: oversized.slice(150) }] })],
  ])('blocks oversized %s using only the bounded worker representation', async (_name, teacherValue) => {
    const oversized = `SECRET-${'X'.repeat(MAX_PARSER_CELL_TEXT_LENGTH + 500)}`;
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('TKB').addRows([headers, ['T2', 'Sáng', 1, '10A', 'Toán', teacherValue(oversized)]]);
    const parsed = await parseWorkbookBuffer(Buffer.from(await workbook.xlsx.writeBuffer()));
    const parsedRow = parsed.sheets[0]!.rows[1]!;
    expect(parsedRow.cells[5]).toMatchObject({ textOverLimit: true });
    expect(parsedRow.cells[5]!.text).toHaveLength(MAX_PARSER_CELL_TEXT_LENGTH);
    const result = await fixture(parsedRow).service.preview(upload, dto);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MAPPED_VALUE_TOO_LONG', sourceRowNumber: 2 }));
    expect(result.issues.find((issue) => issue.code === 'MAPPED_VALUE_TOO_LONG')?.boundedSourceValue?.length).toBeLessThanOrEqual(MAX_PARSER_CELL_TEXT_LENGTH);
    expect(JSON.stringify(result)).not.toContain(oversized);
    expect(result.canConfirm).toBe(false);
    expect(result.diff).toBeNull();
  });
});
