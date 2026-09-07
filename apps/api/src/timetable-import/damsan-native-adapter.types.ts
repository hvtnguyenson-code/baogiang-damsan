import { BadRequestException } from '@nestjs/common';
import { AcademicWeekday } from '@prisma/client';
import { TimetableImportPreviewIssueCode } from '@baogiang/contracts';

export const DAMSAN_NATIVE_SHEETS = {
  MORNING_CLASS: 'TKB THEO LỚP BUỔI SÁNG',
  MORNING_TEACHER: 'TKB-GV-SANG',
  AFTERNOON_CLASS: 'TKB THEO LỚP BUỔI CHIỀU',
  AFTERNOON_TEACHER: 'TKB-GV-CHIỀU',
} as const;

export const ALL_DAMSAN_NATIVE_SHEETS = [
  DAMSAN_NATIVE_SHEETS.MORNING_CLASS,
  DAMSAN_NATIVE_SHEETS.MORNING_TEACHER,
  DAMSAN_NATIVE_SHEETS.AFTERNOON_CLASS,
  DAMSAN_NATIVE_SHEETS.AFTERNOON_TEACHER,
] as const;

export const DAMSAN_NATIVE_BOUNDARIES = {
  EFFECTIVE_DATE_ROW: 4,
  CLASS_HEADER_ROW: 6,
  CLASS_ROW_START: 7,
  CLASS_ROW_END: 36,
  CLASS_COL_START: 3,
  CLASS_COL_END: 20,
  CLASS_COUNT: 18,
  TEACHER_DAY_HEADER_ROW: 6,
  TEACHER_PERIOD_HEADER_ROW: 7,
  TEACHER_ROW_START: 8,
  TEACHER_ROW_END: 45,
  TEACHER_COL_START: 2,
  TEACHER_COL_END: 31,
  TEACHER_ROW_COUNT: 38,
  PERIODS_PER_DAY: 5,
  DAYS_COUNT: 6,
} as const;

export const SPECIAL_NON_PEER_ALLOWLIST = ['CC', 'GDĐP', 'TN-HN'] as const;
export type SpecialNonPeerActivityCode = (typeof SPECIAL_NON_PEER_ALLOWLIST)[number];

export enum DamSanNativeErrorCode {
  TKB_NATIVE_SHEET_STRUCTURE_INVALID = 'TKB_NATIVE_SHEET_STRUCTURE_INVALID',
  TKB_NATIVE_HEADER_INVALID = 'TKB_NATIVE_HEADER_INVALID',
  TKB_NATIVE_EFFECTIVE_DATE_MISSING = 'TKB_NATIVE_EFFECTIVE_DATE_MISSING',
  TKB_NATIVE_EFFECTIVE_DATE_MISMATCH = 'TKB_NATIVE_EFFECTIVE_DATE_MISMATCH',
  TKB_NATIVE_CLASS_HEADER_UNKNOWN = 'TKB_NATIVE_CLASS_HEADER_UNKNOWN',
  TKB_NATIVE_MARKER_SYNTAX_INVALID = 'TKB_NATIVE_MARKER_SYNTAX_INVALID',
  TKB_NATIVE_PEER_MISSING = 'TKB_NATIVE_PEER_MISSING',
  TKB_NATIVE_PEER_DUPLICATE = 'TKB_NATIVE_PEER_DUPLICATE',
  TKB_NATIVE_PEER_ORPHAN = 'TKB_NATIVE_PEER_ORPHAN',
  TKB_NATIVE_PEER_CONFLICT = 'TKB_NATIVE_PEER_CONFLICT',
  TKB_NATIVE_TEACHER_CODE_CONFLICT = 'TKB_NATIVE_TEACHER_CODE_CONFLICT',
  TKB_NATIVE_TEACHER_IDENTITY_UNKNOWN = 'TKB_NATIVE_TEACHER_IDENTITY_UNKNOWN',
  TKB_NATIVE_SUBJECT_UNKNOWN = 'TKB_NATIVE_SUBJECT_UNKNOWN',
  TKB_NATIVE_CARRY_FORWARD_BASELINE_MISSING = 'TKB_NATIVE_CARRY_FORWARD_BASELINE_MISSING',
}

export interface SafeEvidence {
  sheet?: string;
  rowNumber?: number;
  column?: number | string;
  coordinate?: string;
  derivedTeacherCode?: string;
  expected?: string | number;
  actual?: string | number;
  classCode?: string;
  subjectCode?: string;
  day?: number;
  period?: number;
  weekday?: string;
}

export class DamSanNativeTimetableException extends BadRequestException {
  constructor(
    readonly errorCode: TimetableImportPreviewIssueCode | DamSanNativeErrorCode,
    message: string,
    readonly safeEvidence?: SafeEvidence,
  ) {
    super({
      error: errorCode,
      message,
      ...(safeEvidence ? sanitizeEvidence(safeEvidence) : {}),
    });
  }
}

function sanitizeEvidence(evidence: SafeEvidence): SafeEvidence {
  const sanitized: SafeEvidence = {};
  if (typeof evidence.sheet === 'string') sanitized.sheet = evidence.sheet.slice(0, 100);
  if (typeof evidence.rowNumber === 'number') sanitized.rowNumber = evidence.rowNumber;
  if (evidence.column !== undefined) sanitized.column = String(evidence.column).slice(0, 20);
  if (typeof evidence.coordinate === 'string') sanitized.coordinate = evidence.coordinate.slice(0, 50);
  if (typeof evidence.derivedTeacherCode === 'string') sanitized.derivedTeacherCode = evidence.derivedTeacherCode.slice(0, 50);
  if (evidence.expected !== undefined) sanitized.expected = String(evidence.expected).slice(0, 50);
  if (evidence.actual !== undefined) sanitized.actual = String(evidence.actual).slice(0, 50);
  if (typeof evidence.classCode === 'string') sanitized.classCode = evidence.classCode.slice(0, 50);
  if (typeof evidence.subjectCode === 'string') sanitized.subjectCode = evidence.subjectCode.slice(0, 50);
  if (typeof evidence.day === 'number') sanitized.day = evidence.day;
  if (typeof evidence.period === 'number') sanitized.period = evidence.period;
  if (typeof evidence.weekday === 'string') sanitized.weekday = evidence.weekday.slice(0, 20);
  return sanitized;
}

export const DAMSAN_NATIVE_SHEET_SENTINEL = 'ALL_SHEETS';
export const DAMSAN_NATIVE_MORNING_SHEET_SENTINEL = 'MORNING_SHEETS';
export const DAMSAN_NATIVE_AFTERNOON_SHEET_SENTINEL = 'AFTERNOON_SHEETS';
export const DAMSAN_NATIVE_HEADER_ROW_SENTINEL = 6;

export type NativeSession = 'MORNING' | 'AFTERNOON';

export interface TeacherSourceRowRef {
  sheet: string;
  rowNumber: number;
}

export function teacherSourceRowRefKey(ref: TeacherSourceRowRef): string {
  return `${ref.sheet}\0${ref.rowNumber}`;
}

export type NativeClassCellKind = 'UNSCHEDULED' | 'SPECIAL_NON_PEER' | 'TEACHER_LINKED';

export interface ParsedClassCell {
  session: NativeSession;
  day: number;
  weekday: AcademicWeekday;
  period: number;
  classCode: string;
  rowNumber: number;
  colNumber: number;
  kind: NativeClassCellKind;
  specialActivityCode?: SpecialNonPeerActivityCode;
  subjectCode?: string;
  teacherCode?: string;
  rawText: string;
}

export interface ParsedTeacherCell {
  session: NativeSession;
  day: number;
  weekday: AcademicWeekday;
  period: number;
  teacherRowRef: TeacherSourceRowRef;
  rowNumber: number;
  colNumber: number;
  targetClass: string;
}

export interface NativeWorkbookStructure {
  effectiveDate: string; // ISO civil date YYYY-MM-DD
  morningClasses: string[];
  afternoonClasses: string[];
  morningClassSlots: ParsedClassCell[];
  afternoonClassSlots: ParsedClassCell[];
  morningTeacherSlots: ParsedTeacherCell[];
  afternoonTeacherSlots: ParsedTeacherCell[];
  morningTeacherRows: Map<number, { rowRef: TeacherSourceRowRef; untrustedDisplayName: string }>;
  afternoonTeacherRows: Map<number, { rowRef: TeacherSourceRowRef; untrustedDisplayName: string }>;
}
