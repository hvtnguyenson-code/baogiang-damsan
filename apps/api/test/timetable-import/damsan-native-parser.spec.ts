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
});
