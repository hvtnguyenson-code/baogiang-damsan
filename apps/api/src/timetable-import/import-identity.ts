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
  return a.weekday.localeCompare(b.weekday)
    || a.timeSlotDefinitionId.localeCompare(b.timeSlotDefinitionId)
    || a.schoolClassId.localeCompare(b.schoolClassId)
    || a.subjectId.localeCompare(b.subjectId)
    || a.teachingAssignmentId.localeCompare(b.teachingAssignmentId)
    || a.teacherUserId.localeCompare(b.teacherUserId);
}
