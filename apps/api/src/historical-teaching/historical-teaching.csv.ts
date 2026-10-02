import { createHash } from 'node:crypto';
import type {
  HistoricalTeachingImportKind,
  HistoricalTeachingIssue,
  HistoricalTeachingNormalizedRow,
  HistoricalTeachingSession,
} from '@baogiang/contracts/historical-teaching';
import { isCivilDate } from '../common/validation/civil-date';

export const HISTORICAL_TEACHING_MAX_SOURCE_BYTES = 512 * 1024;
export const HISTORICAL_TEACHING_MAX_ROWS = 2000;

const EXPECTED_HEADERS = [
  'LOP',
  'MON',
  'NGAY_GOC',
  'BUOI_GOC',
  'TIET_GOC',
  'GIAO_VIEN_THUC_DAY',
  'LOAI',
  'NGAY_DAY_THUC_TE',
  'BUOI_THUC_TE',
  'TIET_THUC_TE',
  'GHI_CHU',
] as const;

type Header = (typeof EXPECTED_HEADERS)[number];

function ascii(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

function normalizedHeader(value: string): string {
  return ascii(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

function code(value: string): string {
  return value.normalize('NFC').trim().toUpperCase();
}

function plain(value: string): string {
  return value.normalize('NFC').trim();
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function parseDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(value);
      value = '';
      continue;
    }
    value += char;
  }
  if (quoted) throw new Error('CSV_UNCLOSED_QUOTE');
  cells.push(value);
  return cells;
}

function session(value: string): HistoricalTeachingSession | null {
  const normalized = normalizedHeader(value);
  if (['SANG', 'MORNING'].includes(normalized)) return 'MORNING';
  if (['CHIEU', 'AFTERNOON'].includes(normalized)) return 'AFTERNOON';
  if (['TOI', 'EVENING'].includes(normalized)) return 'EVENING';
  return null;
}

function kind(value: string): HistoricalTeachingImportKind | null {
  const normalized = normalizedHeader(value);
  if (['BINH_THUONG', 'NORMAL'].includes(normalized)) return 'NORMAL';
  if (['DAY_THAY', 'SUBSTITUTION'].includes(normalized)) return 'SUBSTITUTION';
  if (['DAY_BU', 'MAKEUP'].includes(normalized)) return 'MAKEUP';
  return null;
}

function ordinal(value: string): number | null {
  if (!/^\d{1,2}$/u.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : null;
}

function issue(rowNumber: number, codeValue: string, message: string): HistoricalTeachingIssue {
  return { severity: 'BLOCKER', code: codeValue, message, rowNumber };
}

export interface ParsedHistoricalTeachingSource {
  rows: HistoricalTeachingNormalizedRow[];
  issues: HistoricalTeachingIssue[];
}

export function parseHistoricalTeachingCsv(sourceText: string): ParsedHistoricalTeachingSource {
  const issues: HistoricalTeachingIssue[] = [];
  const byteLength = Buffer.byteLength(sourceText, 'utf8');
  if (byteLength === 0) {
    return { rows: [], issues: [{ severity: 'BLOCKER', code: 'HISTORY_SOURCE_EMPTY', message: 'Dữ liệu lịch sử đang trống.' }] };
  }
  if (byteLength > HISTORICAL_TEACHING_MAX_SOURCE_BYTES) {
    return { rows: [], issues: [{ severity: 'BLOCKER', code: 'HISTORY_SOURCE_TOO_LARGE', message: 'Dữ liệu lịch sử vượt quá giới hạn 512 KiB.' }] };
  }
  if (sourceText.includes('\0')) {
    return { rows: [], issues: [{ severity: 'BLOCKER', code: 'HISTORY_SOURCE_INVALID_CONTROL', message: 'Dữ liệu lịch sử chứa ký tự điều khiển không hợp lệ.' }] };
  }

  const lines = sourceText.replace(/^\uFEFF/u, '').split(/\r?\n/u);
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  if (lines.length < 2) {
    return { rows: [], issues: [{ severity: 'BLOCKER', code: 'HISTORY_SOURCE_NO_DATA_ROWS', message: 'CSV/TSV phải có dòng tiêu đề và ít nhất một dòng dữ liệu.' }] };
  }
  if (lines.length - 1 > HISTORICAL_TEACHING_MAX_ROWS) {
    return { rows: [], issues: [{ severity: 'BLOCKER', code: 'HISTORY_SOURCE_TOO_MANY_ROWS', message: 'CSV/TSV vượt quá 2.000 dòng dữ liệu.' }] };
  }

  let headerCells: string[];
  try {
    const delimiter: ',' | '\t' = lines[0]!.includes('\t') ? '\t' : ',';
    headerCells = parseDelimitedLine(lines[0]!, delimiter);
  } catch {
    return { rows: [], issues: [{ severity: 'BLOCKER', code: 'HISTORY_HEADER_INVALID_CSV', message: 'Dòng tiêu đề CSV/TSV không hợp lệ.' }] };
  }
  const headers = headerCells.map(normalizedHeader);
  if (headers.length !== EXPECTED_HEADERS.length || headers.some((value, index) => value !== EXPECTED_HEADERS[index])) {
    return {
      rows: [],
      issues: [{
        severity: 'BLOCKER',
        code: 'HISTORY_HEADER_MISMATCH',
        message: `Tiêu đề phải đúng thứ tự: ${EXPECTED_HEADERS.join(',')}.`,
      }],
    };
  }

  const delimiter: ',' | '\t' = lines[0]!.includes('\t') ? '\t' : ',';
  const rows: HistoricalTeachingNormalizedRow[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const rowNumber = lineIndex + 1;
    if (!lines[lineIndex]!.trim()) continue;
    let cells: string[];
    try {
      cells = parseDelimitedLine(lines[lineIndex]!, delimiter);
    } catch {
      issues.push(issue(rowNumber, 'HISTORY_ROW_INVALID_CSV', 'Dòng CSV/TSV có dấu ngoặc kép không cân bằng.'));
      continue;
    }
    if (cells.length !== EXPECTED_HEADERS.length) {
      issues.push(issue(rowNumber, 'HISTORY_ROW_COLUMN_COUNT', `Dòng phải có đúng ${EXPECTED_HEADERS.length} cột.`));
      continue;
    }
    const values = Object.fromEntries(EXPECTED_HEADERS.map((header, index) => [header, plain(cells[index] ?? '')])) as Record<Header, string>;

    const sourceSession = session(values.BUOI_GOC);
    const sourceOrdinal = ordinal(values.TIET_GOC);
    const importKind = kind(values.LOAI);
    const executionDateRaw = values.NGAY_DAY_THUC_TE || values.NGAY_GOC;
    const executionSession = session(values.BUOI_THUC_TE || values.BUOI_GOC);
    const executionOrdinal = ordinal(values.TIET_THUC_TE || values.TIET_GOC);

    if (!values.LOP) issues.push(issue(rowNumber, 'HISTORY_CLASS_REQUIRED', 'Mã lớp là bắt buộc.'));
    if (!values.MON) issues.push(issue(rowNumber, 'HISTORY_SUBJECT_REQUIRED', 'Mã môn là bắt buộc.'));
    if (!isCivilDate(values.NGAY_GOC)) issues.push(issue(rowNumber, 'HISTORY_SOURCE_DATE_INVALID', 'Ngày gốc phải có dạng YYYY-MM-DD và tồn tại.'));
    if (!sourceSession) issues.push(issue(rowNumber, 'HISTORY_SOURCE_SESSION_INVALID', 'Buổi gốc phải là SANG/CHIEU/TOI.'));
    if (!sourceOrdinal) issues.push(issue(rowNumber, 'HISTORY_SOURCE_ORDINAL_INVALID', 'Tiết gốc phải là số nguyên từ 1 đến 20.'));
    if (!values.GIAO_VIEN_THUC_DAY) issues.push(issue(rowNumber, 'HISTORY_TEACHER_REQUIRED', 'Mã cán bộ giáo viên thực dạy là bắt buộc.'));
    if (!importKind) issues.push(issue(rowNumber, 'HISTORY_KIND_INVALID', 'Loại phải là BINH_THUONG, DAY_THAY hoặc DAY_BU.'));
    if (!isCivilDate(executionDateRaw)) issues.push(issue(rowNumber, 'HISTORY_EXECUTION_DATE_INVALID', 'Ngày dạy thực tế phải có dạng YYYY-MM-DD và tồn tại.'));
    if (!executionSession) issues.push(issue(rowNumber, 'HISTORY_EXECUTION_SESSION_INVALID', 'Buổi dạy thực tế phải là SANG/CHIEU/TOI.'));
    if (!executionOrdinal) issues.push(issue(rowNumber, 'HISTORY_EXECUTION_ORDINAL_INVALID', 'Tiết dạy thực tế phải là số nguyên từ 1 đến 20.'));
    if (values.GHI_CHU.length > 500) issues.push(issue(rowNumber, 'HISTORY_NOTE_TOO_LONG', 'Ghi chú tối đa 500 ký tự.'));
    if (importKind === 'MAKEUP' && (!values.NGAY_DAY_THUC_TE || !values.BUOI_THUC_TE || !values.TIET_THUC_TE)) {
      issues.push(issue(rowNumber, 'HISTORY_MAKEUP_TARGET_REQUIRED', 'DAY_BU bắt buộc có ngày, buổi và tiết dạy thực tế.'));
    }

    const hasRowIssue = issues.some((candidate) => candidate.rowNumber === rowNumber);
    if (hasRowIssue || !sourceSession || !sourceOrdinal || !importKind || !executionSession || !executionOrdinal || !isCivilDate(values.NGAY_GOC) || !isCivilDate(executionDateRaw)) continue;

    if (importKind !== 'MAKEUP' && (
      executionDateRaw !== values.NGAY_GOC
      || executionSession !== sourceSession
      || executionOrdinal !== sourceOrdinal
    )) {
      issues.push(issue(rowNumber, 'HISTORY_NON_MAKEUP_TARGET_MISMATCH', 'BINH_THUONG/DAY_THAY phải dùng đúng ngày, buổi và tiết gốc.'));
      continue;
    }
    if (importKind === 'MAKEUP' && executionDateRaw < values.NGAY_GOC) {
      issues.push(issue(rowNumber, 'HISTORY_MAKEUP_BEFORE_SOURCE', 'Ngày dạy bù không được trước ngày nghĩa vụ gốc.'));
      continue;
    }

    const normalized = {
      rowNumber,
      kind: importKind,
      schoolClassCode: code(values.LOP),
      subjectCode: code(values.MON),
      sourceCivilDate: values.NGAY_GOC,
      sourceSession,
      sourceOrdinal,
      actualTeacherStaffCode: code(values.GIAO_VIEN_THUC_DAY),
      executionCivilDate: executionDateRaw,
      executionSession,
      executionOrdinal,
      note: values.GHI_CHU ? values.GHI_CHU : null,
    } as Omit<HistoricalTeachingNormalizedRow, 'rowRef'>;

    rows.push({ ...normalized, rowRef: sha256(JSON.stringify(normalized)) });
  }

  if (rows.length === 0 && issues.length === 0) {
    issues.push({ severity: 'BLOCKER', code: 'HISTORY_SOURCE_NO_DATA_ROWS', message: 'CSV/TSV không có dòng dữ liệu hợp lệ.' });
  }
  return { rows, issues };
}
