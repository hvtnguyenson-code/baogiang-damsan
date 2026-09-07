import { AcademicWeekday } from '@prisma/client';
import { parseCivilDate } from '../common/validation/civil-date';
import { MAX_PARSER_CELL_TEXT_LENGTH } from './workbook-limits';
import { ParsedWorkbook, ParsedWorkbookCell, ParsedWorkbookSheet } from './workbook-parser.types';
import {
  ALL_DAMSAN_NATIVE_SHEETS,
  DAMSAN_NATIVE_BOUNDARIES,
  DAMSAN_NATIVE_SHEETS,
  DamSanNativeErrorCode,
  DamSanNativeTimetableException,
  NativeSession,
  NativeWorkbookStructure,
  ParsedClassCell,
  ParsedTeacherCell,
  SPECIAL_NON_PEER_ALLOWLIST,
  SpecialNonPeerActivityCode,
  TeacherSourceRowRef,
} from './damsan-native-adapter.types';

const WEEKDAYS: AcademicWeekday[] = [
  AcademicWeekday.MONDAY,
  AcademicWeekday.TUESDAY,
  AcademicWeekday.WEDNESDAY,
  AcademicWeekday.THURSDAY,
  AcademicWeekday.FRIDAY,
  AcademicWeekday.SATURDAY,
];

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_À-ỹ]+$/u;
const EFFECTIVE_DATE_REGEX = /ÁP\s*DỤNG\s*TỪ\s*NGÀY\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/iu;

function normalizeCellText(cell: ParsedWorkbookCell | undefined): string {
  if (!cell || cell.kind === 'BLANK' || cell.text === undefined) return '';
  return cell.text.trim().normalize('NFKC');
}

export function validateSheetStructure(workbook: ParsedWorkbook): void {
  if (workbook.sheets.length !== ALL_DAMSAN_NATIVE_SHEETS.length) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_SHEET_STRUCTURE_INVALID,
      `Workbook must contain exactly ${ALL_DAMSAN_NATIVE_SHEETS.length} sheets, found ${workbook.sheets.length}.`,
      { expected: ALL_DAMSAN_NATIVE_SHEETS.length, actual: workbook.sheets.length },
    );
  }

  const existingSheetNames = new Set(workbook.sheets.map((sheet) => sheet.name.trim().normalize('NFKC')));
  for (const expectedSheet of ALL_DAMSAN_NATIVE_SHEETS) {
    if (!existingSheetNames.has(expectedSheet)) {
      throw new DamSanNativeTimetableException(
        DamSanNativeErrorCode.TKB_NATIVE_SHEET_STRUCTURE_INVALID,
        `Missing required worksheet: ${expectedSheet}`,
        { sheet: expectedSheet },
      );
    }
  }
}

export function extractEffectiveDate(sheet: ParsedWorkbookSheet): string {
  const row4 = sheet.rows.find((row) => row.number === DAMSAN_NATIVE_BOUNDARIES.EFFECTIVE_DATE_ROW);
  if (!row4) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_EFFECTIVE_DATE_MISSING,
      `Effective date row ${DAMSAN_NATIVE_BOUNDARIES.EFFECTIVE_DATE_ROW} was not found on sheet ${sheet.name}.`,
      { sheet: sheet.name, rowNumber: DAMSAN_NATIVE_BOUNDARIES.EFFECTIVE_DATE_ROW },
    );
  }

  for (const cell of row4.cells) {
    const text = normalizeCellText(cell);
    if (!text) continue;
    const match = EFFECTIVE_DATE_REGEX.exec(text);
    if (match) {
      const day = match[1]!.padStart(2, '0');
      const month = match[2]!.padStart(2, '0');
      const year = match[3]!;
      const isoDate = `${year}-${month}-${day}`;
      try {
        parseCivilDate(isoDate);
        return isoDate;
      } catch {
        throw new DamSanNativeTimetableException(
          DamSanNativeErrorCode.TKB_NATIVE_EFFECTIVE_DATE_MISSING,
          `Invalid effective date "${isoDate}" on sheet ${sheet.name}.`,
          { sheet: sheet.name, rowNumber: DAMSAN_NATIVE_BOUNDARIES.EFFECTIVE_DATE_ROW },
        );
      }
    }
  }

  throw new DamSanNativeTimetableException(
    DamSanNativeErrorCode.TKB_NATIVE_EFFECTIVE_DATE_MISSING,
    `Could not extract effective date matching "ÁP DỤNG TỪ NGÀY DD/MM/YYYY" from row ${DAMSAN_NATIVE_BOUNDARIES.EFFECTIVE_DATE_ROW} of sheet ${sheet.name}.`,
    { sheet: sheet.name, rowNumber: DAMSAN_NATIVE_BOUNDARIES.EFFECTIVE_DATE_ROW },
  );
}

export function parseClassCell(
  rawText: string,
  coord: {
    session: NativeSession;
    day: number;
    weekday: AcademicWeekday;
    period: number;
    classCode: string;
    rowNumber: number;
    colNumber: number;
    sheetName: string;
  },
): ParsedClassCell {
  const normalized = rawText.trim().normalize('NFKC');

  // 1. Blank Check -> UNSCHEDULED
  if (normalized.length === 0) {
    return {
      session: coord.session,
      day: coord.day,
      weekday: coord.weekday,
      period: coord.period,
      classCode: coord.classCode,
      rowNumber: coord.rowNumber,
      colNumber: coord.colNumber,
      kind: 'UNSCHEDULED',
      rawText,
    };
  }

  if (normalized.length > MAX_PARSER_CELL_TEXT_LENGTH) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_MARKER_SYNTAX_INVALID,
      `Class slot marker text exceeds length limit of ${MAX_PARSER_CELL_TEXT_LENGTH}.`,
      {
        sheet: coord.sheetName,
        rowNumber: coord.rowNumber,
        column: coord.colNumber,
        coordinate: `${coord.classCode}:D${coord.day}P${coord.period}`,
      },
    );
  }

  // 2. Exact Special Non-Peer Classification (PRECEDENCE: BEFORE hyphen-split)
  if ((SPECIAL_NON_PEER_ALLOWLIST as readonly string[]).includes(normalized)) {
    return {
      session: coord.session,
      day: coord.day,
      weekday: coord.weekday,
      period: coord.period,
      classCode: coord.classCode,
      rowNumber: coord.rowNumber,
      colNumber: coord.colNumber,
      kind: 'SPECIAL_NON_PEER',
      specialActivityCode: normalized as SpecialNonPeerActivityCode,
      rawText,
    };
  }

  // 3. Teacher-Linked Token Parse: split at LAST hyphen
  const lastHyphenIndex = normalized.lastIndexOf('-');
  if (lastHyphenIndex <= 0 || lastHyphenIndex >= normalized.length - 1) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_MARKER_SYNTAX_INVALID,
      `Class marker "${normalized.slice(0, 30)}" must be in <SubjectCode>-<TeacherCode> format.`,
      {
        sheet: coord.sheetName,
        rowNumber: coord.rowNumber,
        column: coord.colNumber,
        coordinate: `${coord.classCode}:D${coord.day}P${coord.period}`,
      },
    );
  }

  const subjectCode = normalized.slice(0, lastHyphenIndex).trim();
  const teacherCode = normalized.slice(lastHyphenIndex + 1).trim();

  // 4. Component Validation
  if (!subjectCode || !teacherCode || !IDENTIFIER_PATTERN.test(subjectCode) || !IDENTIFIER_PATTERN.test(teacherCode)) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_MARKER_SYNTAX_INVALID,
      `Class marker tokens must be non-empty identifiers. Found Subject="${subjectCode.slice(0, 20)}", Teacher="${teacherCode.slice(0, 20)}".`,
      {
        sheet: coord.sheetName,
        rowNumber: coord.rowNumber,
        column: coord.colNumber,
        coordinate: `${coord.classCode}:D${coord.day}P${coord.period}`,
        subjectCode: subjectCode.slice(0, 20),
        derivedTeacherCode: teacherCode.slice(0, 20),
      },
    );
  }

  return {
    session: coord.session,
    day: coord.day,
    weekday: coord.weekday,
    period: coord.period,
    classCode: coord.classCode,
    rowNumber: coord.rowNumber,
    colNumber: coord.colNumber,
    kind: 'TEACHER_LINKED',
    subjectCode,
    teacherCode,
    rawText,
  };
}

function validateAndExtractClassSheet(
  sheet: ParsedWorkbookSheet,
  session: NativeSession,
): { classes: string[]; slots: ParsedClassCell[] } {
  const headerRow = sheet.rows.find((row) => row.number === DAMSAN_NATIVE_BOUNDARIES.CLASS_HEADER_ROW);
  if (!headerRow) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID,
      `Class header row ${DAMSAN_NATIVE_BOUNDARIES.CLASS_HEADER_ROW} missing on sheet ${sheet.name}.`,
      { sheet: sheet.name, rowNumber: DAMSAN_NATIVE_BOUNDARIES.CLASS_HEADER_ROW },
    );
  }

  const col1 = normalizeCellText(headerRow.cells[0]);
  const col2 = normalizeCellText(headerRow.cells[1]);
  if (!col1.toLowerCase().includes('thứ') || !col2.toLowerCase().includes('tiết')) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID,
      `Class view columns 1 and 2 must be "Thứ" and "Tiết" on sheet ${sheet.name}.`,
      { sheet: sheet.name, rowNumber: DAMSAN_NATIVE_BOUNDARIES.CLASS_HEADER_ROW },
    );
  }

  const classes: string[] = [];
  for (let c = DAMSAN_NATIVE_BOUNDARIES.CLASS_COL_START; c <= DAMSAN_NATIVE_BOUNDARIES.CLASS_COL_END; c += 1) {
    const classCode = normalizeCellText(headerRow.cells[c - 1]);
    if (!classCode) {
      throw new DamSanNativeTimetableException(
        DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID,
        `Empty class header at column ${c} on sheet ${sheet.name}.`,
        { sheet: sheet.name, rowNumber: DAMSAN_NATIVE_BOUNDARIES.CLASS_HEADER_ROW, column: c },
      );
    }
    classes.push(classCode);
  }

  if (classes.length !== DAMSAN_NATIVE_BOUNDARIES.CLASS_COUNT) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID,
      `Class header row must contain exactly ${DAMSAN_NATIVE_BOUNDARIES.CLASS_COUNT} classes on sheet ${sheet.name}.`,
      { sheet: sheet.name, rowNumber: DAMSAN_NATIVE_BOUNDARIES.CLASS_HEADER_ROW, actual: classes.length },
    );
  }

  const slots: ParsedClassCell[] = [];
  for (let r = DAMSAN_NATIVE_BOUNDARIES.CLASS_ROW_START; r <= DAMSAN_NATIVE_BOUNDARIES.CLASS_ROW_END; r += 1) {
    const rowOffset = r - DAMSAN_NATIVE_BOUNDARIES.CLASS_ROW_START;
    const dayIndex = Math.floor(rowOffset / DAMSAN_NATIVE_BOUNDARIES.PERIODS_PER_DAY);
    const day = dayIndex + 2;
    const weekday = WEEKDAYS[dayIndex]!;
    const period = (rowOffset % DAMSAN_NATIVE_BOUNDARIES.PERIODS_PER_DAY) + 1;

    const rowObj = sheet.rows.find((row) => row.number === r);
    for (let c = DAMSAN_NATIVE_BOUNDARIES.CLASS_COL_START; c <= DAMSAN_NATIVE_BOUNDARIES.CLASS_COL_END; c += 1) {
      const classCode = classes[c - DAMSAN_NATIVE_BOUNDARIES.CLASS_COL_START]!;
      const cell = rowObj ? rowObj.cells[c - 1] : undefined;
      const rawText = normalizeCellText(cell);
      const parsedSlot = parseClassCell(rawText, {
        session,
        day,
        weekday,
        period,
        classCode,
        rowNumber: r,
        colNumber: c,
        sheetName: sheet.name,
      });
      slots.push(parsedSlot);
    }
  }

  return { classes, slots };
}

function validateAndExtractTeacherSheet(
  sheet: ParsedWorkbookSheet,
  session: NativeSession,
): {
  slots: ParsedTeacherCell[];
  teacherRows: Map<number, { rowRef: TeacherSourceRowRef; untrustedDisplayName: string }>;
} {
  const row6 = sheet.rows.find((row) => row.number === DAMSAN_NATIVE_BOUNDARIES.TEACHER_DAY_HEADER_ROW);
  const row7 = sheet.rows.find((row) => row.number === DAMSAN_NATIVE_BOUNDARIES.TEACHER_PERIOD_HEADER_ROW);
  if (!row6 || !row7) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID,
      `Teacher view header rows 6 and 7 must exist on sheet ${sheet.name}.`,
      { sheet: sheet.name, rowNumber: DAMSAN_NATIVE_BOUNDARIES.TEACHER_DAY_HEADER_ROW },
    );
  }

  const col1Row6 = normalizeCellText(row6.cells[0]);
  const col1Row7 = normalizeCellText(row7.cells[0]);
  if (!col1Row6.toLowerCase().includes('giáo viên') || !col1Row7.toLowerCase().includes('giáo viên')) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_HEADER_INVALID,
      `Teacher view column 1 on rows 6 and 7 must be "Giáo viên" on sheet ${sheet.name}.`,
      { sheet: sheet.name, rowNumber: DAMSAN_NATIVE_BOUNDARIES.TEACHER_DAY_HEADER_ROW },
    );
  }

  const slots: ParsedTeacherCell[] = [];
  const teacherRows = new Map<number, { rowRef: TeacherSourceRowRef; untrustedDisplayName: string }>();

  for (let r = DAMSAN_NATIVE_BOUNDARIES.TEACHER_ROW_START; r <= DAMSAN_NATIVE_BOUNDARIES.TEACHER_ROW_END; r += 1) {
    const rowObj = sheet.rows.find((row) => row.number === r);
    const rowRef: TeacherSourceRowRef = { sheet: sheet.name, rowNumber: r };
    const untrustedDisplayName = normalizeCellText(rowObj?.cells[0]);
    teacherRows.set(r, { rowRef, untrustedDisplayName });

    for (let c = DAMSAN_NATIVE_BOUNDARIES.TEACHER_COL_START; c <= DAMSAN_NATIVE_BOUNDARIES.TEACHER_COL_END; c += 1) {
      const colOffset = c - DAMSAN_NATIVE_BOUNDARIES.TEACHER_COL_START;
      const dayIndex = Math.floor(colOffset / DAMSAN_NATIVE_BOUNDARIES.PERIODS_PER_DAY);
      const day = dayIndex + 2;
      const weekday = WEEKDAYS[dayIndex]!;
      const period = (colOffset % DAMSAN_NATIVE_BOUNDARIES.PERIODS_PER_DAY) + 1;

      const cell = rowObj ? rowObj.cells[c - 1] : undefined;
      const targetClass = normalizeCellText(cell);
      if (targetClass) {
        slots.push({
          session,
          day,
          weekday,
          period,
          teacherRowRef: rowRef,
          rowNumber: r,
          colNumber: c,
          targetClass,
        });
      }
    }
  }

  return { slots, teacherRows };
}

export function validateAndExtractWorkbookStructure(workbook: ParsedWorkbook): NativeWorkbookStructure {
  validateSheetStructure(workbook);

  const morningClassSheet = workbook.sheets.find((sheet) => sheet.name.trim() === DAMSAN_NATIVE_SHEETS.MORNING_CLASS)!;
  const morningTeacherSheet = workbook.sheets.find((sheet) => sheet.name.trim() === DAMSAN_NATIVE_SHEETS.MORNING_TEACHER)!;
  const afternoonClassSheet = workbook.sheets.find((sheet) => sheet.name.trim() === DAMSAN_NATIVE_SHEETS.AFTERNOON_CLASS)!;
  const afternoonTeacherSheet = workbook.sheets.find((sheet) => sheet.name.trim() === DAMSAN_NATIVE_SHEETS.AFTERNOON_TEACHER)!;

  const morningClassDate = extractEffectiveDate(morningClassSheet);
  const morningTeacherDate = extractEffectiveDate(morningTeacherSheet);
  const afternoonClassDate = extractEffectiveDate(afternoonClassSheet);
  const afternoonTeacherDate = extractEffectiveDate(afternoonTeacherSheet);

  if (
    morningClassDate !== morningTeacherDate
    || morningClassDate !== afternoonClassDate
    || morningClassDate !== afternoonTeacherDate
  ) {
    throw new DamSanNativeTimetableException(
      DamSanNativeErrorCode.TKB_NATIVE_EFFECTIVE_DATE_MISMATCH,
      `Effective dates do not match across all 4 sheets: MorningClass=${morningClassDate}, MorningTeacher=${morningTeacherDate}, AfternoonClass=${afternoonClassDate}, AfternoonTeacher=${afternoonTeacherDate}.`,
      {
        expected: morningClassDate,
        actual: `${morningTeacherDate},${afternoonClassDate},${afternoonTeacherDate}`,
      },
    );
  }

  const morningClassResult = validateAndExtractClassSheet(morningClassSheet, 'MORNING');
  const morningTeacherResult = validateAndExtractTeacherSheet(morningTeacherSheet, 'MORNING');
  const afternoonClassResult = validateAndExtractClassSheet(afternoonClassSheet, 'AFTERNOON');
  const afternoonTeacherResult = validateAndExtractTeacherSheet(afternoonTeacherSheet, 'AFTERNOON');

  return {
    effectiveDate: morningClassDate,
    morningClasses: morningClassResult.classes,
    afternoonClasses: afternoonClassResult.classes,
    morningClassSlots: morningClassResult.slots,
    afternoonClassSlots: afternoonClassResult.slots,
    morningTeacherSlots: morningTeacherResult.slots,
    afternoonTeacherSlots: afternoonTeacherResult.slots,
    morningTeacherRows: morningTeacherResult.teacherRows,
    afternoonTeacherRows: afternoonTeacherResult.teacherRows,
  };
}
