import { createHash } from 'node:crypto';
import { AcademicWeekday } from '@prisma/client';

export interface TimetableImportSemanticEntry {
  weekday: AcademicWeekday;
  timeSlotDefinitionId: string;
  schoolClassId: string;
  subjectId: string;
  teachingAssignmentId: string;
  teacherUserId: string;
}

export interface TimetableImportConfirmFingerprintInput {
  workbookSha256: string;
  profileRevisionId: string;
  academicYearId: string;
  calendarVersionId: string;
  effectiveAcademicWeekId: string;
  sheetName: string;
  headerRowNumber: number;
  semanticChecksum: string;
}

const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

export function serializeSemanticV1(entries: TimetableImportSemanticEntry[]): string {
  const sorted = [...entries].sort(compareSemanticEntries).map((entry) => ({
    weekday: entry.weekday,
    timeSlotDefinitionId: entry.timeSlotDefinitionId,
    schoolClassId: entry.schoolClassId,
    subjectId: entry.subjectId,
    teachingAssignmentId: entry.teachingAssignmentId,
    teacherUserId: entry.teacherUserId,
  }));
  return JSON.stringify({ version: 'semantic-v1', entries: sorted });
}

export function computeSemanticChecksum(entries: TimetableImportSemanticEntry[]): string {
  return digest(serializeSemanticV1(entries));
}

export function computeWorkbookSha256(bytes: Buffer): string {
  return digest(bytes);
}

export function serializeConfirmRequestV1(input: TimetableImportConfirmFingerprintInput): string {
  return JSON.stringify({
    version: 'confirm-request-v1',
    workbookSha256: input.workbookSha256,
    profileRevisionId: input.profileRevisionId,
    academicYearId: input.academicYearId,
    calendarVersionId: input.calendarVersionId,
    effectiveAcademicWeekId: input.effectiveAcademicWeekId,
    sheetName: input.sheetName,
    headerRowNumber: input.headerRowNumber,
    semanticChecksum: input.semanticChecksum,
  });
}

export function computeConfirmRequestFingerprint(input: TimetableImportConfirmFingerprintInput): string {
  return digest(serializeConfirmRequestV1(input));
}

function compareSemanticEntries(a: TimetableImportSemanticEntry, b: TimetableImportSemanticEntry): number {
  return compareOrdinal(a.weekday, b.weekday)
    || compareOrdinal(a.timeSlotDefinitionId, b.timeSlotDefinitionId)
    || compareOrdinal(a.schoolClassId, b.schoolClassId)
    || compareOrdinal(a.subjectId, b.subjectId)
    || compareOrdinal(a.teachingAssignmentId, b.teachingAssignmentId)
    || compareOrdinal(a.teacherUserId, b.teacherUserId);
}

function compareOrdinal(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
