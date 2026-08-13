import ExcelJS from 'exceljs';
import { inspectParsedWorkbook, locateHeader } from '../../src/timetable-import/workbook-inspection';
import { MAX_HEADER_CANDIDATES_PER_SHEET, MAX_HEADER_SCAN_ROWS, MAX_MERGED_RANGES, MAX_PARSER_CELL_TEXT_LENGTH } from '../../src/timetable-import/workbook-limits';
import { parseWorkbookBuffer } from '../../src/timetable-import/workbook-parser.worker';

const mappings = [
  ['WEEKDAY', 'thứ'], ['SESSION', 'buổi'], ['PERIOD_ORDINAL', 'tiết'],
  ['SCHOOL_CLASS', 'lớp'], ['SUBJECT', 'môn'], ['TEACHER', 'giáo viên'],
] as const;

async function bytes(configure: (workbook: ExcelJS.Workbook) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  configure(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('bounded workbook parser and inspection', () => {
  it('parses a valid workbook and exposes public sheet/cell metadata without evaluating formulas', async () => {
    const input = await bytes((workbook) => {
      const visible = workbook.addWorksheet('TKB');
      visible.addRow(['Thứ', 'Buổi', 'Tiết', 'Lớp', 'Môn', 'Giáo viên']);
      visible.addRow(['T2', 'Sáng', 1, '10A', 'Toán', { text: 'GV01', hyperlink: 'https://invalid.example' }]);
      visible.getCell('A3').value = { formula: '1+1', result: 2 };
      visible.mergeCells('B3:C3');
      workbook.addWorksheet('Ẩn', { state: 'hidden' });
      workbook.addWorksheet('Rất ẩn', { state: 'veryHidden' });
    });
    const parsed = await parseWorkbookBuffer(input);
    expect(parsed.sheets.map((sheet) => sheet.state)).toEqual(['VISIBLE', 'HIDDEN', 'VERY_HIDDEN']);
    expect(parsed.sheets[0]?.rows[1]?.cells[5]).toMatchObject({ hyperlink: true, kind: 'UNSUPPORTED' });
    expect(parsed.sheets[0]?.rows[2]?.cells[0]).toMatchObject({ formula: true, kind: 'UNSUPPORTED' });
    expect(parsed.sheets[0]?.rows[2]?.cells[1]).toMatchObject({ merged: true });
  });

  it.each([
    ['worksheet', (workbook: ExcelJS.Workbook) => { for (let index = 0; index < 33; index += 1) workbook.addWorksheet(`S${index}`); }],
    ['row', (workbook: ExcelJS.Workbook) => { workbook.addWorksheet('S').getCell(5001, 1).value = 'x'; }],
    ['column', (workbook: ExcelJS.Workbook) => { workbook.addWorksheet('S').getCell(1, 65).value = 'x'; }],
    ['total dimension', (workbook: ExcelJS.Workbook) => { const sheet = workbook.addWorksheet('S'); sheet.getCell(4000, 64).value = 'x'; }],
  ])('rejects the %s complexity limit', async (_name, configure) => {
    await expect(parseWorkbookBuffer(await bytes(configure))).rejects.toThrow('WORKBOOK_COMPLEXITY_LIMIT');
  });

  it.each([
    [MAX_MERGED_RANGES, false],
    [MAX_MERGED_RANGES + 1, true],
  ])('enforces the unique merged-range boundary at %i ranges', async (rangeCount, rejected) => {
    const input = await bytes((workbook) => {
      const sheet = workbook.addWorksheet('Merged');
      for (let rowNumber = 1; rowNumber <= rangeCount; rowNumber += 1) {
        sheet.mergeCells(rowNumber, 1, rowNumber, 2);
        sheet.getCell(rowNumber, 1).value = `range-${rowNumber}`;
      }
    });
    const result = parseWorkbookBuffer(input);
    if (rejected) {
      await expect(result).rejects.toThrow('WORKBOOK_COMPLEXITY_LIMIT');
    } else {
      await expect(result).resolves.toMatchObject({ sheets: [{ rowCount: MAX_MERGED_RANGES }] });
    }
  });

  it('rejects corrupt, arbitrary ZIP-like and non-XLSX input with a stable parser code', async () => {
    await expect(parseWorkbookBuffer(Buffer.from('weekday,session,period'))).rejects.toThrow('INVALID_XLSX');
    await expect(parseWorkbookBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).rejects.toThrow('INVALID_XLSX');
    await expect(parseWorkbookBuffer(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))).rejects.toThrow('INVALID_XLSX');
  });

  it('detects exact bounded headers, duplicate headers, hints, visibility and blank sheets', async () => {
    const input = await bytes((workbook) => {
      const sheet = workbook.addWorksheet('TKB');
      sheet.addRow(['Thứ', 'Buổi', 'Tiết', 'Lớp', 'Môn', 'Giáo viên']);
      const duplicate = workbook.addWorksheet('Duplicate');
      duplicate.addRow(['Thứ', 'Thứ', 'Buổi', 'Tiết', 'Lớp', 'Môn', 'Giáo viên']);
      const missing = workbook.addWorksheet('Missing');
      missing.addRow(['Thứ', 'Buổi']);
      workbook.addWorksheet('Blank');
      const hidden = workbook.addWorksheet('Hidden', { state: 'hidden' });
      hidden.addRow(['Thứ', 'Buổi', 'Tiết', 'Lớp', 'Môn', 'Giáo viên']);
      hidden.addRow(['T2', 'Sáng', 1, '10A', 'Toán', 'GV01']);
      const late = workbook.addWorksheet('Late');
      late.getRow(MAX_HEADER_SCAN_ROWS + 1).values = ['Thứ', 'Buổi', 'Tiết', 'Lớp', 'Môn', 'Giáo viên'];
    });
    const parsed = await parseWorkbookBuffer(input);
    const result = inspectParsedWorkbook(parsed, mappings.map(([semanticField, sourceHeaderKey]) => ({ semanticField, sourceHeaderKey })), 'TKB');
    expect(result.sheets.find((sheet) => sheet.name === 'TKB')).toMatchObject({ selectable: true, matchesProfileSheetHint: true, headerCandidates: [{ complete: true }] });
    expect(result.sheets.find((sheet) => sheet.name === 'Duplicate')?.headerCandidates[0]?.complete).toBe(false);
    expect(result.sheets.find((sheet) => sheet.name === 'Missing')?.headerCandidates[0]?.complete).toBe(false);
    expect(result.sheets.find((sheet) => sheet.name === 'Blank')).toMatchObject({ nonBlank: false, selectable: false });
    expect(result.sheets.find((sheet) => sheet.name === 'Late')?.headerCandidates).toHaveLength(0);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'HIDDEN_MAPPED_DATA', category: 'SHEET' })]);
  });

  it('preserves actual Excel row addresses when locating headers after blank rows', async () => {
    const input = await bytes((workbook) => {
      const sheet = workbook.addWorksheet('TKB');
      sheet.getRow(4).values = ['Thứ', 'Buổi', 'Tiết', 'Lớp', 'Môn', 'Giáo viên'];
      sheet.getRow(7).values = ['T2', 'Sáng', 1, '10A', 'Toán', 'GV01'];
    });
    const sheet = (await parseWorkbookBuffer(input)).sheets[0]!;
    expect(locateHeader(sheet, 4, mappings.map(([semanticField, sourceHeaderKey]) => ({ semanticField, sourceHeaderKey })))?.candidate.complete).toBe(true);
    expect(sheet.rows.find((row) => row.number === 7)?.number).toBe(7);
  });

  it('scans past ten partial candidates and prioritizes a later complete header in the bounded result', async () => {
    const input = await bytes((workbook) => {
      const visible = workbook.addWorksheet('Visible');
      const hidden = workbook.addWorksheet('Hidden', { state: 'hidden' });
      for (const sheet of [visible, hidden]) {
        for (let rowNumber = 1; rowNumber <= MAX_HEADER_CANDIDATES_PER_SHEET; rowNumber += 1) sheet.getRow(rowNumber).values = ['Thứ'];
        sheet.getRow(11).values = ['Thứ', 'Buổi', 'Tiết', 'Lớp', 'Môn', 'Giáo viên'];
        sheet.getRow(12).values = ['T2', 'Sáng', 1, '10A', 'Toán', 'GV01'];
      }
    });
    const result = inspectParsedWorkbook(await parseWorkbookBuffer(input), mappings.map(([semanticField, sourceHeaderKey]) => ({ semanticField, sourceHeaderKey })), null);
    const visible = result.sheets.find((sheet) => sheet.name === 'Visible')!;
    expect(visible.headerCandidates).toHaveLength(MAX_HEADER_CANDIDATES_PER_SHEET);
    expect(visible.headerCandidates).toContainEqual(expect.objectContaining({ rowNumber: 11, complete: true }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'HIDDEN_MAPPED_DATA', category: 'SHEET' }));
  });

  it('bounds plain and rich text before returning parsed worker data', async () => {
    const oversized = 'X'.repeat(MAX_PARSER_CELL_TEXT_LENGTH + 500);
    const input = await bytes((workbook) => {
      const sheet = workbook.addWorksheet('TKB');
      sheet.addRow([oversized, { richText: [{ text: oversized }, { text: oversized }] }]);
    });
    const parsed = await parseWorkbookBuffer(input);
    for (const cell of parsed.sheets[0]!.rows[0]!.cells) {
      expect(cell.textOverLimit).toBe(true);
      expect(cell.text).toHaveLength(MAX_PARSER_CELL_TEXT_LENGTH);
      expect(cell.text).not.toContain(oversized);
    }
  });

  it('does not flag a long raw value whose normalized form remains within the parser bound', async () => {
    const input = await bytes((workbook) => workbook.addWorksheet('TKB').addRow([`${' '.repeat(2_000)}GV01${' '.repeat(2_000)}`]));
    expect((await parseWorkbookBuffer(input)).sheets[0]!.rows[0]!.cells[0]).toMatchObject({ text: 'GV01', textOverLimit: false });
  });
});
