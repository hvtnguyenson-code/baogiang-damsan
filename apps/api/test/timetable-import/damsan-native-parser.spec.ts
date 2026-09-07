import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AcademicWeekday } from '@prisma/client';
import { parseWorkbookBuffer } from '../../src/timetable-import/workbook-parser.worker';
import {
  DAMSAN_NATIVE_SHEETS,
  DamSanNativeErrorCode,
  DamSanNativeTimetableException,
} from '../../src/timetable-import/damsan-native-adapter.types';
import {
  extractEffectiveDate,
  parseClassCell,
  validateAndExtractWorkbookStructure,
  validateSheetStructure,
} from '../../src/timetable-import/damsan-native-parser';
import { ParsedWorkbook } from '../../src/timetable-import/workbook-parser.types';

describe('DamSanNativeParser (Checkpoint A - Structural Core)', () => {
  const fixturePath = resolve(__dirname, '../fixtures/tkb/sanitized-dam-san-tkb-fixture.xlsx');
  let fixtureBuffer: Buffer;
  let parsedFixture: ParsedWorkbook;

  beforeAll(async () => {
    fixtureBuffer = readFileSync(fixturePath);
    parsedFixture = await parseWorkbookBuffer(fixtureBuffer);
  });

  describe('Four-Sheet Recognition Contract', () => {
    it('passes when exactly all 4 required sheets are present', () => {
      expect(() => validateSheetStructure(parsedFixture)).not.toThrow();
    });

    it('throws TKB_NATIVE_SHEET_STRUCTURE_INVALID when a required sheet is missing', () => {
      const incompleteWorkbook: ParsedWorkbook = {
        sheets: parsedFixture.sheets.filter((s) => s.name !== DAMSAN_NATIVE_SHEETS.MORNING_TEACHER),
      };
      expect(() => validateSheetStructure(incompleteWorkbook)).toThrow(DamSanNativeTimetableException);
      try {
        validateSheetStructure(incompleteWorkbook);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_SHEET_STRUCTURE_INVALID,
        );
      }
    });

    it('throws TKB_NATIVE_SHEET_STRUCTURE_INVALID when an extra sheet is present', () => {
      const extraWorkbook: ParsedWorkbook = {
        sheets: [
          ...parsedFixture.sheets,
          {
            name: 'EXTRA_SHEET',
            state: 'VISIBLE',
            rowCount: 10,
            columnCount: 10,
            rows: [],
            hiddenColumns: [],
          },
        ],
      };
      expect(() => validateSheetStructure(extraWorkbook)).toThrow(DamSanNativeTimetableException);
      try {
        validateSheetStructure(extraWorkbook);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_SHEET_STRUCTURE_INVALID,
        );
      }
    });

    it('throws TKB_NATIVE_SHEET_STRUCTURE_INVALID when a sheet name is misspelled', () => {
      const misspelledWorkbook: ParsedWorkbook = {
        sheets: parsedFixture.sheets.map((s) =>
          s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS
            ? { ...s, name: 'TKB THEO LOP BUOI SANG' }
            : s,
        ),
      };
      expect(() => validateSheetStructure(misspelledWorkbook)).toThrow(DamSanNativeTimetableException);
      try {
        validateSheetStructure(misspelledWorkbook);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_SHEET_STRUCTURE_INVALID,
        );
      }
    });
  });

  describe('Effective Date Extraction Contract', () => {
    it('extracts ISO civil date 2026-09-07 from all 4 sheets in the sanitized fixture', () => {
      for (const sheet of parsedFixture.sheets) {
        const date = extractEffectiveDate(sheet);
        expect(date).toBe('2026-09-07');
      }
    });

    it('throws TKB_NATIVE_EFFECTIVE_DATE_MISSING when Row 4 does not contain a date', () => {
      const modifiedSheet = {
        ...parsedFixture.sheets[0]!,
        rows: parsedFixture.sheets[0]!.rows.map((row) =>
          row.number === 4
            ? { ...row, cells: [{ kind: 'TEXT' as const, text: 'THỜI KHÓA BIỂU KHÔNG CÓ NGÀY', textOverLimit: false, formula: false, hyperlink: false, merged: false }] }
            : row,
        ),
      };
      expect(() => extractEffectiveDate(modifiedSheet)).toThrow(DamSanNativeTimetableException);
      try {
        extractEffectiveDate(modifiedSheet);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_EFFECTIVE_DATE_MISSING,
        );
      }
    });

    it('throws TKB_NATIVE_EFFECTIVE_DATE_MISMATCH when sheets have conflicting dates', () => {
      const conflictingWorkbook: ParsedWorkbook = {
        sheets: parsedFixture.sheets.map((sheet) => {
          if (sheet.name === DAMSAN_NATIVE_SHEETS.AFTERNOON_CLASS) {
            return {
              ...sheet,
              rows: sheet.rows.map((row) =>
                row.number === 4
                  ? {
                    ...row,
                    cells: [{
                      kind: 'TEXT' as const,
                      text: 'THỜI KHOÁ BIỂU BUỔI CHIỀU - ÁP DỤNG TỪ NGÀY 14/09/2026',
                      textOverLimit: false,
                      formula: false,
                      hyperlink: false,
                      merged: false,
                    }],
                  }
                  : row,
              ),
            };
          }
          return sheet;
        }),
      };
      expect(() => validateAndExtractWorkbookStructure(conflictingWorkbook)).toThrow(DamSanNativeTimetableException);
      try {
        validateAndExtractWorkbookStructure(conflictingWorkbook);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_EFFECTIVE_DATE_MISMATCH,
        );
      }
    });
  });

  describe('Class Cell Parser Precedence', () => {
    const dummyCoord = {
      session: 'MORNING' as const,
      day: 2,
      weekday: AcademicWeekday.MONDAY,
      period: 1,
      classCode: '10A1',
      rowNumber: 7,
      colNumber: 3,
      sheetName: 'TKB THEO LỚP BUỔI SÁNG',
    };

    it('parses empty or whitespace cell as UNSCHEDULED', () => {
      const resBlank = parseClassCell('', dummyCoord);
      expect(resBlank.kind).toBe('UNSCHEDULED');

      const resSpace = parseClassCell('   ', dummyCoord);
      expect(resSpace.kind).toBe('UNSCHEDULED');
    });

    it('intercepts exact special non-peer tokens before hyphen split (TN-HN precedence invariant)', () => {
      const resCC = parseClassCell('CC', dummyCoord);
      expect(resCC).toEqual(expect.objectContaining({
        kind: 'SPECIAL_NON_PEER',
        specialActivityCode: 'CC',
      }));

      const resGDDP = parseClassCell('GDĐP', dummyCoord);
      expect(resGDDP).toEqual(expect.objectContaining({
        kind: 'SPECIAL_NON_PEER',
        specialActivityCode: 'GDĐP',
      }));

      const resTNHN = parseClassCell('TN-HN', dummyCoord);
      expect(resTNHN).toEqual(expect.objectContaining({
        kind: 'SPECIAL_NON_PEER',
        specialActivityCode: 'TN-HN',
      }));
      // Invariant: MUST NOT be split into subject TN and teacher HN
      expect(resTNHN.subjectCode).toBeUndefined();
      expect(resTNHN.teacherCode).toBeUndefined();
    });

    it('parses standard teacher-linked marker with last-hyphen split', () => {
      const res = parseClassCell('TO-GV01', dummyCoord);
      expect(res).toEqual(expect.objectContaining({
        kind: 'TEACHER_LINKED',
        subjectCode: 'TO',
        teacherCode: 'GV01',
      }));
    });

    it('parses SH-<TeacherCode> as teacher-linked code with neutral semantics', () => {
      const res = parseClassCell('SH-GV15', dummyCoord);
      expect(res).toEqual(expect.objectContaining({
        kind: 'TEACHER_LINKED',
        subjectCode: 'SH',
        teacherCode: 'GV15',
      }));
    });

    it('throws TKB_NATIVE_MARKER_SYNTAX_INVALID on malformed cell text', () => {
      const malformedMarkers = ['INVALID_NO_HYPHEN', '-GV01', 'TO-', 'TO--GV01', 'A B-C D', 'TO-GV@!'];
      for (const marker of malformedMarkers) {
        expect(() => parseClassCell(marker, dummyCoord)).toThrow(DamSanNativeTimetableException);
        try {
          parseClassCell(marker, dummyCoord);
        } catch (error) {
          expect(error).toBeInstanceOf(DamSanNativeTimetableException);
          expect((error as DamSanNativeTimetableException).errorCode).toBe(
            DamSanNativeErrorCode.TKB_NATIVE_MARKER_SYNTAX_INVALID,
          );
        }
      }
    });
  });

  describe('Sanitized Fixture Measured Counts (Section 14 Audit Verification)', () => {
    it('computes exact morning, afternoon, and total counts from the sanitized fixture', () => {
      const structure = validateAndExtractWorkbookStructure(parsedFixture);

      expect(structure.effectiveDate).toBe('2026-09-07');
      expect(structure.morningClasses).toHaveLength(18);
      expect(structure.afternoonClasses).toHaveLength(18);

      // MORNING
      const morningSlots = structure.morningClassSlots;
      expect(morningSlots).toHaveLength(540); // 30 rows * 18 classes

      const morningScheduled = morningSlots.filter((s) => s.kind !== 'UNSCHEDULED');
      const morningBlank = morningSlots.filter((s) => s.kind === 'UNSCHEDULED');
      const morningTeacherLinked = morningSlots.filter((s) => s.kind === 'TEACHER_LINKED');
      const morningSH = morningTeacherLinked.filter((s) => s.subjectCode === 'SH');
      const morningNonSH = morningTeacherLinked.filter((s) => s.subjectCode !== 'SH');
      const morningNonPeer = morningSlots.filter((s) => s.kind === 'SPECIAL_NON_PEER');
      const morningCC = morningNonPeer.filter((s) => s.specialActivityCode === 'CC');
      const morningGDDP = morningNonPeer.filter((s) => s.specialActivityCode === 'GDĐP');
      const morningTNHN = morningNonPeer.filter((s) => s.specialActivityCode === 'TN-HN');

      expect(morningScheduled).toHaveLength(522);
      expect(morningBlank).toHaveLength(18);
      expect(morningTeacherLinked).toHaveLength(402);
      expect(morningSH).toHaveLength(18);
      expect(morningNonSH).toHaveLength(384);
      expect(morningNonPeer).toHaveLength(120);
      expect(morningCC).toHaveLength(18);
      expect(morningGDDP).toHaveLength(48);
      expect(morningTNHN).toHaveLength(54);

      // AFTERNOON
      const afternoonSlots = structure.afternoonClassSlots;
      expect(afternoonSlots).toHaveLength(540);

      const afternoonScheduled = afternoonSlots.filter((s) => s.kind !== 'UNSCHEDULED');
      const afternoonBlank = afternoonSlots.filter((s) => s.kind === 'UNSCHEDULED');
      const afternoonTeacherLinked = afternoonSlots.filter((s) => s.kind === 'TEACHER_LINKED');
      const afternoonNonPeer = afternoonSlots.filter((s) => s.kind === 'SPECIAL_NON_PEER');

      expect(afternoonScheduled).toHaveLength(53);
      expect(afternoonBlank).toHaveLength(487);
      expect(afternoonTeacherLinked).toHaveLength(53);
      expect(afternoonNonPeer).toHaveLength(0);

      // TOTALS
      const totalTeacherLinked = morningTeacherLinked.length + afternoonTeacherLinked.length;
      const totalNonSH = morningNonSH.length + afternoonTeacherLinked.length;
      const totalSH = morningSH.length;

      expect(totalTeacherLinked).toBe(455);
      expect(totalNonSH).toBe(437);
      expect(totalSH).toBe(18);

      // Teacher view rows: 38 rows (8..45)
      expect(structure.morningTeacherRows.size).toBe(38);
      expect(structure.afternoonTeacherRows.size).toBe(38);

      // Teacher slots count
      expect(structure.morningTeacherSlots).toHaveLength(402);
      expect(structure.afternoonTeacherSlots).toHaveLength(53);
    });
  });

  describe('Finding 4 & 6 Regression: Header Validation & Cell Safety', () => {
    function cloneWorkbook(wb: ParsedWorkbook): ParsedWorkbook {
      return {
        sheets: wb.sheets.map((sheet) => ({
          ...sheet,
          rows: sheet.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({ ...cell })),
          })),
        })),
      };
    }

    it('Finding 4: throws TKB_NATIVE_HEADER_INVALID when a teacher day header is corrupt', () => {
      const wb = cloneWorkbook(parsedFixture);
      const teacherSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_TEACHER)!;
      const row6 = teacherSheet.rows.find((r) => r.number === 6)!;
      // Corrupt Monday day header at col 2
      row6.cells[1] = { kind: 'TEXT', text: 'SAI_HEADER_THU', textOverLimit: false, formula: false, hyperlink: false, merged: true };

      expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
      try {
        validateAndExtractWorkbookStructure(wb);
      } catch (err) {
        expect(err).toBeInstanceOf(DamSanNativeTimetableException);
        expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
      }
    });

    it('Finding 4: throws TKB_NATIVE_HEADER_INVALID when a teacher period header is corrupt', () => {
      const wb = cloneWorkbook(parsedFixture);
      const teacherSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_TEACHER)!;
      const row7 = teacherSheet.rows.find((r) => r.number === 7)!;
      // Corrupt Period 1 header under Monday (col 2)
      row7.cells[1] = { kind: 'TEXT', text: '99', textOverLimit: false, formula: false, hyperlink: false, merged: false };

      expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
      try {
        validateAndExtractWorkbookStructure(wb);
      } catch (err) {
        expect(err).toBeInstanceOf(DamSanNativeTimetableException);
        expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
      }
    });

    it('Finding 4: throws TKB_NATIVE_HEADER_INVALID when a class coordinate period header is corrupt', () => {
      const wb = cloneWorkbook(parsedFixture);
      const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
      const row7 = classSheet.rows.find((r) => r.number === 7)!;
      // Corrupt period coordinate at col 2 of row 7
      row7.cells[1] = { kind: 'TEXT', text: 'WRONG_PERIOD', textOverLimit: false, formula: false, hyperlink: false, merged: false };

      expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
      try {
        validateAndExtractWorkbookStructure(wb);
      } catch (err) {
        expect(err).toBeInstanceOf(DamSanNativeTimetableException);
        expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
      }
    });

    it('Finding 6: throws TKB_NATIVE_HEADER_INVALID when a class timetable marker has a formula', () => {
      const wb = cloneWorkbook(parsedFixture);
      const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
      const row7 = classSheet.rows.find((r) => r.number === 7)!;
      // Put formula in col 3 (class 10A1 cell)
      row7.cells[2] = { kind: 'TEXT', text: 'TO-GV01', textOverLimit: false, formula: true, hyperlink: false, merged: false };

      expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
      try {
        validateAndExtractWorkbookStructure(wb);
      } catch (err) {
        expect(err).toBeInstanceOf(DamSanNativeTimetableException);
        expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
      }
    });

    it('Finding 6: throws TKB_NATIVE_HEADER_INVALID when a teacher target-class cell has a hyperlink', () => {
      const wb = cloneWorkbook(parsedFixture);
      const teacherSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_TEACHER)!;
      const row8 = teacherSheet.rows.find((r) => r.number === 8)!;
      // Put hyperlink in col 2
      row8.cells[1] = { kind: 'TEXT', text: '10A1', textOverLimit: false, formula: false, hyperlink: true, merged: false };

      expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
      try {
        validateAndExtractWorkbookStructure(wb);
      } catch (err) {
        expect(err).toBeInstanceOf(DamSanNativeTimetableException);
        expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
      }
    });

    it('Finding 6: throws TKB_NATIVE_HEADER_INVALID when a business cell is an unsafe merged cell', () => {
      const wb = cloneWorkbook(parsedFixture);
      const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
      const row7 = classSheet.rows.find((r) => r.number === 7)!;
      // Mark col 3 as merged
      row7.cells[2] = { kind: 'TEXT', text: 'TO-GV01', textOverLimit: false, formula: false, hyperlink: false, merged: true };

      expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
      try {
        validateAndExtractWorkbookStructure(wb);
      } catch (err) {
        expect(err).toBeInstanceOf(DamSanNativeTimetableException);
        expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
      }
    });

    describe('Finding 9: Class Day Coordinate Validation', () => {
      it('throws TKB_NATIVE_HEADER_INVALID when morning class day coordinate is corrupted (e.g. Monday row 7 says Thứ 6)', () => {
        const wb = cloneWorkbook(parsedFixture);
        const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
        const row7 = classSheet.rows.find((r) => r.number === 7)!;
        row7.cells[0] = { kind: 'TEXT', text: 'Thứ 6', textOverLimit: false, formula: false, hyperlink: false, merged: true };

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
        }
      });

      it('throws TKB_NATIVE_HEADER_INVALID when afternoon class day coordinate is corrupted', () => {
        const wb = cloneWorkbook(parsedFixture);
        const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.AFTERNOON_CLASS)!;
        const row7 = classSheet.rows.find((r) => r.number === 7)!;
        row7.cells[0] = { kind: 'TEXT', text: 'Thứ 3', textOverLimit: false, formula: false, hyperlink: false, merged: true };

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
        }
      });

      it('passes when genuine merged fixture day coordinates are intact', () => {
        expect(() => validateAndExtractWorkbookStructure(parsedFixture)).not.toThrow();
      });
    });

    describe('Finding 10: Row 4 Effective-Date Source Safety', () => {
      it('rejects Row 4 cell containing formula with cached date text', () => {
        const wb = cloneWorkbook(parsedFixture);
        const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
        const row4 = classSheet.rows.find((r) => r.number === 4)!;
        const dateCellIdx = row4.cells.findIndex((c) => c.text && c.text.includes('ÁP DỤNG'));
        row4.cells[dateCellIdx] = {
          ...row4.cells[dateCellIdx]!,
          formula: true,
        };

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
        }
      });

      it('rejects Row 4 cell containing hyperlink', () => {
        const wb = cloneWorkbook(parsedFixture);
        const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
        const row4 = classSheet.rows.find((r) => r.number === 4)!;
        const dateCellIdx = row4.cells.findIndex((c) => c.text && c.text.includes('ÁP DỤNG'));
        row4.cells[dateCellIdx] = {
          ...row4.cells[dateCellIdx]!,
          hyperlink: true,
        };

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
        }
      });

      it('rejects Row 4 cell containing unsupported kind', () => {
        const wb = cloneWorkbook(parsedFixture);
        const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
        const row4 = classSheet.rows.find((r) => r.number === 4)!;
        const dateCellIdx = row4.cells.findIndex((c) => c.text && c.text.includes('ÁP DỤNG'));
        row4.cells[dateCellIdx] = {
          ...row4.cells[dateCellIdx]!,
          kind: 'BOOLEAN',
        };

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
        }
      });
    });

    describe('Finding 11: Cell Safety Order and Hidden Data', () => {
      it('rejects formula metadata on a cell whose cached/kind representation is BLANK', () => {
        const wb = cloneWorkbook(parsedFixture);
        const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
        const row7 = classSheet.rows.find((r) => r.number === 7)!;
        // Unscheduled cell with formula
        row7.cells[5] = { kind: 'BLANK', text: '', textOverLimit: false, formula: true, hyperlink: false, merged: false };

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
        }
      });

      it('rejects nonblank hidden class timetable business row', () => {
        const wb = cloneWorkbook(parsedFixture);
        const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
        const row7 = classSheet.rows.find((r) => r.number === 7)!;
        row7.hidden = true;

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe('HIDDEN_MAPPED_DATA');
        }
      });

      it('rejects nonblank hidden teacher target-class business column', () => {
        const wb = cloneWorkbook(parsedFixture);
        const teacherSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_TEACHER)!;
        const row8 = teacherSheet.rows.find((r) => r.number === 8)!;
        row8.cells[1] = { kind: 'TEXT', text: '10A1', textOverLimit: false, formula: false, hyperlink: false, merged: false };
        teacherSheet.hiddenColumns = [2]; // Col 2 is Monday Period 1

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe('HIDDEN_MAPPED_DATA');
        }
      });
    });

    describe('Finding 12: Missing Teacher Physical Row != Zero Allocation', () => {
      it('rejects when physical teacher row 25 is completely missing', () => {
        const wb = cloneWorkbook(parsedFixture);
        const teacherSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_TEACHER)!;
        teacherSheet.rows = teacherSheet.rows.filter((r) => r.number !== 25);

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
        }
      });

      it('rejects when physical teacher row 25 is missing on afternoon teacher sheet', () => {
        const wb = cloneWorkbook(parsedFixture);
        const teacherSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.AFTERNOON_TEACHER)!;
        teacherSheet.rows = teacherSheet.rows.filter((r) => r.number !== 25);

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
        }
      });

      it('passes when teacher row 25 is physically present but has blank column A and zero allocations', () => {
        const wb = cloneWorkbook(parsedFixture);
        const teacherSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_TEACHER)!;
        const row25 = teacherSheet.rows.find((r) => r.number === 25)!;
        // Blank out column 1 and all target cells
        for (let c = 0; c < row25.cells.length; c += 1) {
          row25.cells[c] = { kind: 'BLANK', text: '', textOverLimit: false, formula: false, hyperlink: false, merged: false };
        }
        // Also ensure no class view refers to row 25's teacher
        expect(() => validateAndExtractWorkbookStructure(wb)).not.toThrow();
      });
    });

    describe('Finding 13: Duplicate Class Header Must Fail Closed', () => {
      it('rejects duplicate raw class header on morning class sheet with TKB_NATIVE_HEADER_INVALID', () => {
        const wb = cloneWorkbook(parsedFixture);
        const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
        const headerRow = classSheet.rows.find((r) => r.number === 6)!;
        // Set col 4 (10A2) to duplicate col 3 (10A1)
        headerRow.cells[3] = { ...headerRow.cells[2]!, text: headerRow.cells[2]!.text };

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
          expect((err as DamSanNativeTimetableException).message).toContain('Duplicate class header');
        }
      });

      it('rejects duplicate raw class header on afternoon class sheet with TKB_NATIVE_HEADER_INVALID', () => {
        const wb = cloneWorkbook(parsedFixture);
        const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.AFTERNOON_CLASS)!;
        const headerRow = classSheet.rows.find((r) => r.number === 6)!;
        // Set col 4 to duplicate col 3
        headerRow.cells[3] = { ...headerRow.cells[2]!, text: headerRow.cells[2]!.text };

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
          expect((err as DamSanNativeTimetableException).message).toContain('Duplicate class header');
        }
      });
    });

    describe('Finding 14: Sheet Name Normalization Consistency', () => {
      it('deterministically accepts workbook whose sheet names use decomposed Unicode (NFD) normalized to NFKC', () => {
        const wb = cloneWorkbook(parsedFixture);
        wb.sheets = wb.sheets.map((s) => ({
          ...s,
          name: s.name.normalize('NFD'),
        }));

        expect(() => validateSheetStructure(wb)).not.toThrow();
        expect(() => validateAndExtractWorkbookStructure(wb)).not.toThrow();
      });
    });

    describe('Finding 15: Day Token Matching Must Be Exact, Not Substring', () => {
      it('rejects malformed day coordinate "Thứ 20" at Monday class row 7 with TKB_NATIVE_HEADER_INVALID', () => {
        const wb = cloneWorkbook(parsedFixture);
        const classSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
        const row7 = classSheet.rows.find((r) => r.number === 7)!;
        row7.cells[0] = { kind: 'TEXT', text: 'Thứ 20', textOverLimit: false, formula: false, hyperlink: false, merged: false };

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
          expect((err as DamSanNativeTimetableException).message).toContain('day coordinate expected "thứ 2", found "thứ 20"');
        }
      });

      it('rejects malformed teacher row 6 day header containing "Thứ 2" as substring with TKB_NATIVE_HEADER_INVALID', () => {
        const wb = cloneWorkbook(parsedFixture);
        const teacherSheet = wb.sheets.find((s) => s.name === DAMSAN_NATIVE_SHEETS.MORNING_TEACHER)!;
        const row6 = teacherSheet.rows.find((r) => r.number === 6)!;
        // Col 2 is the first Monday column (indices: col 2 is index 1)
        row6.cells[1] = { kind: 'TEXT', text: 'Thứ 20', textOverLimit: false, formula: false, hyperlink: false, merged: true };

        expect(() => validateAndExtractWorkbookStructure(wb)).toThrow(DamSanNativeTimetableException);
        try {
          validateAndExtractWorkbookStructure(wb);
        } catch (err) {
          expect(err).toBeInstanceOf(DamSanNativeTimetableException);
          expect((err as DamSanNativeTimetableException).errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID);
          expect((err as DamSanNativeTimetableException).message).toContain('Teacher day header at column 2');
        }
      });
    });
  });
});
